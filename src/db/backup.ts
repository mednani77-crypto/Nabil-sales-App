import type { AppDB } from './db';
import type { Customer, Item, Operation } from '../domain/types';

/** A full local backup. Restoring MERGES (never deletes): operations by id, master data by newest edit. */
export interface BackupFile {
  app: 'nabil-sales';
  version: 1;
  exportedAt: string;
  operations: Operation[];
  items: Item[];
  customers: Customer[];
  attachments: { id: string; opId: string; mime: string; createdAt: string; data: string /* base64 */ }[];
}

function blobToBase64(blob: Blob): Promise<string> {
  return blob.arrayBuffer().then((buf) => {
    let s = '';
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
  });
}

function base64ToBlob(b64: string, mime: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export async function buildBackup(db: AppDB): Promise<BackupFile> {
  const atts = await db.attachments.toArray();
  return {
    app: 'nabil-sales',
    version: 1,
    exportedAt: new Date().toISOString(),
    operations: await db.operations.toArray(),
    items: await db.items.toArray(),
    customers: await db.customers.toArray(),
    attachments: await Promise.all(atts.map(async (a) => ({ id: a.id, opId: a.opId, mime: a.mime, createdAt: a.createdAt, data: await blobToBase64(a.blob) }))),
  };
}

export interface RestoreResult {
  operations: number;
  items: number;
  customers: number;
  attachments: number;
}

export async function restoreBackup(db: AppDB, file: unknown): Promise<RestoreResult> {
  const f = file as BackupFile;
  if (!f || f.app !== 'nabil-sales' || f.version !== 1 || !Array.isArray(f.operations)) {
    throw new Error('الملف ليس نسخة احتياطية صالحة من تطبيق نبيل');
  }
  const res: RestoreResult = { operations: 0, items: 0, customers: 0, attachments: 0 };
  await db.transaction('rw', [db.operations, db.items, db.customers, db.attachments], async () => {
    for (const op of f.operations) {
      if (await db.operations.get(op.id)) continue;
      // Marked local so it is (idempotently) offered to the cloud on the next sync.
      await db.operations.add({ ...op, syncState: 'local' } as Operation);
      res.operations++;
    }
    for (const [table, rows, key] of [
      [db.items, f.items ?? [], 'items'],
      [db.customers, f.customers ?? [], 'customers'],
    ] as const) {
      for (const r of rows as (Item | Customer)[]) {
        const cur = await (table as AppDB['items']).get(r.id);
        if (!cur || r.updatedAt > cur.updatedAt) {
          await (table as AppDB['items']).put(r as Item);
          res[key]++;
        }
      }
    }
    for (const a of f.attachments ?? []) {
      if (await db.attachments.get(a.id)) continue;
      await db.attachments.add({ id: a.id, opId: a.opId, mime: a.mime, createdAt: a.createdAt, blob: base64ToBlob(a.data, a.mime) });
      res.attachments++;
    }
  });
  return res;
}
