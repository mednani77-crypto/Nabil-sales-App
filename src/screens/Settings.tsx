import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { db } from '../db/db';
import { getDevice, resetAll } from '../db/repo';
import { loadDemo } from '../db/seed';
import { TopBar, useToast } from '../ui/kit';

export function SettingsScreen() {
  const toast = useToast();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [device, setDevice] = useState<{ code: string } | null>(null);
  useEffect(() => {
    getDevice(db).then(setDevice);
  }, []);
  const counts = useLiveQuery(async () => ({ ops: await db.operations.count(), items: await db.items.count(), customers: await db.customers.count() }), []);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

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
        <div className="card pad">
          <b>حالة الاتصال: {online ? 'متصل' : 'دون اتصال'}</b>
          <span className="sub">في هذه المرحلة تُحفظ كل البيانات على هذا الجهاز فقط وتعمل دون إنترنت. المزامنة مع السحابة والأجهزة الأخرى في المرحلة 5.</span>
          <span className="sub num">
            رمز الجهاز: {device?.code ?? '…'} · عمليات: {counts?.ops ?? 0} · أصناف: {counts?.items ?? 0} · عملاء: {counts?.customers ?? 0}
          </span>
        </div>
        <Link className="btn btn-g" to="/opening">الأرصدة الافتتاحية</Link>
        <div className="sec">للتجربة</div>
        <button className="btn btn-d" disabled={busy} onClick={demo}>تحميل بيانات تجريبية</button>
        <button className="btn btn-g" style={{ color: 'var(--red)' }} onClick={wipe}>حذف كل البيانات من هذا الجهاز</button>
        <div className="note amber">للتجربة فقط قبل بدء العمل الحقيقي. بعد بدء الاستخدام الفعلي سيُزال هذان الزران.</div>
      </div>
    </div>
  );
}
