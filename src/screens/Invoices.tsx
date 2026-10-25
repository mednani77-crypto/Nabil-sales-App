import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useData } from '../hooks/useData';
import { fmtMoney } from '../domain/money';
import { linesTotal } from '../domain/postings';
import type { PayMode, SaleOp } from '../domain/types';
import { fmtDate, fmtDay, fmtTime } from '../lib/dates';
import { destinationLabel, PAY_MODE_LABEL } from '../lib/labels';
import { Icon } from '../ui/Icon';
import { SearchField, TopBar, useToast } from '../ui/kit';

export function invoiceStatus(s: SaleOp): { label: string; tone: string } {
  const rem = linesTotal(s.lines) - s.paid;
  if (rem <= 0) return { label: 'مدفوعة', tone: 'teal' };
  if (s.paid > 0) return { label: 'جزئي', tone: 'amber' };
  return { label: 'آجل', tone: 'red' };
}

export function InvoicesScreen() {
  const data = useData();
  const [q, setQ] = useState('');
  const [f, setF] = useState<'all' | PayMode>('all');
  const name = (s: SaleOp) => (s.customerId ? data.customersById.get(s.customerId)?.name ?? '' : 'نقدي – بدون عميل');
  const list = data.ops
    .filter((o): o is SaleOp => o.type === 'sale')
    .filter((s) => (f === 'all' || s.payMode === f) && (!q.trim() || s.docNo.includes(q.trim()) || name(s).includes(q.trim())))
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  const sum = list.reduce((t, s) => t + linesTotal(s.lines), 0);

  return (
    <div className="anim">
      <TopBar title="الفواتير">
        <span className="num sub">{fmtMoney(sum)} بر</span>
      </TopBar>
      <div className="page" style={{ paddingTop: 4 }}>
        <SearchField value={q} onChange={setQ} placeholder="ابحث برقم الفاتورة أو اسم العميل" label="بحث في الفواتير" />
        <div className="hs">
          {(['all', 'cash', 'credit', 'partial'] as const).map((k) => (
            <button key={k} className={`chip${f === k ? ' on' : ''}`} onClick={() => setF(k)}>{k === 'all' ? 'الكل' : PAY_MODE_LABEL[k]}</button>
          ))}
        </div>
        <div className="card list">
          {list.map((s) => {
            const st = invoiceStatus(s);
            return (
              <Link key={s.id} to={`/invoices/${s.id}`} className="lrow">
                <span className="avatar"><Icon name="receipt" small /></span>
                <span className="grow">
                  <span className="name">{name(s)}</span>
                  <span className="meta num">{s.docNo} · {fmtDay(s.date)} · {fmtTime(s.createdAt)} · {s.lines.length} سطر</span>
                </span>
                <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                  <b className="num">{fmtMoney(linesTotal(s.lines))}</b>
                  <span className={`pill ${st.tone}`}>{st.label}</span>
                </span>
              </Link>
            );
          })}
          {list.length === 0 && <div style={{ padding: 28, textAlign: 'center', color: 'var(--ink2)' }}>لا توجد فواتير مطابقة</div>}
        </div>
      </div>
    </div>
  );
}

export function InvoiceDetailScreen() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const done = params.get('done') === '1';
  const data = useData();
  const nav = useNavigate();
  const toast = useToast();
  const s = data.ops.find((o): o is SaleOp => o.type === 'sale' && o.id === id);
  if (!s) return data.loading ? null : <div className="page"><TopBar title="فاتورة" /><p className="sub">الفاتورة غير موجودة</p></div>;

  const total = linesTotal(s.lines);
  const st = invoiceStatus(s);
  const cust = s.customerId ? data.customersById.get(s.customerId) : undefined;

  return (
    <div className="anim">
      {done ? (
        <div className="page" style={{ paddingTop: 28, alignItems: 'stretch' }}>
          <div className="pop" style={{ width: 76, height: 76, borderRadius: 26, background: 'var(--teal)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', alignSelf: 'center' }}>
            <Icon name="check" style={{ width: 40, height: 40, strokeWidth: 2.4 }} />
          </div>
          <div style={{ textAlign: 'center' }}>
            <div className="h" style={{ fontSize: 21, fontWeight: 700 }}>تم حفظ الفاتورة <span className="num">{s.docNo}</span></div>
            <div className="sub" style={{ marginTop: 4 }}>{cust?.name ?? 'بيع نقدي'} · خُصمت الكميات من الشاحنة</div>
          </div>
        </div>
      ) : (
        <TopBar title={<>فاتورة <span className="num">{s.docNo}</span></>}>
          <span className={`pill ${st.tone}`}>{st.label}</span>
        </TopBar>
      )}
      <div className="page" style={{ paddingTop: 4 }}>
        <div className="card pad" style={{ padding: 18, gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }} className="sub">
            <span>{cust ? <Link to={`/customers/${cust.id}`}>{cust.name}</Link> : 'نقدي – بدون عميل'}</span>
            <span className="num">{fmtDate(s.date)} · {fmtTime(s.createdAt)}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto auto', gap: '8px 12px', fontSize: 13, alignItems: 'baseline' }}>
            <span className="lbl">الصنف</span>
            <span className="lbl">الكمية × السعر</span>
            <span className="lbl" style={{ textAlign: 'left' }}>الإجمالي</span>
            {s.lines.map((l, i) => (
              <Line key={i} n={`${l.itemName} (${l.unitName})`} q={`${l.qty} × ${fmtMoney(l.unitPrice)}`} t={fmtMoney(l.qty * l.unitPrice)} />
            ))}
          </div>
          <div style={{ borderTop: '1px dashed var(--line2)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14 }}>
            <Row label="الإجمالي" value={fmtMoney(total)} big />
            <Row label={`المدفوع (${PAY_MODE_LABEL[s.payMode]})`} value={fmtMoney(s.paid)} color="var(--teal-ink)" />
            <Row label="المتبقي" value={fmtMoney(total - s.paid)} color="var(--red)" />
            {s.paid > 0 && <div className="sub">وصل المدفوع إلى: {destinationLabel(s.destination)}</div>}
          </div>
          <div className="sub" style={{ fontSize: 12 }}>الأسعار محفوظة كما كانت وقت البيع، ولا تتغير بتغيّر الأسعار لاحقًا.</div>
        </div>
        <div className="grid2" style={{ gap: 8 }}>
          <button className="btn btn-g" onClick={() => shareInvoice(s, cust?.name, toast)}>
            <Icon name="chat" small style={{ color: 'var(--teal)' }} />
            مشاركة واتساب
          </button>
          <button className="btn btn-g" onClick={() => window.print()}>
            <Icon name="file" small />
            طباعة / PDF
          </button>
        </div>
        {done && (
          <>
            <button className="btn btn-p" style={{ minHeight: 56 }} onClick={() => nav('/sale', { replace: true })}>
              <Icon name="plus" />
              فاتورة جديدة
            </button>
            <Link className="btn btn-g" to="/">العودة للرئيسية</Link>
          </>
        )}
      </div>
    </div>
  );
}

function Line({ n, q, t }: { n: string; q: string; t: string }) {
  return (
    <>
      <span style={{ fontWeight: 600 }}>{n}</span>
      <span className="num sub">{q}</span>
      <b className="num" style={{ textAlign: 'left' }}>{t}</b>
    </>
  );
}

function Row({ label, value, color, big }: { label: string; value: string; color?: string; big?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', color }}>
      <span>{label}</span>
      <b className="num" style={{ fontSize: big ? 18 : undefined }}>{value}</b>
    </div>
  );
}

/** Text summary via the phone's share sheet (WhatsApp etc.). PDF attachment comes in phase 6. */
async function shareInvoice(s: SaleOp, customer: string | undefined, toast: (m: string, e?: boolean) => void) {
  const total = linesTotal(s.lines);
  const text = [
    `فاتورة #${s.docNo} — ${fmtDate(s.date)}`,
    customer ? `العميل: ${customer}` : '',
    ...s.lines.map((l) => `• ${l.itemName}: ${l.qty} ${l.unitName} × ${fmtMoney(l.unitPrice)} = ${fmtMoney(l.qty * l.unitPrice)}`),
    `الإجمالي: ${fmtMoney(total)} بر`,
    `المدفوع: ${fmtMoney(s.paid)} · المتبقي: ${fmtMoney(total - s.paid)}`,
  ]
    .filter(Boolean)
    .join('\n');
  try {
    if (navigator.share) await navigator.share({ text });
    else window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  } catch {
    /* user cancelled the share sheet */
  }
  void toast;
}
