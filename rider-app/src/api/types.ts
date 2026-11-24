// Shapes returned by the Arodan API server's /rider endpoints (server/src/rider.js).

export type Vehicle = 'motorbike' | 'bicycle';
export type JobStatus = 'placed' | 'assigned' | 'picked_up' | 'on_the_way' | 'at_gate' | 'delivered' | 'cancelled';
export type PaymentMethod = 'card' | 'transfer' | 'pod';

export interface RiderProfile {
  id: string;
  name: string;
  phone: string;
  vehicle: Vehicle;
  plate: string;
  rating: number;
  trips: number;
  online: boolean;
  checks: { nin: boolean; guarantor: boolean; address: boolean };
  /** All vetting checks done and the account is active: the rider may go online. */
  vetted: boolean;
}

export interface Payout { delivery: number; errand: number; topUp: number; total: number }

export interface MerchantPickup {
  kind: 'merchant';
  id: string;
  name: string;
  area: string;
  distanceKm: number;
  items: { name: string; qty: number; unitPrice: number }[];
}

export interface ErrandPickup {
  kind: 'errand';
  id: string;
  name: string; // errand location, e.g. "Ketu market"
  area: string;
  distanceKm: number;
  errandType: 'buy' | 'pickup' | 'laundry' | 'bills';
  title: string;
  details: string;
  estMin: number;
  budget: number; // money the rider spends for the customer
}

export type Pickup = MerchantPickup | ErrandPickup;

/** Drop-off. Before accepting, only estate and street are shown. */
export interface Dropoff {
  estate: string;
  street: string;
  label?: string;
  houseNo?: string;
  landmark?: string;
  gateName?: string;
  gateCode?: string;
  gateNote?: string;
}

export interface Job {
  id: string;
  code: string;
  status: JobStatus;
  createdAt: string;
  vehicle: Vehicle;
  etaMin: number;
  payout: Payout;
  payment: PaymentMethod;
  paymentStatus: 'pending' | 'paid' | 'refunded' | 'failed';
  /** Cash to collect at the door (pay-on-delivery orders), 0 otherwise. */
  collect: number;
  itemsTotal: number;
  errandBudget: number;
  dropoff: Dropoff;
  customer: { name: string; phone: string } | null;
  pickups: Pickup[];
  itemCount: number;
  weightKg: number;
}

export interface EarningsPeriod { amount: number; trips: number }

export interface Earnings {
  today: EarningsPeriod;
  week: EarningsPeriod;
  total: EarningsPeriod;
  days: { day: string; amount: number; trips: number }[];
  recent: { orderId: string; code: string; at: string; amount: number; delivery: number; errand: number; topUp: number; estate: string }[];
}

export type Proof =
  | { method: 'code'; code: string }
  | { method: 'photo'; photo: string /* base64 JPEG */; note?: string };

export interface Position { lat: number; lng: number; heading?: number | null; speed?: number | null }

/** Everything the rider app needs from a server. Implemented by mock.ts (offline demo) and server.ts. */
export interface RiderBackend {
  mode: 'mock' | 'live';
  otpLength: number;
  demoOtp?: string;
  sendOtp(phone: string): Promise<{ ok: boolean; error?: string }>;
  verifyOtp(phone: string, code: string): Promise<{ ok: boolean; error?: string }>;
  /** null when signed out. Throws NotRiderError when the account is not a rider. */
  restoreSession(): Promise<{ rider: RiderProfile; activeJob: Job | null } | null>;
  setOnline(online: boolean, pos?: Position | null): Promise<RiderProfile>;
  sendLocation(pos: Position): Promise<void>;
  openJobs(): Promise<Job[]>;
  currentJob(): Promise<Job | null>;
  accept(job: Job): Promise<Job>;
  decline(job: Job): Promise<void>;
  release(job: Job): Promise<void>;
  advance(job: Job, status: 'picked_up' | 'on_the_way' | 'at_gate'): Promise<Job>;
  deliver(job: Job, proof: Proof, extra: { cashCollected?: number; pos?: Position | null }): Promise<{ earned: number; job: Job }>;
  earnings(): Promise<Earnings>;
  signOut(): Promise<void>;
}

export class NotRiderError extends Error {}
