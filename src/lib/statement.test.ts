import { describe, expect, it } from 'vitest';
import { buildOpening, buildReceive } from '../domain/operations';
import { buildCompanyPayment, buildCollection } from '../domain/moneyOps';
import { balances } from '../domain/balances';
import type { Customer, Item, Operation } from '../domain/types';
import { buildStatement, paginate } from './statement';

const b = (birr: number) => birr * 100;
const T = '2026-10-01T00:00:00Z';
const sugar: Item = { id: 's', name: 'سكر', units: [{ name: 'جونية', factor: 1, lastPrice: b(7400) }], minStock: 0, createdAt: T, updatedAt: T };
const items = new Map([[sugar.id, sugar]]);
const customers = new Map<string, Customer>([['c1', { id: 'c1', name: 'سوبرماركت النور', createdAt: T, updatedAt: T }]]);
let n = 0;
const ctx = (date: string) => ({ id: `st${++n}`, date, createdAt: `${date}T08:${String(n).padStart(2, '0')}:00Z`, deviceId: 'd' });
function ok<T>(r: { ok: true; value: T } | { ok: false; errors: string[] }): T {
  if (!r.ok) throw new Error(r.errors.join());
  return r.value;
}

function ops(): Operation[] {
  const o: Operation[] = [ok(buildOpening({ company: b(100000), customers: [{ customerId: 'c1', balance: b(5000) }], wallets: { cash: b(30000), cbe: 0, ebirr: 0 }, stock: [] }, ctx('2026-10-01')))];
  o.push(ok(buildReceive([{ itemId: 's', unitName: 'جونية', qty: 2, unitPrice: b(7400) }], items, { ...ctx('2026-10-12'), docNo: 'GRN-A0001' })));
  o.push(ok(buildCompanyPayment({ source: 'cash', bank: 'cbe', amount: b(20000), ref: 'FT1' }, balances(o), ctx('2026-10-20'))));
  o.push(ok(buildCollection({ customerId: 'c1', amount: b(3000), destination: { kind: 'company', bank: 'ebirr' }, ref: 'EB9' }, ctx('2026-10-22'))));
  return o;
}

describe('account statement', () => {
  it('carries the balance forward and totals the period (company, Arabic)', () => {
    const s = buildStatement(ops(), 'company', '2026-10-10', '2026-10-31', 'ar', customers);
    expect(s.carried).toBe(b(100000));
    expect(s.rows).toHaveLength(3);
    expect(s.totalDebit).toBe(b(14800));
    expect(s.totalCredit).toBe(b(23000));
    expect(s.closing).toBe(b(100000 + 14800 - 23000));
    expect(s.rows[0].desc).toBe('استلام بضاعة · GRN-A0001');
    expect(s.rows[2].desc).toContain('سوبرماركت النور'); // names never translated
    expect(s.hasPending).toBe(true);
  });

  it('translates labels but keeps names, amounts and references', () => {
    const en = buildStatement(ops(), 'customer:c1', '2026-10-01', '2026-10-31', 'en', customers);
    expect(en.rows.map((r) => r.desc)).toEqual(['Opening balance', 'Payment received · Ebirr (company) · EB9']);
    const am = buildStatement(ops(), 'customer:c1', '2026-10-01', '2026-10-31', 'am', customers);
    expect(am.rows[1].desc).toContain('EB9');
    expect(am.closing).toBe(en.closing);
    expect(en.holder).toBe('سوبرماركت النور');
  });

  it('paginates long statements', () => {
    expect(paginate(Array.from({ length: 10 }))).toHaveLength(1);
    const p = paginate(Array.from({ length: 50 }), 16, 24);
    expect(p.map((x) => x.length)).toEqual([16, 24, 10]);
  });
});
