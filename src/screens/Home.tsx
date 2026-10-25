import { Link } from 'react-router-dom';
import { useData } from '../hooks/useData';
import { salesOn } from '../domain/balances';
import { customerActivity } from '../domain/moneyOps';
import { fmtMoney } from '../domain/money';
import { linesTotal } from '../domain/postings';
import { stockValue } from '../domain/units';
import { customerAccount, walletAccount, WALLETS, type SaleOp } from '../domain/types';
import { addDaysISO, fmtDay, fmtLongDate, fmtTime, shortWeekday, todayISO } from '../lib/dates';
import { Icon, type IconName } from '../ui/Icon';
import { invoiceStatus } from './Invoices';

export function HomeScreen() {
  const data = useData();
  const today = todayISO();
  const sToday = salesOn(data.ops, today);

  let recv = 0;
  let credit = 0;
  for (const c of data.customers) {
    const b = data.balances.get(customerAccount(c.id)) ?? 0;
    if (b > 0) recv += b;
    else credit -= b;
  }
  const money = WALLETS.reduce((t, w) => t + (data.balances.get(walletAccount(w)) ?? 0), 0);
  const truckValue = data.items.reduce((t, it) => t + stockValue(it, data.stock.get(it.id) ?? 0), 0);
  const covered = truckValue + recv - credit + money;
  const diff = data.company.balance - covered;

  const days = Array.from({ length: 7 }, (_, i) => addDaysISO(today, i - 6));
  const totals = days.map((d) => salesOn(data.ops, d).total);
  const max = Math.max(1, ...totals);

  const low = data.items.filter((it) => it.minStock > 0 && (data.stock.get(it.id) ?? 0) < it.minStock);
  const temps = data.customers.filter((c) => c.temp && (data.balances.get(customerAccount(c.id)) ?? 0) > 0);
  const alerts: { n: number; title: string; sub: string; to: string; tone: string }[] = [];
  if (data.company.unconfirmed > 0)
    alerts.push({ n: 1, title: 'سدادات بانتظار تأكيد الشركة', sub: `${fmtMoney(data.company.unconfirmed)} بر غير مؤكد بعد`, to: '/company', tone: 'blue' });
  const late = data.customers.filter((c) => customerActivity(data.ops, c.id, today).late);
  if (late.length) alerts.push({ n: late.length, title: 'عملاء متأخرون في السداد', sub: late.map((c) => c.name).join('، '), to: '/customers?f=late', tone: 'red' });
  if (low.length) alerts.push({ n: low.length, title: 'مخزون منخفض في الشاحنة', sub: low.map((i) => i.name).join('، '), to: '/truck', tone: 'grey' });
  if (temps.length) alerts.push({ n: temps.length, title: 'ديون مؤقتة بلا اسم', sub: 'سمِّ أصحابها حتى لا تختلط الديون', to: '/customers?f=temp', tone: 'amber' });

  const recent = data.ops
    .filter((o): o is SaleOp => o.type === 'sale')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 3);

  if (!data.loading && data.items.length === 0) return <Welcome />;

  return (
    <div className="page anim">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div className="h" style={{ width: 46, height: 46, borderRadius: 15, background: 'var(--ink)', color: 'var(--amber)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 20 }}>ن</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="sub">{fmtLongDate(today)}</div>
          <div className="h" style={{ fontSize: 19, fontWeight: 700 }}>أهلًا يا نبيل</div>
        </div>
        <Link className="icbtn" to="/settings" aria-label="الإعدادات">
          <Icon name="settings" />
        </Link>
      </div>

      <Link to="/company" className="hero">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="muted">مديونيتي لشركة SYSCO</span>
          <span className="pill" style={{ background: 'rgba(244,161,0,.18)', color: '#f7c65c' }}>حساب جارٍ</span>
        </div>
        <div className="big num">
          {fmtMoney(data.company.balance)} <span style={{ fontSize: 15, fontWeight: 500, color: '#b9c4d2' }}>بر</span>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <span className="tag">غير مؤكد لدى الشركة <b className="num" style={{ color: '#f7c65c' }}>{fmtMoney(data.company.unconfirmed)}</b></span>
        </div>
        <span className="road" />
      </Link>

      <div className="grid2">
        <Link to="/customers" className="card kpi">
          <span className="sub">ديون العملاء</span>
          <span className="v num">{fmtMoney(recv)}</span>
          {credit > 0 && <span style={{ fontSize: 12, color: 'var(--teal-ink)', fontWeight: 600 }}>أرصدة لصالحهم {fmtMoney(credit)}</span>}
        </Link>
        <Link to="/money" className="card kpi">
          <span className="sub">أموال العمل لديّ</span>
          <span className="v num">{fmtMoney(money)}</span>
          <span style={{ fontSize: 12, color: 'var(--teal-ink)', fontWeight: 600 }}>نقد · CBE · Ebirr</span>
        </Link>
      </div>

      <div className="card pad" style={{ gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div className="sub">مبيعات اليوم</div>
            <div className="num" style={{ fontSize: 26, fontWeight: 700 }}>
              {fmtMoney(sToday.total)} <span className="sub" style={{ fontWeight: 500 }}>بر</span>
            </div>
            <div className="sub num">{sToday.count} فاتورة · نقدًا {fmtMoney(sToday.paid)} · آجل {fmtMoney(sToday.total - sToday.paid)}</div>
          </div>
          <Link className="chip" to="/invoices">الفواتير</Link>
        </div>
        <div className="bars" aria-label="مبيعات آخر 7 أيام">
          {days.map((d, i) => {
            const isToday = d === today;
            const t = totals[i];
            return (
              <div className="col" key={d}>
                <span className="num" style={{ fontSize: 10, color: 'var(--ink2)' }}>{t ? (t >= 100000 ? `${(t / 100000).toFixed(1)}k` : fmtMoney(t)) : '—'}</span>
                <div className="bar" style={{ height: Math.max(6, Math.round((t / max) * 62)), background: isToday ? 'var(--amber)' : t ? 'var(--ink)' : 'var(--line)' }} />
                <span style={{ fontSize: 11, color: 'var(--ink2)', fontWeight: isToday ? 700 : 500 }}>{isToday ? 'اليوم' : shortWeekday(d)}</span>
              </div>
            );
          })}
        </div>
      </div>

      {alerts.length > 0 && (
        <>
          <div className="sec">تحتاج انتباهك</div>
          <div className="card list">
            {alerts.map((a) => (
              <Link key={a.title} to={a.to} className="lrow">
                <span className={`avatar num pill ${a.tone === 'grey' ? '' : a.tone}`} style={{ borderRadius: 13, fontSize: 16, padding: 0 }}>{a.n}</span>
                <span className="grow">
                  <span className="name">{a.title}</span>
                  <span className="meta" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.sub}</span>
                </span>
                <Icon name="chevron" small style={{ color: '#8593a3' }} />
              </Link>
            ))}
          </div>
        </>
      )}

      <div className="sec">اختصارات</div>
      <div className="grid3">
        <QA to="/receive" icon="truck" label="استلام بضاعة" bg="var(--blue-soft)" fg="var(--blue)" />
        <QA to="/collect" icon="down" label="تحصيل" bg="var(--teal-soft)" fg="var(--teal-ink)" />
        <QA to="/pay" icon="up" label="سداد للشركة" bg="var(--amber-soft)" fg="var(--amber-ink)" />
        <QA to="/transfer" icon="swap" label="تحويل" bg="var(--ground)" fg="#33414f" />
        <QA to="/invoices" icon="receipt" label="الفواتير" bg="var(--amber-soft)" fg="var(--amber-ink)" />
        <QA icon="count" label="جرد الشاحنة" bg="var(--ground)" fg="#33414f" soon="المرحلة 4" />
      </div>

      <div className="card pad" style={{ gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 600, fontSize: 15, flex: 1 }}>هل يغطي ما لديّ دين الشركة؟</span>
          <span className="num sub">{fmtMoney(covered)}</span>
        </div>
        <CoverageBar parts={[[truckValue, 'var(--blue)', 'بضاعة الشاحنة'], [recv - credit, 'var(--amber)', 'ديون العملاء'], [money, 'var(--teal)', 'أموال العمل']]} />
        <div style={{ fontSize: 12.5, fontWeight: 600, color: Math.abs(diff) <= 100000 ? 'var(--teal-ink)' : 'var(--red)' }}>
          {Math.abs(diff) < 100
            ? 'مطابق تمامًا لدين الشركة'
            : diff > 0
              ? `ينقص ${fmtMoney(diff)} بر عن الدين — راجع الأسعار أو الإدخالات`
              : `يزيد ${fmtMoney(-diff)} بر عن الدين — غالبًا فروق أسعار بيع`}
        </div>
      </div>

      {recent.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div className="sec" style={{ flex: 1 }}>آخر الفواتير</div>
            <Link to="/invoices" style={{ fontSize: 14, fontWeight: 600, padding: '10px 4px' }}>عرض الكل</Link>
          </div>
          <div className="card list">
            {recent.map((s) => {
              const st = invoiceStatus(s);
              return (
                <Link key={s.id} to={`/invoices/${s.id}`} className="lrow">
                  <span className="grow">
                    <span className="name">{s.customerId ? data.customersById.get(s.customerId)?.name : 'نقدي – بدون عميل'}</span>
                    <span className="meta num">{s.docNo} · {fmtDay(s.date)} · {fmtTime(s.createdAt)}</span>
                  </span>
                  <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    <b className="num">{fmtMoney(linesTotal(s.lines))}</b>
                    <span className={`pill ${st.tone}`}>{st.label}</span>
                  </span>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function QA({ to, icon, label, bg, fg, soon }: { to?: string; icon: IconName; label: string; bg: string; fg: string; soon?: string }) {
  const inner = (
    <>
      <span className="b" style={{ background: bg, color: fg }}><Icon name={icon} /></span>
      {label}
      {soon && <span style={{ fontSize: 10.5, color: 'var(--ink2)', fontWeight: 500 }}>{soon}</span>}
    </>
  );
  return to ? <Link to={to} className="qa">{inner}</Link> : <div className="qa soon" aria-disabled="true">{inner}</div>;
}

function CoverageBar({ parts }: { parts: [number, string, string][] }) {
  const tot = Math.max(1, parts.reduce((t, p) => t + Math.max(0, p[0]), 0));
  return (
    <>
      <div style={{ display: 'flex', height: 14, borderRadius: 7, overflow: 'hidden', gap: 2, background: 'var(--ground)' }}>
        {parts.map(([v, c, l]) => <div key={l} style={{ width: `${(Math.max(0, v) / tot) * 100}%`, background: c }} />)}
      </div>
      <div className="grid3" style={{ gap: 8, fontSize: 12, color: 'var(--ink2)' }}>
        {parts.map(([v, c, l]) => (
          <div key={l} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><i style={{ width: 8, height: 8, borderRadius: 2, background: c }} />{l}</span>
            <b className="num" style={{ color: 'var(--ink)', fontSize: 13 }}>{fmtMoney(v)}</b>
          </div>
        ))}
      </div>
    </>
  );
}

function Welcome() {
  return (
    <div className="page anim" style={{ paddingTop: 40, gap: 18 }}>
      <div className="h" style={{ width: 72, height: 72, borderRadius: 24, background: 'var(--ink)', color: 'var(--amber)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, fontWeight: 800 }}>ن</div>
      <div>
        <h1 className="title" style={{ fontSize: 26 }}>مساعدك على الطريق</h1>
        <p className="sub" style={{ fontSize: 15, lineHeight: 1.7 }}>ابدأ بإضافة أصنافك من شاشة الشاحنة، أو جرّب التطبيق ببيانات تجريبية جاهزة.</p>
      </div>
      <Link className="btn btn-p" to="/truck">إضافة الأصناف</Link>
      <Link className="btn btn-g" to="/settings">تحميل بيانات تجريبية</Link>
    </div>
  );
}
