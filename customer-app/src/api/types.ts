import type { ErrandTypeId } from '../data/catalog';
import type { Bill, DeliveryQuote } from '../lib/pricing';

export interface User { phone: string; name: string }

export interface Address {
  id?: string; // set once saved on the server
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
  /** Rider's live position while the order is on its way (server only). */
  location?: { lat: number; lng: number; heading: number | null; at: number };
}

export interface Order {
  id: string;
  code: string; // short code shown to customers, e.g. AR100123
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
  /** 4-digit code the customer gives the rider at hand-over (proof of delivery). */
  deliveryCode?: string;
}

export interface Session { user: User; address: Address | null }

export interface OrderDraft {
  lines: CartLine[];
  errands: Errand[];
  address: Address;
  payment: PaymentMethod;
}

/** Everything the app needs from a server. Implemented by mock.ts (offline demo) and server.ts (Arodan API server). */
export interface Backend {
  mode: 'mock' | 'live';
  otpLength: number;
  /** Code to show on screen in demo mode (mock only). */
  demoOtp?: string;
  sendOtp(phone: string): Promise<{ ok: boolean; error?: string }>;
  verifyOtp(phone: string, code: string): Promise<{ ok: boolean; error?: string }>;
  restoreSession(): Promise<Session | null>;
  saveProfile(user: User, address: Address): Promise<Address>;
  loadCatalog(): Promise<void>;
  placeOrder(draft: OrderDraft): Promise<Order>;
  cancelOrder(order: Order): Promise<Order>;
  listOrders(): Promise<Order[]>;
  /** Calls back with the latest copy of any of the user's orders when it changes. Returns an unsubscribe function. */
  watchOrders(onChange: (o: Order) => void): () => void;
  /** Testing aid: move an order to its next step. Returns null when the server has demo mode off. */
  advanceDemo(order: Order): Promise<Order | null>;
  signOut(): Promise<void>;
}
