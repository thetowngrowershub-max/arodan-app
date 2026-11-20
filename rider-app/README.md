# Arodan Rider app

The app Arodan riders use to take and complete deliveries and errands in Magodo Phase 2, Lagos. Same stack and look as the customer app: Expo (React Native, SDK 58), Sora font, white with one emerald and one mango accent.

It runs in two modes:
- **Offline demo** (default): sample jobs, sign-in code **1234**, delivery code **2580**. Nothing leaves the phone.
- **Real backend**: copy `.env.example` to `.env` and set `EXPO_PUBLIC_API_URL` to your Arodan API server ([`../server/README.md`](../server/README.md)). Only phone numbers that Arodan has set up as riders can sign in; see "Add a rider" in the server README.

## Try it on your phone

Same steps as the customer app: install Node.js LTS and Expo Go, then in this folder:

```
npm install
npx expo start
```

Scan the QR code with Expo Go (Android) or the Camera app (iPhone). Allow location and camera when asked. To try it in a browser: `npx expo start --web`.

To test both apps together against a real server, turn off demo mode or keep a real rider online: while any real rider is online, the customer app's demo timer leaves new orders for riders to accept.

## What a rider can do

- **Sign in** with their registered phone number and an SMS code. Numbers that aren't riders get a "not set up yet" screen with a call button.
- **Go online / offline** with one tap. Only riders whose NIN, guarantor and home address checks are all done can go online.
- **Job offers** (checked every 5 seconds while online): what they'll earn, pickups (shops and errands, with budget), drop-off street, distance, weight, and whether to collect cash. The house number, gate code and customer's phone stay hidden until they accept.
- **Accept or decline.** First rider to accept gets the job; one job at a time. A job can be handed back before pickup.
- **Navigate** to each pickup and to the drop-off (opens Google Maps; Apple Maps on iPhone without Google Maps). Shops and addresses don't have map pins yet, so it searches by name and area.
- **Job steps:** tick items at the shop, Picked up, On the way, At the gate (shows the gate pass in mango), then Hand over. Call the customer from the job.
- **Live location** is shared every ~15 seconds while online or on a job. Customers see it on their live order.
- **Proof of delivery:** the customer's 4-digit delivery code (shown in their app), or a photo of the package (shrunk to a small JPEG before upload). Pay-on-delivery orders also need the rider to confirm the cash collected. Five wrong codes and the rider must use a photo.
- **Earnings:** today, last 7 days, all time, a 7-day chart and recent drops. Pay is 80% of the delivery fee plus 80% of errand fees, at least ₦800 a drop (change it in `pricing_config.config.riderPayout`).

## Not in this version

- Location while the phone is locked: Expo Go only shares location with the app open. Background location needs a development build (`eas build --profile development`) plus `expo-task-manager`.
- Push notifications for new jobs (riders keep the app open while online for now).
- Bank payouts, rider self sign-up and document upload, in-app map. These are done by Arodan ops for the pilot.
- Ready-for-pickup status from merchants (comes with the merchant app).

## Code map

| Path | What |
| --- | --- |
| `App.tsx` | Start-up, restores the session, picks the first screen |
| `src/api/` | `server.ts` (Arodan API), `mock.ts` (offline demo), `types.ts` |
| `src/store/RiderContext.tsx` | Online state, job offers polling, live location sharing |
| `src/screens/` | `SignIn`, `Jobs` (home + offers), `Job` (job in progress), `Deliver` (proof of delivery), `Tabs` (earnings, account) |
| `src/lib/` | `location.ts`, `maps.ts` (navigation, calls), `photo.ts` (camera + shrink), `format.ts` |
| `src/components/` | Shared UI and icons (copied from the customer app) |
