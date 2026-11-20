export interface Category { id: string; name: string; emoji: string }
export interface Area { id: string; name: string; distanceKm: number }

export interface Owner { phone: string; name: string }

export type MerchantStatus = 'pending' | 'live' | 'suspended';

export interface Merchant {
  id: string;
  name: string;
  status: MerchantStatus;
  isOpen: boolean;
  phone: string;
  address: string;
  areaId: string | null;
  area: string;
  categories: string[];
  bankName: string;
  accountNumber: string;
  accountName: string;
}

/** What the sign-up and "edit shop" forms send. */
export interface MerchantInput {
  ownerName?: string;
  name: string;
  phone: string;
  address: string;
  areaId: string;
  categories: string[];
  bankName: string;
  accountNumber: string;
  accountName: string;
}

export interface Listing {
  id: string;
  name: string;
  category: string;
  price: number; // Naira
  unit: string;
  weightKg: number;
  longestSideCm: number | null;
  emoji: string;
  imageUrl: string | null;
  description: string;
  stock: number | null; // null = not tracked
  active: boolean; // false = hidden from customers
  updatedAt: number;
}

export type ListingInput = Omit<Listing, 'id' | 'updatedAt'>;

export type PartStatus = 'new' | 'preparing' | 'ready' | 'picked_up' | 'declined' | 'cancelled';

export interface OrderLine { productId: string; name: string; unitPrice: number; qty: number; imageUrl: string | null; emoji: string; unit: string }

/** This shop's part of a customer order. Customers' addresses and phone numbers are never sent to merchants. */
export interface MerchantOrder {
  id: string;
  code: string;
  createdAt: number;
  updatedAt: number;
  readyAt: number | null;
  status: PartStatus;
  orderStatus: string;
  itemsTotal: number;
  declineReason: string | null;
  customerName: string;
  items: OrderLine[];
  rider: { name: string; phone: string; vehicle: string; plate: string } | null;
}

export type OrderAction = 'accept' | 'ready' | 'decline';

export interface Sales {
  days: number;
  sales: number;
  orders: number;
  itemsSold: number;
  avgOrder: number;
  today: { sales: number; orders: number };
  daily: { date: string; sales: number; orders: number }[];
  topProducts: { productId: string; name: string; qty: number; sales: number }[];
  openOrders: number;
}

export interface Session { owner: Owner; merchant: Merchant | null }

/** Everything the app needs from a server. mock.ts = offline demo, server.ts = Arodan API server. */
export interface Backend {
  mode: 'mock' | 'live';
  otpLength: number;
  demoOtp?: string;
  sendOtp(phone: string): Promise<{ ok: boolean; error?: string }>;
  verifyOtp(phone: string, code: string): Promise<{ ok: boolean; error?: string }>;
  /** Null when not signed in. */
  restoreSession(): Promise<Session | null>;
  loadReference(): Promise<{ categories: Category[]; areas: Area[] }>;
  register(input: MerchantInput): Promise<Merchant>;
  updateMerchant(patch: Partial<MerchantInput> & { isOpen?: boolean }): Promise<Merchant>;
  listListings(): Promise<Listing[]>;
  createListing(input: ListingInput): Promise<Listing>;
  updateListing(id: string, patch: Partial<ListingInput>): Promise<Listing>;
  /** Uploads a JPEG (base64) and returns the URL to save on a listing. */
  uploadImage(base64: string): Promise<string>;
  /** Turns a saved image URL into one the app can display. */
  imageSrc(url: string | null): string | undefined;
  listOrders(activeOnly?: boolean): Promise<MerchantOrder[]>;
  orderAction(id: string, action: OrderAction, reason?: string): Promise<MerchantOrder>;
  sales(days: number): Promise<Sales>;
  signOut(): Promise<void>;
}
