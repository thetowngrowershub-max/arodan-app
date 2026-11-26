/**
 * Arodan pricing model (draft values from "Arodan delivery cost estimation model").
 * All values in Naira. Change numbers here only; screens read from this file.
 */

export type Vehicle = 'motorbike' | 'bicycle';

export const PRICING = {
  serviceChargeRate: 0.075, // 7.5% on items + errand fees. NOT on delivery fee (pending confirmation)
  serviceChargeOnDelivery: false,
  smallOrderThreshold: 10000,
  smallOrderFee: 300,
  roundTo: 50,
  vehicles: {
    motorbike: { base: 500, perKm: 150, longKm: 200, longAfterKm: 8, perMin: 15, min: 1000, radiusKm: 15, maxKg: 30 },
    bicycle: { base: 300, perKm: 120, longKm: 120, longAfterKm: 8, perMin: 15, min: 700, radiusKm: 4, maxKg: 8 },
  },
  weightTiers: [
    { upToKg: 5, fee: 0 },
    { upToKg: 10, fee: 300 },
    { upToKg: 20, fee: 700 },
    { upToKg: 30, fee: 1500 },
  ],
  maxSideCm: 80,
  surge: { weekdayPeak: 1.2, rainOrLate: 1.3, cap: 1.5 },
  freeWaitMin: 10,
  waitPerMin: 30,
  extraStop: 300,
  errand: { firstBlockFee: 500, firstBlockMin: 15, perExtraMin: 25 },
  cancelAfterDispatchRate: 0.5,
};

const roundUp = (n: number, step = PRICING.roundTo) => Math.ceil(n / step) * step;

/** Surge multiplier for a given time. Weekday 7-10am and 4-8pm = peak; after 9pm or rain = 1.3. */
export function surgeFor(date = new Date(), raining = false): number {
  const h = date.getHours();
  const day = date.getDay();
  const weekday = day >= 1 && day <= 5;
  let s = 1;
  if (weekday && ((h >= 7 && h < 10) || (h >= 16 && h < 20))) s = PRICING.surge.weekdayPeak;
  if (raining || h >= 21) s = Math.max(s, PRICING.surge.rainOrLate);
  return Math.min(s, PRICING.surge.cap);
}

export function chargeableKg(actualKg: number, dimsCm?: [number, number, number]) {
  if (!dimsCm) return actualKg;
  const vol = (dimsCm[0] * dimsCm[1] * dimsCm[2]) / 5000;
  return Math.max(actualKg, vol);
}

export function weightFee(kg: number): number | null {
  for (const t of PRICING.weightTiers) if (kg <= t.upToKg) return t.fee;
  return null; // needs a car/van quote
}

export interface DeliveryInput {
  distanceKm: number;
  durationMin: number;
  weightKg: number;
  longestSideCm?: number;
  extraStops?: number;
  waitMin?: number;
  vehicle?: Vehicle;
  surge?: number;
}

export interface DeliveryQuote {
  vehicle: Vehicle;
  transport: number;
  weight: number;
  stops: number;
  waiting: number;
  surge: number;
  total: number;
  needsVanQuote: boolean;
  outOfRange: boolean;
}

export function pickVehicle(distanceKm: number, weightKg: number): Vehicle {
  const b = PRICING.vehicles.bicycle;
  return distanceKm <= b.radiusKm && weightKg <= b.maxKg ? 'bicycle' : 'motorbike';
}

export function quoteDelivery(i: DeliveryInput): DeliveryQuote {
  const vehicle = i.vehicle ?? pickVehicle(i.distanceKm, i.weightKg);
  const v = PRICING.vehicles[vehicle];
  const surge = i.surge ?? surgeFor();
  const d = i.distanceKm;
  const raw =
    (v.base + v.perKm * Math.min(d, v.longAfterKm) + v.longKm * Math.max(0, d - v.longAfterKm) + v.perMin * i.durationMin) *
    surge;
  const transport = Math.max(v.min, raw);
  const wf = weightFee(i.weightKg);
  const needsVanQuote = wf === null || (i.longestSideCm ?? 0) > PRICING.maxSideCm;
  const weight = wf ?? 0;
  const stops = (i.extraStops ?? 0) * PRICING.extraStop;
  const waiting = Math.max(0, (i.waitMin ?? 0) - PRICING.freeWaitMin) * PRICING.waitPerMin;
  return {
    vehicle,
    transport: Math.round(transport),
    weight,
    stops,
    waiting,
    surge,
    total: roundUp(transport + weight + stops + waiting),
    needsVanQuote,
    outOfRange: d > PRICING.vehicles.motorbike.radiusKm,
  };
}

/** Errand time fee: ₦500 covers the first 15 minutes, then ₦25 per extra minute. */
export function errandFee(estimatedMin: number): number {
  const e = PRICING.errand;
  return roundUp(e.firstBlockFee + Math.max(0, estimatedMin - e.firstBlockMin) * e.perExtraMin);
}

export interface Bill {
  items: number;
  errandPurchases: number;
  errandFees: number;
  serviceCharge: number;
  delivery: number;
  smallOrderFee: number;
  total: number;
}

/**
 * Totals for any order.
 * itemsSubtotal = shop items, errandPurchases = money the rider spends buying things on an errand,
 * errandFees = errand time fees. Service charge applies to all three, not to delivery.
 */
export function buildBill(itemsSubtotal: number, errandPurchases: number, errandFees: number, delivery: number): Bill {
  const base = itemsSubtotal + errandPurchases + errandFees + (PRICING.serviceChargeOnDelivery ? delivery : 0);
  const serviceCharge = Math.round(base * PRICING.serviceChargeRate);
  const smallOrderFee = itemsSubtotal > 0 && itemsSubtotal < PRICING.smallOrderThreshold ? PRICING.smallOrderFee : 0;
  return {
    items: itemsSubtotal,
    errandPurchases,
    errandFees,
    serviceCharge,
    delivery,
    smallOrderFee,
    total: itemsSubtotal + errandPurchases + errandFees + serviceCharge + delivery + smallOrderFee,
  };
}
