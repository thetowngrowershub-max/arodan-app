import type { ErrandTypeId } from '../data/catalog';
import type { Bill, DeliveryQuote } from '../lib/pricing';

export interface User { phone: string; name: string }

export interface Address {
  label: string; // Home, Office
  estate: string; // e.g. Magodo Phase 2
  street: string;
  houseNo: string;
  landmark: string;
  gateName: string; // e.g. "CMD Road gate"
  gateCode: string; // estate visitor code the rider shows at the gate
  gateNote: string; // instructions for the security man / rider
}

export interface Errand {
  id: string;
  type: ErrandTypeId;
  title: string;
  details: string;
  pickupSpotId: string;
  estMin: number;
  budget: number; // money the rider spends on the customer's behalf (0 if none)
}

export interface CartLine { productId: string; qty: number }

export type PaymentMethod = 'card' | 'transfer' | 'pod';

export const ORDER_STEPS = ['placed', 'assigned', 'picked_up', 'on_the_way', 'at_gate', 'delivered'] as const;
export type OrderStatus = (typeof ORDER_STEPS)[number] | 'cancelled';

export interface Rider {
  name: string;
  phone: string;
  vehicle: string;
  plate: string;
  rating: number;
  trips: number;
  checks: string[];
}

export interface Order {
  id: string;
  createdAt: number;
  lines: CartLine[];
  errands: Errand[];
  address: Address;
  quote: DeliveryQuote;
  bill: Bill;
  payment: PaymentMethod;
  status: OrderStatus;
  statusTimes: Partial<Record<OrderStatus, number>>;
  rider?: Rider;
  etaMin: number;
}
