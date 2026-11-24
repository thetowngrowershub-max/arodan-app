-- Starter data for the Magodo Phase 2 pilot. Safe to re-run.

insert into public.pricing_config (id, config, demo_mode) values (1, '{"serviceChargeRate":0.075,"serviceChargeOnDelivery":false,"smallOrderThreshold":10000,"smallOrderFee":300,"roundTo":50,"vehicles":{"motorbike":{"base":500,"perKm":150,"longKm":200,"longAfterKm":8,"perMin":15,"min":1000,"radiusKm":15,"maxKg":30},"bicycle":{"base":300,"perKm":120,"longKm":120,"longAfterKm":8,"perMin":15,"min":700,"radiusKm":4,"maxKg":8}},"weightTiers":[{"upToKg":5,"fee":0},{"upToKg":10,"fee":300},{"upToKg":20,"fee":700},{"upToKg":30,"fee":1500}],"maxSideCm":80,"surge":{"weekdayPeak":1.2,"rainOrLate":1.3,"cap":1.5},"freeWaitMin":10,"waitPerMin":30,"extraStop":300,"errand":{"firstBlockFee":500,"firstBlockMin":15,"perExtraMin":25},"cancelAfterDispatchRate":0.5,"riderPayout":{"deliveryShare":0.8,"errandShare":0.8,"minPerDrop":800}}'::jsonb, true)
on conflict (id) do update set config = excluded.config, updated_at = now();

insert into public.categories (id, name, emoji, sort) values
  ('groceries', 'Groceries', '🥬', 0),
  ('household', 'Household', '🧴', 1),
  ('electronics', 'Electronics', '📺', 2),
  ('gadgets', 'Gadgets', '🎧', 3),
  ('drinks', 'Drinks', '🥤', 4),
  ('baby', 'Baby care', '🍼', 5)
on conflict (id) do update set name = excluded.name, emoji = excluded.emoji, sort = excluded.sort;

insert into public.merchants (id, name, area, distance_km, duration_min, area_id) values
  ('m1', 'Magodo Fresh Mart', 'Magodo Phase 2', 1.8, 9, 'magodo2'),
  ('m2', 'Shangisha Home Store', 'Shangisha', 3.2, 14, 'shangisha'),
  ('m3', 'Ikeja Gadget Hub', 'Computer Village, Ikeja', 11.5, 38, 'ikeja'),
  ('m4', 'Ketu Market Stalls', 'Ketu', 5.6, 22, 'alapere')
on conflict (id) do update set name = excluded.name, area = excluded.area, distance_km = excluded.distance_km, duration_min = excluded.duration_min, area_id = excluded.area_id;

insert into public.products (id, merchant_id, category_id, name, unit, price, weight_kg, longest_side_cm, emoji, rating, popular, description) values
  ('p1', 'm1', 'groceries', 'Ofada rice', '5 kg bag', 14500, 5, null, '🍚', 4.5, true, 'Ofada rice, sourced from a vetted Arodan merchant and delivered to your gate.'),
  ('p2', 'm4', 'groceries', 'Fresh tomatoes', '1 basket (small)', 3200, 2, null, '🍅', 4.5, true, 'Fresh tomatoes, sourced from a vetted Arodan merchant and delivered to your gate.'),
  ('p3', 'm4', 'groceries', 'Plantain bunch', '6 fingers', 4000, 2.5, null, '🍌', 4.5, false, 'Plantain bunch, sourced from a vetted Arodan merchant and delivered to your gate.'),
  ('p4', 'm1', 'groceries', 'Eggs, crate', '30 eggs', 5800, 1.8, null, '🥚', 4.5, true, 'Eggs, crate, sourced from a vetted Arodan merchant and delivered to your gate.'),
  ('p5', 'm1', 'groceries', 'Vegetable oil', '3 litres', 6900, 3, null, '🫙', 4.5, false, 'Vegetable oil, sourced from a vetted Arodan merchant and delivered to your gate.'),
  ('p6', 'm4', 'groceries', 'Yam tuber', '1 medium tuber', 3500, 2.5, null, '🍠', 4.5, false, 'Yam tuber, sourced from a vetted Arodan merchant and delivered to your gate.'),
  ('p7', 'm1', 'groceries', 'Sliced bread', 'Family loaf', 1600, 0.6, null, '🍞', 4.5, false, 'Sliced bread, sourced from a vetted Arodan merchant and delivered to your gate.'),
  ('p8', 'm2', 'household', 'Laundry detergent', '2 kg', 4200, 2, null, '🧺', 4.5, true, 'Laundry detergent, sourced from a vetted Arodan merchant and delivered to your gate.'),
  ('p9', 'm2', 'household', 'Toilet tissue', '12 rolls', 3900, 1.4, null, '🧻', 4.5, false, 'Toilet tissue, sourced from a vetted Arodan merchant and delivered to your gate.'),
  ('p10', 'm2', 'household', 'Dishwashing liquid', '750 ml', 1800, 0.8, null, '🧴', 4.5, false, 'Dishwashing liquid, sourced from a vetted Arodan merchant and delivered to your gate.'),
  ('p11', 'm2', 'household', 'Insecticide spray', '600 ml', 2600, 0.7, null, '🪲', 4.5, false, 'Insecticide spray, sourced from a vetted Arodan merchant and delivered to your gate.'),
  ('p12', 'm3', 'electronics', 'Rechargeable fan', '16 inch', 38500, 5.5, 60, '🌀', 4.5, true, 'Rechargeable fan, sourced from a vetted Arodan merchant and delivered to your gate.'),
  ('p13', 'm3', 'electronics', 'Electric kettle', '1.8 litres', 17900, 1.3, null, '🫖', 4.5, false, 'Electric kettle, sourced from a vetted Arodan merchant and delivered to your gate.'),
  ('p14', 'm3', 'electronics', 'Blender', '1.5 litres', 32000, 3, null, '🍹', 4.5, false, 'Blender, sourced from a vetted Arodan merchant and delivered to your gate.'),
  ('p15', 'm3', 'electronics', 'Smart TV 43"', '43 inch', 265000, 9, 105, '📺', 4.5, false, 'Large item. Needs a car/van delivery quote.'),
  ('p16', 'm3', 'gadgets', 'Wireless earbuds', '1 pair', 24500, 0.2, null, '🎧', 4.5, true, 'Wireless earbuds, sourced from a vetted Arodan merchant and delivered to your gate.'),
  ('p17', 'm3', 'gadgets', 'Power bank 20,000 mAh', '1 unit', 21000, 0.5, null, '🔋', 4.5, false, 'Power bank 20,000 mAh, sourced from a vetted Arodan merchant and delivered to your gate.'),
  ('p18', 'm3', 'gadgets', 'Phone charger (USB-C)', '25 W', 6500, 0.2, null, '🔌', 4.5, false, 'Phone charger (USB-C), sourced from a vetted Arodan merchant and delivered to your gate.'),
  ('p19', 'm3', 'gadgets', 'Smart watch', '1 unit', 45000, 0.2, null, '⌚', 4.5, false, 'Smart watch, sourced from a vetted Arodan merchant and delivered to your gate.'),
  ('p20', 'm1', 'drinks', 'Table water', 'Pack of 12', 2400, 6.5, null, '💧', 4.5, false, 'Table water, sourced from a vetted Arodan merchant and delivered to your gate.'),
  ('p21', 'm1', 'drinks', 'Malt drink', 'Pack of 6 cans', 5400, 2.1, null, '🥫', 4.5, false, 'Malt drink, sourced from a vetted Arodan merchant and delivered to your gate.'),
  ('p22', 'm1', 'drinks', 'Orange juice', '1 litre', 2900, 1.1, null, '🧃', 4.5, false, 'Orange juice, sourced from a vetted Arodan merchant and delivered to your gate.'),
  ('p23', 'm2', 'baby', 'Baby diapers', 'Size 4, 44 pcs', 11500, 1.6, null, '🧷', 4.5, false, 'Baby diapers, sourced from a vetted Arodan merchant and delivered to your gate.'),
  ('p24', 'm2', 'baby', 'Baby wipes', '80 wipes', 1900, 0.5, null, '🧻', 4.5, false, 'Baby wipes, sourced from a vetted Arodan merchant and delivered to your gate.')
on conflict (id) do update set merchant_id = excluded.merchant_id, category_id = excluded.category_id, name = excluded.name, unit = excluded.unit, price = excluded.price, weight_kg = excluded.weight_kg, longest_side_cm = excluded.longest_side_cm, emoji = excluded.emoji, rating = excluded.rating, popular = excluded.popular, description = excluded.description;

insert into public.errand_spots (id, name, distance_km, duration_min, sort) values
  ('s1', 'Magodo Phase 2 shopping complex', 1.2, 6, 0),
  ('s2', 'Ketu market', 5.6, 22, 1),
  ('s3', 'Mile 12 market', 7.4, 28, 2),
  ('s4', 'Ojota (bank / pharmacy row)', 4.1, 16, 3),
  ('s5', 'Ikeja City Mall', 12.8, 42, 4),
  ('s6', 'Somewhere else (describe it)', 6, 24, 5)
on conflict (id) do update set name = excluded.name, distance_km = excluded.distance_km, duration_min = excluded.duration_min, sort = excluded.sort;

-- Two demo riders so test orders get assigned (demo_mode). Delete these before launch.
insert into auth.users (id, phone) values
  ('00000000-0000-4000-8000-000000000001', '2348030001122'),
  ('00000000-0000-4000-8000-000000000002', '2348130004455')
on conflict (id) do nothing;
update public.profiles set role = 'rider', full_name = 'Demo rider' where id in ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002');
insert into public.riders (id, display_name, phone, vehicle, plate, rating, trips, nin_verified, guarantor_confirmed, address_visited) values
  ('00000000-0000-4000-8000-000000000001', 'Tunde Adeyemi', '0803 000 1122', 'motorbike', 'LSR 214 QA', 4.9, 812, true, true, true),
  ('00000000-0000-4000-8000-000000000002', 'Chiamaka Obi', '0813 000 4455', 'bicycle', 'Arodan #B-07', 4.8, 356, true, true, true)
on conflict (id) do nothing;
