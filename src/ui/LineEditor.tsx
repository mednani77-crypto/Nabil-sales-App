import { decompose } from '../domain/units';
import { fmtMoney, parseBirr, toBirrInput } from '../domain/money';
import type { DraftLine } from '../domain/operations';
import type { Item } from '../domain/types';
import type { AppData } from '../hooks/useData';
import { Icon } from './Icon';

/** Editable line. qty and price are kept as typed text; converted on save. */
export interface LineState {
  key: string;
  itemId: string;
  unitName: string;
  qty: string;
  price: string; // birr text
}

export function newLine(item: Item): LineState {
  const u = item.units[0];
  return { key: crypto.randomUUID?.() ?? String(Math.random()), itemId: item.id, unitName: u.name, qty: '1', price: toBirrInput(u.lastPrice) };
}

/** Add an item: if it is already on the list with the main unit, increase quantity instead. */
export function addOrIncrement(lines: LineState[], item: Item): LineState[] {
  const i = lines.findIndex((l) => l.itemId === item.id && l.unitName === item.units[0].name);
  if (i < 0) return [...lines, newLine(item)];
  return lines.map((l, j) => (j === i ? { ...l, qty: String((parseInt(l.qty, 10) || 0) + 1) } : l));
}

export function toDraft(lines: LineState[]): DraftLine[] {
  return lines.map((l) => ({
    itemId: l.itemId,
    unitName: l.unitName,
    qty: parseInt(l.qty, 10) || 0,
    unitPrice: parseBirr(l.price) ?? -1,
  }));
}

export function linesTotalOf(lines: LineState[]): number {
  return lines.reduce((t, l) => t + (parseInt(l.qty, 10) || 0) * (parseBirr(l.price) ?? 0), 0);
}

export function LineEditor({ lines, setLines, data, checkStock }: { lines: LineState[]; setLines: (l: LineState[]) => void; data: AppData; checkStock: boolean }) {
  const upd = (i: number, p: Partial<LineState>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...p } : l)));

  // Base units requested per item across all lines (for the stock warning).
  const need = new Map<string, number>();
  for (const l of lines) {
    const it = data.itemsById.get(l.itemId);
    const u = it?.units.find((x) => x.name === l.unitName);
    if (it && u) need.set(it.id, (need.get(it.id) ?? 0) + (parseInt(l.qty, 10) || 0) * u.factor);
  }

  return (
    <>
      {lines.map((l, i) => {
        const item = data.itemsById.get(l.itemId);
        if (!item) return null;
        const unit = item.units.find((u) => u.name === l.unitName) ?? item.units[0];
        const smallest = item.units[item.units.length - 1];
        const have = data.stock.get(item.id) ?? 0;
        const short = checkStock && (need.get(item.id) ?? 0) > have;
        const qtyN = parseInt(l.qty, 10) || 0;
        const total = qtyN * (parseBirr(l.price) ?? 0);
        return (
          <div key={l.key} className="card anim" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 15.5 }}>{item.name}</div>
                <div className="num" style={{ fontSize: 12.5, color: short ? '#b42318' : 'var(--ink2)' }}>
                  {short ? `المتوفر ${decompose(item, have).label} فقط` : `في الشاحنة: ${decompose(item, have).label}`}
                </div>
              </div>
              <button className="icbtn" style={{ border: 0, background: '#f3f5f8' }} aria-label={`حذف ${item.name}`} onClick={() => setLines(lines.filter((_, j) => j !== i))}>
                <Icon name="trash" small />
              </button>
            </div>
            {item.units.length > 1 && (
              <div className="chips">
                {item.units.map((u) => (
                  <button key={u.name} className={`chip${u.name === l.unitName ? ' on' : ''}`} onClick={() => upd(i, { unitName: u.name, price: toBirrInput(u.lastPrice) })}>
                    {u.name}
                  </button>
                ))}
              </div>
            )}
            <div className="grid2" style={{ gap: 10 }}>
              <div className="field">
                <span className="lbl">الكمية ({unit.name})</span>
                <div className="stepper">
                  <button aria-label="زيادة الكمية" onClick={() => upd(i, { qty: String(qtyN + 1) })}>+</button>
                  <input aria-label="الكمية" type="number" inputMode="numeric" min={1} value={l.qty} onChange={(e) => upd(i, { qty: e.target.value.replace(/\D/g, '') })} />
                  <button aria-label="إنقاص الكمية" onClick={() => upd(i, { qty: String(Math.max(1, qtyN - 1)) })}>−</button>
                </div>
              </div>
              <label className="field">
                <span className="lbl">سعر الوحدة (بر)</span>
                <input className="inp num" inputMode="decimal" value={l.price} onChange={(e) => upd(i, { price: e.target.value })} style={{ fontWeight: 600 }} />
              </label>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--ink2)' }}>
              <span className="num">
                {unit.factor > 1 ? `1 ${unit.name} = ${unit.factor} ${smallest.name} · ` : ''}آخر سعر {fmtMoney(unit.lastPrice)}
              </span>
              <span>
                الإجمالي <b className="num" style={{ color: 'var(--ink)', fontSize: 16 }}>{fmtMoney(total)}</b>
              </span>
            </div>
          </div>
        );
      })}
    </>
  );
}
