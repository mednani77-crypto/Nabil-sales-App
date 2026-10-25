import { describe, expect, it } from 'vitest';
import { balances, companySummary, ledger } from './balances';
import { buildCollection, buildCompanyPayment } from './moneyOps';
import { buildNoticeStatus, noticeCounts, notices } from './notices';
import { buildOpening } from './operations';
import type { Operation } from './types';

const b = (birr: number) => birr * 100;
let n = 0;
const ctx = (date = '2026-10-25') => ({ id: `n${++n}`, date, createdAt: `${date}T09:${String(n).padStart(2, '0')}:00Z`, deviceId: 'dev' });
function ok<T>(r: { ok: true; value: T } | { ok: false; errors: string[] }): T {
  if (!r.ok) throw new Error(r.errors.join());
  return r.value;
}

function setup() {
  const ops: Operation[] = [
    ok(buildOpening({ company: b(50000), customers: [{ customerId: 'c1', balance: b(9000) }], wallets: { cash: b(20000), cbe: 0, ebirr: 0 }, stock: [] }, ctx('2026-10-01'))),
  ];
  const pay = ok(buildCompanyPayment({ source: 'cash', bank: 'cbe', amount: b(15000), ref: 'FT1' }, balances(ops), ctx('2026-10-20')));
  ops.push(pay);
  const direct = ok(buildCollection({ customerId: 'c1', amount: b(4000), destination: { kind: 'company', bank: 'ebirr' } }, ctx('2026-10-24')));
  ops.push(direct);
  // a wallet collection is NOT a notice
  ops.push(ok(buildCollection({ customerId: 'c1', amount: b(1000), destination: { kind: 'wallet', wallet: 'cash' } }, ctx('2026-10-24'))));
  return { ops, pay, direct };
}

describe('bank notices', () => {
  it('lists every transfer into a company account, newest first, starting as recorded', () => {
    const { ops, pay, direct } = setup();
    const list = notices(ops);
    expect(list.map((x) => x.op.id)).toEqual([direct.id, pay.id]);
    expect(list.every((x) => x.status === 'recorded')).toBe(true);
    expect(list[0].from).toEqual({ kind: 'customer', customerId: 'c1' });
    expect(list[1].from).toEqual({ kind: 'wallet', wallet: 'cash' });
  });

  it('marks sent then confirmed; only confirmation clears the unconfirmed amount', () => {
    const { ops, pay } = setup();
    expect(companySummary(ops).unconfirmed).toBe(b(19000));
    ops.push(ok(buildNoticeStatus(pay.id, 'sent', ops, ctx())));
    expect(companySummary(ops).unconfirmed).toBe(b(19000));
    ops.push(ok(buildNoticeStatus(pay.id, 'confirmed', ops, ctx())));
    expect(companySummary(ops)).toEqual({ balance: b(31000), unconfirmed: b(4000) });
    expect(noticeCounts(ops)).toEqual({ recorded: 1, sent: 0, confirmed: 1 });
    const row = ledger(ops, 'company').rows.find((r) => r.posting.opId === pay.id)!;
    expect(row.posting.unconfirmed).toBe(false);
  });

  it('latest status wins, so a confirmation can be undone without editing history', () => {
    const { ops, pay } = setup();
    ops.push(ok(buildNoticeStatus(pay.id, 'confirmed', ops, ctx())));
    ops.push(ok(buildNoticeStatus(pay.id, 'sent', ops, ctx())));
    expect(notices(ops).find((x) => x.op.id === pay.id)!.status).toBe('sent');
    expect(companySummary(ops).unconfirmed).toBe(b(19000));
  });

  it('never changes any balance', () => {
    const { ops, pay } = setup();
    const before = [...balances(ops)];
    ops.push(ok(buildNoticeStatus(pay.id, 'confirmed', ops, ctx())));
    expect([...balances(ops)]).toEqual(before);
  });

  it('rejects status for operations that are not company transfers', () => {
    const { ops } = setup();
    expect(buildNoticeStatus(ops[0].id, 'sent', ops, ctx()).ok).toBe(false);
  });
});
