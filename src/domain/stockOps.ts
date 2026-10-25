import { balances, stockByItem, uniqueOps, voidedIds } from './balances';
import { fmtMoney } from './money';
import { checkStock, snapshotLines, type DraftLine, type OpContext, type Result } from './operations';
import { linesTotal, postingsOf, stockMovesOf } from './postings';
import { decompose } from './units';
import {
  walletAccount,
  type CompanyReturnDecisionOp,
  type CompanyReturnOp,
  type CustomerReturnOp,
  type Item,
  type Operation,
  type StockAdjustment,
  type StockCountOp,
  type VoidableOp,
  type VoidOp,
} from './types';

/* ---------------- Customer returns ---------------- */

export interface CustomerReturnDraft {
  customerId: string | null;
  lines: DraftLine[];
  condition: 'good' | 'damaged';
  settle: 'balance' | 'cash';
  invoiceOpId?: string;
}

export function buildCustomerReturn(
  d: CustomerReturnDraft,
  items: Map<string, Item>,
  ops: Operation[],
  ctx: OpContext,
): Result<CustomerReturnOp> {
  const r = snapshotLines(d.lines, items);
  if (!r.ok) return r;
  const errors: string[] = [];
  if (d.settle === 'balance' && !d.customerId) errors.push('اختر العميل لخصم المرتجع من رصيده، أو اختر «رد المبلغ نقدًا»');
  const value = linesTotal(r.value);
  if (d.settle === 'cash') {
    const cash = balances(ops).get(walletAccount('cash')) ?? 0;
    if (value > cash) errors.push(`النقد لديك ${fmtMoney(cash)} لا يكفي لرد ${fmtMoney(value)}`);
  }
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: { ...ctx, type: 'customerReturn', customerId: d.customerId, lines: r.value, condition: d.condition, settle: d.settle, invoiceOpId: d.invoiceOpId || undefined, syncState: 'local' },
  };
}

/* ---------------- Company returns ---------------- */

export function buildCompanyReturn(
  d: { lines: DraftLine[]; reason: string },
  items: Map<string, Item>,
  ops: Operation[],
  ctx: OpContext & { docNo: string },
): Result<CompanyReturnOp> {
  const r = snapshotLines(d.lines, items);
  if (!r.ok) return r;
  const errors = checkStock(r.value, items, stockByItem(ops));
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { ...ctx, type: 'companyReturn', lines: r.value, reason: d.reason.trim() || 'تالف', syncState: 'local' } };
}

export type ReturnState = 'pending' | 'accepted' | 'rejected';

export function companyReturnStates(ops: Operation[]): { op: CompanyReturnOp; state: ReturnState; value: number }[] {
  const u = uniqueOps(ops);
  const voided = voidedIds(u);
  const decided = new Map<string, ReturnState>();
  for (const o of u) if (o.type === 'companyReturnDecision') decided.set(o.targetOpId, o.decision);
  return u
    .filter((o): o is CompanyReturnOp => o.type === 'companyReturn' && !voided.has(o.id))
    .map((op) => ({ op, state: decided.get(op.id) ?? 'pending', value: linesTotal(op.lines) }))
    .sort((a, b) => b.op.createdAt.localeCompare(a.op.createdAt));
}

export function pendingCompanyReturnsValue(ops: Operation[]): number {
  return companyReturnStates(ops)
    .filter((r) => r.state === 'pending')
    .reduce((t, r) => t + r.value, 0);
}

export function buildCompanyReturnDecision(
  targetOpId: string,
  decision: 'accepted' | 'rejected',
  ops: Operation[],
  ctx: OpContext,
): Result<CompanyReturnDecisionOp> {
  const st = companyReturnStates(ops).find((r) => r.op.id === targetOpId);
  if (!st) return { ok: false, errors: ['المرتجع غير موجود'] };
  if (st.state !== 'pending') return { ok: false, errors: ['سُجّل قرار الشركة لهذا المرتجع مسبقًا'] };
  return { ok: true, value: { ...ctx, type: 'companyReturnDecision', targetOpId, decision, lines: st.op.lines, syncState: 'local' } };
}

/* ---------------- Stock count ---------------- */

export function buildStockCount(
  counts: { itemId: string; actual: number; reason?: string }[],
  items: Map<string, Item>,
  ops: Operation[],
  ctx: OpContext,
): Result<StockCountOp> {
  const stock = stockByItem(ops);
  const errors: string[] = [];
  const adjustments: StockAdjustment[] = [];
  for (const c of counts) {
    const item = items.get(c.itemId);
    if (!item) continue;
    if (!Number.isInteger(c.actual) || c.actual < 0) {
      errors.push(`«${item.name}»: الكمية الفعلية غير صحيحة`);
      continue;
    }
    const recorded = stock.get(c.itemId) ?? 0;
    if (c.actual !== recorded) adjustments.push({ itemId: item.id, itemName: item.name, recorded, actual: c.actual, reason: c.reason?.trim() || 'خطأ عدّ' });
  }
  if (!errors.length && adjustments.length === 0) errors.push('لا توجد فروقات لحفظها');
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { ...ctx, type: 'stockCount', adjustments, syncState: 'local' } };
}

/* ---------------- Void (safe cancel) ---------------- */

const VOIDABLE = new Set<Operation['type']>(['receive', 'sale', 'opening', 'collection', 'transfer', 'companyPayment', 'customerReturn', 'companyReturn', 'stockCount']);

export function canVoid(op: Operation, ops: Operation[]): string | null {
  if (!VOIDABLE.has(op.type)) return 'هذه العملية لا تُلغى';
  if (voidedIds(ops).has(op.id)) return 'العملية ملغاة مسبقًا';
  if (op.type === 'companyReturn' && companyReturnStates(ops).find((r) => r.op.id === op.id)?.state !== 'pending')
    return 'لا يمكن إلغاء مرتجع بعد تسجيل قرار الشركة';
  return null;
}

/** Cancel a mistaken operation by appending its exact reversal. Blocks if stock or a wallet would go negative. */
export function buildVoid(targetOpId: string, reason: string, ops: Operation[], items: Map<string, Item>, ctx: OpContext): Result<VoidOp> {
  const target = uniqueOps(ops).find((o) => o.id === targetOpId);
  if (!target) return { ok: false, errors: ['العملية غير موجودة'] };
  const why = canVoid(target, ops);
  if (why) return { ok: false, errors: [why] };
  const op: VoidOp = { ...ctx, type: 'void', targetOpId, reason: reason.trim() || 'إدخال خاطئ', target: target as VoidableOp, syncState: 'local' };

  const errors: string[] = [];
  const after = [...ops, op];
  const stock = stockByItem(after);
  for (const m of stockMovesOf(op)) {
    const q = stock.get(m.itemId) ?? 0;
    if (q < 0) {
      const item = items.get(m.itemId);
      errors.push(`لا يمكن الإلغاء: سيصبح مخزون «${item?.name ?? m.itemId}» بالسالب (${item ? decompose(item, q).label : q})`);
    }
  }
  const bal = balances(after);
  for (const p of postingsOf(op)) {
    if (p.account.startsWith('wallet:') && (bal.get(p.account) ?? 0) < 0)
      errors.push(`لا يمكن الإلغاء: سيصبح رصيد المحفظة بالسالب (${fmtMoney(bal.get(p.account) ?? 0)})`);
  }
  return errors.length ? { ok: false, errors: [...new Set(errors)] } : { ok: true, value: op };
}
