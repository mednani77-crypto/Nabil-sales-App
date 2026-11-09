import type { Santim } from './money';
import type { GoodsRef, Item, Operation } from './types';

/* Payments counted in goods ("حق 2 كنتال رز"): the price to use and the checks. Pure. */

/** Price per unit for a goods-based payment.
 *  - from a customer: the last price this customer was charged for this item/unit;
 *  - to the company: the last price the company charged Nabil (receive) for it;
 *  falling back to the unit's last known price. */
export function goodsPrice(ops: Operation[], item: Item, unitName: string, who: { customerId: string } | 'company'): Santim {
  let best: { at: string; price: Santim } | null = null;
  for (const o of ops) {
    const lines =
      who === 'company'
        ? o.type === 'receive' ? o.lines : null
        : o.type === 'sale' && o.customerId === who.customerId ? o.lines : null;
    if (!lines) continue;
    for (const l of lines) {
      if (l.itemId !== item.id || l.unitName !== unitName) continue;
      const at = `${o.date}|${o.createdAt}`;
      if (!best || at > best.at) best = { at, price: l.unitPrice };
    }
  }
  return best?.price ?? item.units.find((u) => u.name === unitName)?.lastPrice ?? 0;
}

export function buildGoodsRef(item: Item, unitName: string, qty: number, unitPrice: Santim): GoodsRef {
  const unit = item.units.find((u) => u.name === unitName);
  return { itemId: item.id, itemName: item.name, unitName, factor: unit?.factor ?? 1, qty, unitPrice };
}

/** Errors for a goods-based amount; the amount must equal qty × price exactly. */
export function checkGoods(g: GoodsRef | undefined, amount: Santim, errors: string[]) {
  if (!g) return;
  if (!Number.isInteger(g.qty) || g.qty <= 0) errors.push('أدخل كمية صحيحة أكبر من صفر');
  if (!Number.isInteger(g.unitPrice) || g.unitPrice <= 0) errors.push('أدخل سعر الوحدة');
  if (g.qty * g.unitPrice !== amount) errors.push('المبلغ لا يساوي الكمية × السعر');
}

/** "حق 2 كنتال رز" */
export const goodsLabel = (g: GoodsRef) => `حق ${g.qty} ${g.unitName} ${g.itemName}`;
