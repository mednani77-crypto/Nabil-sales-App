import Dexie, { type Table } from 'dexie';
import type { Customer, Item, Operation } from '../domain/types';

export interface MetaRow {
  key: string;
  value: unknown;
}

export class AppDB extends Dexie {
  operations!: Table<Operation, string>;
  items!: Table<Item, string>;
  customers!: Table<Customer, string>;
  meta!: Table<MetaRow, string>;

  constructor(name = 'nabil-sales') {
    super(name);
    this.version(1).stores({
      // Operations are append-only: never call put/update/delete on this table outside sync merge.
      operations: 'id, type, date, createdAt, syncState',
      items: 'id, name',
      customers: 'id, name',
      meta: 'key',
    });
  }
}

export const db = new AppDB();
