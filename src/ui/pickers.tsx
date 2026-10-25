import { useState } from 'react';
import { db } from '../db/db';
import { addCustomer, addItem, DomainError } from '../db/repo';
import type { AppData } from '../hooks/useData';
import { decompose } from '../domain/units';
import { balanceOf } from '../domain/balances';
import { fmtMoney, parseBirr } from '../domain/money';
import { customerAccount, UNIT_NAMES, type Customer, type Item } from '../domain/types';
import { Icon } from './Icon';
import { SearchField, Sheet, useToast } from './kit';

/* ---------- Item picker ---------- */
export function ItemPicker({ open, onClose, data, onPick }: { open: boolean; onClose: () => void; data: AppData; onPick: (item: Item) => void }) {
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const list = data.items.filter((i) => !q.trim() || i.name.includes(q.trim()));
  const close = () => {
    setQ('');
    setCreating(false);
    onClose();
  };
  if (creating) {
    return (
      <NewItemSheet
        open={open}
        initialName={q}
        onClose={close}
        onCreated={(item) => {
          setCreating(false);
          setQ('');
          onPick(item);
        }}
      />
    );
  }
  return (
    <Sheet open={open} onClose={close}>
      <div className="head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h2 style={{ flex: 1 }}>اختر صنفًا</h2>
          <button className="chip on" onClick={() => setCreating(true)}>
            <Icon name="plus" small />
            صنف جديد
          </button>
        </div>
        <SearchField value={q} onChange={setQ} placeholder="اكتب اسم الصنف" label="بحث عن صنف" />
      </div>
      <div className="body" style={{ paddingBottom: 16 }}>
        {list.map((it) => (
          <button key={it.id} className="lrow" onClick={() => { setQ(''); onPick(it); }}>
            <span className="avatar" style={{ background: 'var(--blue-soft)', color: 'var(--blue)' }}>
              <Icon name="box" small />
            </span>
            <span className="grow">
              <span className="name">{it.name}</span>
              <span className="meta num">في الشاحنة: {decompose(it, data.stock.get(it.id) ?? 0).label}</span>
            </span>
            <span className="num meta">
              {fmtMoney(it.units[0].lastPrice)} / {it.units[0].name}
            </span>
          </button>
        ))}
        {list.length === 0 && (
          <div style={{ padding: 22, textAlign: 'center', color: 'var(--ink2)', fontSize: 14 }}>
            لا يوجد صنف بهذا الاسم —{' '}
            <button className="chip" onClick={() => setCreating(true)}>أضفه كصنف جديد</button>
          </div>
        )}
      </div>
    </Sheet>
  );
}

/* ---------- New item ---------- */
export function NewItemSheet({ open, onClose, onCreated, initialName = '' }: { open: boolean; onClose: () => void; onCreated: (item: Item) => void; initialName?: string }) {
  const toast = useToast();
  const [name, setName] = useState(initialName);
  const [u1, setU1] = useState<string>('كرتون');
  const [u2, setU2] = useState<string>('حبة');
  const [per, setPer] = useState('');
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [min, setMin] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    const price1 = parseBirr(p1);
    if (price1 === null) return toast(`أدخل سعر ${u1}`, true);
    const factor = parseInt(per, 10);
    const units = [{ name: u1, factor: 1, lastPrice: price1 }];
    if (u2) {
      if (!(factor > 1)) return toast(`كم ${u2} في ${u1} الواحد؟`, true);
      units[0].factor = factor;
      units.push({ name: u2, factor: 1, lastPrice: parseBirr(p2) ?? Math.round(price1 / factor) });
    }
    setBusy(true);
    try {
      const minUnits = parseInt(min, 10);
      const item = await addItem(db, { name, units, minStock: minUnits > 0 ? minUnits * units[0].factor : 0 });
      toast(`أُضيف الصنف «${item.name}»`);
      onCreated(item);
    } catch (e) {
      toast(e instanceof DomainError ? e.errors.join('\n') : 'تعذّر حفظ الصنف', true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose}>
      <div className="body" style={{ padding: '4px 16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2>صنف جديد</h2>
        <label className="field">
          <span className="lbl">اسم الصنف</span>
          <input className="inp" placeholder="مثل: عدس أحمر 25 كغ" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <span className="lbl">الوحدة الأساسية للبيع</span>
        <div className="chips">
          {UNIT_NAMES.map((u) => (
            <button key={u} className={`chip${u1 === u ? ' on' : ''}`} onClick={() => { setU1(u); if (u2 === u) setU2(''); }}>{u}</button>
          ))}
        </div>
        <span className="lbl">وحدة أصغر (اختياري)</span>
        <div className="chips">
          {['', ...UNIT_NAMES.filter((u) => u !== u1)].map((u) => (
            <button key={u || 'none'} className={`chip${u2 === u ? ' on' : ''}`} onClick={() => setU2(u)}>{u || 'بدون'}</button>
          ))}
        </div>
        {u2 && (
          <label className="field">
            <span className="lbl">كم {u2} في {u1} الواحد؟</span>
            <input className="inp num" type="number" inputMode="numeric" min={2} placeholder="مثل 24" value={per} onChange={(e) => setPer(e.target.value)} />
          </label>
        )}
        <div className="grid2" style={{ gap: 8 }}>
          <label className="field">
            <span className="lbl">سعر {u1}</span>
            <input className="inp num" inputMode="decimal" value={p1} onChange={(e) => setP1(e.target.value)} />
          </label>
          {u2 && (
            <label className="field">
              <span className="lbl">سعر {u2}</span>
              <input className="inp num" inputMode="decimal" placeholder="تلقائي" value={p2} onChange={(e) => setP2(e.target.value)} />
            </label>
          )}
        </div>
        <label className="field">
          <span className="lbl">نبّهني إذا قلّ المخزون عن (بالـ{u1}) — اختياري</span>
          <input className="inp num" type="number" inputMode="numeric" min={0} value={min} onChange={(e) => setMin(e.target.value)} />
        </label>
        <button className="btn btn-p" disabled={busy} onClick={save}>حفظ الصنف</button>
      </div>
    </Sheet>
  );
}

/* ---------- Customer picker ---------- */
export function CustomerPicker({
  open,
  onClose,
  data,
  onPick,
  allowNone,
}: {
  open: boolean;
  onClose: () => void;
  data: AppData;
  onPick: (c: Customer | null) => void;
  allowNone?: boolean;
}) {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const list = data.customers.filter((c) => !q.trim() || c.name.includes(q.trim()) || (c.phone ?? '').replace(/\s/g, '').includes(q.replace(/\s/g, '')));

  async function create() {
    try {
      const c = await addCustomer(db, { name, phone });
      setName('');
      setPhone('');
      toast(`أُضيف العميل ${c.name}`);
      onPick(c);
    } catch (e) {
      toast(e instanceof DomainError ? e.errors.join('\n') : 'تعذّر الحفظ', true);
    }
  }

  return (
    <Sheet open={open} onClose={onClose}>
      <div className="head">
        <h2>اختر العميل</h2>
        <SearchField value={q} onChange={setQ} placeholder="ابحث بالاسم أو الهاتف" label="بحث عن عميل" />
      </div>
      <div className="body">
        {allowNone && (
          <button className="lrow" onClick={() => onPick(null)}>
            <span className="grow"><span className="name">بدون عميل — بيع نقدي</span></span>
          </button>
        )}
        {list.map((c) => {
          const bal = balanceOf(data.ops, customerAccount(c.id));
          return (
            <button key={c.id} className="lrow" onClick={() => onPick(c)}>
              <span className="grow">
                <span className="name">{c.name}</span>
                {c.phone && <span className="meta num">{c.phone}</span>}
              </span>
              {bal !== 0 && (
                <span className="num" style={{ fontSize: 13, color: bal > 0 ? 'var(--red)' : 'var(--teal-ink)' }}>
                  {fmtMoney(Math.abs(bal))} {bal > 0 ? 'عليه' : 'له'}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div style={{ padding: '12px 16px 18px', borderTop: '1px solid #eef1f5', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span className="lbl">عميل جديد</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1fr)', gap: 8 }}>
          <input className="inp" aria-label="اسم العميل الجديد" placeholder="الاسم" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="inp num" aria-label="الهاتف" inputMode="tel" placeholder="الهاتف (اختياري)" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <button className="btn btn-d" onClick={create}>إضافة واختيار</button>
      </div>
    </Sheet>
  );
}
