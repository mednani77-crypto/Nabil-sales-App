import { allPostings, ledger, stockByItem, voidedIds } from '../domain/balances';
import { customerActivity } from '../domain/moneyOps';
import { notices } from '../domain/notices';
import { linesTotal } from '../domain/postings';
import { decompose, stockValue } from '../domain/units';
import type { Customer, Item, Operation, SaleOp, WalletKey } from '../domain/types';
import { describePosting } from './describe';
import { BANK_LABEL, WALLET_LABEL } from './labels';
import { fmtDateDMY } from './statement';

const birr = (s: number) => Math.round(s) / 100;
const inRange = (d: string, from: string, to: string) => d >= from && d <= to;
const STATUS = { recorded: 'لم يُرسل', sent: 'أُرسل · بانتظار الشركة', confirmed: 'مؤكد' } as const;

/** All report tables for a period, as rows (first row = header). Used for Excel and on-screen reports. */
export function reportTables(ops: Operation[], items: Item[], customers: Customer[], from: string, to: string, today: string) {
  const cmap = new Map(customers.map((c) => [c.id, c]));
  const byId = new Map(ops.map((o) => [o.id, o]));
  const voided = voidedIds(ops);
  const cname = (id: string | null) => (id ? cmap.get(id)?.name ?? '' : 'نقدي – بدون عميل');

  const co = ledger(ops, 'company', from, to);
  const company: (string | number)[][] = [
    ['التاريخ', 'البيان', 'مدين', 'دائن', 'الرصيد', 'ملاحظة'],
    ['', 'الرصيد المرحّل من قبل الفترة', '', '', birr(co.carried), ''],
    ...co.rows.map((r) => [fmtDateDMY(r.posting.date), describePosting(r.posting, byId.get(r.posting.opId), cmap), birr(r.posting.debit), birr(r.posting.credit), birr(r.balance), r.posting.unconfirmed ? 'غير مؤكد' : '']),
  ];

  const custRows: (string | number)[][] = [['العميل', 'الهاتف', 'الرصيد (موجب = عليه)', 'آخر بيع', 'آخر تحصيل', 'متأخر']];
  for (const c of customers) {
    const a = customerActivity(ops, c.id, today);
    custRows.push([c.name, c.phone ?? '', birr(a.balance), a.lastSale ? fmtDateDMY(a.lastSale) : '', a.lastPayment ? fmtDateDMY(a.lastPayment) : '', a.late ? 'نعم' : '']);
  }

  const sales = ops.filter((o): o is SaleOp => o.type === 'sale' && inRange(o.date, from, to)).sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
  const salesRows: (string | number)[][] = [['التاريخ', 'الفاتورة', 'العميل', 'الصنف', 'الوحدة', 'الكمية', 'السعر', 'إجمالي السطر', 'إجمالي الفاتورة', 'المدفوع', 'الحالة']];
  for (const s of sales) {
    s.lines.forEach((l, i) =>
      salesRows.push([fmtDateDMY(s.date), s.docNo, cname(s.customerId), l.itemName, l.unitName, l.qty, birr(l.unitPrice), birr(l.qty * l.unitPrice), i === 0 ? birr(linesTotal(s.lines)) : '', i === 0 ? birr(s.paid) : '', voided.has(s.id) ? 'ملغاة' : '']),
    );
  }

  const colRows: (string | number)[][] = [['التاريخ', 'العميل', 'المبلغ', 'وصل إلى', 'المرجع', 'الحالة']];
  for (const o of ops) {
    if (o.type !== 'collection' || !inRange(o.date, from, to)) continue;
    const d = o.destination;
    colRows.push([fmtDateDMY(o.date), cname(o.customerId), birr(o.amount), d.kind === 'wallet' ? WALLET_LABEL[d.wallet] : `${BANK_LABEL[d.bank]} (الشركة)`, o.ref ?? '', voided.has(o.id) ? 'ملغاة' : '']);
  }

  const payRows: (string | number)[][] = [['التاريخ', 'بنك الشركة', 'المبلغ', 'المرجع', 'المصدر', 'حالة الإشعار']];
  for (const n of notices(ops).filter((x) => inRange(x.date, from, to)).reverse()) {
    payRows.push([fmtDateDMY(n.date), BANK_LABEL[n.bank], birr(n.amount), n.ref ?? '', n.from.kind === 'wallet' ? WALLET_LABEL[n.from.wallet] : `مباشر من ${cname(n.from.customerId)}`, STATUS[n.status]]);
  }

  const stock = stockByItem(ops);
  const stockRows: (string | number)[][] = [['الصنف', 'المتوفر', 'بأصغر وحدة', 'القيمة']];
  for (const it of items) {
    const q = stock.get(it.id) ?? 0;
    stockRows.push([it.name, decompose(it, q).label, q, birr(stockValue(it, q))]);
  }

  const walletRows: (string | number)[][] = [['التاريخ', 'المحفظة', 'البيان', 'داخل', 'خارج']];
  for (const p of allPostings(ops)) {
    if (!p.account.startsWith('wallet:') || !inRange(p.date, from, to)) continue;
    walletRows.push([fmtDateDMY(p.date), WALLET_LABEL[p.account.slice(7) as WalletKey], describePosting(p, byId.get(p.opId), cmap), p.debit ? birr(p.debit) : '', p.credit ? birr(p.credit) : '']);
  }

  return {
    'كشف الشركة': company,
    'أرصدة العملاء': custRows,
    'المبيعات': salesRows,
    'التحصيلات': colRows,
    'سدادات الشركة': payRows,
    'مخزون الشاحنة': stockRows,
    'حركة المحافظ': walletRows,
  };
}

export async function buildExcel(tables: Record<string, (string | number)[][]>): Promise<Blob> {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(tables)) {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = rows[0].map((_, i) => ({ wch: Math.min(40, Math.max(10, ...rows.map((r) => String(r[i] ?? '').length + 2))) }));
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
  }
  wb.Workbook = { Views: [{ RTL: true }] };
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
