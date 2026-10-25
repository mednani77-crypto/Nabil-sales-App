import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { db } from '../db/db';

/* Simple app lock: a 4-digit PIN asked when the app opens and after 2 minutes in the background.
 * Only a salted SHA-256 hash is stored on the device. */

interface PinRecord {
  salt: string;
  hash: string;
}

async function sha(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function setPin(pin: string | null) {
  if (!pin) return db.meta.delete('pin');
  const salt = crypto.getRandomValues(new Uint32Array(4)).join('-');
  await db.meta.put({ key: 'pin', value: { salt, hash: await sha(salt + pin) } satisfies PinRecord });
}

async function checkPin(pin: string): Promise<boolean> {
  const rec = (await db.meta.get('pin'))?.value as PinRecord | undefined;
  return !rec || (await sha(rec.salt + pin)) === rec.hash;
}

export function usePinEnabled() {
  return useLiveQuery(async () => Boolean(await db.meta.get('pin')), []);
}

const AWAY_MS = 2 * 60 * 1000;

export function LockGate({ children }: { children: ReactNode }) {
  const enabled = usePinEnabled();
  const [unlocked, setUnlocked] = useState(false);
  const hiddenAt = useRef<number | null>(null);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'hidden') hiddenAt.current = Date.now();
      else if (hiddenAt.current && Date.now() - hiddenAt.current > AWAY_MS) setUnlocked(false);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  if (enabled === undefined) return null;
  if (!enabled || unlocked) return <>{children}</>;
  return <PinPad onOk={() => setUnlocked(true)} />;
}

export function PinPad({ onOk, title = 'أدخل الرمز السري', verify = checkPin }: { onOk: (pin: string) => void; title?: string; verify?: (pin: string) => Promise<boolean> }) {
  const [pin, setPinText] = useState('');
  const [error, setError] = useState(false);

  async function press(d: string) {
    if (pin.length >= 4) return;
    const next = pin + d;
    setPinText(next);
    setError(false);
    if (next.length === 4) {
      if (await verify(next)) onOk(next);
      else {
        setError(true);
        setTimeout(() => setPinText(''), 400);
      }
    }
  }

  return (
    <div className="app" style={{ alignItems: 'center', justifyContent: 'center', padding: 24, gap: 24 }}>
      <div className="h" style={{ width: 64, height: 64, borderRadius: 22, background: 'var(--ink)', color: 'var(--amber)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 800 }}>ن</div>
      <h1 className="title" style={{ fontSize: 20 }}>{title}</h1>
      <div dir="ltr" style={{ display: 'flex', gap: 14 }} aria-live="polite" aria-label={`${pin.length} من 4`}>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} style={{ width: 16, height: 16, borderRadius: '50%', background: i < pin.length ? (error ? 'var(--red)' : 'var(--ink)') : 'var(--line2)' }} />
        ))}
      </div>
      {error && <div style={{ color: 'var(--red)', fontWeight: 600 }}>الرمز غير صحيح</div>}
      <div dir="ltr" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 76px)', gap: 12 }}>
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((k, i) =>
          k === '' ? (
            <span key={i} />
          ) : (
            <button
              key={i}
              className="num"
              aria-label={k === '⌫' ? 'حذف' : k}
              onClick={() => (k === '⌫' ? setPinText(pin.slice(0, -1)) : press(k))}
              style={{ height: 64, borderRadius: 20, border: '1px solid var(--line)', background: '#fff', fontSize: 24, fontWeight: 600, cursor: 'pointer' }}
            >
              {k}
            </button>
          ),
        )}
      </div>
    </div>
  );
}
