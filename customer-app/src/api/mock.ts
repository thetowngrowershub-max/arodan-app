/**
 * Offline demo backend: no network, fake SMS code, fake riders.
 * Used when EXPO_PUBLIC_API_URL is not set.
 */
import { shortId } from '../lib/format';
import { priceOrder } from '../store/checkout';
import type { Backend, Order, Rider } from './types';
import { ORDER_STEPS } from './types';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const DEMO_OTP = '1234';

const riders: Rider[] = [
  { name: 'Tunde Adeyemi', phone: '0803 000 1122', vehicle: 'Motorbike', plate: 'LSR 214 QA', rating: 4.9, trips: 812, checks: ['NIN verified', 'Guarantor confirmed', 'Home address visited'] },
  { name: 'Chiamaka Obi', phone: '0813 000 4455', vehicle: 'Bicycle', plate: 'Arodan #B-07', rating: 4.8, trips: 356, checks: ['NIN verified', 'Guarantor confirmed', 'Home address visited'] },
];

export const mockBackend: Backend = {
  mode: 'mock',
  otpLength: 4,
  demoOtp: DEMO_OTP,
  async sendOtp() {
    await wait(600);
    return { ok: true };
  },
  async verifyOtp(_phone, code) {
    await wait(500);
    return code === DEMO_OTP ? { ok: true } : { ok: false, error: 'That code is not right. Try again.' };
  },
  async restoreSession() {
    return null;
  },
  async saveProfile(_user, address) {
    await wait(300);
    return address;
  },
  async loadCatalog() {},
  async placeOrder(d) {
    await wait(900);
    const { quote, bill, etaMin } = priceOrder(d.lines, d.errands);
    const code = shortId();
    return {
      id: code,
      code,
      createdAt: Date.now(),
      lines: d.lines,
      errands: d.errands,
      address: d.address,
      quote,
      bill,
      payment: d.payment,
      status: 'placed',
      statusTimes: { placed: Date.now() },
      etaMin,
      deliveryCode: String(Math.floor(1000 + Math.random() * 9000)),
      rider: quote.vehicle === 'bicycle' ? riders[1] : riders[0],
    };
  },
  async cancelOrder(o) {
    await wait(300);
    return { ...o, status: 'cancelled', statusTimes: { ...o.statusTimes, cancelled: Date.now() } };
  },
  async listOrders() {
    return [];
  },
  watchOrders() {
    return () => {};
  },
  async advanceDemo(o) {
    if (o.status === 'cancelled' || o.status === 'delivered') return o;
    const status = ORDER_STEPS[ORDER_STEPS.indexOf(o.status) + 1];
    return { ...o, status, statusTimes: { ...o.statusTimes, [status]: Date.now() } } as Order;
  },
  async signOut() {},
};
