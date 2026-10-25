import type { AppDB } from './db';
import { stockByItem } from '../domain/balances';
import {
  buildOpening,
  buildReceive,
  buildSale,
  type DraftLine,
  type OpeningDraft,
  type Result,
  type SaleDraft,
} from '../domain/operations';
import { normaliseUnits } from '../domain/units';
import type { Customer, Item, OpLine, ReceiveOp, SaleOp, Unit } from '../domain/types';
import { newId } from '../lib/dates';

export class DomainError extends Error {
  constructor(public errors: string[]) {
    super(errors.join('\n'));
  }
}

function unwrap<T>(r: Result<T>): T {
  if (!r.ok) throw new DomainError(r.errors);
  return r.value;
}

export interface Device {
  id: string;
  code: string;
}

export async function getDevice(db: AppDB): Promise<Device> {
  const row = await db.meta.get('device');
  if (row) return row.value as Device;
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const device: Device = { id: newId(), code: letters[Math.floor(Math.random() * letters.length)] };
  await db.meta.put({ key: 'device', value: device });
  return device;
}

type CounterKind = 'invoice' | 'grn' | 'temp';
const COUNTER_START: Record<CounterKind, number> = { invoice: 1000, grn: 0, temp: 0 };

async function nextCounter(db: AppDB, kind: CounterKind): Promise<number> {
  const key = `counter:${kind}`;
  const row = await db.meta.get(key);
  const next = ((row?.value as number | undefined) ?? COUNTER_START[kind]) + 1;
  await db.meta.put({ key, value: next });
  return next;
}

/** Remember the last price per unit as a suggestion (master data, not history). */
async function rememberPrices(db: AppDB, lines: OpLine[], now: string) {
  for (const l of lines) {
    const item = await db.items.get(l.itemId);
    if (!item) continue;
    const units = item.units.map((u) => (u.name === l.unitName ? { ...u, lastPrice: l.unitPrice } : u));
    await db.items.put({ ...item, units, updatedAt: now });
  }
}

async function itemsMap(db: AppDB) {
  return new Map((await db.items.toArray()).map((i) => [i.id, i]));
}

export async function saveReceive(db: AppDB, lines: DraftLine[], date: string): Promise<ReceiveOp> {
  const device = await getDevice(db);
  return db.transaction('rw', db.operations, db.items, db.meta, async () => {
    const seq = await nextCounter(db, 'grn');
    const now = new Date().toISOString();
    const op = unwrap(
      buildReceive(lines, await itemsMap(db), {
        id: newId(),
        date,
        createdAt: now,
        deviceId: device.id,
        docNo: `GRN-${device.code}${String(seq).padStart(4, '0')}`,
      }),
    );
    await db.operations.add(op);
    await rememberPrices(db, op.lines, now);
    return op;
  });
}

export async function saveSale(
  db: AppDB,
  draft: SaleDraft,
  date: string,
): Promise<{ op: SaleOp; tempCustomer?: Customer }> {
  const device = await getDevice(db);
  return db.transaction('rw', [db.operations, db.items, db.customers, db.meta], async () => {
    const now = new Date().toISOString();
    const items = await itemsMap(db);
    const stock = stockByItem(await db.operations.toArray());
    const seq = await nextCounter(db, 'invoice');
    // The temp code is reserved lazily, only if the sale really needs a temporary debt.
    let tempSeq = 0;
    const tempId = newId();
    const result = buildSale(draft, items, stock, {
      id: newId(),
      date,
      createdAt: now,
      deviceId: device.id,
      docNo: `${device.code}-${seq}`,
      makeTempCustomer: () => ({
        id: tempId,
        name: '',
        temp: true,
        createdAt: now,
        updatedAt: now,
      }),
    });
    const value = unwrap(result);
    if (value.tempCustomer) {
      tempSeq = await nextCounter(db, 'temp');
      value.tempCustomer.name = `دين مؤقت D-${device.code}${String(tempSeq).padStart(3, '0')}`;
      await db.customers.add(value.tempCustomer);
    }
    await db.operations.add(value.op);
    await rememberPrices(db, value.op.lines, now);
    return value;
  });
}

export async function saveOpening(db: AppDB, draft: OpeningDraft, date: string) {
  const device = await getDevice(db);
  const op = unwrap(buildOpening(draft, { id: newId(), date, createdAt: new Date().toISOString(), deviceId: device.id }));
  await db.operations.add(op);
  return op;
}

export interface NewItemInput {
  name: string;
  units: Unit[];
  minStock?: number;
}

export async function addItem(db: AppDB, input: NewItemInput): Promise<Item> {
  const name = input.name.trim();
  if (!name) throw new DomainError(['اكتب اسم الصنف']);
  let units: Unit[];
  try {
    units = normaliseUnits(input.units);
  } catch (e) {
    throw new DomainError([(e as Error).message]);
  }
  const dup = await db.items.filter((i) => i.name.trim() === name).first();
  if (dup) throw new DomainError([`الصنف «${name}» موجود مسبقًا`]);
  const now = new Date().toISOString();
  const item: Item = { id: newId(), name, units, minStock: input.minStock ?? 0, createdAt: now, updatedAt: now };
  await db.items.add(item);
  return item;
}

export async function addCustomer(db: AppDB, input: { name: string; phone?: string; area?: string }): Promise<Customer> {
  const name = input.name.trim();
  if (!name) throw new DomainError(['اكتب اسم العميل']);
  const now = new Date().toISOString();
  const c: Customer = { id: newId(), name, phone: input.phone?.trim() || undefined, area: input.area?.trim() || undefined, createdAt: now, updatedAt: now };
  await db.customers.add(c);
  return c;
}

export async function renameCustomer(db: AppDB, id: string, name: string) {
  const n = name.trim();
  if (!n) throw new DomainError(['اكتب الاسم']);
  await db.customers.update(id, { name: n, temp: false, updatedAt: new Date().toISOString() });
}

export async function resetAll(db: AppDB) {
  await db.transaction('rw', [db.operations, db.items, db.customers, db.meta], async () => {
    await Promise.all([db.operations.clear(), db.items.clear(), db.customers.clear()]);
    const device = await db.meta.get('device');
    await db.meta.clear();
    if (device) await db.meta.put(device);
  });
}
