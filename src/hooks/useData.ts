import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { db } from '../db/db';
import { balances, companySummary, stockByItem } from '../domain/balances';
import type { Customer, Item, Operation } from '../domain/types';

const EMPTY_OPS: Operation[] = [];
const EMPTY_ITEMS: Item[] = [];
const EMPTY_CUSTOMERS: Customer[] = [];

/** Everything the screens need, recomputed from operations whenever IndexedDB changes. */
export function useData() {
  const ops = useLiveQuery(() => db.operations.toArray(), []);
  const items = useLiveQuery(() => db.items.orderBy('name').toArray(), []);
  const customers = useLiveQuery(() => db.customers.orderBy('name').toArray(), []);
  const loading = ops === undefined || items === undefined || customers === undefined;

  return useMemo(() => {
    const o = ops ?? EMPTY_OPS;
    const it = items ?? EMPTY_ITEMS;
    const cs = customers ?? EMPTY_CUSTOMERS;
    return {
      loading,
      ops: o,
      items: it,
      customers: cs,
      itemsById: new Map(it.map((i) => [i.id, i])),
      customersById: new Map(cs.map((c) => [c.id, c])),
      stock: stockByItem(o),
      balances: balances(o),
      company: companySummary(o),
    };
  }, [ops, items, customers, loading]);
}

export type AppData = ReturnType<typeof useData>;
