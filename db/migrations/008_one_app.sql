-- One Arodan app for shoppers, riders and merchants (decision 2026-11-26).
-- Anyone can apply to ride from the app; they can go online only after Arodan has done the
-- NIN, guarantor and home-address checks (rider_is_vetted in 005_riders.sql).
-- Merchants already apply through register_merchant (004_merchants.sql).
-- The app registers one push token for all three parts ('arodan').

-- ───────────────────────── Rider applications ─────────────────────────
alter table public.riders add column home_address text not null default '';
alter table public.riders add column guarantor_name text not null default '';
alter table public.riders add column guarantor_phone text not null default '';
alter table public.riders add column applied_at timestamptz;

-- "2348031234567" → "0803 123 4567"
create function public.local_phone(p text) returns text language sql immutable as $$
  select case when p ~ '^234\d{10}$' then '0' || substr(p, 4, 3) || ' ' || substr(p, 7, 3) || ' ' || substr(p, 10, 4) else coalesce(p, '') end
$$;

create function public.rider_apply(p jsonb) returns public.riders
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  r riders;
  existed boolean;
  nm text := left(btrim(coalesce(p ->> 'name', '')), 80);
  veh text := coalesce(p ->> 'vehicle', '');
  v_plate text := upper(left(btrim(coalesce(p ->> 'plate', '')), 20));
  home text := left(btrim(coalesce(p ->> 'homeAddress', '')), 200);
  g_name text := left(btrim(coalesce(p ->> 'guarantorName', '')), 80);
  g_phone text := regexp_replace(coalesce(p ->> 'guarantorPhone', ''), '\D', '', 'g');
begin
  if uid is null then raise exception 'not signed in'; end if;
  if length(nm) < 2 then raise exception 'Enter your full name'; end if;
  if veh not in ('motorbike', 'bicycle') then raise exception 'Choose motorbike or bicycle'; end if;
  if veh = 'motorbike' and length(v_plate) < 4 then raise exception 'Enter your plate number'; end if;
  if length(home) < 5 then raise exception 'Enter your home address'; end if;
  if length(g_name) < 2 then raise exception 'Enter your guarantor''s name'; end if;
  if g_phone !~ '^(0|234)?[789][01]\d{8}$' then raise exception 'Enter your guarantor''s phone number'; end if;

  select * into r from riders where id = uid for update;
  existed := found;
  if existed and public.rider_is_vetted(r) then raise exception 'You are already an Arodan rider'; end if;
  if existed and not r.active then raise exception 'Your rider account is paused. Call Arodan support.'; end if;

  update profiles set full_name = nm where id = uid;
  if existed then
    -- Still in review: let them correct their details.
    update riders set display_name = nm, vehicle = veh, plate = v_plate, home_address = home,
      guarantor_name = g_name, guarantor_phone = g_phone
    where id = uid returning * into r;
  else
    insert into riders (id, display_name, phone, vehicle, plate, home_address, guarantor_name, guarantor_phone, applied_at)
    select uid, nm, public.local_phone(pr.phone), veh, v_plate, home, g_name, g_phone, now()
    from profiles pr where pr.id = uid
    returning * into r;
  end if;
  return r;
end $$;

-- ───────────────────────── Roles for the app ─────────────────────────
-- none | pending | approved | paused, for riding and for selling.
create function public.my_roles() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'rider', coalesce((select case when not r.active then 'paused' when public.rider_is_vetted(r) then 'approved' else 'pending' end
                       from riders r where r.id = auth.uid()), 'none'),
    'merchant', coalesce((select case m.status when 'live' then 'approved' when 'suspended' then 'paused' else 'pending' end
                          from merchants m where m.owner_id = auth.uid()), 'none'))
$$;

-- ───────────────────────── Ops: reviewing riders ─────────────────────────
create function public.rider_admin_json(r public.riders) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'id', r.id, 'name', r.display_name, 'phone', r.phone, 'vehicle', r.vehicle, 'plate', r.plate,
    'homeAddress', r.home_address, 'guarantorName', r.guarantor_name, 'guarantorPhone', r.guarantor_phone,
    'appliedAt', r.applied_at, 'active', r.active, 'online', r.is_online, 'trips', r.trips,
    'checks', jsonb_build_object('nin', r.nin_verified, 'guarantor', r.guarantor_confirmed, 'address', r.address_visited),
    'status', case when not r.active then 'paused' when public.rider_is_vetted(r) then 'approved' else 'pending' end)
$$;

-- p_status: '' (all), 'pending', 'approved' or 'paused'.
create function public.admin_riders(p_status text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from profiles where id = auth.uid() and role = 'admin') then raise exception 'not allowed'; end if;
  return (select coalesce(jsonb_agg(j order by j ->> 'appliedAt' desc nulls last), '[]')
          from (select public.rider_admin_json(r) as j from riders r) x
          where coalesce(p_status, '') = '' or j ->> 'status' = p_status);
end $$;

-- Tick off checks, or pause / resume a rider. Keys left out stay as they are.
create function public.admin_set_rider(p_rider_id uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r riders;
begin
  if not exists (select 1 from profiles where id = auth.uid() and role = 'admin') then raise exception 'not allowed'; end if;
  update riders set
    nin_verified = coalesce((p ->> 'nin')::boolean, nin_verified),
    guarantor_confirmed = coalesce((p ->> 'guarantor')::boolean, guarantor_confirmed),
    address_visited = coalesce((p ->> 'address')::boolean, address_visited),
    active = coalesce((p ->> 'active')::boolean, active)
  where id = p_rider_id returning * into r;
  if not found then raise exception 'rider not found'; end if;
  -- A rider who loses a check or is paused goes offline.
  if not public.rider_is_vetted(r) and r.is_online then
    update riders set is_online = false where id = r.id returning * into r;
  end if;
  update profiles set role = 'rider' where id = r.id and role = 'customer' and public.rider_is_vetted(r);
  return public.rider_admin_json(r);
end $$;

-- ───────────────────────── One push token for the whole app ─────────────────────────
alter table public.push_tokens drop constraint push_tokens_app_check;
alter table public.push_tokens add constraint push_tokens_app_check check (app in ('customer', 'rider', 'merchant', 'arodan'));

-- ───────────────────────── Permissions ─────────────────────────
do $grants$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute $q$revoke all on function public.rider_apply(jsonb), public.my_roles(), public.admin_riders(text),
      public.admin_set_rider(uuid, jsonb) from public, anon$q$;
    execute $q$grant execute on function public.rider_apply(jsonb), public.my_roles(), public.admin_riders(text),
      public.admin_set_rider(uuid, jsonb) to authenticated$q$;
    execute $q$revoke all on function public.rider_admin_json(public.riders) from public, anon, authenticated$q$;
  end if;
end $grants$;
