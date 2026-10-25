import { describe, expect, it } from 'vitest';
import { fmtMoney, parseBirr } from './money';
import { decompose, normaliseUnits, stockValue } from './units';
import { buildOpening, buildReceive, buildSale, type DraftLine, type SaleDraft } from './operations';
import { balanceOf, balances, companySummary, ledger, stockByItem } from './balances';
import type { Customer, Item, Operation } from './types';

const T = '2026-10-25T08:00:00.000Z';
const b = (birr: number) => birr * 100;

const oil: Item = {
  id: 'oil',
  name: 'زيت طبخ 3 لتر',
  units: [
    { name: 'كرتون', factor: 6, lastPrice: b(6300) },
    { name: 'حبة', factor: 1, lastPrice: b(1050) },
  ],
  minStock: 24,
  createdAt: T,
  updatedAt: T,
};
const rice: Item = {
  id: 'rice',
  name: 'أرز بسمتي 25 كغ',
  units: [
    { name: 'كنتال', factor: 4, lastPrice: b(14000) },
    { name: 'جونية', factor: 1, lastPrice: b(3500) },
  ],
  minStock: 4,
  createdAt: T,
  updatedAt: T,
};
const sugar: Item = {
  id: 'sugar',
  name: 'سكر 50 كغ',
  units: [{ name: 'جونية', factor: 1, lastPrice: b(7400) }],
  minStock: 0,
  createdAt: T,
  updatedAt: T,
};
const items = new Map([oil, rice, sugar].map((i) => [i.id, i]));

let n = 0;
const ctx = (date = '2026-10-25') => ({ id: `op${++n}`, date, createdAt: `${date}T0${n % 10}:00:00Z`, deviceId: 'dev' });

function receive(lines: DraftLine[], date?: string): Operation {
  const r = buildReceive(lines, items, { ...ctx(date), docNo: 'A-GRN-1' });
  if (!r.ok) throw new Error(r.errors.join());
  return r.value;
}

function sale(ops: Operation[], draft: SaleDraft, temp?: Customer[]) {
  return buildSale(draft, items, stockByItem(ops), {
    ...ctx(),
    docNo: 'A-1001',
    makeTempCustomer: () => {
      const c: Customer = { id: 'tmp1', name: 'دين مؤقت D-A001', temp: true, createdAt: T, updatedAt: T };
      temp?.push(c);
      return c;
    },
  });
}

describe('money', () => {
  it('parses birr input into integer santim', () => {
    expect(parseBirr('1,250')).toBe(125000);
    expect(parseBirr('12.5')).toBe(1250);
    expect(parseBirr('0.05')).toBe(5);
    expect(parseBirr('abc')).toBeNull();
    expect(parseBirr('')).toBeNull();
  });
  it('formats santim', () => {
    expect(fmtMoney(1260000)).toBe('12,600');
    expect(fmtMoney(1250)).toBe('12.50');
    expect(fmtMoney(-500)).toBe('−5');
  });
});

describe('units', () => {
  it('decomposes base quantity into full packs and open pieces', () => {
    const p = decompose(oil, 64);
    expect(p.label).toBe('10 كرتون + 4 حبة');
    expect(p.openPack).toBe(true);
    expect(decompose(oil, 60).openPack).toBe(false);
  });
  it('handles items without pieces and single-unit items', () => {
    expect(decompose(rice, 10).label).toBe('2 كنتال + 2 جونية');
    expect(decompose(rice, 10).openPack).toBe(false);
    expect(decompose(sugar, 4).label).toBe('4 جونية');
    expect(decompose(oil, 0).label).toBe('0 كرتون');
  });
  it('validates unit definitions', () => {
    expect(() => normaliseUnits([{ name: 'كرتون', factor: 6, lastPrice: 0 }])).toThrow();
    expect(normaliseUnits([{ name: 'حبة', factor: 1, lastPrice: 0 }, { name: 'كرتون', factor: 6, lastPrice: 0 }])[0].name).toBe('كرتون');
  });
  it('values stock at main-unit price', () => {
    expect(stockValue(oil, 64)).toBe(b(67200));
  });
});

describe('receive goods', () => {
  it('adds stock and increases the company debt by the received value', () => {
    const ops = [receive([{ itemId: 'oil', unitName: 'كرتون', qty: 10, unitPrice: b(6300) }])];
    expect(stockByItem(ops).get('oil')).toBe(60);
    expect(companySummary(ops).balance).toBe(b(63000));
  });
});

describe('opening balances', () => {
  it('does not charge opening stock to the company account', () => {
    const r = buildOpening(
      {
        company: b(412000),
        customers: [{ customerId: 'c4', balance: -b(1200) }],
        wallets: { cash: b(100), cbe: 0, ebirr: 0 },
        stock: [{ itemId: 'oil', qty: 64 }],
      },
      ctx('2026-10-01'),
    );
    if (!r.ok) throw new Error();
    const ops = [r.value];
    expect(companySummary(ops).balance).toBe(b(412000));
    expect(stockByItem(ops).get('oil')).toBe(64);
    expect(balanceOf(ops, 'customer:c4')).toBe(-b(1200));
    expect(balanceOf(ops, 'wallet:cash')).toBe(b(100));
  });
});

describe('sales', () => {
  const base = () => [receive([{ itemId: 'oil', unitName: 'كرتون', qty: 10, unitPrice: b(6300) }])];

  it('cash sale: stock down, cash wallet up, company debt unchanged', () => {
    const ops = base();
    const r = sale(ops, {
      customerId: null,
      lines: [{ itemId: 'oil', unitName: 'كرتون', qty: 2, unitPrice: b(6300) }],
      payMode: 'cash',
      paid: 0,
      destination: { kind: 'wallet', wallet: 'cash' },
    });
    if (!r.ok) throw new Error(r.errors.join());
    ops.push(r.value.op);
    expect(stockByItem(ops).get('oil')).toBe(48);
    expect(balanceOf(ops, 'wallet:cash')).toBe(b(12600));
    expect(companySummary(ops).balance).toBe(b(63000));
    expect(r.value.tempCustomer).toBeUndefined();
  });

  it('credit sale to a customer raises their balance only', () => {
    const ops = base();
    const r = sale(ops, {
      customerId: 'c1',
      lines: [{ itemId: 'oil', unitName: 'حبة', qty: 3, unitPrice: b(1080) }],
      payMode: 'credit',
      paid: 0,
      destination: null,
    });
    if (!r.ok) throw new Error(r.errors.join());
    ops.push(r.value.op);
    expect(balanceOf(ops, 'customer:c1')).toBe(b(3240));
    expect(stockByItem(ops).get('oil')).toBe(57);
    expect(companySummary(ops).balance).toBe(b(63000));
  });

  it('partial sale paid into a company bank: one operation credits customer and company once', () => {
    const ops = base();
    const r = sale(ops, {
      customerId: 'c1',
      lines: [{ itemId: 'oil', unitName: 'كرتون', qty: 2, unitPrice: b(6300) }],
      payMode: 'partial',
      paid: b(5000),
      destination: { kind: 'company', bank: 'cbe' },
    });
    if (!r.ok) throw new Error(r.errors.join());
    ops.push(r.value.op);
    expect(balanceOf(ops, 'customer:c1')).toBe(b(7600));
    expect(companySummary(ops)).toEqual({ balance: b(58000), unconfirmed: b(5000) });
    const wallets = [...balances(ops).keys()].filter((k) => k.startsWith('wallet'));
    expect(wallets).toEqual([]);
  });

  it('anonymous credit sale creates a separate temporary debt', () => {
    const ops = base();
    const temps: Customer[] = [];
    const r = sale(
      ops,
      {
        customerId: null,
        lines: [{ itemId: 'oil', unitName: 'كرتون', qty: 1, unitPrice: b(6300) }],
        payMode: 'credit',
        paid: 0,
        destination: null,
      },
      temps,
    );
    if (!r.ok) throw new Error(r.errors.join());
    expect(r.value.tempCustomer?.temp).toBe(true);
    expect(r.value.op.customerId).toBe('tmp1');
    ops.push(r.value.op);
    expect(balanceOf(ops, 'customer:tmp1')).toBe(b(6300));
  });

  it('blocks selling more than the truck holds, summing cartons and pieces', () => {
    const ops = base(); // 60 pieces
    const r = sale(ops, {
      customerId: null,
      lines: [
        { itemId: 'oil', unitName: 'كرتون', qty: 9, unitPrice: b(6300) },
        { itemId: 'oil', unitName: 'حبة', qty: 7, unitPrice: b(1080) },
      ],
      payMode: 'cash',
      paid: 0,
      destination: { kind: 'wallet', wallet: 'cash' },
    });
    expect(r.ok).toBe(false);
  });

  it('validates partial payments and destinations', () => {
    const ops = base();
    const line = [{ itemId: 'oil', unitName: 'كرتون', qty: 1, unitPrice: b(6300) }];
    expect(sale(ops, { customerId: 'c1', lines: line, payMode: 'partial', paid: b(6300), destination: { kind: 'wallet', wallet: 'cash' } }).ok).toBe(false);
    expect(sale(ops, { customerId: 'c1', lines: line, payMode: 'cash', paid: 0, destination: null }).ok).toBe(false);
    expect(sale(ops, { customerId: 'c1', lines: [], payMode: 'credit', paid: 0, destination: null }).ok).toBe(false);
  });

  it('keeps historical prices when the item price changes later', () => {
    const ops = base();
    const r = sale(ops, {
      customerId: 'c1',
      lines: [{ itemId: 'oil', unitName: 'كرتون', qty: 1, unitPrice: b(6300) }],
      payMode: 'credit',
      paid: 0,
      destination: null,
    });
    if (!r.ok) throw new Error();
    ops.push(r.value.op);
    oil.units[0].lastPrice = b(7000);
    expect(balanceOf(ops, 'customer:c1')).toBe(b(6300));
    oil.units[0].lastPrice = b(6300);
  });
});

describe('integrity', () => {
  it('counts an operation saved twice only once', () => {
    const op = receive([{ itemId: 'sugar', unitName: 'جونية', qty: 5, unitPrice: b(7400) }]);
    expect(stockByItem([op, op]).get('sugar')).toBe(5);
    expect(companySummary([op, op]).balance).toBe(b(37000));
  });

  it('company debt equals stock + receivables + work money when selling at the charged price', () => {
    const ops: Operation[] = [receive([{ itemId: 'rice', unitName: 'كنتال', qty: 3, unitPrice: b(14000) }])];
    const s1 = sale(ops, { customerId: 'c1', lines: [{ itemId: 'rice', unitName: 'جونية', qty: 3, unitPrice: b(3500) }], payMode: 'partial', paid: b(4000), destination: { kind: 'wallet', wallet: 'ebirr' } });
    if (!s1.ok) throw new Error(s1.errors.join());
    ops.push(s1.value.op);
    const bal = balances(ops);
    const stockVal = stockValue(rice, stockByItem(ops).get('rice')!);
    const covered = stockVal + (bal.get('customer:c1') ?? 0) + (bal.get('wallet:ebirr') ?? 0);
    expect(covered).toBe(companySummary(ops).balance);
  });

  it('ledger carries the balance forward instead of starting from zero', () => {
    const ops = [
      receive([{ itemId: 'sugar', unitName: 'جونية', qty: 1, unitPrice: b(7400) }], '2026-10-05'),
      receive([{ itemId: 'sugar', unitName: 'جونية', qty: 2, unitPrice: b(7400) }], '2026-10-20'),
    ];
    const l = ledger(ops, 'company', '2026-10-10', '2026-10-31');
    expect(l.carried).toBe(b(7400));
    expect(l.rows).toHaveLength(1);
    expect(l.rows[0].balance).toBe(b(22200));
    expect(l.closing).toBe(b(22200));
  });
});
