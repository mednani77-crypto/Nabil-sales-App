import { describe, expect, it } from 'vitest';
import { balanceOf, balances, companySummary } from './balances';
import { buildCollection, buildCompanyPayment, buildTransfer, customerActivity, findSimilarTransfers } from './moneyOps';
import { buildOpening } from './operations';
import type { Operation } from './types';

const b = (birr: number) => birr * 100;
let n = 0;
const ctx = (date = '2026-10-25') => ({ id: `m${++n}`, date, createdAt: `${date}T08:${String(n % 60).padStart(2, '0')}:00Z`, deviceId: 'dev' });

function start(): Operation[] {
  const r = buildOpening(
    { company: b(100000), customers: [{ customerId: 'c1', balance: b(20000) }], wallets: { cash: b(10000), cbe: b(5000), ebirr: 0 }, stock: [] },
    ctx('2026-10-01'),
  );
  if (!r.ok) throw new Error();
  return [r.value];
}
function ok<T>(r: { ok: true; value: T } | { ok: false; errors: string[] }): T {
  if (!r.ok) throw new Error(r.errors.join());
  return r.value;
}

describe('collections', () => {
  it('cash collection lowers the customer debt and raises cash, company untouched', () => {
    const ops = start();
    ops.push(ok(buildCollection({ customerId: 'c1', amount: b(5000), destination: { kind: 'wallet', wallet: 'cash' } }, ctx())));
    expect(balanceOf(ops, 'customer:c1')).toBe(b(15000));
    expect(balanceOf(ops, 'wallet:cash')).toBe(b(15000));
    expect(companySummary(ops)).toEqual({ balance: b(100000), unconfirmed: 0 });
  });

  it('collection paid straight into a company bank counts once for both customer and company', () => {
    const ops = start();
    ops.push(ok(buildCollection({ customerId: 'c1', amount: b(8000), destination: { kind: 'company', bank: 'cbe' }, ref: ' FT1 ' }, ctx())));
    expect(balanceOf(ops, 'customer:c1')).toBe(b(12000));
    expect(companySummary(ops)).toEqual({ balance: b(92000), unconfirmed: b(8000) });
    const walletTotal = ['cash', 'cbe', 'ebirr'].reduce((t, w) => t + balanceOf(ops, `wallet:${w}` as 'wallet:cash'), 0);
    expect(walletTotal).toBe(b(15000));
  });

  it('allows overpayment, leaving a credit balance for the customer', () => {
    const ops = start();
    ops.push(ok(buildCollection({ customerId: 'c1', amount: b(25000), destination: { kind: 'wallet', wallet: 'ebirr' } }, ctx())));
    expect(balanceOf(ops, 'customer:c1')).toBe(-b(5000));
  });

  it('requires customer, amount and destination', () => {
    expect(buildCollection({ customerId: null, amount: b(1), destination: { kind: 'wallet', wallet: 'cash' } }, ctx()).ok).toBe(false);
    expect(buildCollection({ customerId: 'c1', amount: 0, destination: { kind: 'wallet', wallet: 'cash' } }, ctx()).ok).toBe(false);
    expect(buildCollection({ customerId: 'c1', amount: b(1), destination: null }, ctx()).ok).toBe(false);
  });
});

describe('transfers between wallets', () => {
  it('moves money between wallets without changing the company debt', () => {
    const ops = start();
    ops.push(ok(buildTransfer({ from: 'cash', to: 'cbe', amount: b(4000) }, balances(ops), ctx())));
    expect(balanceOf(ops, 'wallet:cash')).toBe(b(6000));
    expect(balanceOf(ops, 'wallet:cbe')).toBe(b(9000));
    expect(companySummary(ops).balance).toBe(b(100000));
  });

  it('rejects same wallet and more than the wallet holds', () => {
    const ops = start();
    expect(buildTransfer({ from: 'cash', to: 'cash', amount: b(1) }, balances(ops), ctx()).ok).toBe(false);
    expect(buildTransfer({ from: 'ebirr', to: 'cash', amount: b(1) }, balances(ops), ctx()).ok).toBe(false);
  });
});

describe('payments to the company', () => {
  it('lowers the wallet and the company debt (unconfirmed until notice is confirmed)', () => {
    const ops = start();
    ops.push(ok(buildCompanyPayment({ source: 'cbe', bank: 'cbe', amount: b(5000), ref: 'FT2' }, balances(ops), ctx())));
    expect(balanceOf(ops, 'wallet:cbe')).toBe(0);
    expect(companySummary(ops)).toEqual({ balance: b(95000), unconfirmed: b(5000) });
    expect(balanceOf(ops, 'customer:c1')).toBe(b(20000)); // never touches customers
  });

  it('cannot pay more than the work money in the chosen wallet', () => {
    expect(buildCompanyPayment({ source: 'cbe', bank: 'cbe', amount: b(5001) }, balances(start()), ctx()).ok).toBe(false);
  });

  it('flags possible duplicates by reference, or by amount + bank + date', () => {
    const ops = start();
    ops.push(ok(buildCompanyPayment({ source: 'cash', bank: 'cbe', amount: b(3000), ref: 'ft26297' }, balances(ops), ctx('2026-10-24'))));
    ops.push(ok(buildCollection({ customerId: 'c1', amount: b(2000), destination: { kind: 'company', bank: 'ebirr' } }, ctx('2026-10-25'))));
    expect(findSimilarTransfers(ops, { bank: 'abyssinia', amount: b(1), ref: 'FT26297', date: '2026-10-25' })).toHaveLength(1);
    expect(findSimilarTransfers(ops, { bank: 'ebirr', amount: b(2000), date: '2026-10-25' })).toHaveLength(1);
    expect(findSimilarTransfers(ops, { bank: 'ebirr', amount: b(2000), date: '2026-10-26' })).toHaveLength(0);
  });
});

describe('customer activity', () => {
  it('marks customers late when they owe and have not paid for more than 7 days', () => {
    const ops = start();
    expect(customerActivity(ops, 'c1', '2026-10-25').late).toBe(true);
    ops.push(ok(buildCollection({ customerId: 'c1', amount: b(1000), destination: { kind: 'wallet', wallet: 'cash' } }, ctx('2026-10-22'))));
    const a = customerActivity(ops, 'c1', '2026-10-25');
    expect(a.late).toBe(false);
    expect(a.lastPayment).toBe('2026-10-22');
    expect(a.balance).toBe(b(19000));
  });
});
