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

/** Tracking state of a bank-transfer notice (the transfer itself is another operation).
 *  recorded → sent to the WhatsApp group → confirmed by the company. Latest status wins. */
export type NoticeStatus = 'recorded' | 'sent' | 'confirmed';

export interface NoticeStatusOp extends OpBase {
  type: 'noticeStatus';
  targetOpId: string;
  status: NoticeStatus;
}

/** Goods returned by a customer. Good goods go back to the truck; damaged ones do not. */
export interface CustomerReturnOp extends OpBase {
  type: 'customerReturn';
  customerId: string | null;
  lines: OpLine[];
  condition: 'good' | 'damaged';
  /** 'balance' = reduce the customer's debt (or give him credit); 'cash' = hand back cash. */
  settle: 'balance' | 'cash';
  invoiceOpId?: string;
}

/** Goods sent back to the company warehouse. Leaves the truck now; debt drops only when accepted. */
export interface CompanyReturnOp extends OpBase {
  type: 'companyReturn';
  docNo: string;
  lines: OpLine[];
  reason: string;
}

/** The company's answer to a return. Carries a copy of the lines so it is self-contained. */
export interface CompanyReturnDecisionOp extends OpBase {
  type: 'companyReturnDecision';
  targetOpId: string;
  decision: 'accepted' | 'rejected';
  lines: OpLine[];
}

export interface StockAdjustment {
  itemId: string;
  itemName: string;
  /** Base units recorded by the app before the count. */
  recorded: number;
  /** Base units actually counted. */
  actual: number;
  reason: string;
}

/** Physical truck count. Changes stock only — never money. */
export interface StockCountOp extends OpBase {
  type: 'stockCount';
  adjustments: StockAdjustment[];
}

/** Cancels a mistaken operation by reversing it. The original stays in history. */
export interface VoidOp extends OpBase {
  type: 'void';
  targetOpId: string;
  reason: string;
  /** Copy of the cancelled operation, so the reversal is self-contained. */
  target: VoidableOp;
}

export type VoidableOp =
  | ReceiveOp
  | SaleOp
  | OpeningOp
  | CollectionOp
  | TransferOp
  | CompanyPaymentOp
  | CustomerReturnOp
  | CompanyReturnOp
  | StockCountOp;

export type Operation =
  | VoidableOp
  | NoticeStatusOp
  | CompanyReturnDecisionOp
  | VoidOp;
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
