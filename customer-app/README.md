# Arodan customer app (prototype)

One app for shopping, errands and delivery in Magodo Phase 2, Lagos. Built with Expo (React Native, SDK 58) so it runs on Android and iPhone from one codebase. All data is mock data: no real SMS, payments or riders yet.

## Try it on your phone (about 10 minutes, first time)

You need a computer (Windows or Mac) and your phone on the same Wi-Fi.

1. Install **Node.js LTS** from https://nodejs.org (just click Next through the installer).
2. On your phone, install **Expo Go** from the Play Store or App Store.
3. Unzip `arodan-customer-app.zip` on your computer.
4. Open a terminal in the unzipped folder (Windows: right-click the folder > "Open in Terminal"; Mac: right-click > "New Terminal at Folder").
5. Run:
   ```
   npm install
   npx expo start
   ```
6. A QR code appears. Android: scan it from inside Expo Go. iPhone: scan it with the Camera app.
   If your Wi-Fi blocks it, stop with Ctrl+C and run `npx expo start --tunnel` instead.

Sign in with any Nigerian mobile number (e.g. 0803 123 4567). The demo code is **1234**.

To try it in a web browser instead: `npx expo start --web`.

## What's in it

- Phone sign-up with code, name, address and **gate access** (gate name, visitor code, note for security)
- Shop: categories, search, product pages, cart
- Add an **errand to a shop order** (same rider does both) or send a **standalone errand** (buy, pick up & drop, laundry, pay/queue)
- Checkout: card, bank transfer or pay on delivery
- Live tracking (simulated, moves a step every ~9 seconds): vetted rider card, gate pass shown while the order is live, timeline
- Orders history and account

## Pricing rules (all in `src/lib/pricing.ts`)

- Service charge **7.5%** on items, errand purchases and errand fees. **Not** on the delivery fee (set `serviceChargeOnDelivery: true` to change).
- Delivery: base + per-km + per-minute, × busy-time rate (1.2 weekday peaks, 1.3 after 9pm, cap 1.5), minimum fare, + weight tier + ₦300 per extra stop, rounded up to ₦50. Bicycle for short light trips (≤4 km, ≤8 kg), motorbike otherwise.
- Errand fee ₦500 for the first 15 minutes, then ₦25/min.
- Small-order fee ₦300 on shop orders under ₦10,000.
- Large items (>30 kg or a side over 80 cm) flag a car/van quote.

## Where things live

| Folder | What |
| --- | --- |
| `src/screens/` | All screens (onboarding, shop, checkout, errands, orders/tracking, tabs) |
| `src/lib/pricing.ts` | Every fee and rate in one place |
| `src/data/` | Mock catalogue, merchants and errand pickup spots |
| `src/api/mock.ts` | Fake backend. Replace this file to connect a real server |
| `src/theme.ts` | Option D colours and font (Sora, emerald #06805A, mango #FFB52E) |

## Next steps to launch

1. Real backend (orders, users, merchant catalogue) and SMS codes (e.g. Termii).
2. Payments (Paystack or Flutterwave), real maps and rider location.
3. Rider app and Merchant app on the same backend.
4. Builds for testers with EAS (`npx eas-cli build`), then Play Store / App Store submission.
