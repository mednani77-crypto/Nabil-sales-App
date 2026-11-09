import { useMemo, useState } from 'react';
import { buildGoodsRef, goodsPrice } from '../domain/goods';
import { fmtMoney, parseBirr, toBirrInput } from '../domain/money';
import type { GoodsRef, Item, Operation } from '../domain/types';

/* Amount entry "by quantity": حق 2 كنتال رز → 2 × price. Nabil counts payments in goods. */

export type AmountMode = 'goods' | 'money';
const MODE_KEY = 'nabil.amountMode';

export function lastAmountMode(): AmountMode {
  try {
    return localStorage.getItem(MODE_KEY) === 'money' ? 'money' : 'goods';
  } catch {
    return 'goods';
  }
}
function rememberMode(m: AmountMode) {
  try {
    localStorage.setItem(MODE_KEY, m);
  } catch {
    /* storage unavailable */
  }
}

export interface GoodsState {
  itemId: string;
  unitName: string;
  qty: string;
  price: string;
}

/** Parent keeps the state; this returns the resulting amount and GoodsRef. */
export function useGoodsAmount(items: Item[], ops: Operation[], who: { customerId: string } | 'company' | null) {
  const [mode, setModeState] = useState<AmountMode>(lastAmountMode);
  const [g, setG] = useState<GoodsState>({ itemId: '', unitName: '', qty: '1', price: '' });
  const setMode = (m: AmountMode) => {
    setModeState(m);
    rememberMode(m);
  };

  // Items this customer bought (or Nabil received) first, most recent first.
  const ordered = useMemo(() => {
    const seen: string[] = [];
    for (let i = ops.length - 1; i >= 0; i--) {
      const o = ops[i];
      const lines = who === 'company' ? (o.type === 'receive' ? o.lines : null) : who && o.type === 'sale' && o.customerId === who.customerId ? o.lines : null;
      if (lines) for (const l of lines) if (!seen.includes(l.itemId)) seen.push(l.itemId);
    }
    const rank = (id: string) => (seen.includes(id) ? seen.indexOf(id) : 1e6);
    return [...items].sort((a, b) => rank(a.id) - rank(b.id) || a.name.localeCompare(b.name, 'ar'));
  }, [items, ops, who]);

  const item = items.find((i) => i.id === g.itemId);
  const qty = Number.parseInt(g.qty, 10);
  const price = parseBirr(g.price) ?? 0;
  const valid = Boolean(item && g.unitName && Number.isInteger(qty) && qty > 0 && price > 0);
  const goods: GoodsRef | undefined = valid ? buildGoodsRef(item!, g.unitName, qty, price) : undefined;

  const pick = (it: Item, unitName = it.units[0].name) => {
    const p = who ? goodsPrice(ops, it, unitName, who) : (it.units.find((u) => u.name === unitName)?.lastPrice ?? 0);
    setG({ itemId: it.id, unitName, qty: g.itemId === it.id ? g.qty : '1', price: p ? toBirrInput(p) : '' });
  };

  return { mode, setMode, g, setG, item, ordered, goods, amount: goods ? goods.qty * goods.unitPrice : 0, pick };
}

export function ModeSwitch({ mode, setMode }: { mode: AmountMode; setMode: (m: AmountMode) => void }) {
  return (
    <div className="seg" role="radiogroup" style={{ gridTemplateColumns: 'repeat(2,minmax(0,1fr))' }}>
      <button role="radio" aria-checked={mode === 'goods'} className={mode === 'goods' ? 'on' : ''} onClick={() => setMode('goods')}>بالكمية (حق كم كنتال)</button>
      <button role="radio" aria-checked={mode === 'money'} className={mode === 'money' ? 'on' : ''} onClick={() => setMode('money')}>بالمبلغ</button>
    </div>
  );
}

export function GoodsFields({ s, priceHint }: { s: ReturnType<typeof useGoodsAmount>; priceHint: string }) {
  const { g, setG, item, ordered, goods, pick } = s;
  const qty = Number.parseInt(g.qty, 10) || 0;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <span className="lbl">الصنف</span>
      <div className="hs">
        {ordered.map((it) => (
          <button key={it.id} className={`chip${g.itemId === it.id ? ' on' : ''}`} onClick={() => pick(it)}>{it.name}</button>
        ))}
        {ordered.length === 0 && <span className="sub">لا توجد أصناف بعد</span>}
      </div>
      {item && item.units.length > 1 && (
        <div className="chips">
          {item.units.map((u) => (
            <button key={u.name} className={`chip${g.unitName === u.name ? ' on' : ''}`} style={{ minHeight: 40, fontSize: 13 }} onClick={() => pick(item, u.name)}>{u.name}</button>
          ))}
        </div>
      )}
      {item && (
        <>
          <div className="grid2" style={{ gap: 8, alignItems: 'end' }}>
            <label className="field">
              <span className="lbl">الكمية ({g.unitName})</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-g" style={{ minWidth: 48, padding: 0 }} onClick={() => setG({ ...g, qty: String(qty + 1) })} aria-label="أكثر">+</button>
                <input className="inp num" inputMode="numeric" value={g.qty} onChange={(e) => setG({ ...g, qty: e.target.value.replace(/\D/g, '') })} style={{ textAlign: 'center', fontSize: 22, fontWeight: 700, minWidth: 0 }} />
                <button className="btn btn-g" style={{ minWidth: 48, padding: 0 }} onClick={() => setG({ ...g, qty: String(Math.max(1, qty - 1)) })} aria-label="أقل">−</button>
              </div>
            </label>
            <label className="field">
              <span className="lbl">سعر {g.unitName}</span>
              <input className="inp num" inputMode="decimal" value={g.price} onChange={(e) => setG({ ...g, price: e.target.value })} />
            </label>
          </div>
          <span className="sub" style={{ fontSize: 12 }}>{priceHint}</span>
          <div style={{ background: 'var(--soft)', borderRadius: 14, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontWeight: 600 }}>حق {g.qty || 0} {g.unitName} {item.name}</span>
            <b className="num" style={{ fontSize: 20 }}>{fmtMoney(goods ? goods.qty * goods.unitPrice : 0)} بر</b>
          </div>
        </>
      )}
    </div>
  );
}
