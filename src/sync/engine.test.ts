import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { AppDB } from '../db/db';
import { addCustomer, addItem, saveReceive, saveSale } from '../db/repo';
import { balanceOf, companySummary, stockByItem } from '../domain/balances';
import type { Operation } from '../domain/types';
import { resetEverywhere, syncOnce, pendingCount, type MasterRow, type MasterTable, type RemoteAttachment, type RemoteMaster, type RemoteOp, type Transport } from './engine';

/** In-memory stand-in for Supabase with the same semantics as the SQL schema. */
class FakeServer {
  seq = 0;
  ops: RemoteOp[] = [];
  master: Record<MasterTable, RemoteMaster<unknown>[]> = { items: [], customers: [] };
  files: RemoteAttachment[] = [];
  blobs = new Map<string, Blob>();
  devices = new Map<string, string>();
  epoch = 0;
  transport(): Transport {
    const s = this;
    return {
      async registerDevice(id, code) {
        const used = new Set([...s.devices].filter(([d]) => d !== id).map(([, c]) => c));
        let c = code;
        for (const letter of 'ABCDEFGHJKLMNPQRSTUVWXYZ') if (used.has(c)) c = letter;
        s.devices.set(id, c);
        return c;
      },
      async pushOps(ops: Operation[]) {
        for (const o of ops) if (!s.ops.some((r) => r.payload.id === o.id)) s.ops.push({ seq: ++s.seq, payload: o });
      },
      async pullOps(after, limit) {
        return s.ops.filter((r) => r.seq > after).slice(0, limit);
      },
      async pushMaster<T>(table: MasterTable, rows: MasterRow<T>[]) {
        for (const r of rows) {
          const cur = s.master[table].find((x) => x.id === r.id);
          if (!cur) s.master[table].push({ ...r, seq: ++s.seq });
          else if (r.updatedAt > cur.updatedAt) Object.assign(cur, r, { seq: ++s.seq });
        }
      },
      async pullMaster<T>(table: MasterTable, after: number, limit: number) {
        return s.master[table].filter((r) => r.seq > after).sort((a, b) => a.seq - b.seq).slice(0, limit) as RemoteMaster<T>[];
      },
      async pushAttachment(a) {
        if (s.files.some((f) => f.id === a.id)) return;
        const path = `u/${a.opId}/${a.id}`;
        s.blobs.set(path, a.blob);
        s.files.push({ seq: ++s.seq, id: a.id, opId: a.opId, path, mime: a.mime, createdAt: a.createdAt });
      },
      async pullAttachments(after, limit) {
        return s.files.filter((f) => f.seq > after).slice(0, limit);
      },
      async downloadAttachment(path) {
        return s.blobs.get(path)!;
      },
      async getEpoch() {
        return s.epoch;
      },
      async resetAccount() {
        s.ops = [];
        s.master = { items: [], customers: [] };
        s.files = [];
        s.blobs.clear();
        return ++s.epoch;
      },
    };
  }
}

const b = (birr: number) => birr * 100;
let n = 0;

describe('sync between two devices', () => {
  it('phone and computer end up with the same operations, balances and stock', async () => {
    const server = new FakeServer();
    const phone = new AppDB(`sync-phone-${++n}`);
    const pc = new AppDB(`sync-pc-${n}`);

    // Phone works offline first.
    const oil = await addItem(phone, { name: 'زيت', units: [{ name: 'كرتون', factor: 6, lastPrice: b(6300) }, { name: 'حبة', factor: 1, lastPrice: b(1050) }] });
    const c = await addCustomer(phone, { name: 'بقالة' });
    await saveReceive(phone, [{ itemId: oil.id, unitName: 'كرتون', qty: 5, unitPrice: b(6300) }], '2026-10-24');
    await saveSale(phone, { customerId: c.id, payMode: 'credit', paid: 0, destination: null, lines: [{ itemId: oil.id, unitName: 'كرتون', qty: 2, unitPrice: b(6300) }] }, '2026-10-25');
    expect(await pendingCount(phone)).toBe(2);

    const r1 = await syncOnce(phone, server.transport());
    expect(r1.pushedOps).toBe(2);
    expect(await pendingCount(phone)).toBe(0);

    // Computer pulls everything.
    await syncOnce(pc, server.transport(), 'كمبيوتر');
    const pcOps = await pc.operations.toArray();
    expect(pcOps).toHaveLength(2);
    expect(stockByItem(pcOps).get(oil.id)).toBe(18);
    expect(balanceOf(pcOps, `customer:${c.id}`)).toBe(b(12600));
    expect((await pc.items.get(oil.id))?.name).toBe('زيت');

    // Both devices code differently so document numbers never collide.
    expect(new Set(server.devices.values()).size).toBe(2);
  });

  it('is idempotent: re-sending and re-syncing never duplicates operations', async () => {
    const server = new FakeServer();
    const phone = new AppDB(`sync-idem-${++n}`);
    const sugar = await addItem(phone, { name: 'سكر', units: [{ name: 'جونية', factor: 1, lastPrice: b(7400) }] });
    await saveReceive(phone, [{ itemId: sugar.id, unitName: 'جونية', qty: 3, unitPrice: b(7400) }], '2026-10-25');
    const t = server.transport();
    const op = (await phone.operations.toArray())[0];
    await t.pushOps([op]); // e.g. a request that succeeded but whose answer was lost
    await syncOnce(phone, t);
    await syncOnce(phone, t);
    expect(server.ops).toHaveLength(1);
    expect(await phone.operations.count()).toBe(1);
    expect(companySummary(await phone.operations.toArray()).balance).toBe(b(22200));
  });

  it('merges operations made offline on both devices (no loss)', async () => {
    const server = new FakeServer();
    const a = new AppDB(`sync-a-${++n}`);
    const bb = new AppDB(`sync-b-${n}`);
    const item = await addItem(a, { name: 'دقيق', units: [{ name: 'جونية', factor: 1, lastPrice: b(4850) }] });
    await syncOnce(a, server.transport());
    await syncOnce(bb, server.transport());
    await saveReceive(a, [{ itemId: item.id, unitName: 'جونية', qty: 4, unitPrice: b(4850) }], '2026-10-25');
    await saveReceive(bb, [{ itemId: item.id, unitName: 'جونية', qty: 6, unitPrice: b(4850) }], '2026-10-25');
    await syncOnce(a, server.transport());
    await syncOnce(bb, server.transport());
    await syncOnce(a, server.transport());
    for (const d of [a, bb]) expect(stockByItem(await d.operations.toArray()).get(item.id)).toBe(10);
  });

  it('master data: the newest edit wins on every device', async () => {
    const server = new FakeServer();
    const a = new AppDB(`sync-m-a-${++n}`);
    const bb = new AppDB(`sync-m-b-${n}`);
    const cust = await addCustomer(a, { name: 'دين مؤقت' });
    await syncOnce(a, server.transport());
    await syncOnce(bb, server.transport());
    await a.customers.update(cust.id, { name: 'اسم قديم', updatedAt: '2099-01-01T08:00:00.000Z' });
    await bb.customers.update(cust.id, { name: 'سوبرماركت النور', updatedAt: '2099-01-01T09:00:00.000Z' });
    await syncOnce(bb, server.transport());
    await syncOnce(a, server.transport());
    await syncOnce(bb, server.transport());
    expect((await a.customers.get(cust.id))?.name).toBe('سوبرماركت النور');
    expect((await bb.customers.get(cust.id))?.name).toBe('سوبرماركت النور');
  });

  it('start over: a reset clears the server and every device, and old data never comes back', async () => {
    const server = new FakeServer();
    const phone = new AppDB(`sync-r-a-${++n}`);
    const pc = new AppDB(`sync-r-b-${n}`);
    const rice = await addItem(phone, { name: 'رز', units: [{ name: 'كنتال', factor: 1, lastPrice: b(18800) }] });
    await saveReceive(phone, [{ itemId: rice.id, unitName: 'كنتال', qty: 3, unitPrice: b(18800) }], '2026-10-25');
    await syncOnce(phone, server.transport());
    await syncOnce(pc, server.transport());
    expect(await pc.operations.count()).toBe(1);

    // The PC records something offline that is not synced yet, then the phone resets.
    await saveReceive(pc, [{ itemId: rice.id, unitName: 'كنتال', qty: 1, unitPrice: b(18800) }], '2026-10-25');
    await resetEverywhere(phone, server.transport());
    expect(await phone.operations.count()).toBe(0);
    expect(await phone.items.count()).toBe(0);
    expect(server.ops).toHaveLength(0);

    // Phone syncs again: nothing comes back.
    await syncOnce(phone, server.transport());
    expect(await phone.operations.count()).toBe(0);

    // PC syncs: it is wiped instead of pushing its old (pre-reset) data.
    const r = await syncOnce(pc, server.transport());
    expect(r.wiped).toBe(true);
    expect(await pc.operations.count()).toBe(0);
    expect(await pc.items.count()).toBe(0);
    expect(server.ops).toHaveLength(0);
    expect(server.master.items).toHaveLength(0);

    // Real work after the reset syncs normally, and a second sync does not wipe again.
    const sugar = await addItem(pc, { name: 'سكر', units: [{ name: 'جونية', factor: 1, lastPrice: b(7400) }] });
    await saveReceive(pc, [{ itemId: sugar.id, unitName: 'جونية', qty: 2, unitPrice: b(7400) }], '2026-10-26');
    expect((await syncOnce(pc, server.transport())).wiped).toBeUndefined();
    await syncOnce(phone, server.transport());
    expect(await phone.operations.count()).toBe(1);
    expect(stockByItem(await phone.operations.toArray()).get(sugar.id)).toBe(2);
  });

  it('a new phone that never synced keeps what it recorded offline after an account reset', async () => {
    const server = new FakeServer();
    const old = new AppDB(`sync-r-c-${++n}`);
    await addItem(old, { name: 'قديم', units: [{ name: 'حبة', factor: 1, lastPrice: 100 }] });
    await syncOnce(old, server.transport());
    await resetEverywhere(old, server.transport());

    const fresh = new AppDB(`sync-r-d-${n}`);
    const oil = await addItem(fresh, { name: 'زيت', units: [{ name: 'كرتون', factor: 1, lastPrice: b(6300) }] });
    await saveReceive(fresh, [{ itemId: oil.id, unitName: 'كرتون', qty: 4, unitPrice: b(6300) }], '2026-10-26');
    const r = await syncOnce(fresh, server.transport());
    expect(r.wiped).toBeUndefined();
    expect(server.ops).toHaveLength(1);
    await syncOnce(old, server.transport());
    expect(stockByItem(await old.operations.toArray()).get(oil.id)).toBe(4);
  });
});
