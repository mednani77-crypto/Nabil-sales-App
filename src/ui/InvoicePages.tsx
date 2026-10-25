import { forwardRef } from 'react';
import { fmtMoney } from '../domain/money';
import { linesTotal } from '../domain/postings';
import type { SaleOp } from '../domain/types';
import { INV, invDir, invFont } from '../lib/invoiceDoc';
import { fmtDateDMY, I18N as ST, paginate, type Lang } from '../lib/statement';

/** A4 pages (794×1123 CSS px) of a sales invoice, rendered off-screen and turned into a PDF. */
export const InvoicePages = forwardRef<HTMLDivElement, { s: SaleOp; customer?: string; phone?: string; lang: Lang; voided?: boolean }>(function InvoicePages({ s, customer, phone, lang, voided }, ref) {
  const L = INV[lang];
  const pages = paginate(s.lines, 18, 26);
  const total = linesTotal(s.lines);
  const cols = '36px minmax(0,1fr) 120px 110px 120px';
  const num: React.CSSProperties = { fontFamily: "'Alexandria', 'IBM Plex Sans Arabic', sans-serif", fontVariantNumeric: 'tabular-nums' };
  const th: React.CSSProperties = { fontSize: 11.5, fontWeight: 700, color: '#33414f', padding: '10px 10px', background: '#eef1f5' };
  const td: React.CSSProperties = { fontSize: 12.5, padding: '10px 10px', borderBottom: '1px solid #e3e8ef' };
  const name: React.CSSProperties = { fontFamily: "'IBM Plex Sans Arabic', sans-serif" };
  let n = 0;
  return (
    <div ref={ref} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {pages.map((lines, pi) => {
        const first = pi === 0;
        const last = pi === pages.length - 1;
        return (
          <div key={pi} data-page dir={invDir(lang)} style={{ width: 794, height: 1123, background: '#fff', color: '#0d1b2a', padding: '48px 52px 40px', display: 'flex', flexDirection: 'column', gap: 20, fontFamily: invFont(lang), boxSizing: 'border-box', position: 'relative', overflow: 'hidden' }}>
            {voided && <div style={{ position: 'absolute', top: 420, insetInline: 0, textAlign: 'center', fontSize: 110, fontWeight: 800, color: 'rgba(163,42,32,.12)', transform: 'rotate(-18deg)' }}>{L.voided}</div>}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 24 }}>
              <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                <div style={{ width: 52, height: 52, borderRadius: 14, background: '#0d1b2a', color: '#f4a100', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Alexandria', sans-serif", fontWeight: 700, fontSize: 17 }}>SY</div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "'Alexandria', sans-serif" }}>SYSCO ADAWEH</div>
                  <div style={{ fontSize: 11.5, color: '#46566a' }}>Dire Dawa · Addis Ababa</div>
                  <div style={{ fontSize: 11.5, color: '#46566a' }}>{L.seller}: <span style={name}>نبيل عادل</span></div>
                </div>
              </div>
              <div style={{ textAlign: 'end' }}>
                <div style={{ fontSize: 26, fontWeight: 700 }}>{L.title}</div>
                <div style={{ ...num, fontSize: 18, fontWeight: 700, color: '#f4a100', marginTop: 2 }}>{s.docNo}</div>
              </div>
            </div>
            <div style={{ height: 3, background: '#0d1b2a', borderRadius: 2, position: 'relative' }}><div style={{ position: 'absolute', insetInlineStart: 0, top: 0, height: 3, width: 120, background: '#f4a100' }} /></div>

            {first && (
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12 }}>
                <Box label={L.customer} value={<span style={name}>{customer ?? L.cashCustomer}</span>} sub={phone} />
                <Box label={L.date} value={<span style={num}>{fmtDateDMY(s.date)}</span>} />
                <Box label={L.status} value={L.mode[s.payMode]} />
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: cols, border: '1px solid #dce2ea', borderRadius: 10, overflow: 'hidden' }}>
              <span style={th}>#</span><span style={th}>{L.item}</span><span style={{ ...th, textAlign: 'end' }}>{L.qty}</span><span style={{ ...th, textAlign: 'end' }}>{L.price}</span><span style={{ ...th, textAlign: 'end' }}>{L.amount}</span>
              {lines.map((l) => {
                n += 1;
                return [
                  <span key={`${n}a`} style={{ ...td, ...num, color: '#8593a3' }}>{n}</span>,
                  <span key={`${n}b`} style={{ ...td, ...name, fontWeight: 600 }}>{l.itemName}</span>,
                  <span key={`${n}c`} style={{ ...td, textAlign: 'end' }}><span style={num}>{l.qty}</span> <span style={name}>{l.unitName}</span></span>,
                  <span key={`${n}d`} style={{ ...td, ...num, textAlign: 'end' }}>{fmtMoney(l.unitPrice)}</span>,
                  <span key={`${n}e`} style={{ ...td, ...num, textAlign: 'end', fontWeight: 700 }}>{fmtMoney(l.qty * l.unitPrice)}</span>,
                ];
              })}
            </div>

            {last && (
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <div style={{ width: 330, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <Sum label={L.total} value={`${fmtMoney(total)} ${L.currency}`} dark />
                  <Sum label={`${L.paid} (${L.mode[s.payMode]})`} value={fmtMoney(s.paid)} color="#0a7c6e" />
                  {total - s.paid > 0 && <Sum label={L.remaining} value={`${fmtMoney(total - s.paid)} ${L.currency}`} color="#a32a20" />}
                </div>
              </div>
            )}

            <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', fontSize: 11, color: '#46566a' }}>
              {last ? <span style={{ fontSize: 13, fontWeight: 600, color: '#0d1b2a' }}>{L.thanks}</span> : <span />}
              <span style={num}>{ST[lang].page} {pi + 1} / {pages.length}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
});

function Box({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div style={{ border: '1px solid #dce2ea', borderRadius: 10, padding: '11px 14px' }}>
      <div style={{ fontSize: 11, color: '#46566a' }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, marginTop: 3 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#46566a', fontFamily: "'Alexandria', sans-serif" }}>{sub}</div>}
    </div>
  );
}

function Sum({ label, value, dark, color }: { label: string; value: string; dark?: boolean; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: dark ? '#0d1b2a' : '#f6f8fb', color: dark ? '#fff' : color, borderRadius: 10, padding: '11px 16px' }}>
      <span style={{ fontSize: 12.5, fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: dark ? 19 : 15, fontWeight: 700, fontFamily: "'Alexandria', sans-serif" }}>{value}</span>
    </div>
  );
}
