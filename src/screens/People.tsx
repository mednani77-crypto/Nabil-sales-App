import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { db } from '../db/db';
import { DomainError, renameCustomer } from '../db/repo';
import { useData } from '../hooks/useData';
import { ledger } from '../domain/balances';
import { fmtMoney } from '../domain/money';
import { customerAccount, walletAccount, WALLETS, type Customer, type Operation, type Posting } from '../domain/types';
import { fmtDate, fmtDay } from '../lib/dates';
import { BANK_LABEL, WALLET_LABEL } from '../lib/labels';
import { Icon } from '../ui/Icon';
import { SearchField, TopBar, useToast } from '../ui/kit';
import { CustomerPicker } from '../ui/pickers';

type Filter = 'all' | 'debt' | 'credit' | 'temp';

export function CustomersScreen() {
  const data = useData();
  const [params] = useSearchParams();
  const [q, setQ] = useState('');
  const [f, setF] = useState<Filter>((params.get('f') as Filter) || 'all');
  const [adding, setAdding] = useState(false);
  const bal = (c: Customer) => data.balances.get(customerAccount(c.id)) ?? 0;
  let recv = 0;
  let credit = 0;
  for (const c of data.customers) {
    const b = bal(c);
    if (b > 0) recv += b;
    else credit -= b;
  }
  const list = data.customers
    .filter((c) => {
      const b = bal(c);
      if (f === 'debt' && b <= 0) return false;
      if (f === 'credit' && b >= 0) return false;
      if (f === 'temp' && !c.temp) return false;
      return !q.trim() || c.name.includes(q.trim()) || (c.phone ?? '').replace(/\s/g, '').includes(q.replace(/\s/g, ''));
    })
    .sort((a, b) => bal(b) - bal(a));

  return (
    <div className="page anim">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <h1 className="title" style={{ flex: 1 }}>العملاء</h1>
        <button className="chip on" onClick={() => setAdding(true)}><Icon name="plus" small />عميل</button>
      </div>
      <div className="grid2" style={{ gap: 10 }}>
        <div style={{ background: 'var(--amber-soft)', borderRadius: 18, padding: 14 }}>
          <div style={{ fontSize: 12.5, color: 'var(--amber-ink)' }}>مستحق على العملاء</div>
          <div className="num" style={{ fontSize: 21, fontWeight: 700, color: '#5e3d00' }}>{fmtMoney(recv)}</div>
        </div>
        <div style={{ background: 'var(--teal-soft)', borderRadius: 18, padding: 14 }}>
          <div style={{ fontSize: 12.5, color: 'var(--teal-ink)' }}>أرصدة لصالح العملاء</div>
          <div className="num" style={{ fontSize: 21, fontWeight: 700, color: '#0a5e53' }}>{fmtMoney(credit)}</div>
        </div>
      </div>
      <SearchField value={q} onChange={setQ} placeholder="ابحث بالاسم أو الهاتف" label="بحث عن عميل" />
      <div className="hs">
        {([['all', 'الكل'], ['debt', 'عليهم دين'], ['credit', 'لهم رصيد'], ['temp', 'ديون مؤقتة']] as [Filter, string][]).map(([k, l]) => (
          <button key={k} className={`chip${f === k ? ' on' : ''}`} onClick={() => setF(k)}>{l}</button>
        ))}
      </div>
      <div className="card list">
        {list.map((c) => {
          const b = bal(c);
          return (
            <Link key={c.id} to={`/customers/${c.id}`} className="lrow">
              <span className="avatar" style={{ borderRadius: '50%', background: c.temp ? 'var(--amber-soft)' : undefined, color: c.temp ? 'var(--amber-ink)' : undefined }}>
                {c.temp ? '؟' : initial(c.name)}
              </span>
              <span className="grow">
                <span className="name">{c.name}</span>
                <span className="meta num">{c.phone ?? (c.temp ? 'بلا اسم — سمِّه' : 'بلا هاتف')}</span>
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                <b className="num" style={{ color: b > 0 ? 'var(--red)' : b < 0 ? 'var(--teal-ink)' : 'var(--ink2)' }}>{fmtMoney(Math.abs(b))}</b>
                <span className="sub" style={{ fontSize: 11.5 }}>{b > 0 ? 'عليه' : b < 0 ? 'له' : 'مسدد'}</span>
              </span>
            </Link>
          );
        })}
        {list.length === 0 && !data.loading && <div style={{ padding: 28, textAlign: 'center' }} className="sub">لا يوجد عملاء مطابقون</div>}
      </div>
      <CustomerPicker open={adding} onClose={() => setAdding(false)} data={data} onPick={() => setAdding(false)} />
    </div>
  );
}

function initial(name: string) {
  return name.replace(/^(بقالة|محل|متجر|مطعم|دكان|سوبرماركت)\s+/, '').charAt(0);
}

export function describePosting(p: Posting, op: Operation | undefined): string {
  if (!op) return '';
  if (op.type === 'opening') return 'رصيد افتتاحي';
  if (op.type === 'receive') return `استلام بضاعة ${op.docNo}`;
  if (op.type === 'sale') {
    if (p.debit > 0 && p.account.startsWith('customer')) return `فاتورة بيع #${op.docNo}`;
    const d = op.destination;
    const where = d ? (d.kind === 'wallet' ? WALLET_LABEL[d.wallet] : `${BANK_LABEL[d.bank]} (الشركة)`) : '';
    if (p.account === 'company') return `تحويل مباشر من عميل · ${where} · #${op.docNo}`;
    if (p.account.startsWith('wallet')) return `فاتورة #${op.docNo}`;
    return `دفعة مع الفاتورة #${op.docNo} · ${where}`;
  }
  return '';
}

export function CustomerScreen() {
  const { id } = useParams();
  const data = useData();
  const toast = useToast();
  const [name, setName] = useState('');
  const c = id ? data.customersById.get(id) : undefined;
  if (!c) return data.loading ? null : <div className="page"><TopBar title="عميل" /><p className="sub">العميل غير موجود</p></div>;
  const l = ledger(data.ops, customerAccount(c.id));
  const b = l.closing;
  const byId = new Map(data.ops.map((o) => [o.id, o]));

  async function saveName() {
    try {
      await renameCustomer(db, c!.id, name);
      setName('');
      toast('حُفظ اسم صاحب الدين');
    } catch (e) {
      toast(e instanceof DomainError ? e.errors.join('\n') : 'تعذّر الحفظ', true);
    }
  }

  return (
    <div className="anim">
      <TopBar title={c.name}>
        {c.phone && (
          <a className="icbtn" aria-label="اتصال" href={`tel:${c.phone.replace(/\s/g, '')}`} style={{ color: 'var(--teal-ink)' }}>
            <Icon name="phone" />
          </a>
        )}
      </TopBar>
      <div className="page" style={{ paddingTop: 4 }}>
        {c.temp && (
          <div style={{ background: 'var(--amber-soft)', borderRadius: 18, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 13, color: '#5e3d00', fontWeight: 600 }}>دين مؤقت — سمِّ صاحبه حتى لا يختلط بغيره</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="inp" aria-label="اسم صاحب الدين" placeholder="اسم العميل" value={name} onChange={(e) => setName(e.target.value)} style={{ flex: 1 }} />
              <button className="btn btn-d" onClick={saveName}>حفظ</button>
            </div>
          </div>
        )}
        <div className="card pad" style={{ padding: 18, gap: 8 }}>
          <span className="lbl">{b > 0 ? 'مستحق على العميل' : b < 0 ? 'رصيد لصالح العميل' : 'الحساب مسدد'}</span>
          <span className="num" style={{ fontSize: 32, fontWeight: 700, color: b > 0 ? 'var(--red)' : b < 0 ? 'var(--teal-ink)' : 'var(--ink)' }}>
            {fmtMoney(Math.abs(b))} <span className="sub" style={{ fontWeight: 500 }}>بر</span>
          </span>
          <span className="sub num">{[c.phone, c.area].filter(Boolean).join(' · ') || '—'}</span>
        </div>
        <div className="grid2" style={{ gap: 8 }}>
          <Link className="btn btn-p" to={`/sale?customer=${c.id}`}><Icon name="receipt" small />بيع لهذا العميل</Link>
          <div className="btn btn-g" aria-disabled="true" style={{ opacity: 0.55 }}>تحصيل · المرحلة 2</div>
        </div>
        <div className="sec">الحساب الجاري</div>
        <div className="card list">
          <div className="ledger-head"><span>البيان</span><span className="n">مدين</span><span className="n">دائن</span><span className="n">الرصيد</span></div>
          {[...l.rows].reverse().map((r, i) => (
            <div key={i} className="ledger-row">
              <span style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
                <span>{describePosting(r.posting, byId.get(r.posting.opId))}</span>
                <span className="num sub" style={{ fontSize: 11 }}>{fmtDate(r.posting.date)}</span>
              </span>
              <span className="num n" style={{ color: 'var(--red)' }}>{r.posting.debit ? fmtMoney(r.posting.debit) : ''}</span>
              <span className="num n" style={{ color: 'var(--teal-ink)' }}>{r.posting.credit ? fmtMoney(r.posting.credit) : ''}</span>
              <b className="num n">{r.balance < 0 ? `(${fmtMoney(-r.balance)})` : fmtMoney(r.balance)}</b>
            </div>
          ))}
          {l.rows.length === 0 && <div style={{ padding: 20, textAlign: 'center' }} className="sub">لا توجد حركات بعد</div>}
        </div>
      </div>
    </div>
  );
}

export function MoneyScreen() {
  const data = useData();
  const tags = { cash: ['نقد', 'var(--teal-soft)', 'var(--teal-ink)'], cbe: ['CBE', '#f3e6ee', '#6a1b4d'], ebirr: ['eB', 'var(--blue-soft)', 'var(--blue)'] } as const;
  const total = WALLETS.reduce((t, w) => t + (data.balances.get(walletAccount(w)) ?? 0), 0);
  const l = ledger(data.ops, 'company');
  const byId = new Map(data.ops.map((o) => [o.id, o]));
  return (
    <div className="page anim">
      <div>
        <h1 className="title">المال</h1>
        <div className="sub">أموال العمل فقط — وليست كامل أرصدة حساباتك الشخصية</div>
      </div>
      {WALLETS.map((w) => {
        const v = data.balances.get(walletAccount(w)) ?? 0;
        return (
          <div key={w} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px' }}>
            <span className="avatar h" style={{ background: tags[w][1], color: tags[w][2], fontSize: 12 }}>{tags[w][0]}</span>
            <span style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <span className="sub">{WALLET_LABEL[w]}</span>
              <span className="num" style={{ fontSize: 22, fontWeight: 700 }}>{fmtMoney(v)}</span>
            </span>
            <span className="num sub">{total ? Math.round((v / total) * 100) : 0}%</span>
          </div>
        );
      })}
      <div className="note amber">التحويل بين المحافظ والسداد للشركة وتسجيل التحصيل: المرحلة 2.</div>
      <div className="hero" style={{ padding: 18 }}>
        <span className="muted">حسابي مع الشركة (مدين)</span>
        <span className="big num" style={{ fontSize: 28 }}>{fmtMoney(data.company.balance)}</span>
        <span style={{ fontSize: 12.5, color: '#f7c65c' }}>منها سدادات غير مؤكدة <span className="num">{fmtMoney(data.company.unconfirmed)}</span></span>
      </div>
      <div className="sec">الحساب الجاري مع الشركة</div>
      <div className="card list">
        <div className="ledger-head"><span>البيان</span><span className="n">مدين</span><span className="n">دائن</span><span className="n">الرصيد</span></div>
        {[...l.rows].reverse().map((r, i) => (
          <div key={i} className="ledger-row">
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
              <span>{describePosting(r.posting, byId.get(r.posting.opId))}</span>
              <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span className="num sub" style={{ fontSize: 11 }}>{fmtDay(r.posting.date)}</span>
                {r.posting.unconfirmed && <span className="pill amber" style={{ fontSize: 10.5, padding: '2px 7px' }}>غير مؤكد</span>}
              </span>
            </span>
            <span className="num n" style={{ color: 'var(--red)' }}>{r.posting.debit ? fmtMoney(r.posting.debit) : ''}</span>
            <span className="num n" style={{ color: 'var(--teal-ink)' }}>{r.posting.credit ? fmtMoney(r.posting.credit) : ''}</span>
            <b className="num n">{r.balance < 0 ? `(${fmtMoney(-r.balance)})` : fmtMoney(r.balance)}</b>
          </div>
        ))}
        {l.rows.length === 0 && <div style={{ padding: 20, textAlign: 'center' }} className="sub">لا توجد حركات بعد</div>}
      </div>
    </div>
  );
}
