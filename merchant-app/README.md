# Arodan Merchant app

The app B2B merchants use to sell through Arodan. Whatever they list here is what customers see in the customer app's shop. Built with Expo (React Native, SDK 58), the same stack and look as the customer app (white, emerald and mango, Sora font).

It runs in two modes:
- **Offline demo** (default): sign-in code **1234**, five starter products, and a pretend customer order arrives a few seconds after you register and then every minute, so you can try the whole flow. Nothing is saved.
- **Real backend**: copy `.env.example` to `.env` and set `EXPO_PUBLIC_API_URL` to the Arodan API server (see [`../server/README.md`](../server/README.md)).

## Try it on your phone

Same steps as the customer app: install Node.js LTS and Expo Go, then in this folder run

```
npm install
npx expo start
```

and scan the QR code with Expo Go (Android) or the Camera app (iPhone). `npx expo start --web` opens it in a browser.

## What merchants can do

- **Sign in** with their phone number and an SMS code (same sign-in as customers).
- **Register the shop**: business name, phone riders call, area (sets the delivery distance), address, what they sell, and the bank account Arodan pays out to. New shops wait for Arodan to approve them before customers see their products (instant while the server's `demo_mode` is on). They can add products while they wait.
- **Products**: add and edit with a photo (camera or gallery, shrunk to about 1000 px before upload), name, category, price in Naira, pack size, weight and size (these set the delivery fee), description and stock. Filters for low stock, sold out and hidden. Hide a product without deleting it.
- **Stock**: optional per product. Stock is taken when a customer orders and put back if the order is declined or cancelled. Sold-out products drop out of the customer shop automatically; customers see "Only 3 left" when it's low.
- **Orders**: New, Packing, Ready and Past tabs. The phone buzzes when a new order arrives (the app checks every 8 seconds while open). Accept to start packing, then **mark ready for pickup**. The rider can't collect until the shop marks it ready. The assigned rider's name, vehicle and plate show with a call button, and the merchant checks the order code at handover.
- **Decline** an order they can't fill, with a reason. For the pilot this cancels the customer's whole order and restocks it (see "Not yet" below).
- **Sales**: last 7 or 30 days, today so far, orders, average order, items sold, a daily bar chart and best sellers.
- **Shop**: open/close switch (closed hides every product), edit details and payout account, sign out.

Merchants only ever see the customer's first name and the items from their own shop. They never see the customer's address, gate code or phone number.

## Where things live

| Folder | What |
| --- | --- |
| `src/screens/` | Onboarding (sign-in, register/edit shop), Orders, Products (list + editor), Sales, Tabs (bottom bar + Shop tab) |
| `src/api/` | `server.ts` (Arodan API), `mock.ts` (offline demo), `types.ts` (shapes), `index.ts` picks one |
| `src/store/AppContext.tsx` | Shop, products and orders state; polls orders |
| `src/lib/photo.ts` | Take/choose and shrink product photos |
| `src/theme.ts`, `src/components/` | Same design tokens and building blocks as the customer app |

## Not yet

- Push notifications for new orders when the app is closed (needs Expo push tokens on the server).
- Declining just one item of an order (today a decline cancels the order).
- Payouts: bank details are collected, but paying merchants is still manual. No commission is taken in the sales figures.
- An admin screen for approving merchants: use `POST /admin/merchants/:id/status` or SQL (see the server README).
