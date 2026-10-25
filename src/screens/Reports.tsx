import { useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useData } from '../hooks/useData';
import { fmtMoney } from '../domain/money';
import { customerAccount, type AccountKey } from '../domain/types';
import { addDaysISO, fmtDate, todayISO } from '../lib/dates';
import { buildExcel, reportTables } from '../lib/excel';
import { pagesToPdf, saveOrShare } from '../lib/files';
import { buildStatement, LANGS, type Lang } from '../lib/statement';
import { Icon } from '../ui/Icon';
import { TopBar, useToast } from '../ui/kit';
import { StatementPages } from '../ui/StatementPages';

type Period = 'today' | 'week' | 'month' | 'lastMonth' | 'all' | 'custom';

function periodRange(p: Period, from: string, to: string, earliest: string): [string, string] {
  const t = todayISO();
  const monthStart = t.slice(0, 8) + '01';
  if (p === 'today') return [t, t];
  if (p === 'week') return [addDaysISO(t, -6), t];
  if (p === 'month') return [monthStart, t];
  if (p === 'lastMonth') {
    const end = addDaysISO(monthStart, -1);
    return [end.slice(0, 8) + '01', end];
  }
  if (p === 'all') return [earliest, t];
  return [from || earliest, to || t];
}

function PeriodPicker({ period, setPeriod, from, to, setFrom, setTo }: { period: Period; setPeriod: (p: Period) => void; from: string; to: string; setFrom: (v: string) => void; setTo: (v: string) => void }) {
  return (
    <>
      <div className="hs">
        {([['today', 'اليوم'], ['week', 'آخر 7 أيام'], ['month', 'هذا الشهر'], ['lastMonth', 'الشهر الماضي'], ['all', 'منذ البداية'], ['custom', 'من — إلى']] as [Period, string][]).map(([k, l]) => (
          <button key={k} className={`chip${period === k ? ' on' : ''}`} onClick={() => setPeriod(k)}>{l}</button>
        ))}
      </div>
      {period === 'custom' && (
        <div className="grid2" style={{ gap: 8 }}>
          <label className="field"><span className="lbl">من</span><input className="inp num" type="date" value={from} max={to || todayISO()} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="field"><span className="lbl">إلى</span><input className="inp num" type="date" value={to} max={todayISO()} onChange={(e) => setTo(e.target.value)} /></label>
        </div>
      )}
    </>
  );
}

export function ReportsScreen() {
  const data = useData();
  const toast = useToast();
  const [params] = useSearchParams();
  const [tab, setTab] = useState<'statement' | 'reports'>(params.get('tab') === 'reports' ? 'reports' : 'statement');
  const [acct, setAcct] = useState<string>(params.get('acct') || 'company');
  const [period, setPeriod] = useState<Period>('month');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [lang, setLang] = useState<Lang>('ar');
  const [busy, setBusy] = useState(false);
  const pagesRef = useRef<HTMLDivElement>(null);

  const earliest = useMemo(() => data.ops.reduce((m, o) => (o.date < m ? o.date : m), todayISO()), [data.ops]);
  const [rFrom, rTo] = periodRange(period, from, to, earliest);
  const account: AccountKey = acct === 'company' ? 'company' : customerAccount(acct);
  const statement = useMemo(() => buildStatement(data.ops, account, rFrom, rTo, lang, data.customersById), [data.ops, account, rFrom, rTo, lang, data.customersById]);
  const tables = useMemo(() => (tab === 'reports' ? reportTables(data.ops, data.items, data.customers, rFrom, rTo, todayISO()) : null), [tab, data.ops, data.items, data.customers, rFrom, rTo]);

  const width = Math.min(window.innerWidth, 560) - 32;
  const scale = width / 794;
  const pageCount = Math.max(1, Math.ceil(Math.max(0, statement.rows.length - 16) / 24) + 1);

  async function pdf() {
    if (!pagesRef.current) return;
    setBusy(true);
    try {
      const pages = [...pagesRef.current.querySelectorAll<HTMLElement>('[data-page]')];
      const blob = await pagesToPdf(pages);
      const who = acct === 'company' ? 'company' : 'customer';
      const r = await saveOrShare(blob, `statement-${who}-${rFrom}-${rTo}-${lang}.pdf`, 'كشف حساب');
      if (r !== 'cancelled') toast(r === 'shared' ? 'جاهز — اختر واتساب أو أي تطبيق' : 'نُزّل ملف PDF');
    } catch (e) {
      toast('تعذّر إنشاء PDF: ' + (e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }

  async function excel() {
    setBusy(true);
    try {
      const blob = await buildExcel(reportTables(data.ops, data.items, data.customers, rFrom, rTo, todayISO()));
      const r = await saveOrShare(blob, `nabil-report-${rFrom}-${rTo}.xlsx`, 'تقرير Excel');
      if (r !== 'cancelled') toast(r === 'shared' ? 'جاهز — اختر أين تحفظه أو ترسله' : 'نُزّل ملف Excel');
    } catch (e) {
      toast('تعذّر إنشاء Excel: ' + (e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="anim">
      <TopBar title="الكشوف والتقارير" />
      <div className="page" style={{ paddingTop: 4 }}>
        <div className="seg" style={{ gridTemplateColumns: 'repeat(2,minmax(0,1fr))', background: 'var(--line)' }}>
          <button className={tab === 'statement' ? 'on' : ''} onClick={() => setTab('statement')}>كشف حساب PDF</button>
          <button className={tab === 'reports' ? 'on' : ''} onClick={() => setTab('reports')}>تقارير و Excel</button>
        </div>

        {tab === 'statement' && (
          <>
            <span className="lbl" style={{ margin: '0 4px' }}>الحساب</span>
            <div className="hs">
              <button className={`chip${acct === 'company' ? ' on' : ''}`} onClick={() => setAcct('company')}>حسابي مع الشركة</button>
              {data.customers.map((c) => (
                <button key={c.id} className={`chip${acct === c.id ? ' on' : ''}`} onClick={() => setAcct(c.id)}>{c.name}</button>
              ))}
            </div>
            <span className="lbl" style={{ margin: '0 4px' }}>الفترة</span>
            <PeriodPicker period={period} setPeriod={setPeriod} from={from} to={to} setFrom={setFrom} setTo={setTo} />
            <span className="lbl" style={{ margin: '0 4px' }}>لغة الكشف</span>
            <div className="hs">
              {LANGS.map((l) => (
                <button key={l.code} className={`chip${lang === l.code ? ' on' : ''}`} onClick={() => setLang(l.code)} style={l.code === 'am' ? { fontFamily: "'Noto Sans Ethiopic', sans-serif" } : undefined}>{l.name}</button>
              ))}
            </div>
            <div className="card pad num" style={{ gap: 4, fontSize: 13 }}>
              <span className="sub">{fmtDate(rFrom)} — {fmtDate(rTo)} · {statement.rows.length} حركة · {pageCount} صفحة</span>
              <span>المرحّل <b>{fmtMoney(statement.carried)}</b> · الختامي <b>{fmtMoney(statement.closing)}</b></span>
            </div>
            <div style={{ width, height: pageCount * 1123 * scale + (pageCount - 1) * 24 * scale, overflow: 'hidden', borderRadius: 6, boxShadow: '0 1px 2px rgba(13,27,42,.08), 0 12px 32px rgba(13,27,42,.12)' }}>
              <div style={{ transform: `scale(${scale})`, transformOrigin: 'top right', width: 794 }}>
                <StatementPages ref={pagesRef} s={statement} issued={todayISO()} />
              </div>
            </div>
            <div className="note amber" style={{ fontSize: 12 }}>ترجمة الصومالية والأمهرية والأورومية تحتاج مراجعة متحدث أصلي قبل الاستخدام الرسمي.</div>
          </>
        )}

        {tab === 'reports' && tables && (
          <>
            <PeriodPicker period={period} setPeriod={setPeriod} from={from} to={to} setFrom={setFrom} setTo={setTo} />
            <span className="sub num" style={{ padding: '0 4px' }}>{fmtDate(rFrom)} — {fmtDate(rTo)}</span>
            {Object.entries(tables).map(([name, rows]) => (
              <ReportCard key={name} name={name} rows={rows} />
            ))}
          </>
        )}
      </div>
      <div className="foot">
        {tab === 'statement' ? (
          <button className="btn btn-p btn-block" style={{ minHeight: 56 }} disabled={busy} onClick={pdf}>
            <Icon name="file" />
            {busy ? 'جارٍ التجهيز…' : 'PDF — حفظ أو مشاركة'}
          </button>
        ) : (
          <button className="btn btn-d btn-block" style={{ minHeight: 56 }} disabled={busy} onClick={excel}>
            <Icon name="down" />
            {busy ? 'جارٍ التجهيز…' : 'تصدير كل التقارير إلى Excel'}
          </button>
        )}
      </div>
    </div>
  );
}

function ReportCard({ name, rows }: { name: string; rows: (string | number)[][] }) {
  const [open, setOpen] = useState(false);
  const body = rows.slice(1);
  const show = open ? body : body.slice(0, 4);
  const cols = rows[0];
  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <button onClick={() => setOpen(!open)} style={{ width: '100%', border: 0, background: 'transparent', display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', cursor: 'pointer', textAlign: 'right' }}>
        <b style={{ flex: 1, fontSize: 15 }}>{name}</b>
        <span className="pill grey num">{body.length}</span>
        <Icon name="chevron" small style={{ transform: open ? 'rotate(-90deg)' : 'none', color: '#8593a3' }} />
      </button>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
          <thead>
            <tr>{cols.map((c, i) => <th key={i} style={{ textAlign: 'right', padding: '8px 10px', background: 'var(--soft)', color: 'var(--ink2)', whiteSpace: 'nowrap' }}>{c}</th>)}</tr>
          </thead>
          <tbody>
            {show.map((r, i) => (
              <tr key={i}>{r.map((c, j) => <td key={j} className="num" style={{ padding: '8px 10px', borderTop: '1px solid #eef1f5', whiteSpace: 'nowrap' }}>{typeof c === 'number' ? fmtMoney(Math.round(c * 100)) : c}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
      {body.length > 4 && !open && <button className="chip" style={{ margin: 10 }} onClick={() => setOpen(true)}>عرض الكل ({body.length})</button>}
      {body.length === 0 && <div className="sub" style={{ padding: '0 16px 14px' }}>لا توجد بيانات في هذه الفترة</div>}
    </div>
  );
}
