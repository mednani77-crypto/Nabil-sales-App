import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { db } from '../db/db';
import { addAttachment, DomainError, latestAttachment, saveNoticeStatus } from '../db/repo';
import { useData } from '../hooks/useData';
import { notices, type Notice } from '../domain/notices';
import { fmtMoney } from '../domain/money';
import type { NoticeStatus } from '../domain/types';
import { addDaysISO, fmtDate, fmtTime, todayISO } from '../lib/dates';
import { BANK_LABEL, WALLET_LABEL } from '../lib/labels';
import { compressImage, shareImageAndText, useAttachmentUrl } from '../lib/media';
import { Icon } from '../ui/Icon';
import { Sheet, TopBar, useToast } from '../ui/kit';
import type { Customer } from '../domain/types';

type Filter = 'all' | NoticeStatus;
type DateFilter = 'all' | 'today' | 'week' | 'month';

const STATUS: Record<NoticeStatus, { label: string; tone: string; level: number }> = {
  recorded: { label: 'لم يُرسل', tone: 'amber', level: 1 },
  sent: { label: 'أُرسل · بانتظار الشركة', tone: 'blue', level: 2 },
  confirmed: { label: 'مؤكد', tone: 'teal', level: 3 },
};

export function noticeText(n: Notice, customers: Map<string, Customer>): string {
  const from = n.from.kind === 'wallet' ? `من ${WALLET_LABEL[n.from.wallet]}` : `تحويل مباشر من ${n.from.customerId ? customers.get(n.from.customerId)?.name ?? 'عميل' : 'عميل'}`;
  return [
    'سداد لشركة SYSCO',
    `المبلغ: ${fmtMoney(n.amount)} بر`,
    `البنك: ${BANK_LABEL[n.bank]}`,
    n.ref ? `المرجع: ${n.ref}` : '',
    `التاريخ: ${fmtDate(n.date)}`,
    from,
    'المندوب: نبيل عادل',
  ]
    .filter(Boolean)
    .join('\n');
}

export function NoticesScreen() {
  const data = useData();
  const toast = useToast();
  const [params] = useSearchParams();
  const [f, setF] = useState<Filter>((params.get('f') as Filter) || 'all');
  const [df, setDf] = useState<DateFilter>('all');
  const [ask, setAsk] = useState<Notice | null>(null);
  const today = todayISO();
  const all = notices(data.ops);
  const counts = { all: all.length, recorded: 0, sent: 0, confirmed: 0 } as Record<Filter, number>;
  for (const n of all) counts[n.status]++;
  const inDate = (d: string) =>
    df === 'all' ? true : df === 'today' ? d === today : df === 'week' ? d >= addDaysISO(today, -6) : d.slice(0, 7) === today.slice(0, 7);
  const list = all.filter((n) => (f === 'all' || n.status === f) && inDate(n.date));

  async function setStatus(n: Notice, s: NoticeStatus, msg: string) {
    try {
      await saveNoticeStatus(db, n.op.id, s);
      toast(msg);
    } catch (e) {
      toast(e instanceof DomainError ? e.errors.join('\n') : 'تعذّر الحفظ', true);
    }
  }

  async function share(n: Notice) {
    const att = await latestAttachment(db, n.op.id);
    if (!att) toast('لا توجد صورة مرفقة — ستُشارك التفاصيل نصًا فقط');
    const r = await shareImageAndText(att?.blob, noticeText(n, data.customersById), `notice-${n.ref || n.op.id.slice(0, 8)}.jpg`);
    if (r === 'unavailable') toast('تعذّر فتح المشاركة على هذا الجهاز', true);
    else if (r === 'shared') setAsk(n);
  }

  return (
    <div className="anim">
      <TopBar title="الإشعارات البنكية" />
      <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="grid2" style={{ gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 6 }}>
          {([['all', 'الكل'], ['recorded', 'لم يُرسل'], ['sent', 'بانتظار التأكيد'], ['confirmed', 'مؤكد']] as [Filter, string][]).map(([k, l]) => {
            const on = f === k;
            return (
              <button key={k} onClick={() => setF(k)} style={{ cursor: 'pointer', borderRadius: 14, padding: '8px 4px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minHeight: 58, border: `1px solid ${on ? 'var(--ink)' : 'var(--line)'}`, background: on ? 'var(--ink)' : '#fff', color: on ? '#fff' : 'var(--ink)' }}>
                <b className="num" style={{ fontSize: 18 }}>{counts[k]}</b>
                <span style={{ fontSize: 11, lineHeight: 1.2, textAlign: 'center' }}>{l}</span>
              </button>
            );
          })}
        </div>
        <div className="hs">
          {([['all', 'كل التواريخ'], ['today', 'اليوم'], ['week', 'آخر 7 أيام'], ['month', 'هذا الشهر']] as [DateFilter, string][]).map(([k, l]) => (
            <button key={k} className={`chip${df === k ? ' on' : ''}`} style={{ minHeight: 38, fontSize: 13 }} onClick={() => setDf(k)}>{l}</button>
          ))}
        </div>
      </div>
      <div className="page" style={{ paddingTop: 4 }}>
        {list.map((n) => (
          <NoticeCard
            key={n.op.id}
            n={n}
            customers={data.customersById}
            onShare={() => share(n)}
            onSent={() => setStatus(n, 'sent', 'سُجّل أنه أُرسل إلى مجموعة واتساب')}
            onConfirm={() => setStatus(n, 'confirmed', 'تم تأكيد احتساب الشركة')}
            onUndo={() => setStatus(n, 'sent', 'أُعيدت الحالة إلى: بانتظار تأكيد الشركة')}
            onPhoto={async (blob) => {
              await addAttachment(db, n.op.id, blob);
              toast('أُرفقت صورة الإشعار');
            }}
          />
        ))}
        {list.length === 0 && (
          <div style={{ padding: '40px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center' }}>
            <span className="avatar" style={{ width: 64, height: 64, borderRadius: 22, background: 'var(--teal-soft)', color: 'var(--teal-ink)' }}><Icon name="check" /></span>
            <b>لا توجد إشعارات هنا</b>
            <span className="sub">كل شيء مرتب في هذا التصنيف</span>
          </div>
        )}
      </div>

      <Sheet open={!!ask} onClose={() => setAsk(null)}>
        <div style={{ padding: '4px 16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="avatar" style={{ background: 'var(--teal-soft)', color: 'var(--teal-ink)', width: 48, height: 48 }}><Icon name="chat" /></span>
            <h2 style={{ flex: 1 }}>هل أرسلته إلى المجموعة؟</h2>
          </div>
          <div className="sub" style={{ fontSize: 14, lineHeight: 1.7 }}>
            لا يستطيع التطبيق التأكد من وصول الرسالة. هل أرسلت إشعار <b className="num" style={{ color: 'var(--ink)' }}>{ask ? fmtMoney(ask.amount) : ''}</b> بر إلى مجموعة واتساب؟
          </div>
          <button className="btn btn-p" onClick={async () => { if (ask) await setStatus(ask, 'sent', 'سُجّل أنه أُرسل إلى مجموعة واتساب'); setAsk(null); }}>نعم، أرسلته</button>
          <button className="btn btn-g" onClick={() => setAsk(null)}>ليس بعد</button>
        </div>
      </Sheet>
    </div>
  );
}

function NoticeCard({
  n,
  customers,
  onShare,
  onSent,
  onConfirm,
  onUndo,
  onPhoto,
}: {
  n: Notice;
  customers: Map<string, Customer>;
  onShare: () => void;
  onSent: () => void;
  onConfirm: () => void;
  onUndo: () => void;
  onPhoto: (b: Blob) => void;
}) {
  const url = useAttachmentUrl(n.op.id);
  const st = STATUS[n.status];
  const from =
    n.from.kind === 'wallet'
      ? `من ${WALLET_LABEL[n.from.wallet]}`
      : `تحويل مباشر من ${n.from.customerId ? customers.get(n.from.customerId)?.name ?? 'عميل' : 'بيع نقدي'}`;
  return (
    <div className="card pad" style={{ padding: 14, gap: 12 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <label style={{ cursor: 'pointer', flex: 'none' }} aria-label={url ? 'تغيير صورة الإشعار' : 'إرفاق صورة الإشعار'}>
          {url ? (
            <img src={url} alt="" style={{ width: 56, height: 72, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--line2)', display: 'block' }} />
          ) : (
            <span style={{ width: 56, height: 72, borderRadius: 8, border: '2px dashed var(--line2)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, color: 'var(--ink2)', fontSize: 10 }}>
              <Icon name="camera" small />صورة
            </span>
          )}
          <input type="file" accept="image/*" hidden onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onPhoto(await compressImage(f)); }} />
        </label>
        <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <b style={{ fontSize: 15, flex: 1 }}>{BANK_LABEL[n.bank]} – حساب الشركة</b>
            <span className={`pill ${st.tone}`}>{st.label}</span>
          </span>
          <b className="num" style={{ fontSize: 20 }}>{fmtMoney(n.amount)} <span className="sub" style={{ fontWeight: 500, fontSize: 12 }}>بر</span></b>
          <span className="num sub" style={{ fontSize: 12 }}>{fmtDate(n.date)} · {fmtTime(n.op.createdAt)}{n.ref ? ` · ${n.ref}` : ''}</span>
          <span className="sub" style={{ fontSize: 12 }}>{from}</span>
        </span>
      </div>
      <div style={{ display: 'flex', gap: 4 }} aria-label={`المرحلة ${st.level} من 3`}>
        {[1, 2, 3].map((i) => (
          <span key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i <= st.level ? 'var(--teal)' : 'var(--line)' }} />
        ))}
      </div>
      {n.status === 'recorded' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.3fr) minmax(0,1fr)', gap: 8 }}>
          <button className="btn btn-p" style={{ minHeight: 48, fontSize: 14 }} onClick={onShare}><Icon name="chat" small />مشاركة عبر واتساب</button>
          <button className="btn btn-g" style={{ minHeight: 48, fontSize: 14 }} onClick={onSent}>أرسلته يدويًا</button>
        </div>
      )}
      {n.status === 'sent' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button onClick={onConfirm} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, border: '1px solid var(--line2)', background: 'var(--soft)', borderRadius: 14, padding: '10px 12px', minHeight: 52, textAlign: 'right', color: 'var(--ink)' }}>
            <span style={{ width: 24, height: 24, borderRadius: 7, border: '2px solid var(--ink)', flex: 'none' }} />
            <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>أكدت الشركة احتساب هذا السداد</span>
          </button>
          <button className="chip" style={{ alignSelf: 'flex-start', minHeight: 38, fontSize: 13 }} onClick={onShare}><Icon name="chat" small />مشاركة مجددًا</button>
        </div>
      )}
      {n.status === 'confirmed' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--teal-ink)', fontWeight: 600 }}>
          <Icon name="check" small />
          <span style={{ flex: 1 }}>محتسب لدى الشركة</span>
          <button className="chip" style={{ minHeight: 36, fontSize: 12.5 }} onClick={onUndo}>تراجع</button>
        </div>
      )}
    </div>
  );
}
