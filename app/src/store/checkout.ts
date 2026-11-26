import { merchantById, productById } from '../data/catalog';
import { spotById } from '../data/places';
import { buildBill, errandFee, quoteDelivery } from '../lib/pricing';
import type { CartLine, Errand } from '../api/types';

/** Works out the delivery quote and bill for any mix of shop items and errands. */
export function priceOrder(lines: CartLine[], errands: Errand[]) {
  const stops: { distanceKm: number; durationMin: number }[] = [];
  const merchantIds = Array.from(new Set(lines.map((l) => productById(l.productId).merchantId)));
  merchantIds.forEach((id) => stops.push(merchantById(id)));
  errands.forEach((e) => stops.push(spotById(e.pickupSpotId)));

  const far = stops.reduce((a, b) => (b.distanceKm > a.distanceKm ? b : a), { distanceKm: 0, durationMin: 0 });
  const weightKg =
    lines.reduce((s, l) => s + productById(l.productId).weightKg * l.qty, 0) + errands.length * 2; // allow ~2 kg per errand
  const longestSideCm = Math.max(0, ...lines.map((l) => productById(l.productId).longestSideCm ?? 0));

  const quote = quoteDelivery({
    distanceKm: far.distanceKm,
    durationMin: far.durationMin,
    weightKg,
    longestSideCm,
    extraStops: Math.max(0, stops.length - 1),
  });

  const items = lines.reduce((s, l) => s + productById(l.productId).price * l.qty, 0);
  const errandPurchases = errands.reduce((s, e) => s + e.budget, 0);
  const errandFees = errands.reduce((s, e) => s + errandFee(e.estMin), 0);
  const bill = buildBill(items, errandPurchases, errandFees, quote.total);
  const etaMin = Math.round(far.durationMin + 15 + errands.reduce((s, e) => s + e.estMin, 0));

  return { quote, bill, weightKg, etaMin };
}
