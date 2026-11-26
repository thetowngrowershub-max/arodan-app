# Arodan API server

Our own backend: a Node.js API in front of a PostgreSQL database. It handles SMS sign-in (via Message Central or Termii), profiles and addresses, the catalogue, server-side pricing, orders and tracking. No third-party backend service is needed.

```
customer app  ──HTTPS──►  API server (this folder)  ──►  PostgreSQL (db/)
                                │
                                └──► Message Central or Termii (sign-in codes)
```

## Endpoints

| Method | Path | What it does |
| --- | --- | --- |
| POST | `/auth/otp` | Send a sign-in code to `{ phone }` by Termii or Message Central (max 5 an hour per number) |
| POST | `/auth/verify` | Check `{ phone, code }`, returns a sign-in token (5 tries per code) |
| GET / PUT | `/me` | Profile, address and `roles` (`rider` and `merchant`: `none`, `pending`, `approved` or `paused`); PUT sets `{ name }` |
| PUT | `/me/address` | Save the delivery address and gate details |
| GET | `/catalog` | Categories, products, merchants, errand locations, pricing |
| POST | `/quote` | Price a basket without ordering |
| POST | `/orders` | Place an order (priced on the server) |
| GET | `/orders`, `/orders/:id` | Your orders (`?active=true` for ones in progress) |
| POST | `/orders/:id/cancel` | Cancel before a rider is assigned |
| POST | `/orders/:id/status` | Admins move an order forward (riders use `/rider/jobs/:id/status`) |
| POST | `/orders/:id/demo-advance` | Testing aid while `demo_mode` is on (holds off while a real rider is online) |

Rider app (signed in as a rider; see `db/migrations/005_riders.sql`):

| Method | Path | What it does |
| --- | --- | --- |
| POST | `/rider/apply` | Apply to ride: `{ name, vehicle, plate, homeAddress, guarantorName, guarantorPhone }`. Can be sent again to correct details while in review |
| GET | `/rider/me` | Rider profile, vetting checks and the job in progress |
| POST | `/rider/online` | `{ online, lat?, lng? }`. Only fully vetted riders can go online |
| POST | `/rider/location` | `{ lat, lng, heading?, speed? }`, sent every ~15 s. Customers see it on live orders |
| GET | `/rider/jobs` | Jobs on offer (online, free, right vehicle, not declined). Exact address and customer hidden until accepted |
| GET | `/rider/job` | The job in progress, with full address, gate pass and customer phone |
| POST | `/rider/jobs/:id/accept` | Take a job (first rider wins; one job at a time) |
| POST | `/rider/jobs/:id/decline` | Don't offer this job to me again |
| POST | `/rider/jobs/:id/release` | Hand a job back before pickup |
| POST | `/rider/jobs/:id/status` | `picked_up`, `on_the_way` or `at_gate` |
| POST | `/rider/jobs/:id/deliver` | Proof of delivery: `{ method: 'code', code }` (customer's 4-digit code) or `{ method: 'photo', photo: <base64 JPEG> }`; pay-on-delivery also needs `cashCollected` |
| GET | `/rider/earnings` | Today, last 7 days, all time, and recent drops |
| GET | `/health` | Uptime check |
| GET | `/merchant/areas` | Areas a merchant can be in (sets their delivery distance) |
| GET / PUT | `/merchant/me` | The signed-in merchant's shop (null if none); PUT changes details or `{ isOpen }` |
| POST | `/merchant/register` | Set up a shop (pending approval unless `demo_mode` is on) |
| GET / POST | `/merchant/products` | The merchant's own listings / add one |
| PUT | `/merchant/products/:id` | Change a listing (send only what changed, e.g. `{ stock: 12 }`) |
| POST | `/merchant/images` | Upload a product photo `{ data: base64 }` (JPEG/PNG/WebP, max 2 MB); returns `{ url }` |
| GET | `/images/:id` | Product photos |
| GET | `/merchant/orders`, `/merchant/orders/:id` | The shop's part of each order (`?active=true` for ones to prepare) |
| POST | `/merchant/orders/:id/accept`, `/ready`, `/decline` | Start packing, ready for pickup, or decline `{ reason }` (cancels the order) |
| GET | `/merchant/sales?days=7` | Sales summary for 1 to 90 days |
| GET | `/admin/merchants?status=pending` | Admins: merchants waiting for approval |
| POST | `/admin/merchants/:id/status` | Admins: `{ status: 'live' }` to approve, `'suspended'` to pause |

Push notifications (the app registers one token with `app: 'arodan'` for shopping, riding and selling; see `db/migrations/006_push.sql`):

| Method | Path | What it does |
| --- | --- | --- |
| POST | `/push/register` | `{ token: 'ExponentPushToken[…]', app: 'customer' \| 'rider' \| 'merchant', platform }` after sign-in |
| POST | `/push/unregister` | `{ token }` on sign-out |

Rider payouts by Paystack transfer (see `db/migrations/007_payouts.sql` and `src/payouts.js`):

| Method | Path | What it does |
| --- | --- | --- |
| GET | `/rider/wallet` | Balance (earnings + errand money spent − pay-on-delivery cash held ± adjustments), bank account (masked), last 20 payouts |
| GET | `/rider/banks` | Nigerian banks (from Paystack, cached for a day) |
| POST | `/rider/bank-account/check` | `{ bankCode, accountNumber }` → the account holder's name, for the rider to confirm |
| PUT | `/rider/bank-account` | Save it (checked with the bank again). A changed account can't receive payouts for 24 hours |
| POST | `/rider/payouts` | Withdraw the whole balance now (minimum `minWithdrawal`, default ₦1,000) |
| POST | `/paystack/webhook` | Paystack transfer results (signature checked) |
| GET | `/admin/payouts?status=processing` | Admins: payouts (`processing`, `paid`, `failed`) |
| GET | `/admin/riders/balances` | Admins: every rider's balance |
| POST | `/admin/riders/:id/adjustments` | Admins: `{ amount, note }`, e.g. `{ amount: 12500, note: 'POD cash handed in' }`; negative takes money off |
| POST | `/admin/payouts/run` | Admins: pay everyone due now instead of waiting for the nightly run |

Background jobs in the server: queued push notifications are sent every 3 seconds; payouts with no answer from Paystack are checked every 5 minutes; and at `autoPayoutHour` (21:00 Lagos by default) every rider with at least `minWithdrawal` is paid automatically. Setup steps are in [`docs/push-and-payouts-setup.md`](../docs/push-and-payouts-setup.md).

Security: each request runs inside the database as the signed-in user, so the row level security rules in `db/migrations/002_app.sql` decide what anyone can see or change. Customers only ever see their own orders and addresses.

## Run it on your computer

Needs Node.js 20+ and PostgreSQL 15+ (or Docker).

```
cp server/.env.example .env      # fill in POSTGRES_PASSWORD and JWT_SECRET
docker compose up -d --build
curl http://localhost:3000/health
```

Then in `app/.env` set `EXPO_PUBLIC_API_URL=http://<your computer's Wi-Fi IP>:3000` and run `npx expo start`. Sign in with a number from `TEST_OTP_PHONES` and its code.

## Put it online

**Recommended:** Render, using [`render.yaml`](../render.yaml): follow [`docs/render-setup.md`](../docs/render-setup.md) (about $13/month, nothing to maintain).
**Free alternative:** [`docs/oracle-cloud-setup.md`](../docs/oracle-cloud-setup.md) (Oracle Cloud Always Free, you look after the server).

Any host that runs Docker or Node.js works. Two simple choices:

**A. One small Linux server (about $6–12/month: DigitalOcean, Hetzner, Contabo)**
1. Create an Ubuntu server and install Docker (`curl -fsSL https://get.docker.com | sh`).
2. `git clone` this repo, create `.env` from `server/.env.example`, then `docker compose up -d --build`.
3. Set `DOMAIN` in `.env` (e.g. `api.arodan.ng`, pointed at the server) and start with `docker compose --profile https up -d --build`: Caddy adds HTTPS automatically.
4. Back up daily with `scripts/backup.sh` (see the Oracle guide for the cron line).

**B. A managed platform (Render, Railway, Fly.io): no server to look after**
1. Create a managed PostgreSQL database there and copy its connection string into `DATABASE_URL` (set `DATABASE_SSL=true` if they require SSL).
2. Create a web service from this repo using `server/Dockerfile` (build context = repo root), and add the other variables from `.env.example`.
3. On first start the server loads the starter catalogue itself (`seed.js --if-empty`).

If the database user can create roles (`CREATEROLE`), the database's own row level security also enforces privacy; if not, the setup skips that and the API's own per-user filters do the job.

## Changing prices, products or orders

Connect with any Postgres tool (TablePlus, DBeaver, pgAdmin, or `psql`):
- **Prices:** edit `pricing_config.config` (same names as `app/src/lib/pricing.ts`). Apps pick it up next time they open.
- **Products:** merchants manage their own in the merchant app. Arodan's starter products (merchants `m1`–`m4`) are edited in the `products` table; set `active = false` to hide one.
- **Approve a merchant:** `update merchants set status = 'live' where name = 'Bisi Provisions';` (or make yourself an admin with `update profiles set role = 'admin' where phone = '234…'` and use `/admin/merchants`).
- **Move an order by hand:** `update orders set status = 'on_the_way' where code = 'AR100001';`
- **Approve riders.** People apply in the app (Ride with Arodan). Applications wait until all three checks are ticked:
  - With an admin account (`update profiles set role = 'admin' where phone = '234…';`): `GET /admin/riders?status=pending` lists applicants with their home address and guarantor; `POST /admin/riders/:id` with `{ "nin": true }`, `{ "guarantor": true }`, `{ "address": true }` ticks each check. Riding opens when all three are true. `{ "active": false }` pauses a rider (they go offline), `{ "active": true }` resumes.
  - Or in SQL: `update riders set nin_verified = true, guarantor_confirmed = true, address_visited = true where phone = '0803 111 2222';`
- **Approve shops:** `POST /admin/merchants/:id/status` with `{ "status": "live" }` (or `suspended`), or `update merchants set status = 'live' where …`.
- **Rider pay:** `pricing_config.config.riderPayout` (`deliveryShare` 0.8, `errandShare` 0.8, `minPerDrop` 800, `minWithdrawal` 1000, `autoPayoutHour` 21 or `null` for no nightly run). What each rider earned is in `rider_earnings`; delivery photos and codes are in `delivery_proofs`.

## Before real customers

- Set `demo_mode = false` in `pricing_config`, and delete the two demo riders (ids starting `00000000-`).
- Set up an SMS provider (`SMS_PROVIDER=messagecentral` with its Customer ID and password, or Termii with `TERMII_API_KEY` and a registered sender ID); remove `TEST_OTP_PHONES`.
- Set `CORS_ORIGIN` to your own website(s) if any.

## Tests

On a throwaway database:

```
cd server
export DATABASE_URL=postgresql://localhost/arodan_test JWT_SECRET=any-32-character-or-longer-test-secret
npm run migrate && npm run seed && npm test
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f ../db/tests/backend_test.sql
```
