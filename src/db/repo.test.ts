import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { AppDB } from './db';
import { addCustomer, addItem, DomainError, saveReceive, saveSale } from './repo';
import { loadDemo } from './seed';
import { balanceOf, balances, companySummary, stockByItem } from '../domain/balances';
import { stockValue } from '../domain/units';

const b = (birr: number) => birr * 100;
let n = 0;
const freshDb = () => new AppDB(`test-${++n}`);

describe('repository', () => {
  it('saves receive and sale atomically and numbers documents', async () => {
    const db = freshDb();
    const oil = await addItem(db, { name: 'زيت', units: [{ name: 'كرتون', factor: 6, lastPrice: b(6300) }, { name: 'حبة', factor: 1, lastPrice: b(1080) }] });
    await saveReceive(db, [{ itemId: oil.id, unitName: 'كرتون', qty: 2, unitPrice: b(6300) }], '2026-10-24');
    const s1 = await saveSale(db, { customerId: null, payMode: 'credit', paid: 0, destination: null, lines: [{ itemId: oil.id, unitName: 'حبة', qty: 3, unitPrice: b(1100) }] }, '2026-10-25');
    expect(s1.tempCustomer?.name).toMatch(/^دين مؤقت D-[A-Z]001$/);
    expect(s1.op.docNo).toMatch(/^[A-Z]-1001$/);

    const ops = await db.operations.toArray();
    expect(stockByItem(ops).get(oil.id)).toBe(9);
    expect(balanceOf(ops, `customer:${s1.op.customerId!}`)).toBe(b(3300));
    expect(companySummary(ops).balance).toBe(b(12600));
    // last price remembered as a suggestion
    expect((await db.items.get(oil.id))!.units[1].lastPrice).toBe(b(1100));
  });

  it('rolls back counters when a sale is rejected', async () => {
    const db = freshDb();
    const sugar = await addItem(db, { name: 'سكر', units: [{ name: 'جونية', factor: 1, lastPrice: b(7400) }] });
    const c = await addCustomer(db, { name: 'عميل' });
    await expect(
      saveSale(db, { customerId: c.id, payMode: 'credit', paid: 0, destination: null, lines: [{ itemId: sugar.id, unitName: 'جونية', qty: 1, unitPrice: b(7400) }] }, '2026-10-25'),
    ).rejects.toBeInstanceOf(DomainError);
    expect(await db.operations.count()).toBe(0);
    expect(await db.meta.get('counter:invoice')).toBeUndefined();
  });

  it('loads consistent demo data', async () => {
    const db = freshDb();
    await loadDemo(db);
    const ops = await db.operations.toArray();
    expect(ops.length).toBeGreaterThan(5);
    const company = companySummary(ops);
    expect(company.unconfirmed).toBe(b(2900));
    for (const [, qty] of stockByItem(ops)) expect(qty).toBeGreaterThanOrEqual(0);
    expect((await db.customers.toArray()).some((c) => c.temp)).toBe(true);
    // Demo is consistent: what Nabil holds covers the company debt up to small price differences.
    const items = await db.items.toArray();
    const bal = balances(ops);
    let covered = 0;
    for (const it of items) covered += stockValue(it, stockByItem(ops).get(it.id) ?? 0);
    for (const [k, v] of bal) if (k !== 'company') covered += v;
    expect(Math.abs(company.balance - covered)).toBeLessThan(b(1000));
  });
});
