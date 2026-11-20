# Put the Arodan server online with Render

Render runs the API and its PostgreSQL database for you: no server to look after, HTTPS included, and updates deploy automatically when code is merged on GitHub. Everything is described in [`render.yaml`](../render.yaml) at the repo root, so setup is mostly clicking through.

**Cost:** about **$13 a month** (API $7 + database $6, plus $0.30 per GB of database storage; prices as of November 2026). You can start the API on the free plan, but it falls asleep after 15 minutes without use and takes about a minute to wake, which customers will notice. Don't use the free database: Render deletes it after 30 days.

---

## Before you start

- **Pull request #2 must be merged** into `main` on GitHub. Render deploys from `main`.
- Have a bank card ready for the $13/month.
- Decide your testers' phone numbers. Each gets a fixed sign-in code until real SMS is on, written like `2348031234567:123456` (country code, no `+`, no leading `0`), separated by commas.

## 1. Create the Render account (3 min)

1. Go to https://render.com and click **Get Started**.
2. Choose **Sign up with GitHub** and use the GitHub account that owns `arodan-app`. This lets Render read the repo.
3. Add your card under **Account settings > Billing**.

## 2. Create everything from the Blueprint (5 min)

1. In the Render dashboard, click **New + > Blueprint**.
2. Pick the **arodan-app** repository. (If it isn't listed, click **Configure account** and give Render access to it.)
3. Render reads `render.yaml` and shows two things to create: **arodan-api** (web service) and **arodan-db** (PostgreSQL), both in Frankfurt.
4. It asks for a few values:

| Setting | What to enter |
| --- | --- |
| `TEST_OTP_PHONES` | your testers' numbers and codes, e.g. `2348031234567:123456,2348039999999:654321` |
| `MESSAGECENTRAL_CUSTOMER_ID`, `MESSAGECENTRAL_PASSWORD` | leave empty for now (step 5) |
| `TERMII_API_KEY` | leave empty |

5. Click **Apply**. Render creates the database first, then builds and starts the API. The first build takes about 5 to 10 minutes. On first start the server sets up the database tables and loads the starter catalogue by itself.

## 3. Check it works (2 min)

1. Open **arodan-api** in the dashboard. When the status shows **Live**, copy its address at the top, e.g. `https://arodan-api.onrender.com`.
2. Open that address followed by `/health` in your browser, e.g. `https://arodan-api.onrender.com/health`. You should see `{"ok":true}`.

If it says **Deploy failed**, open the **Logs** tab and send me a screenshot of the last red lines.

## 4. Point the app at it

In `customer-app/.env` on your computer:

```
EXPO_PUBLIC_API_URL=https://arodan-api.onrender.com
```

Restart `npx expo start`, then sign in with a tester number and its code. Orders you place appear in the database straight away.

## 5. Turn on real SMS (when ready)

1. Create a Message Central account at https://www.messagecentral.com, add credit, and note your **Customer ID** and password.
2. In Render: **arodan-api > Environment**, fill in `MESSAGECENTRAL_CUSTOMER_ID` and `MESSAGECENTRAL_PASSWORD`, and click **Save, rebuild, and deploy**. (Set `MESSAGECENTRAL_FLOW` to `WHATSAPP` to send codes on WhatsApp instead.)
3. Until this is done, any number not in `TEST_OTP_PHONES` gets its code written to the **Logs** tab instead of texted ("SMS not sent").

To use Termii instead: set `SMS_PROVIDER` to `termii` and fill in `TERMII_API_KEY` (and `TERMII_SENDER_ID` once Termii approves your sender name).

## Everyday tasks

| Task | Where |
| --- | --- |
| Install a new version | Merge the pull request on GitHub. Render deploys it automatically. |
| See what the server is doing | arodan-api > **Logs** |
| Change prices or products | arodan-db > **Connect** gives a connection string for TablePlus/DBeaver/pgAdmin; edit `pricing_config` or `products` |
| Move an order by hand (until the rider app exists) | In the database: `update orders set status = 'on_the_way' where code = 'AR100001';` |
| Backups | arodan-db > **Recovery** (check what your database plan includes) |

## Before real customers

- In the database, set `demo_mode` to `false` in `pricing_config`, and delete the two demo riders (ids starting `00000000-`).
- Turn on SMS (step 5) and clear `TEST_OTP_PHONES` (or keep only your own number).
