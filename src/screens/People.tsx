import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { db } from '../db/db';
import { DomainError, renameCustomer } from '../db/repo';
import { useData } from '../hooks/useData';
import { allPostings, ledger } from '../domain/balances';
import { customerActivity } from '../domain/moneyOps';
import { noticeCounts } from '../domain/notices';
import { fmtMoney } from '../domain/money';
import { customerAccount, walletAccount, WALLETS, type AccountKey, type WalletKey } from '../domain/types';
import { fmtDate, fmtDay, todayISO } from '../lib/dates';
import { describePosting } from '../lib/describe';
import { WALLET_LABEL, WALLET_SHORT } from '../lib/labels';
import type { AppData } from '../hooks/useData';
import { Icon } from '../ui/Icon';
import { SearchField, TopBar, useToast } from '../ui/kit';
import { CustomerPicker } from '../ui/pickers';

type Filter = 'all' | 'debt' | 'late' | 'credit' | 'temp';

export function CustomersScreen() {
  const data = useData();
  const [params] = useSearchParams();
  const [q, setQ] = useState('');
  const [f, setF] = useState<Filter>((params.get('f') as Filter) || 'all');
  const [adding, setAdding] = useState(false);
  const today = todayISO();
  const rows = data.customers.map((c) => ({ c, a: customerActivity(data.ops, c.id, today) }));
  let recv = 0;
  let credit = 0;
  for (const r of rows) {
    if (r.a.balance > 0) recv += r.a.balance;
    else credit -= r.a.balance;
  }
  const list = rows
    .filter(({ c, a }) => {
      if (f === 'debt' && a.balance <= 0) return false;
      if (f === 'late' && !a.late) return false;
      if (f === 'credit' && a.balance >= 0) return false;
      if (f === 'temp' && !c.temp) return false;
      return !q.trim() || c.name.includes(q.trim()) || (c.phone ?? '').replace(/\s/g, '').includes(q.replace(/\s/g, ''));
    })
    .sort((x, y) => y.a.balance - x.a.balance);

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
        {([['all', 'الكل'], ['debt', 'عليهم دين'], ['late', 'متأخرون'], ['credit', 'لهم رصيد'], ['temp', 'ديون مؤقتة']] as [Filter, string][]).map(([k, l]) => (
          <button key={k} className={`chip${f === k ? ' on' : ''}`} onClick={() => setF(k)}>{l}</button>
        ))}
      </div>
      <div className="card list">
        {list.map(({ c, a }) => {
          const b = a.balance;
          return (
            <Link key={c.id} to={`/customers/${c.id}`} className="lrow">
              <span className="avatar" style={{ borderRadius: '50%', background: c.temp ? 'var(--amber-soft)' : undefined, color: c.temp ? 'var(--amber-ink)' : undefined }}>
                {c.temp ? '؟' : initial(c.name)}
              </span>
              <span className="grow">
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="name">{c.name}</span>
                  {a.late && <span className="pill red" style={{ fontSize: 11 }}>متأخر</span>}
                </span>
                <span className="meta num">
                  آخر بيع {a.lastSale ? fmtDay(a.lastSale) : '—'} · آخر تحصيل {a.lastPayment ? fmtDay(a.lastPayment) : '—'}
                </span>
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

export function LedgerTable({ data, account, showUnconfirmed }: { data: AppData; account: AccountKey; showUnconfirmed?: boolean }) {
  const l = ledger(data.ops, account);
  const byId = new Map(data.ops.map((o) => [o.id, o]));
  return (
    <div className="card list">
      <div className="ledger-head"><span>البيان</span><span className="n">مدين</span><span className="n">دائن</span><span className="n">الرصيد</span></div>
      {[...l.rows].reverse().map((r, i) => (
        <Link key={i} to={`/op/${r.posting.opId}`} className="ledger-row" style={{ color: 'var(--ink)', textDecoration: 'none' }}>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <span>{describePosting(r.posting, byId.get(r.posting.opId), data.customersById)}</span>
            <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span className="num sub" style={{ fontSize: 11 }}>{fmtDate(r.posting.date)}</span>
              {showUnconfirmed && r.posting.unconfirmed && <span className="pill amber" style={{ fontSize: 10.5, padding: '2px 7px' }}>غير مؤكد</span>}
            </span>
          </span>
          <span className="num n" style={{ color: 'var(--red)' }}>{r.posting.debit ? fmtMoney(r.posting.debit) : ''}</span>
          <span className="num n" style={{ color: 'var(--teal-ink)' }}>{r.posting.credit ? fmtMoney(r.posting.credit) : ''}</span>
          <b className="num n">{r.balance < 0 ? `(${fmtMoney(-r.balance)})` : fmtMoney(r.balance)}</b>
        </Link>
      ))}
      {l.rows.length === 0 && <div style={{ padding: 20, textAlign: 'center' }} className="sub">لا توجد حركات بعد</div>}
    </div>
  );
}

export function CustomerScreen() {
  const { id } = useParams();
  const data = useData();
  const toast = useToast();
  const [name, setName] = useState('');
  const c = id ? data.customersById.get(id) : undefined;
  if (!c) return data.loading ? null : <div className="page"><TopBar title="عميل" /><p className="sub">العميل غير موجود</p></div>;
  const a = customerActivity(data.ops, c.id, todayISO());
  const b = a.balance;

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
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="lbl" style={{ flex: 1 }}>{b > 0 ? 'مستحق على العميل' : b < 0 ? 'رصيد لصالح العميل' : 'الحساب مسدد'}</span>
            {a.late && <span className="pill red">متأخر · {a.daysSincePayment} يومًا</span>}
          </span>
          <span className="num" style={{ fontSize: 32, fontWeight: 700, color: b > 0 ? 'var(--red)' : b < 0 ? 'var(--teal-ink)' : 'var(--ink)' }}>
            {fmtMoney(Math.abs(b))} <span className="sub" style={{ fontWeight: 500 }}>بر</span>
          </span>
          <span className="sub num" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {c.phone && <span>{c.phone}</span>}
            <span>آخر بيع {a.lastSale ? fmtDay(a.lastSale) : '—'}</span>
            <span>آخر تحصيل {a.lastPayment ? fmtDay(a.lastPayment) : '—'}</span>
          </span>
        </div>
        <div className="grid2" style={{ gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 8 }}>
          <Link className="qa" to={`/sale?customer=${c.id}`} style={{ minHeight: 84 }}>
            <span className="b" style={{ background: 'var(--amber-soft)', color: 'var(--amber-ink)' }}><Icon name="receipt" /></span>بيع
          </Link>
          <Link className="qa" to={`/collect?customer=${c.id}`} style={{ minHeight: 84 }}>
            <span className="b" style={{ background: 'var(--teal-soft)', color: 'var(--teal-ink)' }}><Icon name="down" /></span>تحصيل
          </Link>
          <Link className="qa" to={`/returns?customer=${c.id}`} style={{ minHeight: 84 }}>
            <span className="b" style={{ background: 'var(--red-soft)', color: 'var(--red)' }}><Icon name="ret" /></span>مرتجع
          </Link>
          <div className="qa soon" style={{ minHeight: 84 }} aria-disabled="true">
            <span className="b" style={{ background: 'var(--blue-soft)', color: 'var(--blue)' }}><Icon name="file" /></span>كشف حساب
            <span style={{ fontSize: 10.5, color: 'var(--ink2)', fontWeight: 500 }}>المرحلة 6</span>
          </div>
        </div>
        <div className="sec">الحساب الجاري</div>
        <LedgerTable data={data} account={customerAccount(c.id)} />
      </div>
    </div>
  );
}

const WALLET_TAG: Record<WalletKey, [string, string, string]> = {
  cash: ['نقد', 'var(--teal-soft)', 'var(--teal-ink)'],
  cbe: ['CBE', '#f3e6ee', '#6a1b4d'],
  ebirr: ['eB', 'var(--blue-soft)', 'var(--blue)'],
};

export function WalletBadge({ w }: { w: WalletKey }) {
  return <span className="avatar h" style={{ background: WALLET_TAG[w][1], color: WALLET_TAG[w][2], fontSize: 12 }}>{WALLET_TAG[w][0]}</span>;
}

export function MoneyScreen() {
  const data = useData();
  const [wf, setWf] = useState<'all' | WalletKey>('all');
  const total = WALLETS.reduce((t, w) => t + (data.balances.get(walletAccount(w)) ?? 0), 0);
  const nc = noticeCounts(data.ops);
  const byId = new Map(data.ops.map((o) => [o.id, o]));
  const moves = allPostings(data.ops)
    .filter((p) => p.account.startsWith('wallet:') && (wf === 'all' || p.account === walletAccount(wf)))
    .reverse()
    .slice(0, 30);

  return (
    <div className="page anim">
      <div>
        <h1 className="title">المال</h1>
        <div className="sub">أموال العمل فقط — وليست كامل أرصدة حساباتك الشخصية</div>
      </div>
      {WALLETS.map((w) => {
        const v = data.balances.get(walletAccount(w)) ?? 0;
        const on = wf === w;
        return (
          <button key={w} className="card" onClick={() => setWf(on ? 'all' : w)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', cursor: 'pointer', textAlign: 'right', border: on ? '2px solid var(--ink)' : undefined }}>
            <WalletBadge w={w} />
            <span style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <span className="sub">{WALLET_LABEL[w]}</span>
              <span className="num" style={{ fontSize: 22, fontWeight: 700 }}>{fmtMoney(v)}</span>
            </span>
            <span className="num sub">{total ? Math.round((v / total) * 100) : 0}%</span>
          </button>
        );
      })}
      <div className="grid2" style={{ gap: 8 }}>
        <Link className="btn btn-g" to="/transfer"><Icon name="swap" small />تحويل داخلي</Link>
        <Link className="btn btn-p" to="/pay"><Icon name="up" small />سداد للشركة</Link>
      </div>
      <Link to="/company" className="hero" style={{ padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="muted" style={{ fontSize: 13 }}>حسابي مع الشركة</span>
          <span className="num" style={{ fontSize: 22, fontWeight: 700 }}>{fmtMoney(data.company.balance)}</span>
          <span style={{ fontSize: 12, color: '#f7c65c' }}>غير مؤكد <span className="num">{fmtMoney(data.company.unconfirmed)}</span></span>
        </span>
        <Icon name="chevron" />
      </Link>
      <Link to="/notices" className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', color: 'var(--ink)', textDecoration: 'none' }}>
        <span className="avatar" style={{ background: 'var(--teal-soft)', color: 'var(--teal-ink)' }}><Icon name="chat" /></span>
        <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontWeight: 600 }}>الإشعارات البنكية وواتساب</span>
          <span className="sub num" style={{ fontSize: 12.5 }}>{nc.recorded} لم يُرسل · {nc.sent} بانتظار التأكيد · {nc.confirmed} مؤكد</span>
        </span>
        {nc.recorded > 0 && <span className="pill num" style={{ background: 'var(--amber)', color: 'var(--ink)', fontSize: 13 }}>{nc.recorded}</span>}
      </Link>
      <div className="sec">حركة المحافظ</div>
      <div className="hs">
        {(['all', ...WALLETS] as const).map((k) => (
          <button key={k} className={`chip${wf === k ? ' on' : ''}`} onClick={() => setWf(k)}>{k === 'all' ? 'الكل' : WALLET_SHORT[k]}</button>
        ))}
      </div>
      <div className="card list">
        {moves.map((p, i) => {
          const amt = p.debit - p.credit;
          return (
            <Link key={p.opId + i} to={`/op/${p.opId}`} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid #eef1f5', color: 'var(--ink)', textDecoration: 'none' }}>
              <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 14 }}>{describePosting(p, byId.get(p.opId), data.customersById)}</span>
                <span className="num sub" style={{ fontSize: 12 }}>{fmtDay(p.date)} · {WALLET_SHORT[p.account.slice(7) as WalletKey]}</span>
              </span>
              <b className="num" style={{ color: amt > 0 ? 'var(--teal-ink)' : 'var(--red)' }}>{amt > 0 ? '+' : '−'}{fmtMoney(Math.abs(amt))}</b>
            </Link>
          );
        })}
        {moves.length === 0 && <div style={{ padding: 20, textAlign: 'center' }} className="sub">لا توجد حركات بعد</div>}
      </div>
    </div>
  );
}

export function CompanyScreen() {
  const data = useData();
  return (
    <div className="anim">
      <TopBar title="حسابي مع الشركة" />
      <div className="page" style={{ paddingTop: 4 }}>
        <div className="hero" style={{ padding: 18 }}>
          <span className="muted">الرصيد المحسوب من عملياتك (مدين)</span>
          <span className="big num" style={{ fontSize: 30 }}>{fmtMoney(data.company.balance)} <span style={{ fontSize: 14, color: '#b9c4d2', fontWeight: 500 }}>بر</span></span>
          <div className="grid2" style={{ gap: 8 }}>
            <div style={{ background: 'rgba(255,255,255,.08)', borderRadius: 14, padding: '10px 12px' }}>
              <div style={{ fontSize: 12, color: '#b9c4d2' }}>بعد احتساب المؤكد فقط</div>
              <div className="num" style={{ fontWeight: 700 }}>{fmtMoney(data.company.balance + data.company.unconfirmed)}</div>
            </div>
            <div style={{ background: 'rgba(244,161,0,.16)', borderRadius: 14, padding: '10px 12px' }}>
              <div style={{ fontSize: 12, color: '#f7c65c' }}>سدادات غير مؤكدة</div>
              <div className="num" style={{ fontWeight: 700, color: '#f7c65c' }}>{fmtMoney(data.company.unconfirmed)}</div>
            </div>
          </div>
        </div>
        <div className="grid2" style={{ gap: 8 }}>
          <Link className="btn btn-p" to="/pay">سداد جديد</Link>
          <Link className="btn btn-g" to="/receive">استلام بضاعة</Link>
        </div>
        <Link className="btn btn-g" to="/notices"><Icon name="chat" small />الإشعارات: الإرسال إلى واتساب وتأكيد الشركة</Link>
        <div className="sec">الحساب الجاري</div>
        <LedgerTable data={data} account="company" showUnconfirmed />
      </div>
    </div>
  );
}
