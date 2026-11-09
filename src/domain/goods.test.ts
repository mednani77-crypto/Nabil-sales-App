import { describe, expect, it } from 'vitest';
import { buildGoodsRef, goodsLabel, goodsPrice } from './goods';
import { buildCollection, buildCompanyPayment } from './moneyOps';
import { buildReceive, buildSale } from './operations';
import { balances } from './balances';
import type { Item, Operation } from './types';

const b = (birr: number) => birr * 100;
const T = '2026-11-01T00:00:00Z';
const rice: Item = { id: 'r', name: 'رز', units: [{ name: 'كنتال', factor: 1, lastPrice: b(18000) }], minStock: 0, createdAt: T, updatedAt: T };
const items = new Map([[rice.id, rice]]);
let n = 0;
const ctx = (date: string) => ({ id: `g${++n}`, date, createdAt: `${date}T08:${String(n).padStart(2, '0')}:00Z`, deviceId: 'd' });
function ok<V>(r: { ok: true; value: V } | { ok: false; errors: string[] }): V {
  if (!r.ok) throw new Error(r.errors.join());
  return r.value;
}

/** Nabil's own example: took 4, gave Khaled 2 and Mohamed 2 on credit,
 *  Khaled paid for 1, Mohamed for 2, Nabil paid the company for 3 → 1 quintal still owed. */
function example(): Operation[] {
  const o: Operation[] = [];
  o.push(ok(buildReceive([{ itemId: 'r', unitName: 'كنتال', qty: 4, unitPrice: b(18000) }], items, { ...ctx('2026-11-01'), docNo: 'GRN-1' })));
  for (const c of ['khaled', 'mohamed'])
    o.push(ok(buildSale({ customerId: c, payMode: 'credit', paid: 0, destination: null, lines: [{ itemId: 'r', unitName: 'كنتال', qty: 2, unitPrice: b(18800) }] }, items, new Map([['r', 4]]), { ...ctx('2026-11-02'), docNo: `C-${c}`, makeTempCustomer: () => { throw new Error('no temp'); } })).op);
  return o;
}

describe('payments counted in goods', () => {
  it('uses the price this customer was charged, and the company price for the company', () => {
    const o = example();
    expect(goodsPrice(o, rice, 'كنتال', { customerId: 'khaled' })).toBe(b(18800));
    expect(goodsPrice(o, rice, 'كنتال', 'company')).toBe(b(18000));
    expect(goodsPrice([], rice, 'كنتال', { customerId: 'x' })).toBe(b(18000)); // fallback: unit's last price
  });

  it("works through Nabil's example: 1 quintal left with Khaled, 1 quintal owed to the company", () => {
    const o = example();
    const pay = (customerId: string, qty: number) => {
      const g = buildGoodsRef(rice, 'كنتال', qty, goodsPrice(o, rice, 'كنتال', { customerId }));
      o.push(ok(buildCollection({ customerId, amount: g.qty * g.unitPrice, destination: { kind: 'wallet', wallet: 'cash' }, goods: g }, ctx('2026-11-03'))));
    };
    pay('khaled', 1);
    pay('mohamed', 2);
    const g = buildGoodsRef(rice, 'كنتال', 3, goodsPrice(o, rice, 'كنتال', 'company'));
    o.push(ok(buildCompanyPayment({ source: 'cash', bank: 'cbe', amount: g.qty * g.unitPrice, goods: g }, balances(o), ctx('2026-11-04'))));
    const bal = balances(o);
    expect(bal.get('customer:khaled')).toBe(b(18800));
    expect(bal.get('customer:mohamed') ?? 0).toBe(0);
    expect(bal.get('company')).toBe(b(18000));
    expect(goodsLabel(g)).toBe('حق 3 كنتال رز');
  });

  it('rejects a goods payment whose amount does not match quantity × price', () => {
    const g = buildGoodsRef(rice, 'كنتال', 2, b(18800));
    const r = buildCollection({ customerId: 'c', amount: b(30000), destination: { kind: 'wallet', wallet: 'cash' }, goods: g }, ctx('2026-11-05'));
    expect(r.ok).toBe(false);
    const z = buildCollection({ customerId: 'c', amount: 0, destination: { kind: 'wallet', wallet: 'cash' }, goods: { ...g, qty: 0 } }, ctx('2026-11-05'));
    expect(z.ok).toBe(false);
  });
});
