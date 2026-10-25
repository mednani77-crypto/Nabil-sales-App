import Dexie, { type Table } from 'dexie';
import type { Customer, Item, Operation } from '../domain/types';

export interface MetaRow {
  key: string;
  value: unknown;
}

/** A photo (e.g. bank-transfer notice) linked to an operation. Replacing = adding a newer one. */
export interface Attachment {
  id: string;
  opId: string;
  blob: Blob;
  mime: string;
  createdAt: string;
  /** Set once the photo is stored in the cloud (phase 5 sync). */
  uploaded?: boolean;
}

export class AppDB extends Dexie {
  operations!: Table<Operation, string>;
  items!: Table<Item, string>;
  customers!: Table<Customer, string>;
  meta!: Table<MetaRow, string>;
  attachments!: Table<Attachment, string>;

  constructor(name = 'nabil-sales') {
    super(name);
    this.version(1).stores({
      // Operations are append-only: never call put/update/delete on this table outside sync merge.
      operations: 'id, type, date, createdAt, syncState',
      items: 'id, name',
      customers: 'id, name',
      meta: 'key',
    });
    this.version(2).stores({
      attachments: 'id, opId, createdAt',
    });
  }
}

export const db = new AppDB();
