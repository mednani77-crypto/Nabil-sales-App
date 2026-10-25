import { fmtMoney, type Santim } from './money';
import type { OpContext, Result } from './operations';
import { postingsOf } from './postings';
import {
  customerAccount,
  walletAccount,
  type AccountKey,
  type CollectionOp,
  type CompanyBank,
  type CompanyPaymentOp,
  type ISODate,
  type Operation,
  type PayDestination,
  type TransferOp,
  type WalletKey,
} from './types';

const WALLET_NAME: Record<WalletKey, string> = { cash: 'النقد في اليد', cbe: 'CBE الشخصي', ebirr: 'Ebirr الشخصي' };

function checkAmount(amount: Santim, errors: string[]) {
  if (!Number.isInteger(amount) || amount <= 0) errors.push('أدخل مبلغًا صحيحًا أكبر من صفر');
}

function cleanRef(ref?: string) {
  const r = ref?.trim();
  return r ? r : undefined;
}

export interface CollectionDraft {
  customerId: string | null;
  amount: Santim;
  destination: PayDestination | null;
  ref?: string;
  invoiceOpId?: string;
}

export function buildCollection(d: CollectionDraft, ctx: OpContext): Result<CollectionOp> {
  const errors: string[] = [];
  if (!d.customerId) errors.push('اختر العميل أولًا');
  checkAmount(d.amount, errors);
  if (!d.destination) errors.push('حدد كيف وصل المبلغ');
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      ...ctx,
      type: 'collection',
      customerId: d.customerId!,
      amount: d.amount,
      destination: d.destination!,
      ref: cleanRef(d.ref),
      invoiceOpId: d.invoiceOpId || undefined,
      syncState: 'local',
    },
  };
}

export function buildTransfer(
  d: { from: WalletKey; to: WalletKey; amount: Santim },
  balances: Map<AccountKey, Santim>,
  ctx: OpContext,
): Result<TransferOp> {
  const errors: string[] = [];
  if (d.from === d.to) errors.push('اختر محفظتين مختلفتين');
  checkAmount(d.amount, errors);
  const have = balances.get(walletAccount(d.from)) ?? 0;
  if (d.amount > have) errors.push(`المبلغ أكبر من أموال العمل في ${WALLET_NAME[d.from]} (${fmtMoney(have)})`);
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { ...ctx, type: 'transfer', from: d.from, to: d.to, amount: d.amount, syncState: 'local' } };
}

export function buildCompanyPayment(
  d: { source: WalletKey; bank: CompanyBank; amount: Santim; ref?: string },
  balances: Map<AccountKey, Santim>,
  ctx: OpContext,
): Result<CompanyPaymentOp> {
  const errors: string[] = [];
  checkAmount(d.amount, errors);
  const have = balances.get(walletAccount(d.source)) ?? 0;
  if (d.amount > have) errors.push(`المبلغ أكبر من أموال العمل في ${WALLET_NAME[d.source]} (${fmtMoney(have)})`);
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: { ...ctx, type: 'companyPayment', source: d.source, bank: d.bank, amount: d.amount, ref: cleanRef(d.ref), syncState: 'local' },
  };
}

/** A transfer that landed in a company bank account (direct customer payment or Nabil's payment). */
export interface CompanyTransfer {
  op: Operation;
  bank: CompanyBank;
  amount: Santim;
  ref?: string;
  date: ISODate;
}

export function companyTransfers(ops: Operation[]): CompanyTransfer[] {
  const out: CompanyTransfer[] = [];
  for (const op of ops) {
    if (op.type === 'companyPayment') out.push({ op, bank: op.bank, amount: op.amount, ref: op.ref, date: op.date });
    else if (op.type === 'collection' && op.destination.kind === 'company')
      out.push({ op, bank: op.destination.bank, amount: op.amount, ref: op.ref, date: op.date });
    else if (op.type === 'sale' && op.paid > 0 && op.destination?.kind === 'company')
      out.push({ op, bank: op.destination.bank, amount: op.paid, date: op.date });
  }
  return out;
}

/**
 * Possible duplicates of a new company transfer: same reference number, or same amount + bank + date.
 * The UI warns and lets Nabil confirm — it never silently blocks.
 */
export function findSimilarTransfers(
  ops: Operation[],
  t: { bank: CompanyBank; amount: Santim; ref?: string; date: ISODate },
): CompanyTransfer[] {
  const ref = cleanRef(t.ref)?.toUpperCase();
  return companyTransfers(ops).filter(
    (x) => (ref && x.ref?.trim().toUpperCase() === ref) || (x.amount === t.amount && x.bank === t.bank && x.date === t.date),
  );
}

export interface CustomerActivity {
  balance: Santim;
  lastSale: ISODate | null;
  lastPayment: ISODate | null;
  /** Owes money and paid nothing for more than `lateDays` days. */
  late: boolean;
  daysSincePayment: number | null;
}

function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}

export function customerActivity(ops: Operation[], customerId: string, today: ISODate, lateDays = 7): CustomerActivity {
  const acc = customerAccount(customerId);
  let balance = 0;
  let lastSale: ISODate | null = null;
  let lastPayment: ISODate | null = null;
  let firstDebit: ISODate | null = null;
  for (const op of ops) {
    for (const p of postingsOf(op)) {
      if (p.account !== acc) continue;
      balance += p.debit - p.credit;
      if (p.debit > 0 && (!firstDebit || p.date < firstDebit)) firstDebit = p.date;
      if (op.type === 'sale' && p.debit > 0 && (!lastSale || p.date > lastSale)) lastSale = p.date;
      if (p.credit > 0 && (op.type === 'collection' || op.type === 'sale') && (!lastPayment || p.date > lastPayment)) lastPayment = p.date;
    }
  }
  const since = lastPayment ?? firstDebit;
  const daysSincePayment = since ? daysBetween(since, today) : null;
  return { balance, lastSale, lastPayment, late: balance > 0 && daysSincePayment !== null && daysSincePayment > lateDays, daysSincePayment };
}
