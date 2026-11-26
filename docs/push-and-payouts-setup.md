# Switch on push notifications and rider bank payouts

Both features are built into the server and the apps. They stay off (quietly) until the accounts below are set up, and nothing else breaks while they are off: the apps keep refreshing on a timer, and riders' earnings build up in their balance.

## Push notifications

### What gets sent

| Who | When |
| --- | --- |
| Customer | Rider assigned, order picked up, on the way, rider at the gate, delivered, cancelled |
| Rider | New job nearby (online, free riders with the right vehicle), the shop has the order ready, job cancelled, payout sent / did not go through, bank account changed |
| Merchant | New order to prepare, rider on the way to collect, order cancelled |

Wording lives in `db/migrations/006_push.sql` (`on_order_event_push` and `on_order_merchant_push`).

### What you need (about 1 hour, free)

Push notifications do not work in Expo Go or the web preview. They need a proper build of the app, which is also what goes to the Play Store and App Store.

1. **Expo account** (free): sign up at https://expo.dev and install the tool: `npm install -g eas-cli`, then `eas login`.
2. **Link the app to Expo**: in `app/`, run `eas init`. This adds `extra.eas.projectId` to `app.json`; commit that change.
3. **Android (Firebase Cloud Messaging)**, needed for every Android phone:
   - Create a free Firebase project at https://console.firebase.google.com and add three Android apps with the package names `com.arodan.customer`, `com.arodan.rider` and `com.arodan.merchant` (check `android.package` in each `app.json`).
   - Download the app's `google-services.json` into `app/` and add `"googleServicesFile": "./google-services.json"` under `android` in `app/app.json`.
   - In Firebase > Project settings > Service accounts, create a private key (JSON) and upload it to Expo: `eas credentials` > Android > Google Service Account > "FCM V1".
4. **iPhone** (only when you publish for iPhone): an Apple Developer account (US$99 a year). `eas build -p ios` creates the push key for you.
5. **Build**: `eas build -p android --profile preview` in `app/` gives an installable APK to test with.

The server needs nothing extra. Optional: if you turn on "Enhanced security for push notifications" in your Expo account, put the access token in Render as `EXPO_ACCESS_TOKEN`.

## Rider bank payouts (Paystack)

### How it works

- Riders add their bank account in the rider app (Earnings tab). Paystack tells us the name on the account, and the rider confirms it is theirs.
- A rider's balance = drop earnings (80% of fees, at least ₦800 a drop) + errand money they spent for customers − pay-on-delivery cash they collected ± anything Arodan adds or removes.
- Riders tap **Withdraw** any time their balance is ₦1,000 or more. Every night at 9 pm (Lagos) everyone with ₦1,000 or more is paid automatically. Both numbers are in `pricing_config.config.riderPayout` (`minWithdrawal`, `autoPayoutHour`; set `autoPayoutHour` to `null` to stop the nightly run).
- Changing a bank account holds payouts for 24 hours and sends the rider a warning, in case someone else got into their phone.
- Arodan pays Paystack's transfer fee (roughly ₦10 to ₦50 a transfer; see https://paystack.com/pricing).

### What you need

1. **A Paystack business account** at https://paystack.com, verified as a **registered business** (CAC documents). Transfers are not available on starter accounts.
2. **Money in your Paystack balance.** Payouts come out of it. Customer card payments collected through Paystack land there, or top it up from the dashboard (Transfers > Top up balance).
3. **Turn off OTP for transfers**: Settings > Preferences > Transfers, untick "Confirm transfers before sending" (otherwise every payout waits for a code sent to you).
4. **API key**: Settings > API Keys & Webhooks. In Render > arodan-api > Environment, set `PAYSTACK_SECRET_KEY` to the secret key (`sk_test_…` to try it with fake money first, `sk_live_…` for real). Save and redeploy.
5. **Webhook**: on the same Paystack page, set the webhook URL to `https://<your-render-address>/paystack/webhook`. (If it is missing, the server still checks unfinished payouts with Paystack every 5 minutes.)
6. Optional, for extra safety: Paystack can be told to accept transfer requests only from your server's IP addresses (Settings > API Keys & Webhooks > IP whitelist). Render lists them under arodan-api > Connect > Outbound.

### Everyday tasks (as an admin)

Make yourself an admin once: `update profiles set role = 'admin' where phone = '234…';`

| Task | How |
| --- | --- |
| A rider hands in pay-on-delivery cash | `POST /admin/riders/<rider id>/adjustments` with `{ "amount": 12500, "note": "POD cash handed in" }`, or in the database: `insert into rider_adjustments (rider_id, amount, note) values ('<rider id>', 12500, 'POD cash handed in');` |
| Bonus or tip | Same, with a positive amount. A negative amount takes money off. |
| See every rider's balance | `GET /admin/riders/balances`, or `select display_name, rider_balance(id) from riders;` |
| See payouts | `GET /admin/payouts?status=failed` (or `processing`, `paid`), or the `rider_payouts` table |
| Pay everyone due now | `POST /admin/payouts/run` |

If a payout fails (for example the Paystack balance ran low), the money goes back into the rider's balance and they are told. The nightly run or the rider's next Withdraw tries again.
