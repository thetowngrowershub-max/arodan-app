# Arodan backend (Supabase)

Postgres database, phone sign-in and live order updates for the Arodan apps, hosted on [Supabase](https://supabase.com) (free tier is enough for the pilot).

## What's here

| File | What it does |
| --- | --- |
| `migrations/20261118210000_init.sql` | Tables, security rules and server functions |
| `seed.sql` | Starter categories, 24 products, 4 merchants, errand locations, pricing and 2 demo riders |
| `tests/` | Checks that run on a plain local Postgres (see below) |

**Tables:** `profiles`, `addresses` (with gate name, code and note), `categories`, `merchants`, `products`, `errand_spots`, `pricing_config`, `riders`, `orders`, `order_items`, `order_errands`, `order_events`.

**Server functions the app calls:**
- `price_order(items, errands)`: works out the delivery fee, service charge and total. Same formula as `customer-app/src/lib/pricing.ts` (checked on 120 random orders).
- `place_order(address_id, items, errands, payment)`: prices the order on the server and saves it. The app cannot set its own prices.
- `set_order_status(order_id, status)`: riders move their own orders forward; customers can cancel only before a rider is assigned; admins can do anything.
- `demo_advance_order(order_id)`: testing aid that moves an order to its next step. Only works while `pricing_config.demo_mode` is on.

**Security:** customers see only their own profile, addresses and orders. Riders see orders assigned to them. Customers see a rider's details only for their own orders. Anyone can browse the catalogue. Orders can only be created or changed through the functions above.

## Set it up (about 15 minutes)

1. Create a free account at https://supabase.com and a new project. Choose the region closest to Lagos (e.g. *West EU (London)* or *Central EU (Frankfurt)*).
2. Open **SQL Editor**, paste the whole of `migrations/20261118210000_init.sql`, and click **Run**. Then do the same with `seed.sql`.
3. Turn on phone sign-in: **Authentication > Sign In / Providers > Phone**.
   - For testing without sending real SMS, add test numbers under **Test phone numbers and OTPs**, e.g. `2348031234567=123456`. Supabase may still ask you to fill in an SMS provider; for live SMS in Nigeria use Twilio, Vonage, or a Send SMS hook to Termii.
   - Note the **OTP length** (default 6).
4. Open **Project Settings > API** and copy the **Project URL** and the **anon public** key.
5. In `customer-app/`, copy `.env.example` to `.env` and paste those two values in. Restart `npx expo start`.

The app now signs in with real phone codes, loads the catalogue from the database and saves real orders.

## Changing prices or products

- **Prices:** Table Editor > `pricing_config` > edit the `config` JSON (same names as `pricing.ts`). The app picks it up next time it opens.
- **Products:** Table Editor > `products`. Set `active` to false to hide one.
- **Moving an order along by hand** (until the rider app exists): SQL Editor, `update orders set status = 'on_the_way' where code = 'AR100001';`

## Before real customers

- Set `demo_mode` to **false** in `pricing_config`.
- Delete the two demo riders (ids starting `00000000-`).
- Connect a real SMS provider and remove the test phone numbers.

## Run the checks locally

Needs PostgreSQL 15 or newer:

```
createdb arodan_test
psql -d arodan_test -v ON_ERROR_STOP=1 -f tests/supabase_stub.sql -f migrations/20261118210000_init.sql -f seed.sql -f tests/backend_test.sql
```

It should end with `ALL BACKEND TESTS PASSED`.
