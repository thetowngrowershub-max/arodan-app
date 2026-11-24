-- Merchants: sign-up, their own product listings (photos, prices, stock), the orders they prepare
-- for rider pickup, and their sales. Used by merchant-app/. The customer catalogue is simply every
-- listing from a merchant that is approved ("live") and open, so new listings show up for customers at once.

-- ───────────────────────── Where merchants are ─────────────────────────
-- Until real routing is added, a merchant picks their area and the road distance to the pilot area comes from here.
create table public.merchant_areas (
  id text primary key,
  name text not null,
  distance_km numeric(5, 2) not null,
  duration_min int not null,
  sort int not null default 0
);

insert into public.merchant_areas (id, name, distance_km, duration_min, sort) values
  ('magodo2', 'Magodo Phase 2', 1.8, 9, 0),
  ('magodo1', 'Magodo Phase 1 / Isheri', 3.0, 12, 1),
  ('shangisha', 'Shangisha', 3.2, 14, 2),
  ('alapere', 'Alapere / Ketu', 5.6, 22, 3),
  ('ojota', 'Ojota', 4.1, 16, 4),
  ('ogudu', 'Ogudu / GRA', 6.5, 25, 5),
  ('mile12', 'Mile 12', 7.4, 28, 6),
  ('ikeja', 'Ikeja / Computer Village', 11.5, 38, 7),
  ('maryland', 'Maryland / Anthony', 9.0, 32, 8)
on conflict (id) do nothing;

-- ───────────────────────── Merchant accounts ─────────────────────────
alter table public.merchants
  add column status text not null default 'live' check (status in ('pending', 'live', 'suspended')),
  add column is_open boolean not null default true, -- the merchant can close their shop for a while
  add column contact_phone text not null default '',
  add column address text not null default '',
  add column area_id text references public.merchant_areas (id),
  add column categories text[] not null default '{}',
  add column bank_name text not null default '',
  add column account_number text not null default '',
  add column account_name text not null default '',
  add column created_at timestamptz not null default now();
alter table public.merchants alter column id set default ('m_' || substr(md5(gen_random_uuid()::text), 1, 12));
-- Arodan's starter merchants (db/seed.sql), if already loaded
update public.merchants set area_id = case id when 'm1' then 'magodo2' when 'm2' then 'shangisha' when 'm3' then 'ikeja' when 'm4' then 'alapere' end
where id in ('m1', 'm2', 'm3', 'm4') and area_id is null;
create unique index merchants_owner_idx on public.merchants (owner_id) where owner_id is not null;

alter table public.products alter column id set default ('p_' || substr(md5(gen_random_uuid()::text), 1, 12));
alter table public.products add column updated_at timestamptz not null default now();
alter table public.products add constraint products_stock_check check (stock is null or stock >= 0);
alter table public.products add constraint products_name_check check (length(trim(name)) >= 2);
create index on public.products (merchant_id);

-- Product photos, kept in the database so the usual backup covers them. Served at /images/:id.
create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  merchant_id text not null references public.merchants (id) on delete cascade,
  content_type text not null check (content_type in ('image/jpeg', 'image/png', 'image/webp')),
  data bytea not null check (octet_length(data) <= 2 * 1024 * 1024),
  created_at timestamptz not null default now()
);

-- ───────────────────────── Each merchant's part of an order ─────────────────────────
-- One customer order can hold items from several merchants; each prepares their own part.
create type public.merchant_order_status as enum ('new', 'preparing', 'ready', 'picked_up', 'declined', 'cancelled');

create table public.order_merchants (
  order_id uuid not null references public.orders (id) on delete cascade,
  merchant_id text not null references public.merchants (id),
  status public.merchant_order_status not null default 'new',
  items_total int not null,
  decline_reason text,
  ready_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (order_id, merchant_id)
);
create index on public.order_merchants (merchant_id, status);

-- ───────────────────────── Helpers ─────────────────────────
-- The signed-in user's merchant id (null if they have no merchant account, or it is suspended).
create function public.my_merchant_id() returns text
language sql stable security definer set search_path = public as $$
  select id from merchants where owner_id = auth.uid() and status <> 'suspended'
$$;

-- Whether customers can buy from this merchant right now.
create function public.merchant_selling(p_merchant_id text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from merchants where id = p_merchant_id and active and status = 'live' and is_open)
$$;

-- Full merchant record, including bank details, for the owner only.
create function public.merchant_json(m public.merchants) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'id', m.id, 'name', m.name, 'status', m.status, 'isOpen', m.is_open, 'phone', m.contact_phone,
    'address', m.address, 'areaId', m.area_id, 'area', m.area, 'distanceKm', m.distance_km,
    'categories', to_jsonb(m.categories), 'bankName', m.bank_name, 'accountNumber', m.account_number,
    'accountName', m.account_name, 'createdAt', m.created_at)
$$;

create function public.my_merchant() returns jsonb
language sql stable security definer set search_path = public as $$
  select public.merchant_json(m) from merchants m where m.owner_id = auth.uid()
$$;

-- ───────────────────────── Sign-up and settings ─────────────────────────
create function public.register_merchant(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  a merchant_areas;
  m merchants;
  demo boolean := coalesce((select demo_mode from pricing_config where id = 1), false);
begin
  if uid is null then raise exception 'not signed in'; end if;
  if exists (select 1 from merchants where owner_id = uid) then raise exception 'You already have a merchant account'; end if;
  if length(trim(coalesce(p ->> 'name', ''))) < 2 then raise exception 'Enter your business name'; end if;
  if length(trim(coalesce(p ->> 'address', ''))) < 4 then raise exception 'Enter your shop address'; end if;
  if length(trim(coalesce(p ->> 'phone', ''))) < 10 then raise exception 'Enter a phone number for the shop'; end if;
  select * into a from merchant_areas where id = p ->> 'areaId';
  if not found then raise exception 'Choose your area'; end if;

  insert into merchants (name, area, distance_km, duration_min, owner_id, status, contact_phone, address, area_id,
                         categories, bank_name, account_number, account_name)
  values (left(trim(p ->> 'name'), 80), a.name, a.distance_km, a.duration_min, uid,
          -- New merchants wait for Arodan to approve them; in demo mode they go live at once for testing.
          case when demo then 'live' else 'pending' end,
          left(trim(p ->> 'phone'), 20), left(trim(p ->> 'address'), 200), a.id,
          coalesce(array(select jsonb_array_elements_text(p -> 'categories') intersect select id from categories), '{}'),
          left(trim(coalesce(p ->> 'bankName', '')), 60), left(regexp_replace(coalesce(p ->> 'accountNumber', ''), '\D', '', 'g'), 10),
          left(trim(coalesce(p ->> 'accountName', '')), 80))
  returning * into m;
  update profiles set role = 'merchant' where id = uid and role = 'customer';
  return public.merchant_json(m);
end $$;

-- Change shop details. Only the keys present in p are changed.
create function public.update_my_merchant(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  m merchants;
  a merchant_areas;
begin
  select * into m from merchants where owner_id = auth.uid() for update;
  if not found then raise exception 'No merchant account'; end if;
  if p ? 'name' and length(trim(coalesce(p ->> 'name', ''))) < 2 then raise exception 'Enter your business name'; end if;
  if p ? 'areaId' then
    select * into a from merchant_areas where id = p ->> 'areaId';
    if not found then raise exception 'Choose your area'; end if;
  end if;
  update merchants set
    name = case when p ? 'name' then left(trim(p ->> 'name'), 80) else name end,
    is_open = case when p ? 'isOpen' then (p ->> 'isOpen')::boolean else is_open end,
    contact_phone = case when p ? 'phone' then left(trim(p ->> 'phone'), 20) else contact_phone end,
    address = case when p ? 'address' then left(trim(p ->> 'address'), 200) else address end,
    area_id = coalesce(a.id, area_id),
    area = coalesce(a.name, area),
    distance_km = coalesce(a.distance_km, distance_km),
    duration_min = coalesce(a.duration_min, duration_min),
    categories = case when p ? 'categories'
      then coalesce(array(select jsonb_array_elements_text(p -> 'categories') intersect select id from categories), '{}')
      else categories end,
    bank_name = case when p ? 'bankName' then left(trim(p ->> 'bankName'), 60) else bank_name end,
    account_number = case when p ? 'accountNumber' then left(regexp_replace(p ->> 'accountNumber', '\D', '', 'g'), 10) else account_number end,
    account_name = case when p ? 'accountName' then left(trim(p ->> 'accountName'), 80) else account_name end
  where id = m.id
  returning * into m;
  return public.merchant_json(m);
end $$;

-- Arodan staff approve (or suspend) merchants.
create function public.admin_set_merchant_status(p_merchant_id text, p_status text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m merchants;
begin
  if not exists (select 1 from profiles where id = auth.uid() and role = 'admin') then raise exception 'not allowed'; end if;
  if p_status not in ('pending', 'live', 'suspended') then raise exception 'invalid status'; end if;
  update merchants set status = p_status where id = p_merchant_id returning * into m;
  if not found then raise exception 'merchant not found'; end if;
  return public.merchant_json(m);
end $$;

create function public.admin_merchants(p_status text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from profiles where id = auth.uid() and role = 'admin') then raise exception 'not allowed'; end if;
  return (select coalesce(jsonb_agg(public.merchant_json(m) order by m.created_at desc), '[]')
          from merchants m where coalesce(p_status, '') = '' or m.status = p_status);
end $$;

-- ───────────────────────── Pricing: only sellable, in-stock listings ─────────────────────────
create or replace function public.price_order(p_items jsonb, p_errands jsonb, p_at timestamptz default now())
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
    left join products p on p.id = i ->> 'product_id' and p.active and public.merchant_selling(p.merchant_id)
  loop
    if r.id is null then raise exception 'product not available'; end if;
    if r.qty is null or r.qty < 1 or r.qty > 50 then raise exception 'invalid quantity'; end if;
    items_total := items_total + r.price * r.qty;
    weight := weight + r.weight_kg * r.qty;
    longest := greatest(longest, r.side);
  end loop;

  -- Stock (only for products whose stock the merchant tracks)
  for r in
    select p.name, p.stock, sum((i ->> 'qty')::int) as qty
    from jsonb_array_elements(coalesce(p_items, '[]')) i
    join products p on p.id = i ->> 'product_id'
    where p.stock is not null
    group by p.id, p.name, p.stock
  loop
    if r.stock = 0 then raise exception '% is sold out', r.name; end if;
    if r.qty > r.stock then raise exception 'Only % of % left', r.stock, r.name; end if;
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

-- ───────────────────────── Placing an order: stock and merchant parts ─────────────────────────
create or replace function public.place_order(p_address_id uuid, p_items jsonb, p_errands jsonb, p_payment public.payment_method)
returns public.orders language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  a addresses;
  b jsonb;
  o orders;
  c jsonb := (select config from pricing_config where id = 1);
  r record;
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

  -- Take tracked stock. The row lock plus "stock >= qty" stops two customers buying the last one.
  for r in select product_id, sum(qty)::int as qty from order_items where order_id = o.id group by product_id loop
    update products set stock = stock - r.qty, updated_at = now() where id = r.product_id and stock is not null and stock >= r.qty;
    if not found and exists (select 1 from products where id = r.product_id and stock is not null) then
      raise exception '% just sold out', (select name from products where id = r.product_id);
    end if;
  end loop;

  insert into order_merchants (order_id, merchant_id, items_total)
  select o.id, p.merchant_id, sum(i.unit_price * i.qty)::int
  from order_items i join products p on p.id = i.product_id
  where i.order_id = o.id group by p.merchant_id;

  insert into order_errands (order_id, type, title, details, spot_id, est_min, budget, fee)
  select o.id, e ->> 'type', left(coalesce(nullif(e ->> 'title', ''), 'Errand'), 200), left(coalesce(e ->> 'details', ''), 1000),
         e ->> 'spot_id', (e ->> 'est_min')::int, coalesce((e ->> 'budget')::int, 0), public.errand_fee((e ->> 'est_min')::int, c)
  from jsonb_array_elements(coalesce(p_errands, '[]')) e;

  insert into order_events (order_id, status) values (o.id, 'placed');
  return o;
end $$;

-- When an order changes status:
--  * cancelled: tracked stock goes back on the shelf and every merchant part is closed.
--  * collected by the rider: every merchant part must be ready first (Arodan's own seed merchants,
--    which have no merchant account, count as ready), then the parts are marked picked up.
create function public.on_order_status_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = old.status then return new; end if;
  if new.status = 'cancelled' then
    update products p set stock = p.stock + x.qty, updated_at = now()
    from (select product_id, sum(qty)::int as qty from order_items where order_id = new.id group by product_id) x
    where p.id = x.product_id and p.stock is not null;
    update order_merchants set status = 'cancelled', updated_at = now()
    where order_id = new.id and status not in ('declined', 'cancelled', 'picked_up');
  elsif new.status >= 'picked_up' and old.status < 'picked_up' then
    if exists (
      select 1 from order_merchants om join merchants m on m.id = om.merchant_id
      where om.order_id = new.id and om.status in ('new', 'preparing') and m.owner_id is not null
    ) and not exists (select 1 from profiles where id = auth.uid() and role = 'admin') then
      raise exception 'Waiting for the shop to get this order ready';
    end if;
    update order_merchants set status = 'picked_up', updated_at = now()
    where order_id = new.id and status in ('new', 'preparing', 'ready');
  end if;
  return new;
end $$;

create trigger order_status_change after update of status on public.orders
for each row execute function public.on_order_status_change();

-- ───────────────────────── Merchant order actions ─────────────────────────
-- new → preparing (accept) → ready (for rider pickup). A merchant can decline a new or preparing order
-- (e.g. an item ran out); for the pilot that cancels the whole order so the customer is not charged.
create function public.merchant_set_order_status(p_order_id uuid, p_status public.merchant_order_status, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  mid text := public.my_merchant_id();
  om order_merchants;
  o orders;
begin
  if mid is null then raise exception 'No merchant account'; end if;
  select * into om from order_merchants where order_id = p_order_id and merchant_id = mid for update;
  if not found then raise exception 'order not found'; end if;
  select * into o from orders where id = p_order_id for update;
  if o.status = 'cancelled' then raise exception 'This order was cancelled'; end if;

  if p_status = 'preparing' and om.status = 'new'
     or p_status = 'ready' and om.status in ('new', 'preparing') then
    update order_merchants set status = p_status, updated_at = now(),
      ready_at = case when p_status = 'ready' then now() else ready_at end
    where order_id = p_order_id and merchant_id = mid;
  elsif p_status = 'declined' and om.status in ('new', 'preparing') and o.status < 'picked_up' then
    update order_merchants set status = 'declined', decline_reason = left(coalesce(nullif(trim(p_reason), ''), 'Not available'), 200), updated_at = now()
    where order_id = p_order_id and merchant_id = mid;
    update orders set status = 'cancelled', updated_at = now() where id = p_order_id;
    insert into order_events (order_id, status) values (p_order_id, 'cancelled');
  else
    raise exception 'You can''t do that to this order now';
  end if;
end $$;

-- The merchant's orders. Shows only their own items and the customer's first name: never the
-- delivery address, gate code or phone number. The rider is shown once assigned, for the handover.
create function public.merchant_orders(p_active boolean default false, p_order_id uuid default null, p_limit int default 100)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x.j order by x.created_at desc), '[]')
  from (
    select o.created_at, jsonb_build_object(
      'id', o.id, 'code', o.code, 'createdAt', o.created_at, 'status', om.status, 'orderStatus', o.status,
      'itemsTotal', om.items_total, 'declineReason', om.decline_reason, 'readyAt', om.ready_at, 'updatedAt', om.updated_at,
      'customerName', coalesce(nullif(split_part(trim(pr.full_name), ' ', 1), ''), 'Customer'),
      'items', (select coalesce(jsonb_agg(jsonb_build_object('productId', i.product_id, 'name', i.name, 'unitPrice', i.unit_price,
                         'qty', i.qty, 'imageUrl', p.image_url, 'emoji', p.emoji, 'unit', p.unit) order by i.id), '[]')
                from order_items i join products p on p.id = i.product_id
                where i.order_id = o.id and p.merchant_id = om.merchant_id),
      'rider', (select jsonb_build_object('name', r.display_name, 'phone', r.phone, 'vehicle', r.vehicle, 'plate', r.plate)
                from riders r where r.id = o.rider_id)
    ) as j
    from order_merchants om
    join orders o on o.id = om.order_id
    join profiles pr on pr.id = o.customer_id
    where om.merchant_id = public.my_merchant_id()
      and (p_order_id is null or o.id = p_order_id)
      and (not p_active or (om.status in ('new', 'preparing', 'ready') and o.status <> 'cancelled'))
    order by o.created_at desc
    limit least(greatest(p_limit, 1), 200)
  ) x
$$;

-- Sales over the last p_days days (Lagos time), counting every part not declined or cancelled.
create function public.merchant_sales(p_days int default 7) returns jsonb
language sql stable security definer set search_path = public as $$
  with mid as (select public.my_merchant_id() as id),
  d as (select least(greatest(p_days, 1), 90) as n, (now() at time zone 'Africa/Lagos')::date as today),
  parts as (
    select om.*, (o.created_at at time zone 'Africa/Lagos')::date as day
    from order_merchants om join orders o on o.id = om.order_id, d
    where om.merchant_id = (select id from mid) and om.status not in ('declined', 'cancelled')
      and o.created_at >= ((d.today - (d.n - 1))::timestamp at time zone 'Africa/Lagos')
  ),
  lines as (
    select i.product_id, i.name, i.qty, i.unit_price * i.qty as amount
    from parts pt join order_items i on i.order_id = pt.order_id join products p on p.id = i.product_id and p.merchant_id = pt.merchant_id
  )
  select jsonb_build_object(
    'days', (select n from d),
    'sales', (select coalesce(sum(items_total), 0) from parts),
    'orders', (select count(*) from parts),
    'itemsSold', (select coalesce(sum(qty), 0) from lines),
    'avgOrder', (select coalesce(round(avg(items_total)), 0) from parts),
    'today', jsonb_build_object(
      'sales', (select coalesce(sum(items_total), 0) from parts, d where day = d.today),
      'orders', (select count(*) from parts, d where day = d.today)),
    'daily', (select jsonb_agg(jsonb_build_object('date', g.day, 'sales', coalesce(s.sales, 0), 'orders', coalesce(s.orders, 0)) order by g.day)
              from (select generate_series(d.today - (d.n - 1), d.today, interval '1 day')::date as day from d) g
              left join (select day, sum(items_total) as sales, count(*) as orders from parts group by day) s on s.day = g.day),
    'topProducts', (select coalesce(jsonb_agg(t order by t.sales desc), '[]') from (
                      select product_id as "productId", name, sum(qty) as qty, sum(amount) as sales
                      from lines group by product_id, name order by sum(amount) desc limit 5) t),
    'openOrders', (select count(*) from order_merchants om join orders o on o.id = om.order_id
                   where om.merchant_id = (select id from mid) and om.status in ('new', 'preparing', 'ready') and o.status <> 'cancelled')
  )
$$;

-- ───────────────────────── Row level security ─────────────────────────
alter table public.merchant_areas enable row level security;
alter table public.product_images enable row level security;
alter table public.order_merchants enable row level security;

create policy "public read" on public.merchant_areas for select using (true);

-- Customers see only merchants that are selling, and only these columns (no bank details or owner).
drop policy "public read" on public.merchants;
create policy "public read" on public.merchants for select using (active and status = 'live' and is_open);

-- Listings: customers see active listings from selling merchants; merchants see and edit all of their own.
drop policy "public read" on public.products;
create policy "public read" on public.products for select using (active and public.merchant_selling(merchant_id));
create policy "merchant reads own" on public.products for select using (merchant_id = public.my_merchant_id());
create policy "merchant adds own" on public.products for insert with check (merchant_id = public.my_merchant_id());
create policy "merchant edits own" on public.products for update using (merchant_id = public.my_merchant_id()) with check (merchant_id = public.my_merchant_id());

create policy "public read" on public.product_images for select using (true);
create policy "merchant uploads own" on public.product_images for insert with check (merchant_id = public.my_merchant_id());

-- Customers can see how each shop is getting on with their order. Changes go through the functions above.
create policy "via order" on public.order_merchants for select using (exists (select 1 from public.orders o where o.id = order_id));

-- Role grants (skipped on hosts that don't allow creating the anon/authenticated roles;
-- the API then filters by merchant itself, see server/src/merchant.js).
do $grants$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute $q$revoke all on public.merchants from anon, authenticated$q$;
    execute $q$grant select (id, name, area, distance_km, duration_min, active, status, is_open) on public.merchants to anon, authenticated$q$;
    execute $q$revoke insert, update, delete on public.products from anon, authenticated$q$;
    -- Merchants can't set ratings, "popular" or move a listing to another merchant.
    execute $q$grant insert (merchant_id, category_id, name, unit, price, weight_kg, longest_side_cm, emoji, image_url, description, stock, active) on public.products to authenticated$q$;
    execute $q$grant update (category_id, name, unit, price, weight_kg, longest_side_cm, emoji, image_url, description, stock, active, updated_at) on public.products to authenticated$q$;
    execute $q$revoke update, delete on public.product_images from anon, authenticated$q$;
    execute $q$revoke insert on public.product_images from anon$q$;
    execute $q$revoke insert, update, delete on public.order_merchants from anon, authenticated$q$;
    execute $q$revoke all on function public.my_merchant(), public.register_merchant(jsonb), public.update_my_merchant(jsonb),
  public.admin_set_merchant_status(text, text), public.admin_merchants(text), public.merchant_set_order_status(uuid, public.merchant_order_status, text),
  public.merchant_orders(boolean, uuid, int), public.merchant_sales(int) from public, anon$q$;
    execute $q$grant execute on function public.my_merchant(), public.register_merchant(jsonb), public.update_my_merchant(jsonb),
  public.admin_set_merchant_status(text, text), public.admin_merchants(text), public.merchant_set_order_status(uuid, public.merchant_order_status, text),
  public.merchant_orders(boolean, uuid, int), public.merchant_sales(int) to authenticated$q$;
    execute $q$grant execute on function public.my_merchant_id(), public.merchant_selling(text) to anon, authenticated$q$;
  end if;
end $grants$;
