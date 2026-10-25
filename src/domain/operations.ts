import { fmtMoney, type Santim } from './money';
import { linesTotal } from './postings';
import { decompose, unitByName } from './units';
import type {
  Customer,
  ISODate,
  ISODateTime,
  Item,
  OpeningOp,
  OpLine,
  PayDestination,
  PayMode,
  ReceiveOp,
  SaleOp,
  WalletKey,
} from './types';

export type Result<T> = { ok: true; value: T } | { ok: false; errors: string[] };

export interface DraftLine {
  itemId: string;
  unitName: string;
  qty: number;
  unitPrice: Santim;
}

export interface OpContext {
  id: string;
  date: ISODate;
  createdAt: ISODateTime;
  deviceId: string;
}

export function snapshotLines(draft: DraftLine[], items: Map<string, Item>): Result<OpLine[]> {
  const errors: string[] = [];
  if (draft.length === 0) errors.push('أضف صنفًا واحدًا على الأقل');
  const lines: OpLine[] = [];
  draft.forEach((d, i) => {
    const item = items.get(d.itemId);
    if (!item) {
      errors.push(`السطر ${i + 1}: الصنف غير موجود`);
      return;
    }
    let factor = 1;
    try {
      factor = unitByName(item, d.unitName).factor;
    } catch (e) {
      errors.push((e as Error).message);
      return;
    }
    if (!Number.isInteger(d.qty) || d.qty <= 0) errors.push(`«${item.name}»: أدخل كمية صحيحة أكبر من صفر`);
    if (!Number.isInteger(d.unitPrice) || d.unitPrice < 0) errors.push(`«${item.name}»: السعر غير صحيح`);
    lines.push({ itemId: item.id, itemName: item.name, unitName: d.unitName, factor, qty: d.qty, unitPrice: d.unitPrice });
  });
  return errors.length ? { ok: false, errors } : { ok: true, value: lines };
}

export function buildReceive(
  draft: DraftLine[],
  items: Map<string, Item>,
  ctx: OpContext & { docNo: string },
): Result<ReceiveOp> {
  const r = snapshotLines(draft, items);
  if (!r.ok) return r;
  return {
    ok: true,
    value: { ...ctx, type: 'receive', docNo: ctx.docNo, lines: r.value, syncState: 'local' },
  };
}

export interface SaleDraft {
  customerId: string | null;
  lines: DraftLine[];
  payMode: PayMode;
  /** Only used for 'partial'. */
  paid: Santim;
  destination: PayDestination | null;
}

export function salePaid(payMode: PayMode, total: Santim, partialPaid: Santim): Santim {
  if (payMode === 'cash') return total;
  if (payMode === 'credit') return 0;
  return partialPaid;
}

/** Check the truck has enough of every item (lines of the same item are summed across units). */
export function checkStock(lines: OpLine[], items: Map<string, Item>, stock: Map<string, number>): string[] {
  const need = new Map<string, number>();
  for (const l of lines) need.set(l.itemId, (need.get(l.itemId) ?? 0) + l.qty * l.factor);
  const errors: string[] = [];
  for (const [itemId, qty] of need) {
    const have = stock.get(itemId) ?? 0;
    if (qty > have) {
      const item = items.get(itemId)!;
      errors.push(`«${item.name}»: المتوفر في الشاحنة ${decompose(item, have).label} فقط`);
    }
  }
  return errors;
}

export function buildSale(
  draft: SaleDraft,
  items: Map<string, Item>,
  stock: Map<string, number>,
  ctx: OpContext & { docNo: string; makeTempCustomer: () => Customer },
): Result<{ op: SaleOp; tempCustomer?: Customer }> {
  const r = snapshotLines(draft.lines, items);
  if (!r.ok) return r;
  const lines = r.value;
  const errors = checkStock(lines, items, stock);
  const total = linesTotal(lines);
  const paid = salePaid(draft.payMode, total, draft.paid);

  if (draft.payMode === 'partial') {
    if (!Number.isInteger(paid) || paid <= 0) errors.push('أدخل المبلغ المدفوع الآن');
    else if (paid >= total) errors.push(`المدفوع (${fmtMoney(paid)}) يساوي الإجمالي أو أكثر — اختر «نقدي»`);
  }
  if (paid > 0 && !draft.destination) errors.push('حدد أين وصل المبلغ المدفوع');
  if (errors.length) return { ok: false, errors };

  let customerId = draft.customerId;
  let tempCustomer: Customer | undefined;
  if (!customerId && paid < total) {
    tempCustomer = ctx.makeTempCustomer();
    customerId = tempCustomer.id;
  }

  const { makeTempCustomer: _ignored, ...base } = ctx;
  void _ignored;
  const op: SaleOp = {
    ...base,
    type: 'sale',
    customerId,
    lines,
    payMode: draft.payMode,
    paid,
    destination: paid > 0 ? draft.destination : null,
    syncState: 'local',
  };
  return { ok: true, value: { op, tempCustomer } };
}

export interface OpeningDraft {
  company: Santim;
  customers: { customerId: string; balance: Santim }[];
  wallets: Record<WalletKey, Santim>;
  stock: { itemId: string; qty: number }[];
}

export function buildOpening(draft: OpeningDraft, ctx: OpContext): Result<OpeningOp> {
  const errors: string[] = [];
  const ints = [draft.company, ...draft.customers.map((c) => c.balance), ...Object.values(draft.wallets)];
  if (ints.some((v) => !Number.isInteger(v))) errors.push('المبالغ يجب أن تكون بالسنتيم كأعداد صحيحة');
  if (Object.values(draft.wallets).some((v) => v < 0)) errors.push('رصيد المحفظة لا يكون سالبًا');
  if (draft.stock.some((s) => !Number.isInteger(s.qty) || s.qty < 0)) errors.push('كميات المخزون غير صحيحة');
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { ...ctx, type: 'opening', ...draft, syncState: 'local' } };
}
