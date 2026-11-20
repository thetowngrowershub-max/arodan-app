/**
 * Offline demo backend: no network, demo sign-in code 1234, pretend customers and riders.
 * Used when EXPO_PUBLIC_API_URL is not set. A new pretend order arrives shortly after you
 * open the app and then every minute, so you can try accepting and preparing orders.
 */
import type { Area, Backend, Category, Listing, Merchant, MerchantOrder, Sales } from './types';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const DEMO_OTP = '1234';

const categories: Category[] = [
  { id: 'groceries', name: 'Groceries', emoji: '🥬' },
  { id: 'household', name: 'Household', emoji: '🧴' },
  { id: 'electronics', name: 'Electronics', emoji: '📺' },
  { id: 'gadgets', name: 'Gadgets', emoji: '🎧' },
  { id: 'drinks', name: 'Drinks', emoji: '🥤' },
  { id: 'baby', name: 'Baby care', emoji: '🍼' },
];

const areas: Area[] = [
  { id: 'magodo2', name: 'Magodo Phase 2', distanceKm: 1.8 },
  { id: 'magodo1', name: 'Magodo Phase 1 / Isheri', distanceKm: 3 },
  { id: 'shangisha', name: 'Shangisha', distanceKm: 3.2 },
  { id: 'alapere', name: 'Alapere / Ketu', distanceKm: 5.6 },
  { id: 'ojota', name: 'Ojota', distanceKm: 4.1 },
  { id: 'ogudu', name: 'Ogudu / GRA', distanceKm: 6.5 },
  { id: 'mile12', name: 'Mile 12', distanceKm: 7.4 },
  { id: 'ikeja', name: 'Ikeja / Computer Village', distanceKm: 11.5 },
  { id: 'maryland', name: 'Maryland / Anthony', distanceKm: 9 },
];

const customers = ['Ngozi', 'Tunde', 'Aisha', 'Emeka', 'Funmi', 'Ibrahim', 'Chioma', 'Seyi'];
const riders = [
  { name: 'Tunde Adeyemi', phone: '0803 000 1122', vehicle: 'motorbike', plate: 'LSR 214 QA' },
  { name: 'Chiamaka Obi', phone: '0813 000 4455', vehicle: 'bicycle', plate: 'Arodan #B-07' },
];

let merchant: Merchant | null = null;
let ownerName = '';
let listings: Listing[] = [];
let orders: MerchantOrder[] = [];
let seq = 100200;
let timer: ReturnType<typeof setInterval> | null = null;
let nextOrderAt = 0;

const id = () => Math.random().toString(36).slice(2, 10);

function starterListings(): Listing[] {
  const now = Date.now();
  const l = (name: string, category: string, price: number, unit: string, emoji: string, stock: number | null, weightKg = 1): Listing => ({
    id: 'p_' + id(), name, category, price, unit, emoji, stock, weightKg, longestSideCm: null, imageUrl: null,
    description: '', active: true, updatedAt: now,
  });
  return [
    l('Ofada rice', 'groceries', 14500, '5 kg bag', '🍚', 12, 5),
    l('Eggs, crate', 'groceries', 5800, '30 eggs', '🥚', 4, 1.8),
    l('Vegetable oil', 'groceries', 6900, '3 litres', '🫙', 9, 3),
    l('Sliced bread', 'groceries', 1600, 'Family loaf', '🍞', null, 0.6),
    l('Table water', 'drinks', 2400, 'Pack of 12', '💧', 0, 6.5),
  ];
}

function newOrder(): MerchantOrder | null {
  const pool = listings.filter((x) => x.active && (x.stock === null || x.stock > 0));
  if (!pool.length || !merchant?.isOpen || merchant.status !== 'live') return null;
  const picks = pool.sort(() => Math.random() - 0.5).slice(0, 1 + Math.floor(Math.random() * Math.min(3, pool.length)));
  const items = picks.map((p) => {
    const qty = Math.max(1, Math.min(p.stock ?? 3, 1 + Math.floor(Math.random() * 2)));
    if (p.stock !== null) p.stock -= qty;
    return { productId: p.id, name: p.name, unitPrice: p.price, qty, imageUrl: p.imageUrl, emoji: p.emoji, unit: p.unit };
  });
  const now = Date.now();
  return {
    id: 'o_' + id(), code: 'AR' + ++seq, createdAt: now, updatedAt: now, readyAt: null, status: 'new', orderStatus: 'placed',
    itemsTotal: items.reduce((s, i) => s + i.unitPrice * i.qty, 0), declineReason: null,
    customerName: customers[Math.floor(Math.random() * customers.length)], items, rider: null,
  };
}

// Pretend customers and riders.
function tick() {
  const now = Date.now();
  const open = orders.filter((o) => ['new', 'preparing', 'ready'].includes(o.status)).length;
  if (now >= nextOrderAt && open < 5) {
    const o = newOrder();
    if (o) orders = [o, ...orders];
    nextOrderAt = now + 60_000;
  }
  orders = orders.map((o) => {
    if (o.status === 'cancelled' || o.status === 'declined' || o.status === 'picked_up') return o;
    if (!o.rider && now - o.createdAt > 15_000) return { ...o, rider: riders[seq % 2], orderStatus: 'assigned', updatedAt: now };
    if (o.status === 'ready' && o.rider && o.readyAt && now - o.readyAt > 25_000) return { ...o, status: 'picked_up', orderStatus: 'picked_up', updatedAt: now };
    return o;
  });
}

function startSim() {
  if (timer) return;
  nextOrderAt = Date.now() + 6_000;
  timer = setInterval(tick, 1000);
}

// A month of pretend history so the sales screen has something to show.
function history(days: number) {
  const out: { date: string; sales: number; orders: number }[] = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    const seed = (d.getDate() * 7919 + d.getMonth() * 104729) % 97;
    const n = i === 0 ? 0 : 2 + (seed % 6) + (d.getDay() === 6 ? 3 : 0);
    out.push({ date: d.toISOString().slice(0, 10), orders: n, sales: n * (9000 + (seed % 9) * 1500) });
  }
  return out;
}

export const mockBackend: Backend = {
  mode: 'mock',
  otpLength: 4,
  demoOtp: DEMO_OTP,
  async sendOtp() {
    await wait(500);
    return { ok: true };
  },
  async verifyOtp(_phone, code) {
    await wait(400);
    return code === DEMO_OTP ? { ok: true } : { ok: false, error: 'That code is not right. Try again.' };
  },
  async restoreSession() {
    return merchant ? { owner: { phone: '', name: ownerName }, merchant } : null;
  },
  async loadReference() {
    return { categories, areas };
  },
  async register(input) {
    await wait(600);
    ownerName = input.ownerName ?? '';
    const area = areas.find((a) => a.id === input.areaId);
    merchant = {
      id: 'm_' + id(), name: input.name, status: 'live', isOpen: true, phone: input.phone, address: input.address,
      areaId: input.areaId, area: area?.name ?? '', categories: input.categories, bankName: input.bankName,
      accountNumber: input.accountNumber.replace(/\D/g, ''), accountName: input.accountName,
    };
    listings = starterListings();
    startSim();
    return merchant;
  },
  async updateMerchant(patch) {
    await wait(300);
    if (!merchant) throw new Error('Set up your shop first');
    const area = patch.areaId ? areas.find((a) => a.id === patch.areaId) : undefined;
    merchant = { ...merchant, ...patch, ...(area ? { area: area.name } : {}) } as Merchant;
    return merchant;
  },
  async listListings() {
    startSim();
    return listings.map((x) => ({ ...x }));
  },
  async createListing(input) {
    await wait(400);
    const l: Listing = { ...input, emoji: input.emoji || '📦', id: 'p_' + id(), updatedAt: Date.now() };
    listings = [l, ...listings];
    return { ...l };
  },
  async updateListing(lid, patch) {
    await wait(250);
    const i = listings.findIndex((x) => x.id === lid);
    if (i < 0) throw new Error('Product not found');
    listings[i] = { ...listings[i], ...patch, updatedAt: Date.now() };
    return { ...listings[i] };
  },
  async uploadImage(base64) {
    await wait(500);
    return `data:image/jpeg;base64,${base64}`;
  },
  imageSrc: (url) => url ?? undefined,
  async listOrders(activeOnly) {
    startSim();
    tick();
    return orders.filter((o) => !activeOnly || ['new', 'preparing', 'ready'].includes(o.status)).map((o) => ({ ...o }));
  },
  async orderAction(oid, action, reason) {
    await wait(350);
    const o = orders.find((x) => x.id === oid);
    if (!o) throw new Error('Order not found');
    const now = Date.now();
    if (action === 'accept' && o.status === 'new') Object.assign(o, { status: 'preparing', updatedAt: now });
    else if (action === 'ready' && (o.status === 'new' || o.status === 'preparing')) Object.assign(o, { status: 'ready', readyAt: now, updatedAt: now });
    else if (action === 'decline' && (o.status === 'new' || o.status === 'preparing')) {
      Object.assign(o, { status: 'declined', orderStatus: 'cancelled', declineReason: reason || 'Not available', updatedAt: now });
      for (const i of o.items) {
        const l = listings.find((x) => x.id === i.productId);
        if (l && l.stock !== null) l.stock += i.qty;
      }
    } else throw new Error("You can't do that to this order now");
    return { ...o };
  },
  async sales(days) {
    await wait(250);
    const daily = history(days);
    const counted = orders.filter((o) => o.status !== 'declined' && o.status !== 'cancelled');
    const todaySales = counted.reduce((s, o) => s + o.itemsTotal, 0);
    daily[daily.length - 1] = { ...daily[daily.length - 1], sales: todaySales, orders: counted.length };
    const sales = daily.reduce((s, d) => s + d.sales, 0);
    const n = daily.reduce((s, d) => s + d.orders, 0);
    const top = listings.slice(0, 5).map((l, i) => ({ productId: l.id, name: l.name, qty: Math.max(1, Math.round((n / (i + 2)) * 1.3)), sales: 0 }));
    top.forEach((t) => (t.sales = t.qty * (listings.find((l) => l.id === t.productId)?.price ?? 0)));
    top.sort((a, b) => b.sales - a.sales);
    return {
      days, sales, orders: n, itemsSold: Math.round(n * 2.1), avgOrder: n ? Math.round(sales / n) : 0,
      today: { sales: todaySales, orders: counted.length }, daily, topProducts: top,
      openOrders: orders.filter((o) => ['new', 'preparing', 'ready'].includes(o.status)).length,
    } satisfies Sales;
  },
  async signOut() {
    merchant = null;
    listings = [];
    orders = [];
    if (timer) clearInterval(timer);
    timer = null;
  },
};
