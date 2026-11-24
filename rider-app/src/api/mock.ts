/**
 * Offline demo backend: no network, fake SMS code, sample jobs around Magodo Phase 2.
 * Used when EXPO_PUBLIC_API_URL is not set. Delivery code for every demo job: 2580.
 */
import type { Bank, Earnings, Job, PayoutItem, RiderBackend, RiderProfile, Wallet } from './types';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const DEMO_OTP = '1234';
const DEMO_DELIVERY_CODE = '2580';

let rider: RiderProfile = {
  id: 'demo-rider', name: 'Tunde Adeyemi', phone: '0803 000 1122', vehicle: 'motorbike', plate: 'LSR 214 QA',
  rating: 4.9, trips: 812, online: false, checks: { nin: true, guarantor: true, address: true }, vetted: true,
};

const payout = (delivery: number, errandFees = 0) => {
  const d = Math.round(delivery * 0.8);
  const e = Math.round(errandFees * 0.8);
  return { delivery: d, errand: e, topUp: Math.max(0, 800 - d - e), total: Math.max(800, d + e) };
};

const samples: Omit<Job, 'id' | 'code' | 'createdAt' | 'status'>[] = [
  {
    vehicle: 'bicycle', etaMin: 24, payout: payout(1150), payment: 'card', paymentStatus: 'paid', collect: 0, itemsTotal: 16100, errandBudget: 0,
    dropoff: { estate: 'Magodo Phase 2', street: 'Oluwole Oke St', label: 'Home', houseNo: '14B', landmark: 'Opposite the mosque', gateName: 'CMD Road gate', gateCode: '4821', gateNote: 'Tell security you are going to Mrs Bello' },
    customer: { name: 'Ada Bello', phone: '0803 123 4567' },
    pickups: [{ kind: 'merchant', id: 'm1', name: 'Magodo Fresh Mart', area: 'Magodo Phase 2', distanceKm: 1.8, items: [{ name: 'Ofada rice', qty: 1, unitPrice: 14500 }, { name: 'Sliced bread', qty: 1, unitPrice: 1600 }] }],
    itemCount: 2, weightKg: 5.6,
  },
  {
    vehicle: 'motorbike', etaMin: 52, payout: payout(2350, 650), payment: 'pod', paymentStatus: 'pending', collect: 13450, itemsTotal: 7200, errandBudget: 4000,
    dropoff: { estate: 'Magodo Phase 2', street: 'Adebayo Mokuolu St', label: 'Home', houseNo: '3', landmark: 'Blue gate', gateName: 'Shangisha gate', gateCode: '7710', gateNote: '' },
    customer: { name: 'Kunle Ojo', phone: '0816 555 2299' },
    pickups: [
      { kind: 'merchant', id: 'm4', name: 'Ketu Market Stalls', area: 'Ketu', distanceKm: 5.6, items: [{ name: 'Fresh tomatoes', qty: 1, unitPrice: 3200 }, { name: 'Plantain bunch', qty: 1, unitPrice: 4000 }] },
      { kind: 'errand', id: 'e1', name: 'Ojota (bank / pharmacy row)', area: '', distanceKm: 4.1, errandType: 'buy', title: 'Buy paracetamol and vitamin C', details: 'Emzor paracetamol, 2 packs. Keep the receipt.', estMin: 20, budget: 4000 },
    ],
    itemCount: 2, weightKg: 6.5,
  },
  {
    vehicle: 'motorbike', etaMin: 40, payout: payout(1600, 650), payment: 'transfer', paymentStatus: 'paid', collect: 0, itemsTotal: 0, errandBudget: 0,
    dropoff: { estate: 'Magodo Phase 2', street: 'Kayode Taiwo St', label: 'Office', houseNo: '22', landmark: '', gateName: 'CMD Road gate', gateCode: '3305', gateNote: 'Call when you reach the gate' },
    customer: { name: 'Ngozi Eze', phone: '0907 210 3344' },
    pickups: [{ kind: 'errand', id: 'e2', name: 'Magodo Phase 2 shopping complex', area: '', distanceKm: 1.2, errandType: 'laundry', title: 'Collect laundry from Spotless', details: 'Ticket #2231, already paid.', estMin: 20, budget: 0 }],
    itemCount: 0, weightKg: 2,
  },
];

let signedIn = false;
let seq = 0;
let offers: Job[] = [];
let active: Job | null = null;
const history: Earnings['recent'] = [];

function newOffer(): Job {
  const s = samples[seq % samples.length];
  seq += 1;
  return { ...s, id: `demo-${seq}`, code: `AR${100200 + seq}`, createdAt: new Date().toISOString(), status: 'placed' };
}

/** Before accepting, riders see only the estate and street. */
const preview = (j: Job): Job => ({ ...j, dropoff: { estate: j.dropoff.estate, street: j.dropoff.street }, customer: null });

function earnings(): Earnings {
  const todayStr = new Date().toISOString().slice(0, 10);
  const sum = (xs: typeof history) => ({ amount: xs.reduce((a, x) => a + x.amount, 0), trips: xs.length });
  // A few past days so the chart has something to show in the demo.
  const past = [5600, 7200, 0, 4100, 8800, 6300];
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.now() - (6 - i) * 86400000).toISOString().slice(0, 10);
    if (i === 6) return { day: d, ...sum(history) };
    return { day: d, amount: past[i], trips: Math.round(past[i] / 1200) };
  });
  const week = days.reduce((a, d) => ({ amount: a.amount + d.amount, trips: a.trips + d.trips }), { amount: 0, trips: 0 });
  return { today: sum(history.filter((h) => h.at.startsWith(todayStr))), week, total: { amount: 412300 + week.amount, trips: rider.trips }, days, recent: history };
}

// ── Demo wallet ──
const demoBanks: Bank[] = [
  { code: '044', name: 'Access Bank' }, { code: '011', name: 'First Bank of Nigeria' }, { code: '058', name: 'Guaranty Trust Bank' },
  { code: '50211', name: 'Kuda Bank' }, { code: '50515', name: 'Moniepoint MFB' }, { code: '999992', name: 'OPay Digital Services Limited (OPay)' },
  { code: '999991', name: 'PalmPay' }, { code: '033', name: 'United Bank For Africa' }, { code: '035', name: 'Wema Bank' }, { code: '057', name: 'Zenith Bank' },
];
let bankAccount: Wallet['bankAccount'] = null;
let paidOut = 0; // demo earnings already paid
const unpaidStart = 6300; // yesterday's drops, not yet paid when the demo starts
let payouts: PayoutItem[] = [
  { id: 'po-1', amount: 8800, status: 'paid', trigger: 'auto', bankName: 'Guaranty Trust Bank', accountNumber: '******4021', failureReason: null,
    createdAt: new Date(Date.now() - 2 * 86400000).toISOString(), paidAt: new Date(Date.now() - 2 * 86400000).toISOString() },
];
function wallet(): Wallet {
  const earned = unpaidStart + history.reduce((a, h) => a + h.amount, 0) - paidOut;
  return {
    balance: { earned, errandSpend: 0, cashCollected: 0, adjustments: 0, drops: history.length, available: earned },
    minWithdrawal: 1000, autoPayoutHour: 21, bankAccount, payouts, payoutsEnabled: true,
  };
}

export const mockBackend: RiderBackend = {
  mode: 'mock',
  otpLength: 4,
  demoOtp: DEMO_OTP,
  async sendOtp() {
    await wait(500);
    return { ok: true };
  },
  async verifyOtp(_p, code) {
    await wait(400);
    if (code !== DEMO_OTP) return { ok: false, error: 'That code is not right. Try again.' };
    signedIn = true;
    return { ok: true };
  },
  async restoreSession() {
    return signedIn ? { rider, activeJob: active } : null;
  },
  async setOnline(online) {
    await wait(300);
    rider = { ...rider, online };
    if (online && !active && offers.length === 0) offers = [newOffer()];
    if (!online) offers = [];
    return rider;
  },
  async sendLocation() {},
  async openJobs() {
    if (!rider.online || active) return [];
    // A new job shows up now and then while online.
    if (offers.length < 2 && Math.random() < 0.35) offers.push(newOffer());
    return offers.map(preview);
  },
  async currentJob() {
    return active;
  },
  async accept(j) {
    await wait(400);
    const full = offers.find((o) => o.id === j.id);
    if (!full) throw new Error('This job has been taken or is no longer available');
    offers = [];
    active = { ...full, status: 'assigned' };
    return active;
  },
  async decline(j) {
    offers = offers.filter((o) => o.id !== j.id);
  },
  async release() {
    active = null;
  },
  async advance(_j, status) {
    await wait(300);
    if (!active) throw new Error('No job in progress');
    active = { ...active, status };
    return active;
  },
  async deliver(_j, proof, extra) {
    await wait(700);
    if (!active) throw new Error('No job in progress');
    if (proof.method === 'code' && proof.code !== DEMO_DELIVERY_CODE) throw new Error(`That code is not right. (Demo code: ${DEMO_DELIVERY_CODE})`);
    if (active.collect > 0 && (extra.cashCollected ?? 0) < active.collect) throw new Error('Collect the full amount before completing a pay-on-delivery order');
    const done: Job = { ...active, status: 'delivered', paymentStatus: 'paid', collect: 0 };
    history.unshift({ orderId: done.id, code: done.code, at: new Date().toISOString(), amount: done.payout.total, delivery: done.payout.delivery, errand: done.payout.errand, topUp: done.payout.topUp, estate: done.dropoff.estate });
    rider = { ...rider, trips: rider.trips + 1 };
    active = null;
    return { earned: done.payout.total, job: done };
  },
  async earnings() {
    return earnings();
  },
  async wallet() {
    return wallet();
  },
  async banks() {
    return demoBanks;
  },
  async checkBankAccount(bankCode, accountNumber) {
    await wait(700);
    const bank = demoBanks.find((b) => b.code === bankCode);
    if (!bank || !/^\d{10}$/.test(accountNumber)) throw new Error('That account number and bank do not match. Check them and try again.');
    return { bankName: bank.name, accountName: rider.name.toUpperCase() };
  },
  async saveBankAccount(bankCode, accountNumber) {
    const { bankName, accountName } = await this.checkBankAccount(bankCode, accountNumber);
    const changed = !!bankAccount;
    bankAccount = { bankCode, bankName, accountName, accountNumber: '******' + accountNumber.slice(-4),
      payoutsFrom: new Date(Date.now() + (changed ? 86400000 : 0)).toISOString() };
    return wallet();
  },
  async withdraw() {
    await wait(800);
    const w = wallet();
    if (!bankAccount) throw new Error('Add your bank account first');
    if (new Date(bankAccount.payoutsFrom) > new Date()) throw new Error('Your new bank account can receive payouts from tomorrow');
    if (w.balance.available < w.minWithdrawal) throw new Error(`You can withdraw once your balance reaches ₦${w.minWithdrawal.toLocaleString()}`);
    const p: PayoutItem = { id: 'po-' + Date.now(), amount: w.balance.available, status: 'paid', trigger: 'rider', bankName: bankAccount.bankName,
      accountNumber: bankAccount.accountNumber, failureReason: null, createdAt: new Date().toISOString(), paidAt: new Date().toISOString() };
    paidOut += p.amount;
    payouts = [p, ...payouts];
    return { payout: { id: p.id, amount: p.amount, status: p.status }, wallet: wallet() };
  },
  async signOut() {
    signedIn = false;
    rider = { ...rider, online: false };
    offers = [];
    active = null;
  },
};

export const mockRider = () => rider;
export const DEMO_CODE = DEMO_DELIVERY_CODE;
