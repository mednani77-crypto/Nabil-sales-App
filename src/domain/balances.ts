import type { Santim } from './money';
import { postingsOf, stockMovesOf, linesTotal } from './postings';
import type { AccountKey, ISODate, NoticeStatus, Operation, Posting, SaleOp, StockMove } from './types';

/** Stable chronological order: business date, then creation time, then id. */
export function sortOps(ops: Operation[]): Operation[] {
  return [...ops].sort(
    (a, b) =>
      a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );
}

/** Deduplicate by id (idempotency: the same operation saved/synced twice counts once). */
export function uniqueOps(ops: Operation[]): Operation[] {
  const seen = new Map<string, Operation>();
  for (const op of ops) if (!seen.has(op.id)) seen.set(op.id, op);
  return [...seen.values()];
}

/** Latest notice status per transfer operation (append-only status ops; the newest wins). */
export function noticeStatuses(ops: Operation[]): Map<string, NoticeStatus> {
  const m = new Map<string, { at: string; status: NoticeStatus }>();
  for (const op of uniqueOps(ops)) {
    if (op.type !== 'noticeStatus') continue;
    const cur = m.get(op.targetOpId);
    const key = op.createdAt + op.id;
    if (!cur || key > cur.at) m.set(op.targetOpId, { at: key, status: op.status });
  }
  return new Map([...m].map(([k, v]) => [k, v.status]));
}

export function allPostings(ops: Operation[]): Posting[] {
  const status = noticeStatuses(ops);
  return sortOps(uniqueOps(ops))
    .flatMap(postingsOf)
    .map((p) => (p.unconfirmed && status.get(p.opId) === 'confirmed' ? { ...p, unconfirmed: false } : p));
}

export function balances(ops: Operation[]): Map<AccountKey, Santim> {
  const m = new Map<AccountKey, Santim>();
  for (const p of allPostings(ops)) m.set(p.account, (m.get(p.account) ?? 0) + p.debit - p.credit);
  return m;
}

export function balanceOf(ops: Operation[], account: AccountKey): Santim {
  return balances(ops).get(account) ?? 0;
}

export interface CompanySummary {
  /** Positive = Nabil owes the company. Includes unconfirmed payments. */
  balance: Santim;
  unconfirmed: Santim;
}

export function companySummary(ops: Operation[]): CompanySummary {
  let balance = 0;
  let unconfirmed = 0;
  for (const p of allPostings(ops)) {
    if (p.account !== 'company') continue;
    balance += p.debit - p.credit;
    if (p.unconfirmed) unconfirmed += p.credit;
  }
  return { balance, unconfirmed };
}

export function stockByItem(ops: Operation[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const mv of sortOps(uniqueOps(ops)).flatMap(stockMovesOf)) {
    m.set(mv.itemId, (m.get(mv.itemId) ?? 0) + mv.qty);
  }
  return m;
}

export function movesOfItem(ops: Operation[], itemId: string): StockMove[] {
  return sortOps(uniqueOps(ops))
    .flatMap(stockMovesOf)
    .filter((m) => m.itemId === itemId);
}

export interface LedgerRow {
  posting: Posting;
  op: Operation;
  balance: Santim;
}

/** Running-balance ledger of one account, optionally from a date (carried forward computed). */
export function ledger(
  ops: Operation[],
  account: AccountKey,
  from?: ISODate,
  to?: ISODate,
): { carried: Santim; rows: LedgerRow[]; closing: Santim } {
  const byId = new Map(ops.map((o) => [o.id, o]));
  let run = 0;
  let carried = 0;
  const rows: LedgerRow[] = [];
  for (const p of allPostings(ops)) {
    if (p.account !== account) continue;
    if (to && p.date > to) continue;
    run += p.debit - p.credit;
    if (from && p.date < from) {
      carried = run;
      continue;
    }
    rows.push({ posting: p, op: byId.get(p.opId)!, balance: run });
  }
  return { carried, rows, closing: run };
}

export function salesOn(ops: Operation[], date: ISODate): { total: Santim; paid: Santim; count: number } {
  const sales = uniqueOps(ops).filter((o): o is SaleOp => o.type === 'sale' && o.date === date);
  return {
    total: sales.reduce((t, s) => t + linesTotal(s.lines), 0),
    paid: sales.reduce((t, s) => t + s.paid, 0),
    count: sales.length,
  };
}
