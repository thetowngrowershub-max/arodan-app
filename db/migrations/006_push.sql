-- Push notifications for the customer, rider and merchant apps.
-- The apps register their Expo push token with the API (POST /push/register). Database triggers write
-- one row per message into push_outbox whenever an order changes; the API server's push worker
-- (server/src/push.js) sends them through Expo's push service and marks them sent.
-- Polling in the apps keeps working as before, so a lost notification never loses an order.

create table public.push_tokens (
  token text primary key, -- ExponentPushToken[...]
  user_id uuid not null references public.profiles (id) on delete cascade,
  app text not null check (app in ('customer', 'rider', 'merchant')),
  platform text not null default '' check (platform in ('', 'ios', 'android', 'web')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index on public.push_tokens (user_id, app);

create table public.push_outbox (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  app text not null check (app in ('customer', 'rider', 'merchant')),
  title text not null,
  body text not null,
  data jsonb not null default '{}', -- e.g. { "type": "order", "orderId": "…" } so a tap can open the right screen
  created_at timestamptz not null default now(),
  attempts int not null default 0,
  sent_at timestamptz,
  error text
);
create index push_outbox_pending_idx on public.push_outbox (id) where sent_at is null;

alter table public.push_tokens enable row level security;
alter table public.push_outbox enable row level security;
create policy "own tokens" on public.push_tokens for select using (user_id = auth.uid());

-- ───────────────────────── Registering a phone ─────────────────────────
-- A phone has one token. If someone else signs in on the same phone, the token moves to them.
create function public.register_push_token(p_token text, p_app text, p_platform text) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in'; end if;
  if p_token !~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,200}\]$' then raise exception 'Invalid push token'; end if;
  insert into push_tokens (token, user_id, app, platform) values (p_token, uid, p_app, coalesce(p_platform, ''))
  on conflict (token) do update set user_id = excluded.user_id, app = excluded.app, platform = excluded.platform, last_seen_at = now();
end $$;

-- Signing out: stop sending to this phone. Anyone may remove a token they hold.
create function public.unregister_push_token(p_token text) returns void
language sql security definer set search_path = public as $$
  delete from push_tokens where token = p_token
$$;

-- Queue one message.
create function public.push_queue(p_user uuid, p_app text, p_title text, p_body text, p_data jsonb default '{}')
returns void language sql security definer set search_path = public as $$
  insert into push_outbox (user_id, app, title, body, data) values (p_user, p_app, p_title, p_body, coalesce(p_data, '{}'))
$$;

-- ───────────────────────── What gets sent ─────────────────────────
-- Every order status change writes an order_events row, so one trigger there covers all of them.
create function public.on_order_event_push() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  o orders;
  rider_name text;
  shop record;
  r record;
  d jsonb;
begin
  select * into o from orders where id = new.order_id;
  if not found then return new; end if;
  d := jsonb_build_object('type', 'order', 'orderId', o.id, 'code', o.code, 'status', new.status);
  select split_part(display_name, ' ', 1) into rider_name from riders where id = o.rider_id;

  -- Customer
  case new.status
    when 'assigned' then
      perform push_queue(o.customer_id, 'customer', 'Rider assigned',
        coalesce(rider_name, 'Your rider') || ' is handling order ' || o.code || '.', d);
    when 'picked_up' then
      perform push_queue(o.customer_id, 'customer', 'Order picked up',
        coalesce(rider_name, 'Your rider') || ' has collected order ' || o.code || '.', d);
    when 'on_the_way' then
      perform push_queue(o.customer_id, 'customer', 'On the way',
        coalesce(rider_name, 'Your rider') || ' is heading to you with order ' || o.code || '.', d);
    when 'at_gate' then
      perform push_queue(o.customer_id, 'customer', 'Your rider is at the gate',
        'Have your delivery code ready for order ' || o.code || '.', d);
    when 'delivered' then
      perform push_queue(o.customer_id, 'customer', 'Delivered',
        'Order ' || o.code || ' has been delivered. Thank you for using Arodan!', d);
    when 'cancelled' then
      perform push_queue(o.customer_id, 'customer', 'Order cancelled',
        'Order ' || o.code || ' was cancelled.' ||
        case when o.payment_method <> 'pod' and o.payment_status = 'paid' then ' Your refund is on its way.' else '' end, d);
    else null;
  end case;

  -- Riders: a new job (also when a rider hands one back) goes to every free, online, vetted rider
  -- with the right vehicle who has not declined it. Same rules as rider_open_jobs().
  if new.status = 'placed' and o.rider_id is null and not coalesce((o.quote ->> 'needsVanQuote')::boolean, false) then
    for r in
      select rd.id from riders rd
      where rd.is_online and public.rider_is_vetted(rd)
        and (o.quote ->> 'vehicle' = rd.vehicle or rd.vehicle = 'motorbike')
        and not exists (select 1 from order_declines x where x.order_id = o.id and x.rider_id = rd.id)
        and not exists (select 1 from orders a where a.rider_id = rd.id and a.status not in ('delivered', 'cancelled'))
    loop
      perform push_queue(r.id, 'rider', 'New job nearby',
        'Deliver to ' || coalesce(o.address ->> 'estate', 'Magodo') || '. You earn ₦' ||
        to_char((public.rider_payout(o) ->> 'total')::int, 'FM999,999,990') || '.',
        jsonb_build_object('type', 'job', 'orderId', o.id));
    end loop;
  end if;

  -- The assigned rider hears when their job is cancelled.
  if new.status = 'cancelled' and o.rider_id is not null then
    perform push_queue(o.rider_id, 'rider', 'Job cancelled', 'Order ' || o.code || ' was cancelled. You can take another job.',
      jsonb_build_object('type', 'job', 'orderId', o.id));
  end if;

  -- Shops with a merchant account: a rider is coming, or the order was cancelled.
  if new.status in ('assigned', 'cancelled') then
    for shop in
      select m.owner_id, om.status from order_merchants om join merchants m on m.id = om.merchant_id
      where om.order_id = o.id and m.owner_id is not null and om.status <> 'declined'
    loop
      if new.status = 'assigned' then
        perform push_queue(shop.owner_id, 'merchant', 'Rider on the way',
          coalesce(rider_name, 'A rider') || ' will collect order ' || o.code || '.' ||
          case when shop.status in ('new', 'preparing') then ' Please get it ready.' else '' end,
          jsonb_build_object('type', 'order', 'orderId', o.id));
      else
        perform push_queue(shop.owner_id, 'merchant', 'Order cancelled',
          'Order ' || o.code || ' was cancelled. Put the items back on the shelf.', jsonb_build_object('type', 'order', 'orderId', o.id));
      end if;
    end loop;
  end if;
  return new;
end $$;

create trigger order_event_push after insert on public.order_events
for each row execute function public.on_order_event_push();

-- Shops: a new order to prepare (one row per shop in the order).
-- The assigned rider: the shop has the order ready.
create function public.on_order_merchant_push() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  m merchants;
  o orders;
begin
  select * into m from merchants where id = new.merchant_id;
  select * into o from orders where id = new.order_id;
  if tg_op = 'INSERT' then
    if m.owner_id is not null then
      perform push_queue(m.owner_id, 'merchant', 'New order ' || o.code,
        'Items worth ₦' || to_char(new.items_total, 'FM999,999,990') || ' to prepare for pickup.',
        jsonb_build_object('type', 'order', 'orderId', o.id));
    end if;
  elsif new.status = 'ready' and old.status <> 'ready' and o.rider_id is not null then
    perform push_queue(o.rider_id, 'rider', 'Ready for pickup', m.name || ' has order ' || o.code || ' ready for you.',
      jsonb_build_object('type', 'job', 'orderId', o.id));
  end if;
  return new;
end $$;

create trigger order_merchant_push after insert or update of status on public.order_merchants
for each row execute function public.on_order_merchant_push();

-- ───────────────────────── Permissions ─────────────────────────
do $grants$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute $q$revoke insert, update, delete on public.push_tokens, public.push_outbox from anon, authenticated$q$;
    execute $q$revoke select on public.push_outbox from anon, authenticated$q$;
    execute $q$revoke all on function public.register_push_token(text, text, text), public.unregister_push_token(text) from public, anon$q$;
    execute $q$grant execute on function public.register_push_token(text, text, text), public.unregister_push_token(text) to authenticated$q$;
    execute $q$revoke all on function public.push_queue(uuid, text, text, text, jsonb) from public, anon, authenticated$q$;
  end if;
end $grants$;
