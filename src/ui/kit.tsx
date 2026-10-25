import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from './Icon';

/* ---------- Toast ---------- */
type ToastState = { msg: string; error?: boolean } | null;
const ToastCtx = createContext<(msg: string, error?: boolean) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [t, setT] = useState<ToastState>(null);
  const timer = useRef<number>();
  const show = useCallback((msg: string, error?: boolean) => {
    setT({ msg, error });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setT(null), error ? 4500 : 2800);
  }, []);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {t && (
        <div role="status" className={`toast${t.error ? ' err' : ''}`}>
          <Icon name={t.error ? 'alert' : 'check'} small style={{ color: t.error ? '#ffb4ab' : 'var(--amber)' }} />
          <span style={{ flex: 1, whiteSpace: 'pre-line' }}>{t.msg}</span>
        </div>
      )}
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

/* ---------- Top bar with back button ---------- */
export function TopBar({ title, children }: { title: ReactNode; children?: ReactNode }) {
  const nav = useNavigate();
  return (
    <div className="topbar">
      <button className="icbtn" aria-label="رجوع" onClick={() => (window.history.length > 1 ? nav(-1) : nav('/'))}>
        <Icon name="back" />
      </button>
      <h1>{title}</h1>
      {children}
    </div>
  );
}

/* ---------- Bottom sheet ---------- */
export function Sheet({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="sheet-wrap" role="dialog" aria-modal="true">
      <button className="sheet-bg" aria-label="إغلاق" onClick={onClose} />
      <div className="sheet">
        <div className="grab" />
        {children}
      </div>
    </div>
  );
}

/* ---------- Search field ---------- */
export function SearchField({ value, onChange, placeholder, label }: { value: string; onChange: (v: string) => void; placeholder: string; label: string }) {
  return (
    <label className="search">
      <Icon name="search" small />
      <input className="inp" aria-label={label} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
