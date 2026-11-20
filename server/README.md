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
| GET / PUT | `/me` | Profile; PUT sets `{ name }` |
| PUT | `/me/address` | Save the delivery address and gate details |
| GET | `/catalog` | Categories, products, merchants, errand locations, pricing |
| POST | `/quote` | Price a basket without ordering |
| POST | `/orders` | Place an order (priced on the server) |
| GET | `/orders`, `/orders/:id` | Your orders (`?active=true` for ones in progress) |
| POST | `/orders/:id/cancel` | Cancel before a rider is assigned |
| POST | `/orders/:id/status` | Riders/admins move an order forward (for the rider app) |
| POST | `/orders/:id/demo-advance` | Testing aid while `demo_mode` is on |
| GET | `/health` | Uptime check |

Security: each request runs inside the database as the signed-in user, so the row level security rules in `db/migrations/002_app.sql` decide what anyone can see or change. Customers only ever see their own orders and addresses.

## Run it on your computer

Needs Node.js 20+ and PostgreSQL 15+ (or Docker).

```
cp server/.env.example .env      # fill in POSTGRES_PASSWORD and JWT_SECRET
docker compose up -d --build
docker compose exec api node scripts/seed.js
curl http://localhost:3000/health
```

Then in `customer-app/.env` set `EXPO_PUBLIC_API_URL=http://<your computer's Wi-Fi IP>:3000` and run `npx expo start`. Sign in with a number from `TEST_OTP_PHONES` and its code.

## Put it online

**Free option for the pilot:** follow [`docs/oracle-cloud-setup.md`](../docs/oracle-cloud-setup.md) (Oracle Cloud Always Free, with HTTPS and backups).

Any host that runs Docker or Node.js works. Two simple choices:

**A. One small Linux server (about $6–12/month: DigitalOcean, Hetzner, Contabo)**
1. Create an Ubuntu server and install Docker (`curl -fsSL https://get.docker.com | sh`).
2. `git clone` this repo, create `.env` from `server/.env.example`, then `docker compose up -d --build` and run the seed once.
3. Set `DOMAIN` in `.env` (e.g. `api.arodan.ng`, pointed at the server) and start with `docker compose --profile https up -d --build`: Caddy adds HTTPS automatically.
4. Back up daily with `scripts/backup.sh` (see the Oracle guide for the cron line).

**B. A managed platform (Render, Railway, Fly.io): no server to look after**
1. Create a managed PostgreSQL database there and copy its connection string into `DATABASE_URL` (set `DATABASE_SSL=true` if they require SSL).
2. Create a web service from this repo using `server/Dockerfile` (build context = repo root), and add the other variables from `.env.example`.
3. Run `node scripts/seed.js` once from the service's shell.

The database user needs permission to create roles (`CREATEROLE`), which the default admin user has on all of these.

## Changing prices, products or orders

Connect with any Postgres tool (TablePlus, DBeaver, pgAdmin, or `psql`):
- **Prices:** edit `pricing_config.config` (same names as `customer-app/src/lib/pricing.ts`). Apps pick it up next time they open.
- **Products:** `products` table; set `active = false` to hide one.
- **Move an order by hand** (until the rider app exists): `update orders set status = 'on_the_way' where code = 'AR100001';`

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
