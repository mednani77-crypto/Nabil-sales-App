import { forwardRef, Fragment } from 'react';
import { fmtMoney } from '../domain/money';
import { fmtDateDMY, I18N, paginate, type Statement } from '../lib/statement';

const bal = (v: number) => (v < 0 ? `(${fmtMoney(-v)})` : fmtMoney(v));

/** A4 pages (794×1123 CSS px) of an account statement. Rendered off-screen for PDF and scaled for preview. */
export const StatementPages = forwardRef<HTMLDivElement, { s: Statement; issued: string }>(function StatementPages({ s, issued }, ref) {
  const L = I18N[s.lang];
  const pages = paginate(s.rows);
  const cols = '84px minmax(0,1fr) 92px 92px 104px';
  const th: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: '#33414f', padding: '9px 10px', background: '#eef1f5' };
  const td: React.CSSProperties = { fontSize: 11.5, padding: '8px 10px', borderBottom: '1px solid #e3e8ef' };
  const num: React.CSSProperties = { fontFamily: "'Alexandria', 'IBM Plex Sans Arabic', sans-serif", fontVariantNumeric: 'tabular-nums' };
  return (
    <div ref={ref} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {pages.map((rows, pi) => {
        const first = pi === 0;
        const last = pi === pages.length - 1;
        return (
          <div key={pi} data-page dir={L.dir} style={{ width: 794, height: 1123, background: '#fff', color: '#0d1b2a', padding: '48px 52px 40px', display: 'flex', flexDirection: 'column', gap: 18, fontFamily: L.font, boxSizing: 'border-box', position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 24 }}>
              <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                <div style={{ width: 50, height: 50, borderRadius: 14, background: '#0d1b2a', color: '#f4a100', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Alexandria', sans-serif", fontWeight: 700, fontSize: 16 }}>SY</div>
                <div><div style={{ fontSize: 15, fontWeight: 700, fontFamily: "'Alexandria', sans-serif" }}>SYSCO ADAWEH</div><div style={{ fontSize: 11, color: '#46566a' }}>Dire Dawa · Addis Ababa</div></div>
              </div>
              <div style={{ textAlign: 'end' }}>
                <div style={{ fontSize: 24, fontWeight: 700 }}>{L.title}</div>
                <div style={{ fontSize: 11, color: '#46566a', marginTop: 4 }}>{L.issued}: <span style={num}>{fmtDateDMY(issued)}</span></div>
              </div>
            </div>
            <div style={{ height: 3, background: '#0d1b2a', borderRadius: 2, position: 'relative' }}><div style={{ position: 'absolute', insetInlineStart: 0, top: 0, height: 3, width: 120, background: '#f4a100' }} /></div>

            {first && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 12 }}>
                  <Box label={L.holder} value={<span style={{ fontFamily: "'IBM Plex Sans Arabic', sans-serif" }}>{s.holder}</span>} sub={s.holderSub} />
                  <Box label={L.period} value={<span style={num}>{fmtDateDMY(s.from)} — {fmtDateDMY(s.to)}</span>} />
                  <Box label={L.currency} value={L.currencyValue} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', background: '#f6f8fb', borderRadius: 10, padding: '11px 14px', fontSize: 12.5, fontWeight: 600 }}>
                  <span>{L.carried}</span><span style={{ ...num, fontSize: 14 }}>{bal(s.carried)}</span>
                </div>
              </>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: cols, border: '1px solid #dce2ea', borderRadius: 10, overflow: 'hidden' }}>
              <span style={th}>{L.date}</span><span style={th}>{L.desc}</span><span style={{ ...th, textAlign: 'end' }}>{L.debit}</span><span style={{ ...th, textAlign: 'end' }}>{L.credit}</span><span style={{ ...th, textAlign: 'end' }}>{L.balance}</span>
              {rows.map((r, i) => (
                <Row key={i} cells={[
                  <span style={{ ...td, ...num }}>{r.date}</span>,
                  <span style={td}>{r.desc}{r.pending ? ' *' : ''}</span>,
                  <span style={{ ...td, ...num, textAlign: 'end' }}>{r.debit ? fmtMoney(r.debit) : ''}</span>,
                  <span style={{ ...td, ...num, textAlign: 'end' }}>{r.credit ? fmtMoney(r.credit) : ''}</span>,
                  <span style={{ ...td, ...num, textAlign: 'end', fontWeight: 700 }}>{bal(r.balance)}</span>,
                ]} />
              ))}
              {s.rows.length === 0 && <span style={{ ...td, gridColumn: '1 / -1', textAlign: 'center', color: '#46566a' }}>{L.empty}</span>}
            </div>

            {last && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 12 }}>
                  <Total label={L.totalDebit} value={fmtMoney(s.totalDebit)} />
                  <Total label={L.totalCredit} value={fmtMoney(s.totalCredit)} />
                  <Total label={L.closing} value={bal(s.closing)} dark />
                </div>
                <div style={{ fontSize: 10.5, color: '#46566a', display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {s.hasPending && <span>{L.pendingNote}</span>}
                  <span>{L.creditNote}</span>
                </div>
              </>
            )}

            <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', fontSize: 10.5, color: '#46566a' }}>
              {last ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
                  <span>{L.preparedBy}: <b style={{ color: '#0d1b2a', fontFamily: "'IBM Plex Sans Arabic', sans-serif" }}>نبيل عادل</b></span>
                  <span style={{ borderTop: '1px solid #8593a3', width: 200 }} />
                </div>
              ) : <span />}
              <span style={num}>{L.page} {pi + 1} / {pages.length}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
});

function Row({ cells }: { cells: React.ReactNode[] }) {
  return <>{cells.map((c, i) => <Fragment key={i}>{c}</Fragment>)}</>;
}

function Box({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div style={{ border: '1px solid #dce2ea', borderRadius: 10, padding: '11px 14px' }}>
      <div style={{ fontSize: 10.5, color: '#46566a' }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, marginTop: 3 }}>{value}</div>
      {sub && <div style={{ fontSize: 10.5, color: '#46566a' }}>{sub}</div>}
    </div>
  );
}

function Total({ label, value, dark }: { label: string; value: string; dark?: boolean }) {
  return (
    <div style={{ background: dark ? '#0d1b2a' : '#f6f8fb', color: dark ? '#fff' : undefined, borderRadius: 10, padding: '11px 14px' }}>
      <div style={{ fontSize: 10.5, color: dark ? '#b9c4d2' : '#46566a' }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 700, marginTop: 2, fontFamily: "'Alexandria', sans-serif" }}>{value}</div>
    </div>
  );
}
