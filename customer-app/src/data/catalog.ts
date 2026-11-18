// Mock catalogue. In production this comes from the B2B Merchant app / backend.

export type CategoryId = 'groceries' | 'household' | 'electronics' | 'gadgets' | 'drinks' | 'baby';

export interface Category { id: CategoryId; name: string; emoji: string }

export interface Merchant { id: string; name: string; area: string; distanceKm: number; durationMin: number }

export interface Product {
  id: string;
  name: string;
  category: CategoryId;
  price: number;
  unit: string;
  weightKg: number;
  longestSideCm?: number;
  emoji: string;
  merchantId: string;
  rating: number;
  popular?: boolean;
  description: string;
}

export const categories: Category[] = [
  { id: 'groceries', name: 'Groceries', emoji: '🥬' },
  { id: 'household', name: 'Household', emoji: '🧴' },
  { id: 'electronics', name: 'Electronics', emoji: '📺' },
  { id: 'gadgets', name: 'Gadgets', emoji: '🎧' },
  { id: 'drinks', name: 'Drinks', emoji: '🥤' },
  { id: 'baby', name: 'Baby care', emoji: '🍼' },
];

export const merchants: Merchant[] = [
  { id: 'm1', name: 'Magodo Fresh Mart', area: 'Magodo Phase 2', distanceKm: 1.8, durationMin: 9 },
  { id: 'm2', name: 'Shangisha Home Store', area: 'Shangisha', distanceKm: 3.2, durationMin: 14 },
  { id: 'm3', name: 'Ikeja Gadget Hub', area: 'Computer Village, Ikeja', distanceKm: 11.5, durationMin: 38 },
  { id: 'm4', name: 'Ketu Market Stalls', area: 'Ketu', distanceKm: 5.6, durationMin: 22 },
];

export const merchantById = (id: string) => merchants.find((m) => m.id === id)!;

let n = 0;
const p = (x: Omit<Product, 'id' | 'rating' | 'description'> & Partial<Pick<Product, 'rating' | 'description'>>): Product => ({
  id: 'p' + ++n,
  rating: x.rating ?? 4.5,
  description: x.description ?? `${x.name}, sourced from a vetted Arodan merchant and delivered to your gate.`,
  ...x,
});

export const products: Product[] = [
  p({ name: 'Ofada rice', category: 'groceries', price: 14500, unit: '5 kg bag', weightKg: 5, emoji: '🍚', merchantId: 'm1', popular: true }),
  p({ name: 'Fresh tomatoes', category: 'groceries', price: 3200, unit: '1 basket (small)', weightKg: 2, emoji: '🍅', merchantId: 'm4', popular: true }),
  p({ name: 'Plantain bunch', category: 'groceries', price: 4000, unit: '6 fingers', weightKg: 2.5, emoji: '🍌', merchantId: 'm4' }),
  p({ name: 'Eggs, crate', category: 'groceries', price: 5800, unit: '30 eggs', weightKg: 1.8, emoji: '🥚', merchantId: 'm1', popular: true }),
  p({ name: 'Vegetable oil', category: 'groceries', price: 6900, unit: '3 litres', weightKg: 3, emoji: '🫙', merchantId: 'm1' }),
  p({ name: 'Yam tuber', category: 'groceries', price: 3500, unit: '1 medium tuber', weightKg: 2.5, emoji: '🍠', merchantId: 'm4' }),
  p({ name: 'Sliced bread', category: 'groceries', price: 1600, unit: 'Family loaf', weightKg: 0.6, emoji: '🍞', merchantId: 'm1' }),
  p({ name: 'Laundry detergent', category: 'household', price: 4200, unit: '2 kg', weightKg: 2, emoji: '🧺', merchantId: 'm2', popular: true }),
  p({ name: 'Toilet tissue', category: 'household', price: 3900, unit: '12 rolls', weightKg: 1.4, emoji: '🧻', merchantId: 'm2' }),
  p({ name: 'Dishwashing liquid', category: 'household', price: 1800, unit: '750 ml', weightKg: 0.8, emoji: '🧴', merchantId: 'm2' }),
  p({ name: 'Insecticide spray', category: 'household', price: 2600, unit: '600 ml', weightKg: 0.7, emoji: '🪲', merchantId: 'm2' }),
  p({ name: 'Rechargeable fan', category: 'electronics', price: 38500, unit: '16 inch', weightKg: 5.5, longestSideCm: 60, emoji: '🌀', merchantId: 'm3', popular: true }),
  p({ name: 'Electric kettle', category: 'electronics', price: 17900, unit: '1.8 litres', weightKg: 1.3, emoji: '🫖', merchantId: 'm3' }),
  p({ name: 'Blender', category: 'electronics', price: 32000, unit: '1.5 litres', weightKg: 3, emoji: '🍹', merchantId: 'm3' }),
  p({ name: 'Smart TV 43"', category: 'electronics', price: 265000, unit: '43 inch', weightKg: 9, longestSideCm: 105, emoji: '📺', merchantId: 'm3', description: 'Large item. Needs a car/van delivery quote.' }),
  p({ name: 'Wireless earbuds', category: 'gadgets', price: 24500, unit: '1 pair', weightKg: 0.2, emoji: '🎧', merchantId: 'm3', popular: true }),
  p({ name: 'Power bank 20,000 mAh', category: 'gadgets', price: 21000, unit: '1 unit', weightKg: 0.5, emoji: '🔋', merchantId: 'm3' }),
  p({ name: 'Phone charger (USB-C)', category: 'gadgets', price: 6500, unit: '25 W', weightKg: 0.2, emoji: '🔌', merchantId: 'm3' }),
  p({ name: 'Smart watch', category: 'gadgets', price: 45000, unit: '1 unit', weightKg: 0.2, emoji: '⌚', merchantId: 'm3' }),
  p({ name: 'Table water', category: 'drinks', price: 2400, unit: 'Pack of 12', weightKg: 6.5, emoji: '💧', merchantId: 'm1' }),
  p({ name: 'Malt drink', category: 'drinks', price: 5400, unit: 'Pack of 6 cans', weightKg: 2.1, emoji: '🥫', merchantId: 'm1' }),
  p({ name: 'Orange juice', category: 'drinks', price: 2900, unit: '1 litre', weightKg: 1.1, emoji: '🧃', merchantId: 'm1' }),
  p({ name: 'Baby diapers', category: 'baby', price: 11500, unit: 'Size 4, 44 pcs', weightKg: 1.6, emoji: '🧷', merchantId: 'm2' }),
  p({ name: 'Baby wipes', category: 'baby', price: 1900, unit: '80 wipes', weightKg: 0.5, emoji: '🧻', merchantId: 'm2' }),
];

export const productById = (id: string) => products.find((x) => x.id === id)!;

/** Errand types customers can request on their own or alongside a shop order. */
export const errandTypes = [
  { id: 'buy', name: 'Buy something', emoji: '🛍️', hint: 'Market run, pharmacy, a specific shop', defaultMin: 30, needsBudget: true },
  { id: 'pickup', name: 'Pick up & drop', emoji: '📦', hint: 'Send or collect a parcel', defaultMin: 15, needsBudget: false },
  { id: 'laundry', name: 'Laundry run', emoji: '👔', hint: 'Drop off or collect dry cleaning', defaultMin: 20, needsBudget: false },
  { id: 'bills', name: 'Pay or queue', emoji: '🧾', hint: 'Bank, bills, documents, queues', defaultMin: 45, needsBudget: false },
] as const;

export type ErrandTypeId = (typeof errandTypes)[number]['id'];
