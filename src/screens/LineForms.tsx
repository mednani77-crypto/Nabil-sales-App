import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { db } from '../db/db';
import { DomainError, saveReceive, saveSale } from '../db/repo';
import { useData } from '../hooks/useData';
import { balanceOf } from '../domain/balances';
import { fmtMoney, parseBirr } from '../domain/money';
import { COMPANY_BANKS, customerAccount, type CompanyBank, type PayDestination, type PayMode, type WalletKey } from '../domain/types';
import { BANK_LABEL } from '../lib/labels';
import { todayISO } from '../lib/dates';
import { Icon } from '../ui/Icon';
import { TopBar, useToast } from '../ui/kit';
import { addOrIncrement, LineEditor, linesTotalOf, toDraft, type LineState } from '../ui/LineEditor';
import { CustomerPicker, ItemPicker } from '../ui/pickers';

function QuickAdd({ data, onAdd }: { data: ReturnType<typeof useData>; onAdd: (id: string) => void }) {
  // Most-used items by number of sale lines; falls back to the item list.
  const freq = new Map<string, number>();
  for (const op of data.ops) if (op.type === 'sale') for (const l of op.lines) freq.set(l.itemId, (freq.get(l.itemId) ?? 0) + 1);
  const top = [...data.items].sort((a, b) => (freq.get(b.id) ?? 0) - (freq.get(a.id) ?? 0)).slice(0, 5);
  if (!top.length) return null;
  return (
    <div className="hs">
      {top.map((it) => (
        <button key={it.id} className="chip" onClick={() => onAdd(it.id)}>
          <Icon name="plus" small />
          {it.name}
        </button>
      ))}
    </div>
  );
}

function EmptyLines() {
  return (
    <div className="empty">
      <Icon name="box" style={{ width: 34, height: 34, color: '#8593a3' }} />
      <div style={{ fontWeight: 600 }}>لم تُضف أصنافًا بعد</div>
      <div className="sub">اختر من الأكثر استخدامًا بلمسة واحدة، أو ابحث عن أي صنف</div>
    </div>
  );
}

/* ================= SALE ================= */
type Dest = WalletKey | 'company';

export function SaleScreen() {
  const data = useData();
  const nav = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const [lines, setLines] = useState<LineState[]>([]);
  const [customerId, setCustomerId] = useState<string | null>(params.get('customer'));
  const [payMode, setPayMode] = useState<PayMode>(params.get('customer') ? 'credit' : 'cash');
  const [paidText, setPaidText] = useState('');
  const [dest, setDest] = useState<Dest>('cash');
  const [bank, setBank] = useState<CompanyBank>('cbe');
  const [picker, setPicker] = useState<'item' | 'customer' | null>(null);
  const [busy, setBusy] = useState(false);

  const customer = customerId ? data.customersById.get(customerId) : undefined;
  const total = linesTotalOf(lines);
  const paid = payMode === 'cash' ? total : payMode === 'credit' ? 0 : Math.min(total, parseBirr(paidText) ?? 0);
  const rem = total - paid;

  const add = (id: string) => {
    const it = data.itemsById.get(id);
    if (it) setLines(addOrIncrement(lines, it));
  };

  async function save() {
    const destination: PayDestination | null = dest === 'company' ? { kind: 'company', bank } : { kind: 'wallet', wallet: dest };
    setBusy(true);
    try {
      const r = await saveSale(
        db,
        { customerId, lines: toDraft(lines), payMode, paid: parseBirr(paidText) ?? 0, destination },
        todayISO(),
      );
      nav(`/invoices/${r.op.id}?done=1`, { replace: true });
    } catch (e) {
      toast(e instanceof DomainError ? e.errors.join('\n') : 'تعذّر حفظ الفاتورة', true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="anim">
      <TopBar title="فاتورة بيع جديدة" />
      <div className="page" style={{ paddingTop: 4 }}>
        <button className="card" onClick={() => setPicker('customer')} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', textAlign: 'right', cursor: 'pointer', minHeight: 64 }}>
          <span className="avatar"><Icon name="user" /></span>
          <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontWeight: 600 }}>{customer ? customer.name : 'بدون عميل'}</span>
            <span className="sub num">
              {customer ? `الرصيد الحالي: ${fmtBalance(balanceOf(data.ops, customerAccount(customer.id)))}` : 'بيع نقدي سريع — اختيار العميل اختياري'}
            </span>
          </span>
          <span style={{ fontSize: 13, color: 'var(--blue)', fontWeight: 600 }}>{customer ? 'تغيير' : 'اختيار'}</span>
        </button>

        {lines.length === 0 && <EmptyLines />}
        <QuickAdd data={data} onAdd={add} />
        <LineEditor lines={lines} setLines={setLines} data={data} checkStock />
        <button className="btn btn-g" style={{ border: '2px dashed var(--ink)', background: 'transparent' }} onClick={() => setPicker('item')}>
          <Icon name="search" />
          بحث وإضافة صنف
        </button>

        <div className="card pad" style={{ gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontWeight: 600 }}>طريقة الدفع</span>
            <span className="sub">المجموع <b className="num" style={{ fontSize: 18, color: 'var(--ink)' }}>{fmtMoney(total)}</b></span>
          </div>
          <div className="seg" role="radiogroup" aria-label="طريقة الدفع">
            {(['cash', 'credit', 'partial'] as PayMode[]).map((m) => (
              <button key={m} role="radio" aria-checked={payMode === m} className={payMode === m ? 'on' : ''} onClick={() => setPayMode(m)}>
                {{ cash: 'نقدي', credit: 'آجل', partial: 'جزئي' }[m]}
              </button>
            ))}
          </div>
          {payMode === 'partial' && (
            <label className="field">
              <span className="lbl">المبلغ المدفوع الآن</span>
              <input className="inp num" inputMode="decimal" placeholder="0" value={paidText} onChange={(e) => setPaidText(e.target.value)} />
            </label>
          )}
          {paid > 0 && (
            <>
              <span className="lbl">أين وصل المبلغ المدفوع؟</span>
              <div className="chips">
                {([['cash', 'نقد في اليد'], ['cbe', 'CBE الشخصي'], ['ebirr', 'Ebirr الشخصي'], ['company', 'حساب الشركة']] as [Dest, string][]).map(([k, label]) => (
                  <button key={k} className={`chip${dest === k ? ' on' : ''}`} onClick={() => setDest(k)}>{label}</button>
                ))}
              </div>
              {dest === 'company' && (
                <>
                  <div className="chips">
                    {COMPANY_BANKS.map((bk) => (
                      <button key={bk} className={`chip${bank === bk ? ' on' : ''}`} style={{ minHeight: 40, fontSize: 13 }} onClick={() => setBank(bk)}>{BANK_LABEL[bk]}</button>
                    ))}
                  </div>
                  <div className="note blue">يُسجَّل تلقائيًا كسداد للشركة مرة واحدة فقط، ويُتابع كإشعار حتى تؤكده الشركة.</div>
                </>
              )}
            </>
          )}
          <div className="grid2" style={{ gap: 8 }}>
            <div style={{ background: 'var(--teal-soft)', borderRadius: 14, padding: '10px 12px' }}>
              <div style={{ fontSize: 12, color: 'var(--teal-ink)' }}>المدفوع</div>
              <div className="num" style={{ fontWeight: 700, fontSize: 17, color: '#0a5e53' }}>{fmtMoney(paid)}</div>
            </div>
            <div style={{ background: rem > 0 ? 'var(--red-soft)' : '#f3f5f8', borderRadius: 14, padding: '10px 12px', color: rem > 0 ? 'var(--red)' : 'var(--ink2)' }}>
              <div style={{ fontSize: 12 }}>المتبقي آجلًا</div>
              <div className="num" style={{ fontWeight: 700, fontSize: 17 }}>{fmtMoney(rem)}</div>
            </div>
          </div>
          {!customer && rem > 0 && (
            <div className="note amber">بيع آجل دون اسم: سيُنشأ دين مؤقت مستقل برقم خاص، يمكنك تسمية صاحبه لاحقًا.</div>
          )}
        </div>
      </div>
      <div className="foot">
        <button className="btn btn-p btn-block" style={{ minHeight: 56, fontSize: 16 }} disabled={busy} onClick={save}>
          <Icon name="check" />
          حفظ الفاتورة · <span className="num">{fmtMoney(total)}</span> بر
        </button>
      </div>

      <ItemPicker open={picker === 'item'} onClose={() => setPicker(null)} data={data} onPick={(it) => { setLines(addOrIncrement(lines, it)); setPicker(null); }} />
      <CustomerPicker open={picker === 'customer'} onClose={() => setPicker(null)} data={data} allowNone onPick={(c) => { setCustomerId(c?.id ?? null); setPicker(null); }} />
    </div>
  );
}

export function fmtBalance(b: number): string {
  return b > 0 ? `${fmtMoney(b)} عليه` : b < 0 ? `${fmtMoney(-b)} له` : 'مسدد بالكامل';
}

/* ================= RECEIVE ================= */
export function ReceiveScreen() {
  const data = useData();
  const nav = useNavigate();
  const toast = useToast();
  const [lines, setLines] = useState<LineState[]>([]);
  const [date, setDate] = useState(todayISO());
  const [picker, setPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const total = linesTotalOf(lines);

  async function save() {
    setBusy(true);
    try {
      const op = await saveReceive(db, toDraft(lines), date);
      toast(`تم الاستلام ${op.docNo}: +${fmtMoney(total)} بر على حسابك مع الشركة`);
      nav('/truck', { replace: true });
    } catch (e) {
      toast(e instanceof DomainError ? e.errors.join('\n') : 'تعذّر الحفظ', true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="anim">
      <TopBar title="استلام بضاعة من الشركة" />
      <div className="page" style={{ paddingTop: 4 }}>
        <div className="card pad">
          <label className="field">
            <span className="lbl">تاريخ الاستلام</span>
            <input className="inp num" type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} />
          </label>
          <div className="note blue">تزيد كمية الشاحنة، وتزيد مديونيتك للشركة بقيمة الاستلام نفسها.</div>
        </div>
        {lines.length === 0 && <EmptyLines />}
        <QuickAdd data={data} onAdd={(id) => { const it = data.itemsById.get(id); if (it) setLines(addOrIncrement(lines, it)); }} />
        <LineEditor lines={lines} setLines={setLines} data={data} checkStock={false} />
        <button className="btn btn-g" style={{ border: '2px dashed var(--ink)', background: 'transparent' }} onClick={() => setPicker(true)}>
          <Icon name="search" />
          بحث وإضافة صنف
        </button>
      </div>
      <div className="foot">
        <button className="btn btn-d btn-block" style={{ minHeight: 56 }} disabled={busy} onClick={save}>
          <Icon name="check" />
          حفظ الاستلام · <span className="num">{fmtMoney(total)}</span> بر
        </button>
      </div>
      <ItemPicker open={picker} onClose={() => setPicker(false)} data={data} onPick={(it) => { setLines(addOrIncrement(lines, it)); setPicker(false); }} />
    </div>
  );
}
