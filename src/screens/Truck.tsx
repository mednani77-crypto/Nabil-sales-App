import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useData } from '../hooks/useData';
import { movesOfItem } from '../domain/balances';
import { fmtMoney } from '../domain/money';
import { decompose, stockValue } from '../domain/units';
import type { Operation } from '../domain/types';
import { fmtDate } from '../lib/dates';
import { Icon } from '../ui/Icon';
import { SearchField, TopBar } from '../ui/kit';
import { NewItemSheet } from '../ui/pickers';

export function TruckScreen() {
  const data = useData();
  const [q, setQ] = useState('');
  const [newItem, setNewItem] = useState(false);
  const value = data.items.reduce((t, it) => t + stockValue(it, data.stock.get(it.id) ?? 0), 0);
  const open = data.items.filter((it) => decompose(it, data.stock.get(it.id) ?? 0).openPack).length;
  const low = data.items.filter((it) => it.minStock > 0 && (data.stock.get(it.id) ?? 0) < it.minStock).length;
  const list = data.items.filter((it) => !q.trim() || it.name.includes(q.trim()));

  return (
    <div className="page anim">
      <div>
        <h1 className="title">الشاحنة</h1>
        <div className="sub">مخزن متنقل — يُرحّل تلقائيًا من يوم لآخر</div>
      </div>
      <div style={{ background: 'var(--blue)', color: '#fff', borderRadius: 24, padding: 18, display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 10 }}>
        <div style={{ gridColumn: '1 / -1' }}>
          <div style={{ fontSize: 13, color: '#d6e2fb' }}>قيمة البضاعة في الشاحنة</div>
          <div className="num" style={{ fontSize: 30, fontWeight: 700 }}>{fmtMoney(value)} <span style={{ fontSize: 14, fontWeight: 500, color: '#d6e2fb' }}>بر</span></div>
        </div>
        <Stat n={data.items.length} l="صنف" />
        <Stat n={open} l="عبوة مفتوحة" />
        <Stat n={low} l="منخفض" />
      </div>
      <div className="hs">
        <Link className="chip on" to="/receive"><Icon name="plus" small />استلام بضاعة</Link>
        <button className="chip" onClick={() => setNewItem(true)}>صنف جديد</button>
      </div>
      <SearchField value={q} onChange={setQ} placeholder="ابحث عن صنف" label="بحث في الأصناف" />
      <div className="card list">
        {list.map((it) => {
          const qty = data.stock.get(it.id) ?? 0;
          const p = decompose(it, qty);
          const isLow = it.minStock > 0 && qty < it.minStock;
          return (
            <Link key={it.id} to={`/truck/${it.id}`} className="lrow" style={{ alignItems: 'flex-start', paddingTop: 14, paddingBottom: 14 }}>
              <span className="avatar" style={{ background: 'var(--blue-soft)', color: 'var(--blue)' }}><Icon name="box" /></span>
              <span className="grow" style={{ gap: 4 }}>
                <span className="name">{it.name}</span>
                <span className="num" style={{ fontSize: 14, fontWeight: 600, color: 'var(--blue)' }}>{p.label}</span>
                {(p.openPack || isLow) && (
                  <span style={{ display: 'flex', gap: 6 }}>
                    {p.openPack && <span className="pill amber">عبوة مفتوحة</span>}
                    {isLow && <span className="pill red">منخفض</span>}
                  </span>
                )}
              </span>
              <span className="num sub">{fmtMoney(stockValue(it, qty))}</span>
            </Link>
          );
        })}
        {data.items.length === 0 && !data.loading && (
          <div style={{ padding: 28, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
            <b>لا توجد أصناف بعد</b>
            <span className="sub">أضف أصنافك بوحداتها وأسعارها، ثم سجّل استلام البضاعة.</span>
            <button className="btn btn-d" onClick={() => setNewItem(true)}>+ صنف جديد</button>
          </div>
        )}
      </div>
      <NewItemSheet open={newItem} onClose={() => setNewItem(false)} onCreated={() => setNewItem(false)} />
    </div>
  );
}

function Stat({ n, l }: { n: number; l: string }) {
  return (
    <div>
      <div className="num" style={{ fontSize: 18, fontWeight: 700 }}>{n}</div>
      <div style={{ fontSize: 12, color: '#d6e2fb' }}>{l}</div>
    </div>
  );
}

function moveLabel(op: Operation | undefined): string {
  if (!op) return '';
  if (op.type === 'sale') return `بيع – فاتورة #${op.docNo}`;
  if (op.type === 'receive') return `استلام ${op.docNo}`;
  return 'رصيد افتتاحي';
}

export function ItemScreen() {
  const { id } = useParams();
  const data = useData();
  const item = id ? data.itemsById.get(id) : undefined;
  if (!item) return data.loading ? null : <div className="page"><TopBar title="صنف" /><p className="sub">الصنف غير موجود</p></div>;
  const qty = data.stock.get(item.id) ?? 0;
  const p = decompose(item, qty);
  const smallest = item.units[item.units.length - 1];
  const byId = new Map(data.ops.map((o) => [o.id, o]));
  const moves = movesOfItem(data.ops, item.id).reverse();

  return (
    <div className="anim">
      <TopBar title={item.name} />
      <div className="page" style={{ paddingTop: 4 }}>
        <div className="card pad" style={{ padding: 18, gap: 6 }}>
          <span className="lbl">المتوفر الآن</span>
          <span className="num" style={{ fontSize: 28, fontWeight: 700, color: 'var(--blue)' }}>{p.label}</span>
          <span className="sub num">
            {item.units.length > 1 ? `الإجمالي ${qty.toLocaleString('en-US')} ${smallest.name} · ` : ''}القيمة {fmtMoney(stockValue(item, qty))} بر
          </span>
        </div>
        <div className="sec">الوحدات وآخر الأسعار</div>
        <div className="card list">
          {item.units.map((u) => (
            <div key={u.name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderBottom: '1px solid #eef1f5' }}>
              <span style={{ fontWeight: 600, flex: 1 }}>{u.name}</span>
              <span className="sub">{u.factor > 1 ? `= ${u.factor} ${smallest.name}` : 'أصغر وحدة'}</span>
              <b className="num">{fmtMoney(u.lastPrice)}</b>
            </div>
          ))}
        </div>
        <div className="sec">سجل الحركات</div>
        <div className="card list">
          {moves.map((m, i) => (
            <div key={m.opId + i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid #eef1f5' }}>
              <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 14 }}>{moveLabel(byId.get(m.opId))}</span>
                <span className="num sub" style={{ fontSize: 12 }}>{fmtDate(m.date)}</span>
              </span>
              <b className="num" style={{ fontSize: 13.5, color: m.qty < 0 ? 'var(--red)' : 'var(--teal-ink)' }}>
                {m.qty < 0 ? '− ' : '+ '}{decompose(item, Math.abs(m.qty)).label}
              </b>
            </div>
          ))}
          {moves.length === 0 && <div style={{ padding: 20, textAlign: 'center' }} className="sub">لا توجد حركات بعد</div>}
        </div>
      </div>
    </div>
  );
}
