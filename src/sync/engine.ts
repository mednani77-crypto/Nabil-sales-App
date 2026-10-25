import type { AppDB } from '../db/db';
import { getDevice } from '../db/repo';
import type { Customer, Item, Operation } from '../domain/types';

/* ------------------------------------------------------------------ *
 * Sync rules (spec §6–7):
 *  - Operations are append-only and merge by UNION on id. Pushing the same
 *    operation twice is a no-op on the server (insert … on conflict do nothing).
 *  - Items/customers are small mutable records: last write wins by updatedAt.
 *  - Photos upload once; other devices download them on demand of the cursor.
 * ------------------------------------------------------------------ */

export interface RemoteOp {
  seq: number;
  payload: Operation;
}
export interface MasterRow<T> {
  id: string;
  payload: T;
  updatedAt: string;
}
export interface RemoteMaster<T> extends MasterRow<T> {
  seq: number;
}
export interface RemoteAttachment {
  seq: number;
  id: string;
  opId: string;
  path: string;
  mime: string;
  createdAt: string;
}
export type MasterTable = 'items' | 'customers';

export interface Transport {
  registerDevice(deviceId: string, preferredCode: string, label: string): Promise<string>;
  pushOps(ops: Operation[]): Promise<void>;
  pullOps(afterSeq: number, limit: number): Promise<RemoteOp[]>;
  pushMaster<T>(table: MasterTable, rows: MasterRow<T>[]): Promise<void>;
  pullMaster<T>(table: MasterTable, afterSeq: number, limit: number): Promise<RemoteMaster<T>[]>;
  pushAttachment(a: { id: string; opId: string; mime: string; createdAt: string; blob: Blob }): Promise<void>;
  pullAttachments(afterSeq: number, limit: number): Promise<RemoteAttachment[]>;
  downloadAttachment(path: string): Promise<Blob>;
}

export interface SyncResult {
  pushedOps: number;
  pulledOps: number;
  pushedMaster: number;
  pulledMaster: number;
  pushedFiles: number;
  pulledFiles: number;
}

const BATCH = 200;

async function getMeta<T>(db: AppDB, key: string, fallback: T): Promise<T> {
  const r = await db.meta.get(key);
  return (r?.value as T | undefined) ?? fallback;
}
async function setMeta(db: AppDB, key: string, value: unknown) {
  await db.meta.put({ key, value });
}

/** Number of local changes not yet in the cloud (operations + photos). */
export async function pendingCount(db: AppDB): Promise<number> {
  const ops = await db.operations.where('syncState').equals('local').count();
  const files = await db.attachments.filter((a) => !a.uploaded).count();
  return ops + files;
}

export async function syncOnce(db: AppDB, t: Transport, deviceLabel = 'هاتف'): Promise<SyncResult> {
  const res: SyncResult = { pushedOps: 0, pulledOps: 0, pushedMaster: 0, pulledMaster: 0, pushedFiles: 0, pulledFiles: 0 };

  // 0. Make sure this device has a code no other device of the account uses.
  if (!(await getMeta(db, 'sync:deviceRegistered', false))) {
    const device = await getDevice(db);
    const code = await t.registerDevice(device.id, device.code, deviceLabel);
    if (code !== device.code) await setMeta(db, 'device', { ...device, code });
    await setMeta(db, 'sync:deviceRegistered', true);
  }

  // 1. Push master data changed since the last push (before ops, so names exist everywhere).
  const masterMark = await getMeta(db, 'sync:masterPushedAt', '');
  let newMark = masterMark;
  for (const table of ['items', 'customers'] as const) {
    const rows = (await (db[table] as AppDB['items'] | AppDB['customers']).toArray()) as (Item | Customer)[];
    const changed = rows.filter((r) => r.updatedAt > masterMark);
    for (let i = 0; i < changed.length; i += BATCH) {
      const batch = changed.slice(i, i + BATCH);
      await t.pushMaster(table, batch.map((r) => ({ id: r.id, payload: r, updatedAt: r.updatedAt })));
    }
    res.pushedMaster += changed.length;
    for (const r of changed) if (r.updatedAt > newMark) newMark = r.updatedAt;
  }
  if (newMark !== masterMark) await setMeta(db, 'sync:masterPushedAt', newMark);

  // 2. Push local operations. Marking them synced is the one allowed write to existing op rows.
  const local = await db.operations.where('syncState').equals('local').toArray();
  for (let i = 0; i < local.length; i += BATCH) {
    const batch = local.slice(i, i + BATCH);
    await t.pushOps(batch.map((o) => ({ ...o, syncState: 'synced' }) as Operation));
    await db.operations.bulkPut(batch.map((o) => ({ ...o, syncState: 'synced' }) as Operation));
    res.pushedOps += batch.length;
  }

  // 3. Push photos.
  const files = await db.attachments.filter((a) => !a.uploaded).toArray();
  for (const a of files) {
    await t.pushAttachment({ id: a.id, opId: a.opId, mime: a.mime, createdAt: a.createdAt, blob: a.blob });
    await db.attachments.update(a.id, { uploaded: true });
    res.pushedFiles++;
  }

  // 4. Pull operations from other devices (union by id).
  let opSeq = await getMeta(db, 'sync:opSeq', 0);
  for (;;) {
    const page = await t.pullOps(opSeq, BATCH);
    if (!page.length) break;
    const ids = page.map((r) => r.payload.id);
    const have = new Set((await db.operations.bulkGet(ids)).filter(Boolean).map((o) => o!.id));
    const fresh = page.filter((r) => !have.has(r.payload.id)).map((r) => ({ ...r.payload, syncState: 'synced' }) as Operation);
    if (fresh.length) await db.operations.bulkAdd(fresh);
    res.pulledOps += fresh.length;
    opSeq = page[page.length - 1].seq;
    await setMeta(db, 'sync:opSeq', opSeq);
    if (page.length < BATCH) break;
  }

  // 5. Pull master data (last write wins).
  for (const table of ['items', 'customers'] as const) {
    const key = `sync:${table}Seq`;
    let seq = await getMeta(db, key, 0);
    const tbl = db[table] as unknown as AppDB['items'];
    for (;;) {
      const page = await t.pullMaster<Item>(table, seq, BATCH);
      if (!page.length) break;
      for (const r of page) {
        const cur = await tbl.get(r.id);
        if (!cur || r.updatedAt > cur.updatedAt) {
          await tbl.put(r.payload);
          res.pulledMaster++;
        }
      }
      seq = page[page.length - 1].seq;
      await setMeta(db, key, seq);
      if (page.length < BATCH) break;
    }
  }

  // 6. Pull photos added on other devices.
  let fileSeq = await getMeta(db, 'sync:fileSeq', 0);
  for (;;) {
    const page = await t.pullAttachments(fileSeq, BATCH);
    if (!page.length) break;
    for (const r of page) {
      if (await db.attachments.get(r.id)) continue;
      const blob = await t.downloadAttachment(r.path);
      await db.attachments.add({ id: r.id, opId: r.opId, blob, mime: r.mime, createdAt: r.createdAt, uploaded: true });
      res.pulledFiles++;
    }
    fileSeq = page[page.length - 1].seq;
    await setMeta(db, 'sync:fileSeq', fileSeq);
    if (page.length < BATCH) break;
  }

  await setMeta(db, 'sync:lastAt', new Date().toISOString());
  await setMeta(db, 'sync:lastError', null);
  return res;
}
