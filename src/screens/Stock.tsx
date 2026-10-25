import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { db } from '../db/db';
import {
  addCustomer,
  DomainError,
  saveCompanyReturn,
  saveCompanyReturnDecision,
  saveCustomerReturn,
  saveOpening,
  saveStockCount,
  saveVoid,
} from '../db/repo';
import { useData } from '../hooks/useData';
import { voidedIds } from '../domain/balances';
import { fmtMoney, parseBirr, toBirrInput } from '../domain/money';
import { linesTotal } from '../domain/postings';
import { canVoid, companyReturnStates } from '../domain/stockOps';
import { decompose } from '../domain/units';
import { WALLETS, type OpeningOp, type Operation, type SaleOp, type WalletKey } from '../domain/types';
import { fmtDate, fmtTime, todayISO } from '../lib/dates';
import { opLabel } from '../lib/describe';
import { BANK_LABEL, WALLET_LABEL } from '../lib/labels';
import { Icon } from '../ui/Icon';
import { Sheet, TopBar, useToast } from '../ui/kit';
import { addOrIncrement, LineEditor, linesTotalOf, newLine, toDraft, type LineState } from '../ui/LineEditor';
import { CustomerPicker, ItemPicker, NewItemSheet } from '../ui/pickers';
import { fmtBalance } from './LineForms';
import { customerActivity } from '../domain/moneyOps';

const errText = (e: unknown, fallback = 'تعذّر الحفظ') => (e instanceof DomainError ? e.errors.join('\n') : fallback);

/* ================= RETURNS ================= */
export function ReturnsScreen() {
  const [params] = useSearchParams();
  const [tab, setTab] = useState<'cust' | 'co'>(params.get('tab') === 'co' ? 'co' : 'cust');
  return (
    <div className="anim">
      <TopBar title="المرتجعات" />
      <div style={{ padding: '0 16px 4px' }}>
        <div className="seg" style={{ gridTemplateColumns: 'repeat(2,minmax(0,1fr))', background: 'var(--line)' }}>
          <button className={tab === 'cust' ? 'on' : ''} onClick={() => setTab('cust')}>من عميل إليّ</button>
          <button className={tab === 'co' ? 'on' : ''} onClick={() => setTab('co')}>منّي إلى الشركة</button>
        </div>
      </div>
      {tab === 'cust' ? <CustomerReturnForm initialCustomer={params.get('customer')} initialInvoice={params.get('invoice')} /> : <CompanyReturnForm />}
    </div>
  );
}

function CustomerReturnForm({ initialCustomer, initialInvoice }: { initialCustomer: string | null; initialInvoice: string | null }) {
  const data = useData();
  const nav = useNavigate();
  const toast = useToast();
  const [customerId, setCustomerId] = useState<string | null>(initialCustomer);
  const [invoiceId, setInvoiceId] = useState<string | null>(initialInvoice);
  const [lines, setLines] = useState<LineState[]>([]);
  const [condition, setCondition] = useState<'good' | 'damaged'>('good');
  const [settle, setSettle] = useState<'balance' | 'cash'>(initialCustomer ? 'balance' : 'cash');
  const [picker, setPicker] = useState<'item' | 'customer' | null>(null);
  const [busy, setBusy] = useState(false);
  const customer = customerId ? data.customersById.get(customerId) : undefined;
  const voided = voidedIds(data.ops);
  const invoices = customer
    ? data.ops.filter((o): o is SaleOp => o.type === 'sale' && o.customerId === customer.id && !voided.has(o.id)).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6)
    : [];
  const invoice = invoiceId ? (data.ops.find((o) => o.id === invoiceId) as SaleOp | undefined) : undefined;
  const value = linesTotalOf(lines);

  async function save() {
    setBusy(true);
    try {
      await saveCustomerReturn(db, { customerId, lines: toDraft(lines), condition, settle, invoiceOpId: invoiceId ?? undefined });
      toast(condition === 'good' ? 'سُجّل المرتجع وعاد للشاحنة' : 'سُجّل المرتجع التالف دون إضافته للمتاح');
      nav(-1);
    } catch (e) {
      toast(errText(e), true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="page" style={{ paddingTop: 8 }}>
        <button className="card" onClick={() => setPicker('customer')} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', textAlign: 'right', cursor: 'pointer', minHeight: 64 }}>
          <span className="avatar"><Icon name="user" /></span>
          <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontWeight: 600 }}>{customer?.name ?? 'بدون عميل'}</span>
            <span className="sub num">{customer ? `الرصيد: ${fmtBalance(customerActivity(data.ops, customer.id, todayISO()).balance)}` : 'اختياري عند رد المبلغ نقدًا'}</span>
          </span>
          <span style={{ fontSize: 13, color: 'var(--blue)', fontWeight: 600 }}>{customer ? 'تغيير' : 'اختيار'}</span>
        </button>

        {invoices.length > 0 && (
          <>
            <span className="lbl" style={{ margin: '0 4px' }}>من فاتورة (اختياري — لاستخدام سعرها)</span>
            <div className="hs">
              <button className={`chip${!invoiceId ? ' on' : ''}`} onClick={() => setInvoiceId(null)}>بدون فاتورة</button>
              {invoices.map((s) => (
                <button key={s.id} className={`chip num${invoiceId === s.id ? ' on' : ''}`} style={{ fontSize: 13 }} onClick={() => setInvoiceId(s.id)}>{s.docNo} · {fmtDate(s.date)}</button>
              ))}
            </div>
          </>
        )}
        {invoice && (
          <div className="chips">
            {invoice.lines.map((l, i) => (
              <button
                key={i}
                className="chip"
                style={{ fontSize: 13 }}
                onClick={() => {
                  const it = data.itemsById.get(l.itemId);
                  if (it) setLines([...lines, { ...newLine(it), unitName: l.unitName, price: toBirrInput(l.unitPrice) }]);
                }}
              >
                <Icon name="plus" small />
                {l.itemName} · {l.unitName} · <span className="num">{fmtMoney(l.unitPrice)}</span>
              </button>
            ))}
          </div>
        )}

        <LineEditor lines={lines} setLines={setLines} data={data} checkStock={false} />
        <button className="btn btn-g" style={{ border: '2px dashed var(--ink)', background: 'transparent' }} onClick={() => setPicker('item')}>
          <Icon name="search" />
          اختيار الصنف المرتجع
        </button>

        <div className="card pad" style={{ gap: 12 }}>
          <span className="lbl">حالة البضاعة</span>
          <div className="seg" style={{ gridTemplateColumns: 'repeat(2,minmax(0,1fr))' }}>
            <button className={condition === 'good' ? 'on' : ''} onClick={() => setCondition('good')}>صالح — يعود للشاحنة</button>
            <button className={condition === 'damaged' ? 'on' : ''} onClick={() => setCondition('damaged')}>تالف</button>
          </div>
          <span className="lbl">التسوية مع العميل</span>
          <div className="seg" style={{ gridTemplateColumns: 'repeat(2,minmax(0,1fr))' }}>
            <button className={settle === 'balance' ? 'on' : ''} onClick={() => setSettle('balance')}>خصم من رصيده</button>
            <button className={settle === 'cash' ? 'on' : ''} onClick={() => setSettle('cash')}>رد المبلغ نقدًا</button>
          </div>
          <div className="sub" style={{ fontSize: 12.5 }}>
            {settle === 'balance' ? 'ينقص دين العميل، أو يصبح له رصيد إن لم يكن عليه دين.' : 'يخرج المبلغ من النقد في يدك، ولا يتغير رصيد العميل.'}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>قيمة المرتجع</span><b className="num" style={{ fontSize: 18 }}>{fmtMoney(value)}</b></div>
        </div>
      </div>
      <div className="foot">
        <button className="btn btn-d btn-block" style={{ minHeight: 56 }} disabled={busy} onClick={save}>حفظ مرتجع العميل</button>
      </div>
      <ItemPicker open={picker === 'item'} onClose={() => setPicker(null)} data={data} onPick={(it) => { setLines(addOrIncrement(lines, it)); setPicker(null); }} />
      <CustomerPicker open={picker === 'customer'} onClose={() => setPicker(null)} data={data} allowNone onPick={(c) => { setCustomerId(c?.id ?? null); setInvoiceId(null); if (!c) setSettle('cash'); setPicker(null); }} />
    </>
  );
}

function CompanyReturnForm() {
  const data = useData();
  const toast = useToast();
  const [lines, setLines] = useState<LineState[]>([]);
  const [reason, setReason] = useState('تالف');
  const [picker, setPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const states = companyReturnStates(data.ops);

  async function save() {
    setBusy(true);
    try {
      const op = await saveCompanyReturn(db, { lines: toDraft(lines), reason });
      setLines([]);
      toast(`خرج المرتجع ${op.docNo} من الشاحنة — بانتظار قبول الشركة`);
    } catch (e) {
      toast(errText(e), true);
    } finally {
      setBusy(false);
    }
  }
  async function decide(id: string, d: 'accepted' | 'rejected') {
    try {
      await saveCompanyReturnDecision(db, id, d);
      toast(d === 'accepted' ? 'قُبل المرتجع وانخفض دينك للشركة' : 'رُفض المرتجع وأُعيدت البضاعة للشاحنة');
    } catch (e) {
      toast(errText(e), true);
    }
  }

  return (
    <>
      <div className="page" style={{ paddingTop: 8 }}>
        <LineEditor lines={lines} setLines={setLines} data={data} checkStock />
        <button className="btn btn-g" style={{ border: '2px dashed var(--ink)', background: 'transparent' }} onClick={() => setPicker(true)}>
          <Icon name="search" />
          اختيار الصنف المرتجع
        </button>
        {lines.length > 0 && (
          <div className="card pad">
            <span className="lbl">السبب</span>
            <div className="chips">
              {['تالف', 'منتهي الصلاحية', 'زائد عن الحاجة'].map((r) => (
                <button key={r} className={`chip${reason === r ? ' on' : ''}`} onClick={() => setReason(r)}>{r}</button>
              ))}
            </div>
            <div className="note blue">تخرج البضاعة من الشاحنة الآن، لكن دينك للشركة لا ينخفض إلا بعد تأكيد قبولها للمرتجع.</div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>قيمة المرتجع</span><b className="num" style={{ fontSize: 18 }}>{fmtMoney(linesTotalOf(lines))}</b></div>
            <button className="btn btn-d" disabled={busy} onClick={save}>إرسال المرتجع للشركة</button>
          </div>
        )}
        <div className="sec">متابعة مرتجعات الشركة</div>
        <div className="card list">
          {states.map(({ op, state, value }) => (
            <div key={op.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: '1px solid #eef1f5' }}>
              <Link to={`/op/${op.id}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, color: 'var(--ink)', textDecoration: 'none' }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{op.lines.map((l) => `${l.itemName} · ${l.qty} ${l.unitName}`).join('، ')}</span>
                <span className="num sub" style={{ fontSize: 12 }}>{op.docNo} · {fmtDate(op.date)} · {op.reason} · {fmtMoney(value)}</span>
              </Link>
              {state === 'pending' ? (
                <span style={{ display: 'flex', gap: 6 }}>
                  <button className="chip" style={{ minHeight: 40, fontSize: 12.5, padding: '0 10px' }} onClick={() => decide(op.id, 'rejected')}>رُفض</button>
                  <button className="chip" style={{ minHeight: 40, fontSize: 12.5, padding: '0 10px', background: 'var(--teal)', color: '#fff', borderColor: 'var(--teal)' }} onClick={() => decide(op.id, 'accepted')}>قُبل</button>
                </span>
              ) : (
                <span className={`pill ${state === 'accepted' ? 'teal' : 'red'}`}>{state === 'accepted' ? 'قُبل · خُصم من الدين' : 'رُفض · أُعيد للشاحنة'}</span>
              )}
            </div>
          ))}
          {states.length === 0 && <div style={{ padding: 20, textAlign: 'center' }} className="sub">لا توجد مرتجعات للشركة</div>}
        </div>
      </div>
      <ItemPicker open={picker} onClose={() => setPicker(false)} data={data} onPick={(it) => { setLines(addOrIncrement(lines, it)); setPicker(false); }} />
    </>
  );
}

/* ================= STOCK COUNT ================= */
export function CountScreen() {
  const data = useData();
  const nav = useNavigate();
  const toast = useToast();
  const [counts, setCounts] = useState<Record<string, { full: string; loose: string; reason: string }>>({});
  const [busy, setBusy] = useState(false);

  const rows = data.items.map((it) => {
    const rec = data.stock.get(it.id) ?? 0;
    const multi = it.units.length > 1;
    const main = it.units[0];
    const recFull = multi ? Math.floor(rec / main.factor) : rec;
    const recLoose = multi ? rec - recFull * main.factor : 0;
    const c = counts[it.id];
    const full = c?.full ?? String(recFull);
    const loose = c?.loose ?? String(recLoose);
    const actual = multi ? (parseInt(full, 10) || 0) * main.factor + (parseInt(loose, 10) || 0) : parseInt(full, 10) || 0;
    return { it, rec, multi, full, loose, actual, diff: actual - rec, reason: c?.reason ?? 'خطأ عدّ' };
  });
  const changed = rows.filter((r) => r.diff !== 0);
  const set = (id: string, p: Partial<{ full: string; loose: string; reason: string }>, r: (typeof rows)[number]) =>
    setCounts({ ...counts, [id]: { full: r.full, loose: r.loose, reason: r.reason, ...p } });

  async function save() {
    setBusy(true);
    try {
      const op = await saveStockCount(db, changed.map((r) => ({ itemId: r.it.id, actual: r.actual, reason: r.reason })));
      toast(`حُفظت ${op.adjustments.length} تسوية في سجل الحركات — حساب الشركة لم يتغير`);
      nav(-1);
    } catch (e) {
      toast(errText(e), true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="anim">
      <TopBar title="جرد الشاحنة" />
      <div className="page" style={{ paddingTop: 4 }}>
        <div className="note blue">أدخل الكمية الفعلية التي عددتها، بما فيها حبات العبوات المفتوحة. يظهر الفرق فورًا، والتسوية لا تغيّر حساب الشركة.</div>
        {rows.map((r) => (
          <div key={r.it.id} className="card pad" style={{ padding: 14, gap: 10, borderColor: r.diff ? 'var(--amber)' : undefined }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
              <b>{r.it.name}</b>
              <span className="num sub" style={{ fontSize: 12.5 }}>المسجّل: {decompose(r.it, r.rec).label}</span>
            </div>
            <div className="grid2" style={{ gap: 10 }}>
              <label className="field">
                <span className="lbl">{r.it.units[0].name}{r.multi ? ' كاملة' : ''}</span>
                <input className="inp num" type="number" inputMode="numeric" min={0} value={r.full} onChange={(e) => set(r.it.id, { full: e.target.value.replace(/\D/g, '') }, r)} />
              </label>
              {r.multi && (
                <label className="field">
                  <span className="lbl">{r.it.units[r.it.units.length - 1].name} إضافية</span>
                  <input className="inp num" type="number" inputMode="numeric" min={0} value={r.loose} onChange={(e) => set(r.it.id, { loose: e.target.value.replace(/\D/g, '') }, r)} />
                </label>
              )}
            </div>
            {r.diff !== 0 && (
              <>
                <b className="num" style={{ fontSize: 13, color: r.diff < 0 ? 'var(--red)' : 'var(--teal-ink)' }}>
                  الفرق: {r.diff < 0 ? '− ' : '+ '}{decompose(r.it, Math.abs(r.diff)).label}
                </b>
                <div className="chips">
                  {['خطأ عدّ', 'تلف', 'فقد', 'أخرى'].map((x) => (
                    <button key={x} className={`chip${r.reason === x ? ' on' : ''}`} style={{ minHeight: 40, fontSize: 13 }} onClick={() => set(r.it.id, { reason: x }, r)}>{x}</button>
                  ))}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
      <div className="foot">
        <button className="btn btn-d btn-block" style={{ minHeight: 56 }} disabled={busy || changed.length === 0} onClick={save}>
          حفظ التسويات <span className="num">({changed.length})</span>
        </button>
      </div>
    </div>
  );
}

/* ================= OPENING BALANCES ================= */
interface CustRow { key: string; customerId?: string; name: string; amount: string; dir: 'debt' | 'credit' }

export function OpeningScreen() {
  const data = useData();
  const nav = useNavigate();
  const toast = useToast();
  const voided = voidedIds(data.ops);
  const existing = data.ops.find((o): o is OpeningOp => o.type === 'opening' && !voided.has(o.id));
  const [date, setDate] = useState(todayISO());
  const [coDir, setCoDir] = useState<'owe' | 'credit'>('owe');
  const [coAmt, setCoAmt] = useState('');
  const [wallets, setWallets] = useState<Record<WalletKey, string>>({ cash: '', cbe: '', ebirr: '' });
  const [custs, setCusts] = useState<CustRow[]>([{ key: 'k0', name: '', amount: '', dir: 'debt' }]);
  const [stock, setStock] = useState<Record<string, { full: string; loose: string }>>({});
  const [newItem, setNewItem] = useState(false);
  const [busy, setBusy] = useState(false);

  if (existing) {
    return (
      <div className="anim">
        <TopBar title="الأرصدة الافتتاحية" />
        <div className="page" style={{ paddingTop: 4 }}>
          <div className="card pad">
            <b>مسجلة بتاريخ <span className="num">{fmtDate(existing.date)}</span></b>
            <span className="sub num">دين الشركة {fmtMoney(existing.company)} · عملاء {existing.customers.length} · أصناف {existing.stock.length}</span>
            <span className="sub">لتعديلها: ألغِ هذه العملية من صفحتها ثم أعد إدخالها. الإلغاء يُحفظ في السجل ولا يمحو شيئًا.</span>
            <Link className="btn btn-g" to={`/op/${existing.id}`}>فتح العملية</Link>
          </div>
        </div>
      </div>
    );
  }

  const stockQty = (itemId: string) => {
    const it = data.itemsById.get(itemId)!;
    const s = stock[itemId];
    if (!s) return 0;
    return it.units.length > 1 ? (parseInt(s.full, 10) || 0) * it.units[0].factor + (parseInt(s.loose, 10) || 0) : parseInt(s.full, 10) || 0;
  };

  async function save() {
    setBusy(true);
    try {
      const customers: { customerId: string; balance: number }[] = [];
      for (const r of custs) {
        const amt = parseBirr(r.amount) ?? 0;
        if (!r.name.trim() || !amt) continue;
        const c = r.customerId ? data.customersById.get(r.customerId) : await addCustomer(db, { name: r.name });
        if (c) customers.push({ customerId: c.id, balance: r.dir === 'debt' ? amt : -amt });
      }
      await saveOpening(
        db,
        {
          company: (coDir === 'owe' ? 1 : -1) * (parseBirr(coAmt) ?? 0),
          customers,
          wallets: { cash: parseBirr(wallets.cash) ?? 0, cbe: parseBirr(wallets.cbe) ?? 0, ebirr: parseBirr(wallets.ebirr) ?? 0 },
          stock: data.items.map((it) => ({ itemId: it.id, qty: stockQty(it.id) })).filter((s) => s.qty > 0),
        },
        date,
      );
      toast('حُفظت الأرصدة الافتتاحية');
      nav('/', { replace: true });
    } catch (e) {
      toast(errText(e), true);
    } finally {
      setBusy(false);
    }
  }

  const stockValue = data.items.reduce((t, it) => t + Math.round((stockQty(it.id) * it.units[0].lastPrice) / it.units[0].factor), 0);

  return (
    <div className="anim">
      <TopBar title="الأرصدة الافتتاحية" />
      <div className="page" style={{ paddingTop: 4 }}>
        <div className="note blue">أدخل وضعك يوم بدء استخدام التطبيق. كل ما قبل هذا التاريخ يدخل هنا كرصيد، وكل ما بعده يُسجّل كحركات.</div>
        <label className="field">
          <span className="lbl">تاريخ بداية النظام</span>
          <input className="inp num" type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} />
        </label>

        <div className="sec">١. رصيدك مع الشركة</div>
        <div className="card pad">
          <div className="seg" style={{ gridTemplateColumns: 'repeat(2,minmax(0,1fr))' }}>
            <button className={coDir === 'owe' ? 'on' : ''} onClick={() => setCoDir('owe')}>عليّ للشركة</button>
            <button className={coDir === 'credit' ? 'on' : ''} onClick={() => setCoDir('credit')}>لصالحي</button>
          </div>
          <input className="inp num" inputMode="decimal" placeholder="0" aria-label="رصيد الشركة" value={coAmt} onChange={(e) => setCoAmt(e.target.value)} style={{ fontSize: 22, fontWeight: 700 }} />
          <div className="sub" style={{ fontSize: 12.5 }}>هذا الرقم يشمل عادةً قيمة البضاعة الموجودة في الشاحنة، لذلك لا يُحمَّل المخزون الافتتاحي على حسابك مرة ثانية.</div>
        </div>

        <div className="sec">٢. أموال العمل لديك</div>
        <div className="card pad">
          {WALLETS.map((w) => (
            <label key={w} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ flex: 1, fontWeight: 600 }}>{WALLET_LABEL[w]}</span>
              <input className="inp num" inputMode="decimal" placeholder="0" value={wallets[w]} onChange={(e) => setWallets({ ...wallets, [w]: e.target.value })} style={{ width: 140, textAlign: 'left' }} />
            </label>
          ))}
        </div>

        <div className="sec">٣. أرصدة العملاء</div>
        {custs.map((r, i) => (
          <div key={r.key} className="card pad" style={{ padding: 12, gap: 8 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="inp" aria-label="اسم العميل" placeholder="اسم العميل" list="cust-names" value={r.name} onChange={(e) => {
                const name = e.target.value;
                const match = data.customers.find((c) => c.name === name);
                setCusts(custs.map((x, j) => (j === i ? { ...x, name, customerId: match?.id } : x)));
              }} style={{ flex: 1, minHeight: 46 }} />
              <input className="inp num" aria-label="المبلغ" inputMode="decimal" placeholder="0" value={r.amount} onChange={(e) => setCusts(custs.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} style={{ width: 120, minHeight: 46, textAlign: 'left' }} />
            </div>
            <div className="chips">
              <button className={`chip${r.dir === 'debt' ? ' on' : ''}`} style={{ minHeight: 38, fontSize: 13 }} onClick={() => setCusts(custs.map((x, j) => (j === i ? { ...x, dir: 'debt' } : x)))}>عليه</button>
              <button className={`chip${r.dir === 'credit' ? ' on' : ''}`} style={{ minHeight: 38, fontSize: 13 }} onClick={() => setCusts(custs.map((x, j) => (j === i ? { ...x, dir: 'credit' } : x)))}>له</button>
            </div>
          </div>
        ))}
        <datalist id="cust-names">{data.customers.map((c) => <option key={c.id} value={c.name} />)}</datalist>
        <button className="btn btn-g" style={{ borderStyle: 'dashed' }} onClick={() => setCusts([...custs, { key: 'k' + Date.now(), name: '', amount: '', dir: 'debt' }])}>+ عميل آخر</button>

        <div className="sec">٤. كميات الشاحنة الفعلية</div>
        {data.items.map((it) => {
          const multi = it.units.length > 1;
          const s = stock[it.id] ?? { full: '', loose: '' };
          return (
            <div key={it.id} className="card pad" style={{ padding: 12, gap: 8 }}>
              <b style={{ fontSize: 14.5 }}>{it.name}</b>
              <div className="grid2" style={{ gap: 8 }}>
                <label className="field"><span className="lbl">{it.units[0].name}</span><input className="inp num" type="number" inputMode="numeric" min={0} value={s.full} onChange={(e) => setStock({ ...stock, [it.id]: { ...s, full: e.target.value } })} /></label>
                {multi && <label className="field"><span className="lbl">{it.units[it.units.length - 1].name} إضافية</span><input className="inp num" type="number" inputMode="numeric" min={0} value={s.loose} onChange={(e) => setStock({ ...stock, [it.id]: { ...s, loose: e.target.value } })} /></label>}
              </div>
            </div>
          );
        })}
        <button className="btn btn-g" style={{ borderStyle: 'dashed' }} onClick={() => setNewItem(true)}>+ صنف جديد</button>
        <div className="sub num">قيمة المخزون للعرض فقط: {fmtMoney(stockValue)} بر — لن تُضاف إلى دين الشركة.</div>
      </div>
      <div className="foot">
        <button className="btn btn-p btn-block" style={{ minHeight: 56 }} disabled={busy} onClick={save}>حفظ الأرصدة الافتتاحية</button>
      </div>
      <NewItemSheet open={newItem} onClose={() => setNewItem(false)} onCreated={() => setNewItem(false)} />
    </div>
  );
}

/* ================= OPERATION DETAIL + VOID ================= */
export function OperationScreen() {
  const { id } = useParams();
  const data = useData();
  const toast = useToast();
  const [ask, setAsk] = useState(false);
  const [reason, setReason] = useState('');
  const op = data.ops.find((o) => o.id === id);
  if (!op) return data.loading ? null : <div className="page"><TopBar title="عملية" /><p className="sub">العملية غير موجودة</p></div>;
  const voidOp = data.ops.find((o) => o.type === 'void' && o.targetOpId === op.id);
  const blocked = canVoid(op, data.ops);

  async function doVoid() {
    try {
      await saveVoid(db, op!.id, reason);
      setAsk(false);
      toast('أُلغيت العملية — عُكست آثارها وبقيت في السجل');
    } catch (e) {
      toast(errText(e), true);
    }
  }

  return (
    <div className="anim">
      <TopBar title="تفاصيل العملية" />
      <div className="page" style={{ paddingTop: 4 }}>
        <div className="card pad" style={{ padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <b style={{ fontSize: 17, flex: 1 }}>{opLabel(op)}</b>
            {voidOp && <span className="pill red">ملغاة</span>}
          </div>
          <span className="sub num">{fmtDate(op.date)} · سُجّلت {fmtTime(op.createdAt)}</span>
          <OpDetails op={op} data={data} />
          {op.type === 'sale' && <Link to={`/invoices/${op.id}`}>عرض الفاتورة</Link>}
          {op.type === 'void' && <Link to={`/op/${op.targetOpId}`}>العملية الأصلية</Link>}
        </div>
        {voidOp && voidOp.type === 'void' && (
          <div className="note red">أُلغيت بتاريخ <span className="num">{fmtDate(voidOp.date)}</span> · السبب: {voidOp.reason}</div>
        )}
        {!voidOp && !blocked && (
          <button className="btn btn-g" style={{ color: 'var(--red)', borderColor: '#e9a79f' }} onClick={() => setAsk(true)}>
            <Icon name="close" small />
            إلغاء هذه العملية
          </button>
        )}
        {!voidOp && blocked && op.type !== 'void' && <div className="sub" style={{ fontSize: 12.5 }}>{blocked}</div>}
      </div>
      <Sheet open={ask} onClose={() => setAsk(false)}>
        <div style={{ padding: '4px 16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h2>إلغاء العملية</h2>
          <div className="sub" style={{ lineHeight: 1.7 }}>تُعكس كل آثارها على المخزون والأرصدة بعملية إلغاء مؤرخة اليوم، وتبقى العملية الأصلية ظاهرة في السجل.</div>
          <input className="inp" placeholder="السبب (اختياري) — مثل: خطأ في الكمية" value={reason} onChange={(e) => setReason(e.target.value)} />
          <button className="btn btn-d" onClick={doVoid}>تأكيد الإلغاء</button>
          <button className="btn btn-g" onClick={() => setAsk(false)}>تراجع</button>
        </div>
      </Sheet>
    </div>
  );
}

function OpDetails({ op, data }: { op: Operation; data: ReturnType<typeof useData> }) {
  const cname = (id: string | null | undefined) => (id ? data.customersById.get(id)?.name ?? '—' : 'بدون عميل');
  const lines = 'lines' in op ? op.lines : null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14 }}>
      {(op.type === 'sale' || op.type === 'collection' || op.type === 'customerReturn') && <span>العميل: {cname(op.customerId)}</span>}
      {lines && lines.map((l, i) => (
        <span key={i} className="num">{l.itemName}: {l.qty} {l.unitName} × {fmtMoney(l.unitPrice)} = {fmtMoney(l.qty * l.unitPrice)}</span>
      ))}
      {lines && <b className="num">الإجمالي: {fmtMoney(linesTotal(lines))} بر</b>}
      {op.type === 'collection' && <span className="num">المبلغ: {fmtMoney(op.amount)} · {op.destination.kind === 'wallet' ? WALLET_LABEL[op.destination.wallet] : `${BANK_LABEL[op.destination.bank]} (الشركة)`}{op.ref ? ` · ${op.ref}` : ''}</span>}
      {op.type === 'transfer' && <span className="num">المبلغ: {fmtMoney(op.amount)}</span>}
      {op.type === 'companyPayment' && <span className="num">المبلغ: {fmtMoney(op.amount)} · من {WALLET_LABEL[op.source]} · {BANK_LABEL[op.bank]}{op.ref ? ` · ${op.ref}` : ''}</span>}
      {op.type === 'customerReturn' && <span>{op.condition === 'good' ? 'صالح — عاد للشاحنة' : 'تالف'} · {op.settle === 'balance' ? 'خُصم من الرصيد' : 'رُدّ نقدًا'}</span>}
      {op.type === 'companyReturn' && <span>السبب: {op.reason}</span>}
      {op.type === 'stockCount' && op.adjustments.map((a, i) => {
        const it = data.itemsById.get(a.itemId);
        return <span key={i} className="num">{a.itemName}: {it ? decompose(it, a.recorded).label : a.recorded} ← {it ? decompose(it, a.actual).label : a.actual} · {a.reason}</span>;
      })}
      {op.type === 'opening' && (
        <span className="num">دين الشركة {fmtMoney(op.company)} · نقد {fmtMoney(op.wallets.cash)} · CBE {fmtMoney(op.wallets.cbe)} · Ebirr {fmtMoney(op.wallets.ebirr)} · عملاء {op.customers.length} · أصناف {op.stock.length}</span>
      )}
      {op.type === 'void' && <span>السبب: {op.reason}</span>}
    </div>
  );
}
