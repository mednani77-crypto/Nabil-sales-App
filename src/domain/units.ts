import type { Item, Unit } from './types';

export interface StockParts {
  /** e.g. [{unit:'كرتون', qty:10}, {unit:'حبة', qty:4}] — zero parts omitted (except when total is 0). */
  parts: { unit: string; qty: number }[];
  label: string;
  /** True when a remainder sits in pieces (حبة), i.e. a carton/pack has been opened. */
  openPack: boolean;
}

/** Validate and normalise units: sorted by factor desc, unique names and factors, smallest = 1. */
export function normaliseUnits(units: Unit[]): Unit[] {
  if (units.length === 0) throw new Error('الصنف يحتاج وحدة واحدة على الأقل');
  const sorted = [...units].sort((a, b) => b.factor - a.factor);
  const names = new Set<string>();
  const factors = new Set<number>();
  for (const u of sorted) {
    if (!u.name.trim()) throw new Error('اسم الوحدة مطلوب');
    if (!Number.isInteger(u.factor) || u.factor < 1) throw new Error('معامل التحويل يجب أن يكون عددًا صحيحًا موجبًا');
    if (names.has(u.name)) throw new Error(`الوحدة «${u.name}» مكررة`);
    if (factors.has(u.factor)) throw new Error('لا يمكن أن تتساوى وحدتان في معامل التحويل');
    names.add(u.name);
    factors.add(u.factor);
  }
  if (sorted[sorted.length - 1].factor !== 1) throw new Error('أصغر وحدة يجب أن يكون معاملها 1');
  return sorted;
}

/** Greedy decomposition of a base quantity into the item's units, largest first. */
export function decompose(item: Pick<Item, 'units'>, baseQty: number): StockParts {
  const sign = baseQty < 0 ? -1 : 1;
  let rest = Math.abs(baseQty);
  const parts: { unit: string; qty: number }[] = [];
  for (const u of item.units) {
    const q = Math.floor(rest / u.factor);
    rest -= q * u.factor;
    if (q > 0) parts.push({ unit: u.name, qty: q * sign });
  }
  if (parts.length === 0) parts.push({ unit: item.units[0].name, qty: 0 });
  const smallest = item.units[item.units.length - 1];
  const openPack =
    item.units.length > 1 &&
    smallest.name === 'حبة' &&
    parts.some((p) => p.unit === 'حبة' && p.qty !== 0);
  const label = parts
    .map((p) => `${Math.abs(p.qty).toLocaleString('en-US')} ${p.unit}`)
    .join(' + ');
  return { parts, label: (sign < 0 ? '− ' : '') + label, openPack };
}

export function unitByName(item: Pick<Item, 'units' | 'name'>, name: string): Unit {
  const u = item.units.find((x) => x.name === name);
  if (!u) throw new Error(`الوحدة «${name}» غير معرّفة للصنف «${item.name}»`);
  return u;
}

/** Value of a base quantity at the item's main-unit price (used for truck value). */
export function stockValue(item: Pick<Item, 'units'>, baseQty: number): number {
  const main = item.units[0];
  return Math.round((baseQty * main.lastPrice) / main.factor);
}
