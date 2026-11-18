/**
 * Mock backend. Every function is async so screens can switch to a real API later
 * by replacing this file only.
 */
import type { Address, Order, Rider, User } from './types';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const DEMO_OTP = '1234';

export async function sendOtp(phone: string): Promise<{ ok: boolean }> {
  await wait(600);
  return { ok: /^0[789][01]\d{8}$/.test(phone) || /^\+?234[789][01]\d{8}$/.test(phone) };
}

export async function verifyOtp(phone: string, code: string): Promise<{ ok: boolean; isNew: boolean }> {
  await wait(500);
  return { ok: code === DEMO_OTP, isNew: true };
}

export async function saveProfile(user: User, address: Address) {
  await wait(300);
  return { user, address };
}

const riders: Rider[] = [
  {
    name: 'Tunde Adeyemi',
    phone: '0803 000 1122',
    vehicle: 'Motorbike',
    plate: 'LSR 214 QA',
    rating: 4.9,
    trips: 812,
    checks: ['NIN verified', 'Guarantor confirmed', 'Home address visited'],
  },
  {
    name: 'Chiamaka Obi',
    phone: '0813 000 4455',
    vehicle: 'Bicycle',
    plate: 'Arodan #B-07',
    rating: 4.8,
    trips: 356,
    checks: ['NIN verified', 'Guarantor confirmed', 'Home address visited'],
  },
];

export async function placeOrder(order: Order): Promise<Order> {
  await wait(900);
  const rider = order.quote.vehicle === 'bicycle' ? riders[1] : riders[0];
  return { ...order, rider, status: 'placed', statusTimes: { placed: Date.now() } };
}

export async function cancelOrder(order: Order) {
  await wait(300);
  return { ...order, status: 'cancelled' as const };
}
