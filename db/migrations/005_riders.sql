-- Rider app: going online, job offers, accepting / declining, live location,
-- proof of delivery (customer's delivery code or a photo) and rider earnings.
-- Everything a rider does goes through the security definer functions below,
-- which check that the signed-in user is a vetted rider and is allowed to touch the order.

-- ───────────────────────── Riders ─────────────────────────
-- Ops can suspend a rider without deleting them.
alter table public.riders add column active boolean not null default true;
alter table public.riders add column heading double precision;
alter table public.riders add column speed double precision;

-- A rider may go online only once all three vetting checks shown to customers are done.
create function public.rider_is_vetted(r public.riders) returns boolean language sql immutable as $$
  select r.active and r.nin_verified and r.guarantor_confirmed and r.address_visited
$$;

-- ───────────────────────── Orders ─────────────────────────
-- 4-digit code the customer reads out to the rider at hand-over. Only the customer can read it.
alter table public.orders add column delivery_code text not null default lpad((floor(random() * 10000))::int::text, 4, '0');
alter table public.orders add column delivery_code_attempts int not null default 0;
alter table public.orders add column delivered_at timestamptz;

-- Riders who said no to a job, so it is not offered to them again.
create table public.order_declines (
  order_id uuid not null references public.orders (id) on delete cascade,
  rider_id uuid not null references public.riders (id) on delete cascade,
  at timestamptz not null default now(),
  primary key (order_id, rider_id)
);

-- How each delivery was proven. Photos are small JPEGs (the app shrinks them first).
create table public.delivery_proofs (
  order_id uuid primary key references public.orders (id) on delete cascade,
  rider_id uuid not null references public.riders (id),
  method text not null check (method in ('code', 'photo')),
  photo bytea,
  note text not null default '',
  cash_collected int, -- pay-on-delivery orders: amount the rider says they collected
  lat double precision,
  lng double precision,
  at timestamptz not null default now(),
  check (method <> 'photo' or photo is not null)
);

-- What each rider earned on each delivery.
create table public.rider_earnings (
  id bigint generated always as identity primary key,
  order_id uuid not null unique references public.orders (id) on delete cascade,
  rider_id uuid not null references public.riders (id),
  delivery_part int not null,
  errand_part int not null,
  top_up int not null, -- added to reach the minimum per drop
  amount int not null,
  at timestamptz not null default now()
);
create index on public.rider_earnings (rider_id, at desc);

alter table public.order_declines enable row level security;
alter table public.delivery_proofs enable row level security;
alter table public.rider_earnings enable row level security;
create policy "own declines" on public.order_declines for select using (rider_id = auth.uid());
create policy "own proofs" on public.delivery_proofs for select using (rider_id = auth.uid());
create policy "own earnings" on public.rider_earnings for select using (rider_id = auth.uid());

-- The assigned rider can see the name and phone of the customer on a job still in progress.
create policy "rider sees customer on active job" on public.profiles for select using (
  exists (select 1 from public.orders o where o.customer_id = profiles.id and o.rider_id = auth.uid()
          and o.status not in ('delivered', 'cancelled'))
);

-- ───────────────────────── Helpers ─────────────────────────
-- The signed-in rider, or an error.
create function public.current_rider() returns public.riders
language plpgsql stable security definer set search_path = public as $$
declare r riders;
begin
  select * into r from riders where id = auth.uid();
  if not found then raise exception 'This account is not set up as an Arodan rider'; end if;
  if not r.active then raise exception 'Your rider account is paused. Call Arodan support.'; end if;
  return r;
end $$;

-- Rider payout for an order: share of the delivery fee and errand fees, with a minimum per drop.
-- Rates live in pricing_config.config.riderPayout (defaults below match the delivery cost model).
create function public.rider_payout(o public.orders) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  c jsonb := coalesce((select config -> 'riderPayout' from pricing_config where id = 1), '{}');
  d int := round(o.delivery_fee * coalesce((c ->> 'deliveryShare')::numeric, 0.8))::int;
  e int := round(o.errand_fees * coalesce((c ->> 'errandShare')::numeric, 0.8))::int;
  m int := coalesce((c ->> 'minPerDrop')::int, 800);
begin
  return jsonb_build_object('delivery', d, 'errand', e, 'topUp', greatest(0, m - d - e), 'total', greatest(m, d + e));
end $$;

-- Job as a rider sees it. Before they accept, the exact house, gate code and customer are hidden.
create function public.rider_job_json(o public.orders, p_full boolean) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', o.id, 'code', o.code, 'status', o.status, 'createdAt', o.created_at,
    'vehicle', o.quote ->> 'vehicle', 'etaMin', o.eta_min,
    'payout', public.rider_payout(o),
    'payment', o.payment_method, 'paymentStatus', o.payment_status,
    -- cash to collect at the door on pay-on-delivery orders
    'collect', case when o.payment_method = 'pod' and o.payment_status <> 'paid' then o.total else 0 end,
    'itemsTotal', o.items_total, 'errandBudget', o.errand_purchases,
    'dropoff', case when p_full then o.address
                    else jsonb_build_object('estate', o.address ->> 'estate', 'street', o.address ->> 'street') end,
    'customer', case when p_full then (select jsonb_build_object('name', coalesce(p.full_name, 'Customer'), 'phone', p.phone)
                                         from profiles p where p.id = o.customer_id) end,
    'pickups', coalesce((
      select jsonb_agg(x order by x ->> 'kind' desc, x ->> 'name') from (
        select jsonb_build_object('kind', 'merchant', 'id', m.id, 'name', m.name, 'area', m.area, 'distanceKm', m.distance_km,
                 'items', jsonb_agg(jsonb_build_object('name', i.name, 'qty', i.qty, 'unitPrice', i.unit_price) order by i.id)) as x
        from order_items i join products p on p.id = i.product_id join merchants m on m.id = p.merchant_id
        where i.order_id = o.id group by m.id
        union all
        select jsonb_build_object('kind', 'errand', 'id', e.id::text, 'name', s.name, 'area', '', 'distanceKm', s.distance_km,
                 'errandType', e.type, 'title', e.title, 'details', e.details, 'estMin', e.est_min, 'budget', e.budget)
        from order_errands e join errand_spots s on s.id = e.spot_id where e.order_id = o.id
      ) q), '[]'::jsonb),
    'itemCount', (select coalesce(sum(qty), 0) from order_items where order_id = o.id),
    'weightKg', (select coalesce(sum(p.weight_kg * i.qty), 0) from order_items i join products p on p.id = i.product_id where i.order_id = o.id)
  )
$$;

-- ───────────────────────── Rider actions ─────────────────────────
create function public.rider_set_online(p_online boolean, p_lat double precision default null, p_lng double precision default null)
returns public.riders language plpgsql security definer set search_path = public as $$
declare r riders := public.current_rider();
begin
  if p_online and not public.rider_is_vetted(r) then
    raise exception 'You can go online once your NIN, guarantor and address checks are complete';
  end if;
  update riders set is_online = p_online,
    lat = coalesce(p_lat, lat), lng = coalesce(p_lng, lng),
    location_at = case when p_lat is not null then now() else location_at end
  where id = r.id returning * into r;
  return r;
end $$;

create function public.rider_update_location(p_lat double precision, p_lng double precision,
                                             p_heading double precision default null, p_speed double precision default null)
returns void language plpgsql security definer set search_path = public as $$
declare r riders := public.current_rider();
begin
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'invalid location';
  end if;
  update riders set lat = p_lat, lng = p_lng, heading = p_heading, speed = p_speed, location_at = now() where id = r.id;
end $$;

-- The rider's job in progress, if any (riders do one job at a time during the pilot).
create function public.rider_active_order() returns public.orders
language sql stable security definer set search_path = public as $$
  select * from orders where rider_id = auth.uid() and status not in ('delivered', 'cancelled')
  order by created_at limit 1
$$;

-- The job in progress as the rider app shows it, or null.
create function public.rider_current_job() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  r riders := public.current_rider();
  o orders := public.rider_active_order();
begin
  if o.id is null then return null; end if;
  return public.rider_job_json(o, true);
end $$;

-- Jobs waiting for a rider that this rider can take: online, vetted, free, right vehicle, not declined.
-- Bicycle jobs can go to motorbikes; motorbike jobs need a motorbike.
create function public.rider_open_jobs() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r riders := public.current_rider();
begin
  if not r.is_online or not public.rider_is_vetted(r) or (public.rider_active_order()).id is not null then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(public.rider_job_json(o, false) order by o.created_at)
    from orders o
    where o.status = 'placed' and o.rider_id is null
      and (o.quote ->> 'vehicle' = r.vehicle or r.vehicle = 'motorbike')
      and not coalesce((o.quote ->> 'needsVanQuote')::boolean, false)
      and not exists (select 1 from order_declines d where d.order_id = o.id and d.rider_id = r.id)
      and o.created_at > now() - interval '12 hours'
    limit 20), '[]'::jsonb);
end $$;

create function public.rider_accept_job(p_order_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r riders := public.current_rider();
  o orders;
begin
  if not r.is_online then raise exception 'Go online to take jobs'; end if;
  if not public.rider_is_vetted(r) then raise exception 'Your vetting checks are not complete yet'; end if;
  if (public.rider_active_order()).id is not null then raise exception 'Finish your current job first'; end if;
  -- First rider to accept gets it.
  update orders set rider_id = r.id, status = 'assigned', updated_at = now()
  where id = p_order_id and status = 'placed' and rider_id is null
    and (quote ->> 'vehicle' = r.vehicle or r.vehicle = 'motorbike')
  returning * into o;
  if not found then raise exception 'This job has been taken or is no longer available'; end if;
  insert into order_events (order_id, status) values (o.id, 'assigned');
  return public.rider_job_json(o, true);
end $$;

create function public.rider_decline_job(p_order_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r riders := public.current_rider();
begin
  insert into order_declines (order_id, rider_id) values (p_order_id, r.id) on conflict do nothing;
end $$;

-- Give a job back before pickup (e.g. bike trouble). It goes back to other riders.
create function public.rider_release_job(p_order_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  r riders := public.current_rider();
  o orders;
begin
  select * into o from orders where id = p_order_id and rider_id = r.id for update;
  if not found then raise exception 'order not found'; end if;
  if o.status <> 'assigned' then raise exception 'You can only hand back a job before pickup. Call Arodan support.'; end if;
  update orders set rider_id = null, status = 'placed', updated_at = now() where id = o.id;
  insert into order_declines (order_id, rider_id) values (o.id, r.id) on conflict do nothing;
  insert into order_events (order_id, status) values (o.id, 'placed');
end $$;

-- Move the job forward: picked_up → on_the_way → at_gate. Delivered needs proof (below).
create function public.rider_advance_job(p_order_id uuid, p_status public.order_status) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r riders := public.current_rider();
  o orders;
begin
  select * into o from orders where id = p_order_id and rider_id = r.id for update;
  if not found then raise exception 'order not found'; end if;
  if p_status not in ('picked_up', 'on_the_way', 'at_gate') then raise exception 'not allowed'; end if;
  if p_status <= o.status then raise exception 'This job is already past that step'; end if;
  if o.status in ('delivered', 'cancelled') then raise exception 'This job is closed'; end if;
  update orders set status = p_status, updated_at = now() where id = o.id returning * into o;
  insert into order_events (order_id, status) values (o.id, p_status);
  return public.rider_job_json(o, true);
end $$;

-- Finish a delivery with the customer's 4-digit code or a photo. Records the rider's earnings.
create function public.rider_complete_job(p_order_id uuid, p_method text, p_code text, p_photo bytea, p_note text,
                                          p_cash_collected int, p_lat double precision, p_lng double precision)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r riders := public.current_rider();
  o orders;
  pay jsonb;
begin
  select * into o from orders where id = p_order_id and rider_id = r.id for update;
  if not found then raise exception 'order not found'; end if;
  if o.status in ('delivered', 'cancelled') then raise exception 'This job is closed'; end if;
  if o.status < 'picked_up' then raise exception 'Mark the order as picked up first'; end if;

  if p_method = 'code' then
    if o.delivery_code_attempts >= 5 then raise exception 'Too many wrong codes. Take a photo of the hand-over instead.'; end if;
    if coalesce(p_code, '') <> o.delivery_code then
      update orders set delivery_code_attempts = delivery_code_attempts + 1 where id = o.id;
      return jsonb_build_object('ok', false, 'error', 'That code is not right. Ask the customer to check the code in their app.',
                                'attemptsLeft', 4 - o.delivery_code_attempts);
    end if;
  elsif p_method = 'photo' then
    if p_photo is null or length(p_photo) < 1000 then raise exception 'Take a photo of the package at the door'; end if;
    if length(p_photo) > 1500000 then raise exception 'Photo is too large'; end if;
  else
    raise exception 'Choose code or photo';
  end if;

  if o.payment_method = 'pod' and o.payment_status <> 'paid' and coalesce(p_cash_collected, 0) < o.total then
    raise exception 'Collect the full amount before completing a pay-on-delivery order';
  end if;

  insert into delivery_proofs (order_id, rider_id, method, photo, note, cash_collected, lat, lng)
  values (o.id, r.id, p_method, case when p_method = 'photo' then p_photo end, left(coalesce(p_note, ''), 300),
          case when o.payment_method = 'pod' then p_cash_collected end, p_lat, p_lng);

  update orders set status = 'delivered', delivered_at = now(), updated_at = now(),
    payment_status = case when payment_method = 'pod' then 'paid' else payment_status end
  where id = o.id returning * into o;
  insert into order_events (order_id, status) values (o.id, 'delivered');

  pay := public.rider_payout(o);
  insert into rider_earnings (order_id, rider_id, delivery_part, errand_part, top_up, amount)
  values (o.id, r.id, (pay ->> 'delivery')::int, (pay ->> 'errand')::int, (pay ->> 'topUp')::int, (pay ->> 'total')::int);
  update riders set trips = trips + 1 where id = r.id;

  return jsonb_build_object('ok', true, 'earned', (pay ->> 'total')::int, 'job', public.rider_job_json(o, true));
end $$;

-- Today (Lagos time), the last 7 days, all time, and recent drops.
create function public.rider_earnings_summary() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  r riders := public.current_rider();
  day_start timestamptz := date_trunc('day', now() at time zone 'Africa/Lagos') at time zone 'Africa/Lagos';
begin
  return jsonb_build_object(
    'today', (select jsonb_build_object('amount', coalesce(sum(amount), 0), 'trips', count(*)) from rider_earnings where rider_id = r.id and at >= day_start),
    'week', (select jsonb_build_object('amount', coalesce(sum(amount), 0), 'trips', count(*)) from rider_earnings where rider_id = r.id and at >= day_start - interval '6 days'),
    'total', (select jsonb_build_object('amount', coalesce(sum(amount), 0), 'trips', count(*)) from rider_earnings where rider_id = r.id),
    'days', coalesce((
      select jsonb_agg(jsonb_build_object('day', d::date, 'amount', coalesce(x.amount, 0), 'trips', coalesce(x.trips, 0)) order by d)
      from generate_series((day_start - interval '6 days') at time zone 'Africa/Lagos', day_start at time zone 'Africa/Lagos', interval '1 day') d
      left join (select (at at time zone 'Africa/Lagos')::date as day, sum(amount) as amount, count(*) as trips
                 from rider_earnings where rider_id = r.id group by 1) x on x.day = d::date), '[]'::jsonb),
    'recent', coalesce((
      select jsonb_agg(jsonb_build_object('orderId', e.order_id, 'code', o.code, 'at', e.at, 'amount', e.amount,
               'delivery', e.delivery_part, 'errand', e.errand_part, 'topUp', e.top_up, 'estate', o.address ->> 'estate') order by e.at desc)
      from (select * from rider_earnings where rider_id = r.id order by at desc limit 30) e join orders o on o.id = e.order_id), '[]'::jsonb)
  );
end $$;

-- ───────────────────────── Existing order rules ─────────────────────────
-- Riders now finish deliveries only with proof (rider_complete_job); set_order_status stays for admins and cancels.
create or replace function public.set_order_status(p_order_id uuid, p_status public.order_status)
returns public.orders language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  o orders;
  is_admin boolean := exists (select 1 from profiles where id = uid and role = 'admin');
begin
  select * into o from orders where id = p_order_id for update;
  if not found then raise exception 'order not found'; end if;

  if p_status = 'cancelled' then
    if not (is_admin or (o.customer_id = uid and o.status = 'placed')) then raise exception 'cannot cancel this order'; end if;
  elsif not (is_admin or (o.rider_id = uid and p_status > o.status and p_status <> 'delivered')) then
    raise exception 'not allowed';
  end if;

  update orders set status = p_status, updated_at = now(),
    delivered_at = case when p_status = 'delivered' then now() else delivered_at end
  where id = o.id returning * into o;
  insert into order_events (order_id, status) values (o.id, p_status);
  return o;
end $$;

-- Demo mode: test orders go to the seeded demo riders only when no real rider is online,
-- and orders a real rider has accepted are moved only by that rider.
create or replace function public.demo_advance_order(p_order_id uuid)
returns public.orders language plpgsql security definer set search_path = public as $$
declare
  o orders;
  nxt public.order_status;
  rid uuid;
begin
  if not coalesce((select demo_mode from pricing_config where id = 1), false) then raise exception 'demo mode is off'; end if;
  select * into o from orders where id = p_order_id and customer_id = auth.uid() for update;
  if not found then raise exception 'order not found'; end if;
  if o.status in ('delivered', 'cancelled') then return o; end if;
  -- A real rider is on it: let them drive the status.
  if o.rider_id is not null and o.rider_id::text not like '00000000-0000-4000-8000-%' then return o; end if;
  nxt := (enum_range(o.status, null))[2];
  -- While a real rider is online, leave new orders for them to accept in the rider app.
  if nxt = 'assigned' and o.rider_id is null and exists (
    select 1 from riders r where r.is_online and public.rider_is_vetted(r) and r.id::text not like '00000000-0000-4000-8000-%') then
    return o;
  end if;
  if nxt = 'assigned' and o.rider_id is null then
    select id into rid from riders where id::text like '00000000-0000-4000-8000-%' and vehicle = (o.quote ->> 'vehicle') order by random() limit 1;
    if rid is null then select id into rid from riders where id::text like '00000000-0000-4000-8000-%' order by random() limit 1; end if;
  end if;
  update orders set status = nxt, rider_id = coalesce(rider_id, rid), updated_at = now(),
    delivered_at = case when nxt = 'delivered' then now() else delivered_at end
  where id = o.id returning * into o;
  insert into order_events (order_id, status) values (o.id, nxt);
  return o;
end $$;

-- ───────────────────────── Permissions ─────────────────────────
-- Role grants (skipped on hosts that don't allow creating the anon/authenticated roles;
-- the API then relies on these functions' own auth.uid() checks, see server/src/db.js).
do $grants$ declare f text; begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    -- Riders, proofs, declines and earnings change only through the functions above.
    execute $q$revoke insert, update, delete on public.riders, public.order_declines, public.delivery_proofs, public.rider_earnings from anon, authenticated$q$;
    foreach f in array array[
      'current_rider()', 'rider_set_online(boolean, double precision, double precision)',
      'rider_update_location(double precision, double precision, double precision, double precision)',
      'rider_active_order()', 'rider_current_job()', 'rider_open_jobs()', 'rider_accept_job(uuid)', 'rider_decline_job(uuid)',
      'rider_release_job(uuid)', 'rider_advance_job(uuid, public.order_status)',
      'rider_complete_job(uuid, text, text, bytea, text, int, double precision, double precision)',
      'rider_earnings_summary()'
    ] loop
      execute format('revoke all on function public.%s from public, anon', f);
      execute format('grant execute on function public.%s to authenticated', f);
    end loop;
    -- Internal helpers the app never calls directly.
    execute $q$revoke all on function public.rider_payout(public.orders), public.rider_job_json(public.orders, boolean) from public, anon, authenticated$q$;
  end if;
end $grants$;
