import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { db } from '../db/db';
import { DomainError, saveCollection, saveCompanyPayment, saveTransfer } from '../db/repo';
import { useData } from '../hooks/useData';
import { customerActivity, findSimilarTransfers } from '../domain/moneyOps';
import { fmtMoney, parseBirr, toBirrInput } from '../domain/money';
import { linesTotal } from '../domain/postings';
import { COMPANY_BANKS, walletAccount, WALLETS, type CompanyBank, type PayDestination, type SaleOp, type WalletKey } from '../domain/types';
import { fmtDate, fmtDay, todayISO } from '../lib/dates';
import { BANK_LABEL, WALLET_LABEL, WALLET_SHORT } from '../lib/labels';
import { Icon } from '../ui/Icon';
import { TopBar, useToast } from '../ui/kit';
import { CustomerPicker } from '../ui/pickers';
import { fmtBalance } from './LineForms';
import { WalletBadge } from './People';

function AmountField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="field">
      <span className="lbl">{label}</span>
      <input className="inp num" inputMode="decimal" placeholder="0" value={value} onChange={(e) => onChange(e.target.value)} style={{ fontSize: 24, fontWeight: 700, minHeight: 60 }} />
    </label>
  );
}

function BankChips({ bank, setBank }: { bank: CompanyBank; setBank: (b: CompanyBank) => void }) {
  return (
    <div className="chips">
      {COMPANY_BANKS.map((b) => (
        <button key={b} className={`chip${bank === b ? ' on' : ''}`} onClick={() => setBank(b)}>{BANK_LABEL[b]}</button>
      ))}
    </div>
  );
}

function DuplicateWarning({ items, onForce }: { items: { date: string; amount: number; bank: CompanyBank; ref?: string }[]; onForce: () => void }) {
  return (
    <div className="note red" style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 14, borderRadius: 16 }}>
      <b style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Icon name="alert" small />حوالة مشابهة مسجلة مسبقًا</b>
      {items.slice(0, 3).map((x, i) => (
        <span key={i} className="num">
          {fmtDate(x.date)} · {BANK_LABEL[x.bank]} · {fmtMoney(x.amount)} بر{x.ref ? ` · ${x.ref}` : ''}
        </span>
      ))}
      <span>نفس الرقم المرجعي، أو نفس المبلغ والبنك في اليوم نفسه. تأكد أنها ليست مكررة.</span>
      <button className="btn btn-g" onClick={onForce}>ليست مكررة — احفظ</button>
    </div>
  );
}

/* ================= COLLECT ================= */
type Method = WalletKey | 'company';
const METHODS: [Method, string, string, string, string, string][] = [
  ['cash', 'نقدًا في يدي', 'يزيد النقد لديك', 'نقد', 'var(--teal-soft)', 'var(--teal-ink)'],
  ['cbe', 'حسابي CBE', 'يزيد أموال العمل في CBE', 'CBE', '#f3e6ee', '#6a1b4d'],
  ['ebirr', 'حسابي Ebirr', 'يزيد أموال العمل في Ebirr', 'eB', 'var(--blue-soft)', 'var(--blue)'],
  ['company', 'حساب الشركة مباشرة', 'يُحتسب سدادًا للشركة تلقائيًا', 'SY', 'var(--ink)', 'var(--amber)'],
];

export function CollectScreen() {
  const data = useData();
  const nav = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const [customerId, setCustomerId] = useState<string | null>(params.get('customer'));
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<Method>('cash');
  const [bank, setBank] = useState<CompanyBank>('cbe');
  const [ref, setRef] = useState('');
  const [invoiceOpId, setInvoiceOpId] = useState<string>('');
  const [picker, setPicker] = useState(false);
  const [dupOk, setDupOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const today = todayISO();

  const customer = customerId ? data.customersById.get(customerId) : undefined;
  const act = customer ? customerActivity(data.ops, customer.id, today) : null;
  const amt = parseBirr(amount) ?? 0;
  const dups = method === 'company' && amt > 0 && !dupOk ? findSimilarTransfers(data.ops, { bank, amount: amt, ref, date: today }) : [];
  const openInvoices = customer
    ? data.ops
        .filter((o): o is SaleOp => o.type === 'sale' && o.customerId === customer.id && linesTotal(o.lines) > o.paid)
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 6)
    : [];

  async function save(force = false) {
    if (dups.length && !force) return toast('راجع تنبيه الحوالة المشابهة أولًا', true);
    const destination: PayDestination = method === 'company' ? { kind: 'company', bank } : { kind: 'wallet', wallet: method };
    setBusy(true);
    try {
      await saveCollection(db, { customerId, amount: amt, destination, ref: method === 'cash' ? undefined : ref, invoiceOpId: invoiceOpId || undefined }, today);
      toast(method === 'company' ? 'تم التحصيل وسُجّل كسداد للشركة مرة واحدة' : `تم التحصيل وأُضيف إلى ${WALLET_LABEL[method]}`);
      nav(-1);
    } catch (e) {
      toast(e instanceof DomainError ? e.errors.join('\n') : 'تعذّر الحفظ', true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="anim">
      <TopBar title="تسجيل تحصيل من عميل" />
      <div className="page" style={{ paddingTop: 4 }}>
        <button className="card" onClick={() => setPicker(true)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', textAlign: 'right', cursor: 'pointer', minHeight: 64 }}>
          <span className="avatar"><Icon name="user" /></span>
          <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontWeight: 600 }}>{customer ? customer.name : 'اختر العميل'}</span>
            <span className="sub num">{act ? `الرصيد: ${fmtBalance(act.balance)}` : 'التحصيل يُخصم من إجمالي رصيده افتراضيًا'}</span>
          </span>
          <span style={{ fontSize: 13, color: 'var(--blue)', fontWeight: 600 }}>{customer ? 'تغيير' : 'اختيار'}</span>
        </button>

        <div className="card pad">
          <AmountField label="المبلغ المستلم (بر)" value={amount} onChange={(v) => { setAmount(v); setDupOk(false); }} />
          <div className="hs">
            {act && act.balance > 0 && (
              <button className="chip" style={{ fontSize: 13 }} onClick={() => setAmount(toBirrInput(act.balance))}>كامل الرصيد <span className="num">{fmtMoney(act.balance)}</span></button>
            )}
            {[5000, 10000, 20000].map((v) => (
              <button key={v} className="chip num" style={{ fontSize: 13 }} onClick={() => setAmount(String(v))}>{fmtMoney(v * 100)}</button>
            ))}
          </div>
        </div>

        <span className="lbl" style={{ margin: '0 4px' }}>كيف وصل المبلغ؟</span>
        {METHODS.map(([k, label, sub, tag, bg, fg]) => {
          const on = method === k;
          return (
            <button key={k} role="radio" aria-checked={on} onClick={() => { setMethod(k); setDupOk(false); }} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: on ? '11px 13px' : '12px 14px', minHeight: 60, textAlign: 'right', cursor: 'pointer', border: on ? '2px solid var(--ink)' : undefined, background: on ? 'var(--soft)' : undefined }}>
              <span className="avatar h" style={{ background: bg, color: fg, fontSize: 12 }}>{tag}</span>
              <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontWeight: 600, fontSize: 14.5 }}>{label}</span>
                <span className="sub" style={{ fontSize: 12 }}>{sub}</span>
              </span>
              <span style={{ width: 22, height: 22, borderRadius: '50%', border: '2px solid var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {on && <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--ink)' }} />}
              </span>
            </button>
          );
        })}

        {method === 'company' && (
          <div className="card pad">
            <span className="lbl">حساب الشركة المستلم</span>
            <BankChips bank={bank} setBank={(b) => { setBank(b); setDupOk(false); }} />
            <div className="note blue">ينخفض دين العميل، ويُسجَّل نفس المبلغ كسداد للشركة في حسابك — عملية واحدة دون احتساب مرتين.</div>
          </div>
        )}
        {method !== 'cash' && (
          <label className="field">
            <span className="lbl">الرقم المرجعي للحوالة (اختياري)</span>
            <input className="inp num" dir="ltr" style={{ textAlign: 'right' }} placeholder="FT26298…" value={ref} onChange={(e) => { setRef(e.target.value); setDupOk(false); }} />
          </label>
        )}

        {openInvoices.length > 0 && (
          <>
            <span className="lbl" style={{ margin: '0 4px' }}>ربط بفاتورة (اختياري)</span>
            <div className="hs">
              <button className={`chip${!invoiceOpId ? ' on' : ''}`} onClick={() => setInvoiceOpId('')}>من إجمالي الرصيد</button>
              {openInvoices.map((s) => (
                <button key={s.id} className={`chip num${invoiceOpId === s.id ? ' on' : ''}`} style={{ fontSize: 13 }} onClick={() => setInvoiceOpId(s.id)}>
                  {s.docNo} · {fmtDay(s.date)} · {fmtMoney(linesTotal(s.lines) - s.paid)}
                </button>
              ))}
            </div>
          </>
        )}

        {dups.length > 0 && <DuplicateWarning items={dups} onForce={() => { setDupOk(true); void save(true); }} />}
      </div>
      <div className="foot">
        <button className="btn btn-p btn-block" style={{ minHeight: 56 }} disabled={busy} onClick={() => save()}>
          <Icon name="check" />
          حفظ التحصيل{amt > 0 && <> · <span className="num">{fmtMoney(amt)}</span> بر</>}
        </button>
      </div>
      <CustomerPicker open={picker} onClose={() => setPicker(false)} data={data} onPick={(c) => { setCustomerId(c?.id ?? null); setInvoiceOpId(''); setPicker(false); }} />
    </div>
  );
}

/* ================= TRANSFER ================= */
export function TransferScreen() {
  const data = useData();
  const nav = useNavigate();
  const toast = useToast();
  const [from, setFrom] = useState<WalletKey>('cash');
  const [to, setTo] = useState<WalletKey>('cbe');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const bal = (w: WalletKey) => data.balances.get(walletAccount(w)) ?? 0;
  const amt = parseBirr(amount) ?? 0;

  async function save() {
    setBusy(true);
    try {
      await saveTransfer(db, { from, to, amount: amt }, todayISO());
      toast('تم التحويل — مديونيتك للشركة لم تتغير');
      nav(-1);
    } catch (e) {
      toast(e instanceof DomainError ? e.errors.join('\n') : 'تعذّر الحفظ', true);
    } finally {
      setBusy(false);
    }
  }

  const pick = (side: 'from' | 'to') => (
    <div className="grid3" style={{ gap: 6 }}>
      {WALLETS.map((w) => {
        const on = (side === 'from' ? from : to) === w;
        return (
          <button key={w} className={`chip${on ? ' on' : ''}`} style={{ flexDirection: 'column', gap: 0, minHeight: 58, borderRadius: 14, padding: 6 }} onClick={() => (side === 'from' ? setFrom(w) : setTo(w))}>
            <span style={{ fontSize: 13 }}>{WALLET_SHORT[w]}</span>
            <span className="num" style={{ fontSize: 11.5, opacity: 0.8 }}>{fmtMoney(bal(w))}</span>
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="anim">
      <TopBar title="تحويل بين المحافظ" />
      <div className="page" style={{ paddingTop: 4 }}>
        <div className="card pad" style={{ gap: 12 }}>
          <span className="lbl">من</span>
          {pick('from')}
          <button className="icbtn" aria-label="تبديل الاتجاه" style={{ alignSelf: 'center', borderRadius: '50%' }} onClick={() => { setFrom(to); setTo(from); }}>
            <Icon name="swap" small style={{ transform: 'rotate(90deg)' }} />
          </button>
          <span className="lbl">إلى</span>
          {pick('to')}
          <AmountField label="المبلغ (بر)" value={amount} onChange={setAmount} />
        </div>
        <div className="card pad sub num" style={{ gap: 4 }}>
          {from === to ? (
            <span>اختر محفظتين مختلفتين</span>
          ) : (
            <>
              <span>{WALLET_SHORT[from]}: {fmtMoney(bal(from))} ← {fmtMoney(bal(from) - amt)}</span>
              <span>{WALLET_SHORT[to]}: {fmtMoney(bal(to))} ← {fmtMoney(bal(to) + amt)}</span>
            </>
          )}
          <span>التحويل الداخلي لا يغيّر مديونيتك للشركة.</span>
        </div>
      </div>
      <div className="foot">
        <button className="btn btn-d btn-block" style={{ minHeight: 56 }} disabled={busy} onClick={save}>تنفيذ التحويل</button>
      </div>
    </div>
  );
}

/* ================= PAY COMPANY ================= */
export function PayScreen() {
  const data = useData();
  const nav = useNavigate();
  const toast = useToast();
  const [amount, setAmount] = useState('');
  const [source, setSource] = useState<WalletKey>('cbe');
  const [bank, setBank] = useState<CompanyBank>('cbe');
  const [ref, setRef] = useState('');
  const [dupOk, setDupOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const today = todayISO();
  const amt = parseBirr(amount) ?? 0;
  const bal = (w: WalletKey) => data.balances.get(walletAccount(w)) ?? 0;
  const dups = amt > 0 && !dupOk ? findSimilarTransfers(data.ops, { bank, amount: amt, ref, date: today }) : [];

  async function save(force = false) {
    if (dups.length && !force) return toast('راجع تنبيه الحوالة المشابهة أولًا', true);
    setBusy(true);
    try {
      await saveCompanyPayment(db, { source, bank, amount: amt, ref }, today);
      toast(`سُجّل السداد · انخفض دينك ${fmtMoney(amt)} بر — بانتظار تأكيد الشركة`);
      nav('/company', { replace: true });
    } catch (e) {
      toast(e instanceof DomainError ? e.errors.join('\n') : 'تعذّر الحفظ', true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="anim">
      <TopBar title="سداد للشركة" />
      <div className="page" style={{ paddingTop: 4 }}>
        <div className="card pad" style={{ gap: 12 }}>
          <AmountField label="مبلغ الحوالة (بر)" value={amount} onChange={(v) => { setAmount(v); setDupOk(false); }} />
          <span className="lbl">مصدر الأموال</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {WALLETS.map((w) => {
              const on = source === w;
              return (
                <button key={w} onClick={() => setSource(w)} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: on ? '9px 11px' : '10px 12px', cursor: 'pointer', textAlign: 'right', border: on ? '2px solid var(--ink)' : undefined, background: on ? 'var(--soft)' : undefined }}>
                  <WalletBadge w={w} />
                  <span style={{ flex: 1, fontWeight: 600 }}>{WALLET_LABEL[w]}</span>
                  <span className="num sub">{fmtMoney(bal(w))}</span>
                </button>
              );
            })}
          </div>
          <span className="lbl">بنك الشركة المستلم</span>
          <BankChips bank={bank} setBank={(b) => { setBank(b); setDupOk(false); }} />
          <label className="field">
            <span className="lbl">الرقم المرجعي</span>
            <input className="inp num" dir="ltr" style={{ textAlign: 'right' }} placeholder="FT26298…" value={ref} onChange={(e) => { setRef(e.target.value); setDupOk(false); }} />
          </label>
        </div>
        {dups.length > 0 && <DuplicateWarning items={dups} onForce={() => { setDupOk(true); void save(true); }} />}
        <div className="sub" style={{ padding: '0 4px', fontSize: 12.5 }}>
          يمكنك سداد عدة تحصيلات بحوالة واحدة — لا يلزم تحديد العملاء. إرفاق صورة الإشعار ومتابعة واتساب في المرحلة 3.
        </div>
      </div>
      <div className="foot">
        <button className="btn btn-p btn-block" style={{ minHeight: 56 }} disabled={busy} onClick={() => save()}>
          <Icon name="check" />
          تسجيل السداد{amt > 0 && <> · <span className="num">{fmtMoney(amt)}</span> بر</>}
        </button>
      </div>
    </div>
  );
}
