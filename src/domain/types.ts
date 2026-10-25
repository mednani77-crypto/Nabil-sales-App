import type { Santim } from './money';

export type ISODate = string; // YYYY-MM-DD (business date chosen by Nabil)
export type ISODateTime = string; // full timestamp of creation

export type WalletKey = 'cash' | 'cbe' | 'ebirr';
export type CompanyBank = 'cbe' | 'ebirr' | 'abyssinia' | 'awash';

export const WALLETS: WalletKey[] = ['cash', 'cbe', 'ebirr'];
export const COMPANY_BANKS: CompanyBank[] = ['cbe', 'ebirr', 'abyssinia', 'awash'];

export type PayDestination =
  | { kind: 'wallet'; wallet: WalletKey }
  | { kind: 'company'; bank: CompanyBank };

export type AccountKey = 'company' | `customer:${string}` | `wallet:${WalletKey}`;

export const UNIT_NAMES = ['كنتال', 'كرتون', 'جونية', 'حبة'] as const;

export interface Unit {
  name: string;
  /** How many base units one of this unit contains. The base (smallest) unit has factor 1. */
  factor: number;
  /** Last price used for this unit (suggestion only). */
  lastPrice: Santim;
}

export interface Item {
  id: string;
  name: string;
  /** Sorted by factor, largest first. The last unit always has factor 1. */
  units: Unit[];
  /** Alert threshold in base units (0 = no alert). */
  minStock: number;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface Customer {
  id: string;
  name: string;
  phone?: string;
  area?: string;
  /** Anonymous credit sale; renamable later, id never changes. */
  temp?: boolean;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/** One line of a receive/sale, with everything snapshotted. qty is in `unitName`. */
export interface OpLine {
  itemId: string;
  itemName: string;
  unitName: string;
  factor: number;
  qty: number;
  unitPrice: Santim;
}

interface OpBase {
  id: string;
  date: ISODate;
  createdAt: ISODateTime;
  deviceId: string;
  note?: string;
  syncState: 'local' | 'synced';
}

export interface ReceiveOp extends OpBase {
  type: 'receive';
  docNo: string;
  lines: OpLine[];
}

export type PayMode = 'cash' | 'credit' | 'partial';

export interface SaleOp extends OpBase {
  type: 'sale';
  docNo: string;
  customerId: string | null;
  lines: OpLine[];
  payMode: PayMode;
  paid: Santim;
  destination: PayDestination | null;
}

/** Starting point when Nabil begins using the app. Stock here is NOT charged to the company. */
export interface OpeningOp extends OpBase {
  type: 'opening';
  /** Positive = Nabil owes the company. */
  company: Santim;
  customers: { customerId: string; balance: Santim }[];
  wallets: Record<WalletKey, Santim>;
  stock: { itemId: string; qty: number }[];
}

/** Money received from a customer. Into a wallet, or straight into a company bank account
 *  (then it ALSO counts as a payment to the company — one operation, never two). */
export interface CollectionOp extends OpBase {
  type: 'collection';
  customerId: string;
  amount: Santim;
  destination: PayDestination;
  ref?: string;
  /** Optional link to a specific invoice (operation id). By default it reduces the total balance. */
  invoiceOpId?: string;
}

/** Move work money between Nabil's own wallets. Never touches the company account. */
export interface TransferOp extends OpBase {
  type: 'transfer';
  from: WalletKey;
  to: WalletKey;
  amount: Santim;
}

/** Nabil pays the company from one of his work-money wallets. */
export interface CompanyPaymentOp extends OpBase {
  type: 'companyPayment';
  source: WalletKey;
  bank: CompanyBank;
  amount: Santim;
  ref?: string;
}

export type Operation = ReceiveOp | SaleOp | OpeningOp | CollectionOp | TransferOp | CompanyPaymentOp;
export type OperationType = Operation['type'];

export interface Posting {
  opId: string;
  opType: OperationType;
  date: ISODate;
  account: AccountKey;
  debit: Santim;
  credit: Santim;
  /** Payment to the company not yet confirmed (notice flow, phase 3). */
  unconfirmed?: boolean;
}

export interface StockMove {
  opId: string;
  opType: OperationType;
  date: ISODate;
  itemId: string;
  /** Signed, in base units. */
  qty: number;
}

export const customerAccount = (id: string): AccountKey => `customer:${id}`;
export const walletAccount = (w: WalletKey): AccountKey => `wallet:${w}`;
