import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { db } from '../db/db';
import { buildBackup, restoreBackup } from '../db/backup';
import { getDevice, resetAll } from '../db/repo';
import { loadDemo } from '../db/seed';
import { fmtDate, fmtTime, todayISO } from '../lib/dates';
import { syncNow, useSyncStatus } from '../sync/service';
import { supabase } from '../sync/supabase';
import { Icon } from '../ui/Icon';
import { TopBar, useToast } from '../ui/kit';
import { PinPad, setPin, usePinEnabled } from '../ui/Lock';
import { Sheet } from '../ui/kit';

export function SettingsScreen() {
  const toast = useToast();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [device, setDevice] = useState<{ code: string } | null>(null);
  useEffect(() => {
    getDevice(db).then(setDevice);
  }, []);
  const counts = useLiveQuery(async () => ({ ops: await db.operations.count(), items: await db.items.count(), customers: await db.customers.count() }), []);

  async function demo() {
    if (counts && counts.ops > 0 && !window.confirm('سيُستبدل كل ما على هذا الجهاز ببيانات تجريبية. متابعة؟')) return;
    setBusy(true);
    try {
      await loadDemo(db);
      toast('حُمّلت البيانات التجريبية');
      nav('/');
    } finally {
      setBusy(false);
    }
  }

  async function wipe() {
    if (!window.confirm('حذف كل البيانات من هذا الجهاز؟ لا يمكن التراجع.')) return;
    await resetAll(db);
    toast('حُذفت البيانات من هذا الجهاز');
    nav('/');
  }

  return (
    <div className="anim">
      <TopBar title="الإعدادات" />
      <div className="page" style={{ paddingTop: 4 }}>
        <SyncCard />
        <LockCard />
        <BackupCard />

        <div className="sec">البيانات</div>
        <Link className="btn btn-g" to="/opening">الأرصدة الافتتاحية</Link>
        <span className="sub num" style={{ padding: '0 4px' }}>
          رمز هذا الجهاز: {device?.code ?? '…'} · عمليات: {counts?.ops ?? 0} · أصناف: {counts?.items ?? 0} · عملاء: {counts?.customers ?? 0}
        </span>

        <div className="sec">للتجربة</div>
        <button className="btn btn-d" disabled={busy} onClick={demo}>تحميل بيانات تجريبية</button>
        <button className="btn btn-g" style={{ color: 'var(--red)' }} onClick={wipe}>حذف كل البيانات من هذا الجهاز</button>
        <div className="note amber">للتجربة فقط قبل بدء العمل الحقيقي. بعد بدء الاستخدام الفعلي سيُزال هذان الزران.</div>
      </div>
    </div>
  );
}

/* ---------------- Account & sync ---------------- */
function SyncCard() {
  const toast = useToast();
  const st = useSyncStatus();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  if (!st.configured) {
    return (
      <div className="card pad">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="avatar" style={{ background: 'var(--amber-soft)', color: 'var(--amber-ink)' }}><Icon name="cloud" /></span>
          <span style={{ flex: 1 }}><b>المزامنة غير مفعّلة بعد</b><div className="sub" style={{ fontSize: 12.5 }}>البيانات محفوظة على هذا الجهاز فقط وتعمل دون إنترنت.</div></span>
        </div>
      </div>
    );
  }

  async function auth(kind: 'in' | 'up') {
    const sb = supabase()!;
    setBusy(true);
    try {
      const r = kind === 'in' ? await sb.auth.signInWithPassword({ email: email.trim(), password }) : await sb.auth.signUp({ email: email.trim(), password });
      if (r.error) throw r.error;
      if (kind === 'up' && !r.data.session) toast('أُرسل رابط تأكيد إلى بريدك. افتحه ثم سجّل الدخول.');
      else toast('تم تسجيل الدخول — بدأت المزامنة');
      setPassword('');
    } catch (e) {
      const m = (e as Error).message;
      toast(/invalid login/i.test(m) ? 'البريد أو كلمة السر غير صحيحة' : /least 6/i.test(m) ? 'كلمة السر 6 أحرف على الأقل' : m, true);
    } finally {
      setBusy(false);
    }
  }

  if (!st.session) {
    return (
      <div className="card pad" style={{ gap: 12 }}>
        <b>الحساب والمزامنة</b>
        <span className="sub" style={{ fontSize: 13 }}>سجّل الدخول لحفظ بياناتك في السحابة والوصول إليها من هاتف آخر أو من الكمبيوتر. بياناتك الحالية على هذا الجهاز تبقى كما هي وتُرفع تلقائيًا.</span>
        <input className="inp" type="email" dir="ltr" style={{ textAlign: 'right' }} autoComplete="email" placeholder="البريد الإلكتروني" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className="inp" type="password" dir="ltr" style={{ textAlign: 'right' }} autoComplete="current-password" placeholder="كلمة السر" value={password} onChange={(e) => setPassword(e.target.value)} />
        <div className="grid2" style={{ gap: 8 }}>
          <button className="btn btn-d" disabled={busy} onClick={() => auth('in')}>دخول</button>
          <button className="btn btn-g" disabled={busy} onClick={() => auth('up')}>إنشاء الحساب</button>
        </div>
      </div>
    );
  }

  const tone = !st.online ? ['var(--amber-soft)', 'var(--amber-ink)', 'دون اتصال · الحفظ على الهاتف'] : st.lastError ? ['var(--red-soft)', 'var(--red)', 'تعذّرت آخر مزامنة — ستُعاد تلقائيًا'] : st.running || st.pending ? ['var(--blue-soft)', 'var(--blue)', 'جارٍ الرفع…'] : ['var(--teal-soft)', 'var(--teal-ink)', 'متصل · كل البيانات متزامنة'];
  return (
    <div className="card pad" style={{ gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span className="avatar" style={{ background: tone[0], color: tone[1] }}><Icon name="cloud" /></span>
        <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <b>{tone[2]}</b>
          <span className="sub num" style={{ fontSize: 12.5 }}>
            {st.session.user.email}
            {st.lastAt ? ` · آخر مزامنة ${fmtDate(st.lastAt.slice(0, 10)) === fmtDate(todayISO()) ? 'اليوم' : fmtDate(st.lastAt.slice(0, 10))} ${fmtTime(st.lastAt)}` : ''}
          </span>
        </span>
      </div>
      <div className="grid2" style={{ gap: 8, textAlign: 'center' }}>
        <div style={{ background: 'var(--soft)', borderRadius: 12, padding: '10px 4px' }}><b className="num" style={{ fontSize: 18 }}>{st.pending}</b><div className="sub" style={{ fontSize: 11.5 }}>بانتظار الرفع</div></div>
        <div style={{ background: 'var(--soft)', borderRadius: 12, padding: '10px 4px' }}><b className="num" style={{ fontSize: 18 }}>{st.lastError ? 1 : 0}</b><div className="sub" style={{ fontSize: 11.5 }}>أخطاء</div></div>
      </div>
      {st.lastError && <div className="note red">{st.lastError}</div>}
      <div className="grid2" style={{ gap: 8 }}>
        <button className="btn btn-g" disabled={st.running || !st.online} onClick={() => syncNow().then(() => toast('اكتملت المزامنة'))}>مزامنة الآن</button>
        <button className="btn btn-g" onClick={async () => { await supabase()!.auth.signOut(); toast('خرجت من الحساب — بياناتك على الجهاز باقية'); }}>خروج</button>
      </div>
    </div>
  );
}

/* ---------------- PIN lock ---------------- */
function LockCard() {
  const toast = useToast();
  const enabled = usePinEnabled();
  const [step, setStep] = useState<'off' | 'new' | 'confirm'>('off');
  const first = useRef('');
  return (
    <>
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px' }}>
        <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <b>قفل التطبيق برمز سري</b>
          <span className="sub" style={{ fontSize: 12.5 }}>{enabled ? 'مفعّل — يُطلب عند الفتح وبعد دقيقتين في الخلفية' : 'غير مفعّل'}</span>
        </span>
        {enabled ? (
          <button className="chip" onClick={async () => { await setPin(null); toast('أُلغي القفل'); }}>إلغاء</button>
        ) : (
          <button className="chip on" onClick={() => setStep('new')}>تفعيل</button>
        )}
      </div>
      <Sheet open={step !== 'off'} onClose={() => setStep('off')}>
        {step === 'new' && <PinPad title="اختر رمزًا من 4 أرقام" verify={async () => true} onOk={(p) => { first.current = p; setStep('confirm'); }} />}
        {step === 'confirm' && (
          <PinPad
            title="أعد إدخال الرمز"
            verify={async (p) => p === first.current}
            onOk={async (p) => { await setPin(p); setStep('off'); toast('فُعّل قفل التطبيق'); }}
          />
        )}
      </Sheet>
    </>
  );
}

/* ---------------- Backup ---------------- */
function BackupCard() {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function exportNow() {
    setBusy(true);
    try {
      const json = JSON.stringify(await buildBackup(db));
      const name = `nabil-backup-${todayISO()}.json`;
      if (Capacitor.isNativePlatform()) {
        const w = await Filesystem.writeFile({ path: name, data: json, directory: Directory.Cache, encoding: Encoding.UTF8 });
        await Share.share({ title: 'نسخة احتياطية', files: [w.uri], dialogTitle: 'حفظ النسخة الاحتياطية' });
      } else {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
        a.download = name;
        a.click();
        URL.revokeObjectURL(a.href);
      }
      await db.meta.put({ key: 'backup:lastAt', value: new Date().toISOString() });
      toast('جُهّزت النسخة الاحتياطية — احفظها في Drive أو أرسلها لنفسك');
    } catch (e) {
      if (!/cancel/i.test(String((e as Error).message))) toast('تعذّر إنشاء النسخة', true);
    } finally {
      setBusy(false);
    }
  }

  async function importFile(f: File) {
    setBusy(true);
    try {
      const r = await restoreBackup(db, JSON.parse(await f.text()));
      toast(`اكتملت الاستعادة: ${r.operations} عملية، ${r.items + r.customers} سجل، ${r.attachments} صورة — دون حذف أي شيء`);
    } catch (e) {
      toast((e as Error).message || 'تعذّرت الاستعادة', true);
    } finally {
      setBusy(false);
    }
  }

  const last = useLiveQuery(async () => (await db.meta.get('backup:lastAt'))?.value as string | undefined, []);
  return (
    <div className="card pad" style={{ gap: 10 }}>
      <b>النسخ الاحتياطي</b>
      <span className="sub" style={{ fontSize: 12.5 }}>
        ملف واحد فيه كل العمليات والعملاء والأصناف وصور الإشعارات. الاستعادة تدمج ولا تحذف شيئًا.
        {last ? ` آخر نسخة: ${fmtDate(last.slice(0, 10))}.` : ''}
      </span>
      <div className="grid2" style={{ gap: 8 }}>
        <button className="btn btn-g" disabled={busy} onClick={exportNow}>نسخة احتياطية الآن</button>
        <button className="btn btn-g" disabled={busy} onClick={() => input.current?.click()}>استعادة من ملف</button>
      </div>
      <input ref={input} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void importFile(f); }} />
    </div>
  );
}
