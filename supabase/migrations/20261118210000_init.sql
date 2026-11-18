-- Arodan backend: initial schema for the customer app (and the rider / merchant apps to come).
-- Run on a Supabase project: Dashboard > SQL editor, or `supabase db push`.

-- ───────────────────────── Users ─────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  phone text,
  full_name text,
  role text not null default 'customer' check (role in ('customer', 'rider', 'merchant', 'admin')),
  created_at timestamptz not null default now()
);

create table public.addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  label text not null default 'Home',
  estate text not null,
  street text not null,
  house_no text not null,
  landmark text not null default '',
  gate_name text not null default '',
  gate_code text not null default '',
  gate_note text not null default '',
  is_default boolean not null default true,
  created_at timestamptz not null default now()
);
create index on public.addresses (user_id);

-- Create a profile whenever someone signs up with their phone number.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, phone) values (new.id, new.phone) on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- ───────────────────────── Catalogue ─────────────────────────
create table public.categories (
  id text primary key,
  name text not null,
  emoji text not null default '',
  sort int not null default 0
);

create table public.merchants (
  id text primary key,
  name text not null,
  area text not null,
  distance_km numeric(5, 2) not null, -- road distance to the pilot area (until real routing is added)
  duration_min int not null,
  owner_id uuid references public.profiles (id),
  active boolean not null default true
);

create table public.products (
  id text primary key,
  merchant_id text not null references public.merchants (id),
  category_id text not null references public.categories (id),
  name text not null,
  unit text not null default '',
  price int not null check (price >= 0), -- Naira
  weight_kg numeric(6, 2) not null default 1,
  longest_side_cm int,
  emoji text not null default '📦',
  image_url text,
  rating numeric(2, 1) not null default 4.5,
  popular boolean not null default false,
  description text not null default '',
  stock int, -- null = not tracked
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index on public.products (category_id) where active;

create table public.errand_spots (
  id text primary key,
  name text not null,
  distance_km numeric(5, 2) not null,
  duration_min int not null,
  sort int not null default 0
);

-- One row holding every fee and rate. The app reads it, and place_order() prices with it,
-- so prices can change without releasing a new app.
create table public.pricing_config (
  id int primary key default 1 check (id = 1),
  config jsonb not null,
  demo_mode boolean not null default false, -- lets customers fast-forward their own order status for testing
  updated_at timestamptz not null default now()
);

-- ───────────────────────── Riders ─────────────────────────
create table public.riders (
  id uuid primary key references public.profiles (id) on delete cascade,
  display_name text not null,
  phone text not null,
  vehicle text not null check (vehicle in ('motorbike', 'bicycle')),
  plate text not null default '',
  rating numeric(2, 1) not null default 5.0,
  trips int not null default 0,
  nin_verified boolean not null default false,
  guarantor_confirmed boolean not null default false,
  address_visited boolean not null default false,
  is_online boolean not null default false,
  lat double precision,
  lng double precision,
  location_at timestamptz
);

-- ───────────────────────── Orders ─────────────────────────
create type public.order_status as enum ('placed', 'assigned', 'picked_up', 'on_the_way', 'at_gate', 'delivered', 'cancelled');
create type public.payment_method as enum ('card', 'transfer', 'pod');
create type public.payment_status as enum ('pending', 'paid', 'refunded', 'failed');

create sequence public.order_code_seq start 100001;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('AR' || nextval('public.order_code_seq')),
  customer_id uuid not null references public.profiles (id),
  rider_id uuid references public.riders (id),
  address jsonb not null, -- snapshot at order time
  status public.order_status not null default 'placed',
  payment_method public.payment_method not null,
  payment_status public.payment_status not null default 'pending',
  quote jsonb not null, -- delivery quote breakdown
  items_total int not null,
  errand_purchases int not null,
  errand_fees int not null,
  service_charge int not null,
  delivery_fee int not null,
  small_order_fee int not null,
  total int not null,
  eta_min int not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.orders (customer_id, created_at desc);
create index on public.orders (rider_id) where rider_id is not null;

create table public.order_items (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id text not null references public.products (id),
  name text not null,
  unit_price int not null,
  qty int not null check (qty > 0)
);
create index on public.order_items (order_id);

create table public.order_errands (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders (id) on delete cascade,
  type text not null check (type in ('buy', 'pickup', 'laundry', 'bills')),
  title text not null,
  details text not null default '',
  spot_id text not null references public.errand_spots (id),
  est_min int not null,
  budget int not null default 0,
  fee int not null
);
create index on public.order_errands (order_id);

create table public.order_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders (id) on delete cascade,
  status public.order_status not null,
  at timestamptz not null default now()
);
create index on public.order_events (order_id);

-- ───────────────────────── Pricing (server side) ─────────────────────────
-- Mirrors customer-app/src/lib/pricing.ts. The server's numbers are the ones charged.
create function public.price_order(p_items jsonb, p_errands jsonb, p_at timestamptz default now())
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  c jsonb := (select config from pricing_config where id = 1);
  v jsonb;
  vehicle text;
  local_ts timestamp := p_at at time zone 'Africa/Lagos';
  h int := extract(hour from local_ts);
  dow int := extract(isodow from local_ts);
  surge numeric := 1;
  far_d numeric := 0;
  far_t numeric := 0;
  n_stops int := 0;
  weight numeric := 0;
  longest int := 0;
  items_total int := 0;
  errand_purchases int := 0;
  errand_fees int := 0;
  raw numeric;
  transport numeric;
  wfee int;
  tier jsonb;
  needs_van boolean := false;
  stops_fee int;
  delivery int;
  service int;
  small int := 0;
  step int := (c ->> 'roundTo')::int;
  e jsonb;
  est_total int := 0;
  r record;
begin
  if c is null then raise exception 'pricing_config missing'; end if;
  if jsonb_array_length(coalesce(p_items, '[]')) = 0 and jsonb_array_length(coalesce(p_errands, '[]')) = 0 then
    raise exception 'empty order';
  end if;

  -- Shop items
  for r in
    select p.id, p.price, p.weight_kg, coalesce(p.longest_side_cm, 0) as side, (i ->> 'qty')::int as qty
    from jsonb_array_elements(coalesce(p_items, '[]')) i
    left join products p on p.id = i ->> 'product_id' and p.active
  loop
    if r.id is null then raise exception 'product not available'; end if;
    if r.qty is null or r.qty < 1 or r.qty > 50 then raise exception 'invalid quantity'; end if;
    items_total := items_total + r.price * r.qty;
    weight := weight + r.weight_kg * r.qty;
    longest := greatest(longest, r.side);
  end loop;

  -- One stop per merchant
  for r in
    select distinct m.id, m.distance_km, m.duration_min
    from jsonb_array_elements(coalesce(p_items, '[]')) i
    join products p on p.id = i ->> 'product_id'
    join merchants m on m.id = p.merchant_id
  loop
    n_stops := n_stops + 1;
    if r.distance_km > far_d then far_d := r.distance_km; far_t := r.duration_min; end if;
  end loop;

  -- Errands: one stop each, ~2 kg each
  for e in select * from jsonb_array_elements(coalesce(p_errands, '[]')) loop
    select s.distance_km, s.duration_min into r from errand_spots s where s.id = e ->> 'spot_id';
    if not found then raise exception 'unknown errand location'; end if;
    if coalesce((e ->> 'est_min')::int, 0) < 1 or (e ->> 'est_min')::int > 240 then raise exception 'invalid errand time'; end if;
    if coalesce((e ->> 'budget')::int, 0) < 0 then raise exception 'invalid errand budget'; end if;
    n_stops := n_stops + 1;
    weight := weight + 2;
    if r.distance_km > far_d then far_d := r.distance_km; far_t := r.duration_min; end if;
    errand_purchases := errand_purchases + coalesce((e ->> 'budget')::int, 0);
    errand_fees := errand_fees + public.errand_fee((e ->> 'est_min')::int, c);
    est_total := est_total + (e ->> 'est_min')::int;
  end loop;

  -- Vehicle
  vehicle := case
    when far_d <= (c #>> '{vehicles,bicycle,radiusKm}')::numeric and weight <= (c #>> '{vehicles,bicycle,maxKg}')::numeric then 'bicycle'
    else 'motorbike' end;
  v := c -> 'vehicles' -> vehicle;

  -- Surge (Lagos time)
  if dow between 1 and 5 and ((h >= 7 and h < 10) or (h >= 16 and h < 20)) then surge := (c #>> '{surge,weekdayPeak}')::numeric; end if;
  if h >= 21 then surge := greatest(surge, (c #>> '{surge,rainOrLate}')::numeric); end if;
  surge := least(surge, (c #>> '{surge,cap}')::numeric);

  raw := ((v ->> 'base')::numeric
        + (v ->> 'perKm')::numeric * least(far_d, (v ->> 'longAfterKm')::numeric)
        + (v ->> 'longKm')::numeric * greatest(0, far_d - (v ->> 'longAfterKm')::numeric)
        + (v ->> 'perMin')::numeric * far_t) * surge;
  transport := greatest((v ->> 'min')::numeric, raw);

  wfee := null;
  for tier in select * from jsonb_array_elements(c -> 'weightTiers') loop
    if weight <= (tier ->> 'upToKg')::numeric then wfee := (tier ->> 'fee')::int; exit; end if;
  end loop;
  needs_van := wfee is null or longest > (c ->> 'maxSideCm')::int;
  wfee := coalesce(wfee, 0);

  stops_fee := greatest(0, n_stops - 1) * (c ->> 'extraStop')::int;
  delivery := (ceil((transport + wfee + stops_fee) / step) * step)::int;

  service := round((items_total + errand_purchases + errand_fees
             + case when (c ->> 'serviceChargeOnDelivery')::boolean then delivery else 0 end)
             * (c ->> 'serviceChargeRate')::numeric)::int;
  if items_total > 0 and items_total < (c ->> 'smallOrderThreshold')::int then small := (c ->> 'smallOrderFee')::int; end if;

  return jsonb_build_object(
    'quote', jsonb_build_object(
      'vehicle', vehicle, 'transport', round(transport)::int, 'weight', wfee, 'stops', stops_fee, 'waiting', 0,
      'surge', surge, 'total', delivery, 'needsVanQuote', needs_van,
      'outOfRange', far_d > (c #>> '{vehicles,motorbike,radiusKm}')::numeric),
    'items_total', items_total,
    'errand_purchases', errand_purchases,
    'errand_fees', errand_fees,
    'service_charge', service,
    'delivery_fee', delivery,
    'small_order_fee', small,
    'total', items_total + errand_purchases + errand_fees + service + delivery + small,
    'eta_min', round(far_t + 15 + est_total)::int,
    'weight_kg', weight
  );
end $$;

create function public.errand_fee(p_min int, c jsonb) returns int
language sql immutable as $$
  select (ceil(((c #>> '{errand,firstBlockFee}')::numeric
          + greatest(0, p_min - (c #>> '{errand,firstBlockMin}')::int) * (c #>> '{errand,perExtraMin}')::numeric)
          / (c ->> 'roundTo')::numeric) * (c ->> 'roundTo')::numeric)::int
$$;

-- ───────────────────────── Order actions ─────────────────────────
create function public.place_order(p_address_id uuid, p_items jsonb, p_errands jsonb, p_payment public.payment_method)
returns public.orders language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  a addresses;
  b jsonb;
  o orders;
  c jsonb := (select config from pricing_config where id = 1);
begin
  if uid is null then raise exception 'not signed in'; end if;
  select * into a from addresses where id = p_address_id and user_id = uid;
  if not found then raise exception 'address not found'; end if;

  b := public.price_order(p_items, p_errands);

  insert into orders (customer_id, address, payment_method, quote, items_total, errand_purchases, errand_fees,
                      service_charge, delivery_fee, small_order_fee, total, eta_min)
  values (uid,
          jsonb_build_object('label', a.label, 'estate', a.estate, 'street', a.street, 'houseNo', a.house_no,
                             'landmark', a.landmark, 'gateName', a.gate_name, 'gateCode', a.gate_code, 'gateNote', a.gate_note),
          p_payment, b -> 'quote', (b ->> 'items_total')::int, (b ->> 'errand_purchases')::int, (b ->> 'errand_fees')::int,
          (b ->> 'service_charge')::int, (b ->> 'delivery_fee')::int, (b ->> 'small_order_fee')::int, (b ->> 'total')::int,
          (b ->> 'eta_min')::int)
  returning * into o;

  insert into order_items (order_id, product_id, name, unit_price, qty)
  select o.id, p.id, p.name, p.price, (i ->> 'qty')::int
  from jsonb_array_elements(coalesce(p_items, '[]')) i join products p on p.id = i ->> 'product_id';

  insert into order_errands (order_id, type, title, details, spot_id, est_min, budget, fee)
  select o.id, e ->> 'type', left(coalesce(nullif(e ->> 'title', ''), 'Errand'), 200), left(coalesce(e ->> 'details', ''), 1000),
         e ->> 'spot_id', (e ->> 'est_min')::int, coalesce((e ->> 'budget')::int, 0), public.errand_fee((e ->> 'est_min')::int, c)
  from jsonb_array_elements(coalesce(p_errands, '[]')) e;

  insert into order_events (order_id, status) values (o.id, 'placed');
  return o;
end $$;

create function public.set_order_status(p_order_id uuid, p_status public.order_status)
returns public.orders language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  o orders;
  is_admin boolean := exists (select 1 from profiles where id = uid and role = 'admin');
begin
  select * into o from orders where id = p_order_id for update;
  if not found then raise exception 'order not found'; end if;

  if p_status = 'cancelled' then
    -- Customers can cancel only before a rider is on it.
    if not (is_admin or (o.customer_id = uid and o.status = 'placed')) then raise exception 'cannot cancel this order'; end if;
  elsif not (is_admin or (o.rider_id = uid and p_status > o.status)) then
    raise exception 'not allowed';
  end if;

  update orders set status = p_status, updated_at = now() where id = o.id returning * into o;
  insert into order_events (order_id, status) values (o.id, p_status);
  return o;
end $$;

-- Testing aid: when pricing_config.demo_mode is on, a customer can move their own order to the
-- next step (the app does this on a timer). Turn demo_mode off before real customers use the app.
create function public.demo_advance_order(p_order_id uuid)
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
  nxt := (enum_range(o.status, null))[2];
  if nxt = 'assigned' and o.rider_id is null then
    select id into rid from riders where vehicle = (o.quote ->> 'vehicle') order by random() limit 1;
    if rid is null then select id into rid from riders order by random() limit 1; end if;
  end if;
  update orders set status = nxt, rider_id = coalesce(rider_id, rid), updated_at = now() where id = o.id returning * into o;
  insert into order_events (order_id, status) values (o.id, nxt);
  return o;
end $$;

-- ───────────────────────── Row level security ─────────────────────────
alter table public.profiles enable row level security;
alter table public.addresses enable row level security;
alter table public.categories enable row level security;
alter table public.merchants enable row level security;
alter table public.products enable row level security;
alter table public.errand_spots enable row level security;
alter table public.pricing_config enable row level security;
alter table public.riders enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_errands enable row level security;
alter table public.order_events enable row level security;

create policy "own profile" on public.profiles for select using (id = auth.uid());
create policy "update own profile" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
-- Users may change only their name (not their role or phone).
revoke update on public.profiles from anon, authenticated;
grant update (full_name) on public.profiles to authenticated;

create policy "own addresses" on public.addresses for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "public read" on public.categories for select using (true);
create policy "public read" on public.merchants for select using (active);
create policy "public read" on public.products for select using (active);
create policy "public read" on public.errand_spots for select using (true);
create policy "public read" on public.pricing_config for select using (true);

create policy "customer sees own orders" on public.orders for select using (customer_id = auth.uid() or rider_id = auth.uid());
create policy "via order" on public.order_items for select using (exists (select 1 from public.orders o where o.id = order_id));
create policy "via order" on public.order_errands for select using (exists (select 1 from public.orders o where o.id = order_id));
create policy "via order" on public.order_events for select using (exists (select 1 from public.orders o where o.id = order_id));

-- Customers see the rider on their own order; riders see themselves.
create policy "rider visible to their customers" on public.riders for select using (
  id = auth.uid() or exists (select 1 from public.orders o where o.rider_id = riders.id and o.customer_id = auth.uid())
);

-- Orders are created and changed only through the functions above.
revoke insert, update, delete on public.orders, public.order_items, public.order_errands, public.order_events from anon, authenticated;
revoke all on function public.price_order(jsonb, jsonb, timestamptz) from public;
grant execute on function public.price_order(jsonb, jsonb, timestamptz) to anon, authenticated;
revoke all on function public.place_order(uuid, jsonb, jsonb, public.payment_method) from public, anon;
grant execute on function public.place_order(uuid, jsonb, jsonb, public.payment_method) to authenticated;
revoke all on function public.set_order_status(uuid, public.order_status) from public, anon;
grant execute on function public.set_order_status(uuid, public.order_status) to authenticated;
revoke all on function public.demo_advance_order(uuid) from public, anon;
grant execute on function public.demo_advance_order(uuid) to authenticated;

-- Live tracking
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.orders, public.order_events;
  end if;
end $$;
