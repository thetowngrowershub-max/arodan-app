# Arodan app

One app for everyone in the Magodo Phase 2 pilot: **shoppers**, **riders** and **merchants**. Built with Expo (React Native, SDK 58), so it runs on Android and iPhone from one codebase. White, emerald and mango, Sora font.

Everyone signs in the same way, with their phone number and an SMS code. The first time, the app asks **"How will you use Arodan?"**:

| Choice | What happens |
| --- | --- |
| **Shop** | Name and delivery address, then straight into the shop. |
| **Ride with Arodan** | Rider application: name, motorbike or bicycle, plate, home address, guarantor's name and phone. The rider sees "Application received" with the three checks (NIN, guarantor, home address visit). Riding opens only when Arodan has ticked all three. |
| **Sell on Arodan** | Shop registration. The owner can add products straight away, but customers see the shop only after Arodan approves it. |

Approved riders and merchants switch between their part and shopping from **Account → Use Arodan another way**. They can also apply for the other role from there. A rider can't switch away in the middle of a job, and switching away takes them offline. The app remembers the last part used. Rider-only permissions (location, camera) are asked for only when a rider goes online or takes a delivery photo.

It runs in two modes:
- **Offline demo** (default): fake data, sign-in code **1234**. The demo approves rider and shop applications straight away so every screen can be tried. Rider delivery code is **2580**. Nothing leaves the phone.
- **Real backend**: copy `.env.example` to `.env` and set `EXPO_PUBLIC_API_URL` to your Arodan API server. See [`../server/README.md`](../server/README.md) to run the server and database, and to approve riders and shops.

## Try it on your phone (about 10 minutes, first time)

You need a computer (Windows or Mac) and your phone on the same Wi-Fi.

1. Install **Node.js LTS** from https://nodejs.org (just click Next through the installer).
2. On your phone, install **Expo Go** from the Play Store or App Store.
3. Open a terminal in this `app` folder (Windows: right-click the folder > "Open in Terminal"; Mac: right-click > "New Terminal at Folder").
4. Run:
   ```
   npm install
   npx expo start
   ```
5. A QR code appears. Android: scan it from inside Expo Go. iPhone: scan it with the Camera app.
   If your Wi-Fi blocks it, stop with Ctrl+C and run `npx expo start --tunnel` instead.

To try it in a web browser instead: `npx expo start --web`.

## What's in it

**Shopping**
- Shop: categories, search, product pages (merchant photos, low stock), cart
- Add an **errand to a shop order** (same rider does both) or send a **standalone errand** (buy, pick up & drop, laundry, pay/queue)
- Checkout: card, bank transfer or pay on delivery
- Live tracking: vetted rider card, rider's live location, gate pass while the order is live, 4-digit **delivery code** to give the rider at hand-over

**Riding** (approved riders)
- Go online/offline; job offers with payout, pickups, cash to collect; accept, decline, hand back before pickup
- Job steps with navigation to each pickup and the drop-off, gate pass, call customer
- Live location every ~15 s while online or on a job
- Proof of delivery: customer's code or a photo; cash confirmation for pay-on-delivery
- Earnings, wallet, bank account and withdrawals

**Selling** (merchants)
- Products with photos, prices, weight and stock; hide or mark sold out
- Orders: accept, pack, mark ready for pickup (riders can't collect before), decline with a reason
- Sales for 7 or 30 days, best sellers; open/close the shop

## Pricing rules (all in `src/lib/pricing.ts`)

- Service charge **7.5%** on items, errand purchases and errand fees. **Not** on the delivery fee (set `serviceChargeOnDelivery: true` to change).
- Delivery: base + per-km + per-minute, × busy-time rate (1.2 weekday peaks, 1.3 after 9pm, cap 1.5), minimum fare, + weight tier + ₦300 per extra stop, rounded up to ₦50. Bicycle for short light trips (≤4 km, ≤8 kg), motorbike otherwise.
- Errand fee ₦500 for the first 15 minutes, then ₦25/min.
- Small-order fee ₦300 on shop orders under ₦10,000.
- Rider pay: 80% of the delivery fee and errand fees, at least ₦800 a drop (set on the server).

## Where things live

| Folder | What |
| --- | --- |
| `App.tsx` | Start-up: restores the sign-in, then shows the shop, rider or merchant part |
| `src/roles/` | Which part is showing (`ModeContext`), approval status from the server, the "Use Arodan another way" cards |
| `src/lib/http.ts` | The one sign-in token and push registration shared by all three parts |
| `src/screens/`, `src/store/`, `src/api/` | Shopping (onboarding, shop, checkout, errands, orders) |
| `src/rider/` | Rider part: `RiderRoot.tsx`, application and pending screens, jobs, job, hand-over, wallet |
| `src/merchant/` | Merchant part: `MerchantRoot.tsx`, shop registration, products, orders, sales |
| `src/theme.ts` | Design tokens shared by all parts |

The rider and merchant parts still have their own copies of the small UI building blocks (`components/`) from when they were separate apps; they use the same tokens, so they look the same. Merging those into one set is a tidy-up for later.

## Next steps to launch

1. Live SMS (Message Central or Termii credentials on the server).
2. Payments (Paystack) for card and transfer.
3. An ops screen for approving riders and shops (today: the admin API or SQL in the server README).
4. Builds for testers with EAS (`npx eas-cli build`), then Play Store / App Store submission. One listing: "Arodan".
