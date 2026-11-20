-- Database checks. Run on a throwaway database after db/migrations/*.sql and db/seed.sql:
--   psql -v ON_ERROR_STOP=1 -f db/tests/backend_test.sql
-- Every check raises an exception if it fails.
\set ON_ERROR_STOP 1
insert into auth.users (id, phone) values ('11111111-1111-4111-8111-111111111111', '2348031234567'), ('22222222-2222-4222-8222-222222222222', '2348039999999');

-- Customer A
set role authenticated; set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
update profiles set full_name = 'Ada Customer';
do $$ begin
  begin update profiles set role = 'admin'; raise exception 'FAIL: role change allowed'; exception when insufficient_privilege then null; end;
end $$;
insert into addresses (user_id, estate, street, house_no, gate_name, gate_code) values ('11111111-1111-4111-8111-111111111111', 'Magodo Phase 2', 'Oluwole Oke St', '14B', 'CMD Road gate', '4821');
do $$ begin
  begin insert into addresses (user_id, estate, street, house_no) values ('22222222-2222-4222-8222-222222222222', 'x', 'y', 'z'); raise exception 'FAIL: wrote another user''s address'; exception when insufficient_privilege then null; end;
  begin insert into orders (customer_id, address, payment_method, quote, items_total, errand_purchases, errand_fees, service_charge, delivery_fee, small_order_fee, total, eta_min) values ('11111111-1111-4111-8111-111111111111', '{}', 'card', '{}', 0,0,0,0,0,0,1,1); raise exception 'FAIL: direct order insert'; exception when insufficient_privilege then null; end;
end $$;

do $$ declare o orders; a uuid := (select id from addresses limit 1); n int; begin
  o := place_order(a, '[{"product_id":"p1","qty":2}]', '[{"type":"laundry","title":"Collect shirts","spot_id":"s1","est_min":20,"budget":0}]', 'card');
  if o.items_total <> 29000 then raise exception 'FAIL items %', o.items_total; end if;
  if o.errand_fees <> 650 then raise exception 'FAIL errand fee %', o.errand_fees; end if;
  if o.service_charge <> round((29000 + 650) * 0.075) then raise exception 'FAIL service %', o.service_charge; end if;
  if o.address ->> 'gateCode' <> '4821' then raise exception 'FAIL address snapshot'; end if;
  select count(*) into n from order_items where order_id = o.id; if n <> 1 then raise exception 'FAIL items rows'; end if;
  -- demo progression assigns a rider the customer can then see
  o := demo_advance_order(o.id);
  if o.status <> 'assigned' or o.rider_id is null then raise exception 'FAIL demo advance %', o.status; end if;
  select count(*) into n from riders where id = o.rider_id; if n <> 1 then raise exception 'FAIL rider not visible'; end if;
  begin perform set_order_status(o.id, 'cancelled'); raise exception 'FAIL: cancelled after rider assigned'; exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  -- tampered input
  begin perform place_order(a, '[{"product_id":"p1","qty":-3}]', '[]', 'card'); raise exception 'FAIL: negative qty'; exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin perform place_order(a, '[{"product_id":"nope","qty":1}]', '[]', 'card'); raise exception 'FAIL: unknown product'; exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  -- a fresh order can be cancelled
  o := place_order(a, '[{"product_id":"p7","qty":1}]', '[]', 'pod');
  if o.small_order_fee <> 300 then raise exception 'FAIL small order fee'; end if;
  o := set_order_status(o.id, 'cancelled');
  if o.status <> 'cancelled' then raise exception 'FAIL cancel'; end if;
end $$;

-- Customer B sees nothing of A's
set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
do $$ declare n int; a uuid; begin
  select count(*) into n from orders; if n <> 0 then raise exception 'FAIL: B sees A orders'; end if;
  select count(*) into n from addresses; if n <> 0 then raise exception 'FAIL: B sees A addresses'; end if;
  select count(*) into n from order_items; if n <> 0 then raise exception 'FAIL: B sees A items'; end if;
  select count(*) into n from riders; if n <> 0 then raise exception 'FAIL: B sees riders'; end if;
  select id into a from orders limit 1;
  begin perform place_order((select id from public.addresses limit 1), '[{"product_id":"p1","qty":1}]', '[]', 'card'); raise exception 'FAIL: B used A address'; exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;

-- Signed-out visitors can browse and get quotes, nothing else
reset request.jwt.claim.sub; set role anon;
do $$ declare n int; begin
  select count(*) into n from products; if n < 20 then raise exception 'FAIL: anon cannot browse'; end if;
  perform price_order('[{"product_id":"p1","qty":1}]', '[]');
  select count(*) into n from orders; if n <> 0 then raise exception 'FAIL: anon sees orders'; end if;
end $$;
reset role;
select 'ALL BACKEND TESTS PASSED';
