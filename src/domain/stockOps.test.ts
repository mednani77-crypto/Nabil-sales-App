import { describe, expect, it } from 'vitest';
import { balanceOf, companySummary, stockByItem } from './balances';
import { buildCompanyPayment } from './moneyOps';
import { notices } from './notices';
import { buildOpening, buildReceive, buildSale } from './operations';
import {
  buildCompanyReturn,
  buildCompanyReturnDecision,
  buildCustomerReturn,
  buildStockCount,
  buildVoid,
  companyReturnStates,
  pendingCompanyReturnsValue,
} from './stockOps';
import { balances } from './balances';
import type { Item, Operation } from './types';

const b = (birr: number) => birr * 100;
const T = '2026-10-01T00:00:00Z';
const oil: Item = {
  id: 'oil',
  name: 'زيت',
  units: [
    { name: 'كرتون', factor: 6, lastPrice: b(6300) },
    { name: 'حبة', factor: 1, lastPrice: b(1050) },
  ],
  minStock: 0,
  createdAt: T,
  updatedAt: T,
};
const items = new Map([[oil.id, oil]]);
let n = 0;
const ctx = (date = '2026-10-25') => ({ id: `s${++n}`, date, createdAt: `${date}T10:${String(n).padStart(2, '0')}:00Z`, deviceId: 'dev' });
function ok<T>(r: { ok: true; value: T } | { ok: false; errors: string[] }): T {
  if (!r.ok) throw new Error(r.errors.join());
  return r.value;
}
function start(): Operation[] {
  return [
    ok(buildOpening({ company: b(100000), customers: [{ customerId: 'c1', balance: b(10000) }], wallets: { cash: b(5000), cbe: 0, ebirr: 0 }, stock: [{ itemId: 'oil', qty: 60 }] }, ctx('2026-10-01'))),
  ];
}

describe('customer returns', () => {
  it('good goods go back to the truck and reduce the customer debt', () => {
    const ops = start();
    ops.push(ok(buildCustomerReturn({ customerId: 'c1', lines: [{ itemId: 'oil', unitName: 'كرتون', qty: 1, unitPrice: b(6300) }], condition: 'good', settle: 'balance' }, items, ops, ctx())));
    expect(stockByItem(ops).get('oil')).toBe(66);
    expect(balanceOf(ops, 'customer:c1')).toBe(b(3700));
    expect(companySummary(ops).balance).toBe(b(100000));
  });

  it('damaged goods do not return to available stock', () => {
    const ops = start();
    ops.push(ok(buildCustomerReturn({ customerId: 'c1', lines: [{ itemId: 'oil', unitName: 'حبة', qty: 2, unitPrice: b(1050) }], condition: 'damaged', settle: 'balance' }, items, ops, ctx())));
    expect(stockByItem(ops).get('oil')).toBe(60);
    expect(balanceOf(ops, 'customer:c1')).toBe(b(7900));
  });

  it('cash refund leaves the customer balance unchanged and takes cash from the wallet', () => {
    const ops = start();
    ops.push(ok(buildCustomerReturn({ customerId: 'c1', lines: [{ itemId: 'oil', unitName: 'حبة', qty: 2, unitPrice: b(1050) }], condition: 'good', settle: 'cash' }, items, ops, ctx())));
    expect(balanceOf(ops, 'customer:c1')).toBe(b(10000));
    expect(balanceOf(ops, 'wallet:cash')).toBe(b(2900));
  });

  it('requires a customer to settle against balance, and enough cash to refund', () => {
    const ops = start();
    expect(buildCustomerReturn({ customerId: null, lines: [{ itemId: 'oil', unitName: 'حبة', qty: 1, unitPrice: b(1) }], condition: 'good', settle: 'balance' }, items, ops, ctx()).ok).toBe(false);
    expect(buildCustomerReturn({ customerId: null, lines: [{ itemId: 'oil', unitName: 'كرتون', qty: 1, unitPrice: b(6300) }], condition: 'good', settle: 'cash' }, items, ops, ctx()).ok).toBe(false);
  });
});

describe('company returns', () => {
  it('goods leave the truck at once; debt drops only when the company accepts', () => {
    const ops = start();
    const ret = ok(buildCompanyReturn({ lines: [{ itemId: 'oil', unitName: 'كرتون', qty: 2, unitPrice: b(6300) }], reason: 'تالف' }, items, ops, { ...ctx(), docNo: 'RC-A0001' }));
    ops.push(ret);
    expect(stockByItem(ops).get('oil')).toBe(48);
    expect(companySummary(ops).balance).toBe(b(100000));
    expect(pendingCompanyReturnsValue(ops)).toBe(b(12600));
    ops.push(ok(buildCompanyReturnDecision(ret.id, 'accepted', ops, ctx())));
    expect(companySummary(ops).balance).toBe(b(87400));
    expect(pendingCompanyReturnsValue(ops)).toBe(0);
    expect(buildCompanyReturnDecision(ret.id, 'rejected', ops, ctx()).ok).toBe(false);
  });

  it('a rejected return comes back to the truck and the debt stays', () => {
    const ops = start();
    const ret = ok(buildCompanyReturn({ lines: [{ itemId: 'oil', unitName: 'حبة', qty: 5, unitPrice: b(1050) }], reason: 'زائد' }, items, ops, { ...ctx(), docNo: 'RC-A0002' }));
    ops.push(ret, ok(buildCompanyReturnDecision(ret.id, 'rejected', ops.concat(ret), ctx())));
    expect(stockByItem(ops).get('oil')).toBe(60);
    expect(companySummary(ops).balance).toBe(b(100000));
    expect(companyReturnStates(ops)[0].state).toBe('rejected');
  });

  it('cannot return more than the truck holds', () => {
    expect(buildCompanyReturn({ lines: [{ itemId: 'oil', unitName: 'كرتون', qty: 11, unitPrice: b(6300) }], reason: '' }, items, start(), { ...ctx(), docNo: 'X' }).ok).toBe(false);
  });
});

describe('stock count', () => {
  it('corrects stock to the counted quantity without touching money', () => {
    const ops = start();
    const before = [...balances(ops)];
    const op = ok(buildStockCount([{ itemId: 'oil', actual: 57, reason: 'تلف' }], items, ops, ctx()));
    expect(op.adjustments[0]).toMatchObject({ recorded: 60, actual: 57, reason: 'تلف' });
    ops.push(op);
    expect(stockByItem(ops).get('oil')).toBe(57);
    expect([...balances(ops)]).toEqual(before);
  });

  it('rejects a count with no differences', () => {
    expect(buildStockCount([{ itemId: 'oil', actual: 60 }], items, start(), ctx()).ok).toBe(false);
  });
});

describe('void (safe cancel)', () => {
  it('reverses a sale completely and keeps it in history', () => {
    const ops = start();
    const s = ok(
      buildSale({ customerId: 'c1', lines: [{ itemId: 'oil', unitName: 'كرتون', qty: 2, unitPrice: b(6300) }], payMode: 'partial', paid: b(1000), destination: { kind: 'wallet', wallet: 'cash' } }, items, stockByItem(ops), {
        ...ctx(),
        docNo: 'A-1',
        makeTempCustomer: () => { throw new Error(); },
      }),
    ).op;
    ops.push(s);
    ops.push(ok(buildVoid(s.id, 'خطأ في الكمية', ops, items, ctx())));
    expect(stockByItem(ops).get('oil')).toBe(60);
    expect(balanceOf(ops, 'customer:c1')).toBe(b(10000));
    expect(balanceOf(ops, 'wallet:cash')).toBe(b(5000));
    expect(ops.find((o) => o.id === s.id)).toBeDefined();
    expect(buildVoid(s.id, '', ops, items, ctx()).ok).toBe(false); // not twice
  });

  it('voiding a company payment removes it from notices and from unconfirmed', () => {
    const ops = start();
    const p = ok(buildCompanyPayment({ source: 'cash', bank: 'cbe', amount: b(2000) }, balances(ops), ctx()));
    ops.push(p);
    expect(companySummary(ops).unconfirmed).toBe(b(2000));
    ops.push(ok(buildVoid(p.id, '', ops, items, ctx())));
    expect(companySummary(ops)).toEqual({ balance: b(100000), unconfirmed: 0 });
    expect(notices(ops)).toHaveLength(0);
    expect(balanceOf(ops, 'wallet:cash')).toBe(b(5000));
  });

  it('blocks a void that would make stock negative', () => {
    const ops = start();
    const r = ok(buildReceive([{ itemId: 'oil', unitName: 'كرتون', qty: 1, unitPrice: b(6300) }], items, { ...ctx(), docNo: 'G1' }));
    ops.push(r);
    const s = ok(buildSale({ customerId: 'c1', lines: [{ itemId: 'oil', unitName: 'حبة', qty: 66, unitPrice: b(1) }], payMode: 'credit', paid: 0, destination: null }, items, stockByItem(ops), { ...ctx(), docNo: 'A-2', makeTempCustomer: () => { throw new Error(); } })).op;
    ops.push(s);
    expect(buildVoid(r.id, '', ops, items, ctx()).ok).toBe(false);
  });

  it('does not allow voiding tracking operations', () => {
    const ops = start();
    const p = ok(buildCompanyPayment({ source: 'cash', bank: 'cbe', amount: b(1) }, balances(ops), ctx()));
    ops.push(p);
    const v = ok(buildVoid(p.id, '', ops, items, ctx()));
    ops.push(v);
    expect(buildVoid(v.id, '', ops, items, ctx()).ok).toBe(false);
  });
});
