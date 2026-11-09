import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { db } from '../db/db';
import { pendingCount, resetEverywhere, syncOnce } from './engine';
import { supabase, supabaseTransport, syncConfigured } from './supabase';

/* Runs sync in the background: on start, when the network comes back, when the app returns to
 * the foreground, a few seconds after each local save, and every minute while open.
 * If the platform kills the app, nothing is lost: everything is in IndexedDB and is retried
 * on the next start. */

type Listener = () => void;
let running = false;
let queued = false;
let timer: number | undefined;
const listeners = new Set<Listener>();
const notify = () => listeners.forEach((l) => l());
export let lastResult: { ok: boolean; message: string; at: string } | null = null;

export async function syncNow(): Promise<void> {
  const sb = supabase();
  if (!sb || !navigator.onLine) return;
  if (running) {
    queued = true;
    return;
  }
  const { data } = await sb.auth.getSession();
  if (!data.session) return;
  running = true;
  notify();
  try {
    const r = await syncOnce(db, supabaseTransport(sb, data.session.user.id), /android/i.test(navigator.userAgent) ? 'هاتف' : 'كمبيوتر');
    lastResult = { ok: true, message: `رُفعت ${r.pushedOps + r.pushedFiles} ونُزّلت ${r.pulledOps + r.pulledFiles + r.pulledMaster}`, at: new Date().toISOString() };
  } catch (e) {
    const message = (e as Error).message || 'خطأ غير معروف';
    lastResult = { ok: false, message, at: new Date().toISOString() };
    await db.meta.put({ key: 'sync:lastError', value: message });
  } finally {
    running = false;
    notify();
    if (queued) {
      queued = false;
      void syncNow();
    }
  }
}

/** "Start over" while signed in: wipe the account on the server and on this device; other
 *  devices clear themselves on their next sync. Waits for a running sync so it can't re-upload. */
export async function resetAccountEverywhere(): Promise<void> {
  const sb = supabase();
  if (!sb) throw new Error('المزامنة غير مفعّلة');
  if (!navigator.onLine) throw new Error('لا يوجد اتصال بالإنترنت');
  const { data } = await sb.auth.getSession();
  if (!data.session) throw new Error('لم تسجّل الدخول');
  for (let i = 0; running && i < 150; i++) await new Promise((r) => setTimeout(r, 200));
  window.clearTimeout(timer);
  running = true;
  notify();
  try {
    await resetEverywhere(db, supabaseTransport(sb, data.session.user.id));
    lastResult = null;
  } finally {
    running = false;
    queued = false;
    notify();
  }
}

/** Call after any local save: syncs a few seconds later (batching quick successive saves). */
export function scheduleSync(delayMs = 3000) {
  window.clearTimeout(timer);
  timer = window.setTimeout(() => void syncNow(), delayMs);
}

export function startSyncLoop() {
  if (!syncConfigured()) return () => {};
  void syncNow();
  const onOnline = () => void syncNow();
  const onVisible = () => document.visibilityState === 'visible' && void syncNow();
  window.addEventListener('online', onOnline);
  document.addEventListener('visibilitychange', onVisible);
  const every = window.setInterval(() => void syncNow(), 60_000);
  // Any write to operations / master data / photos triggers a debounced sync.
  const hook = () => scheduleSync();
  db.operations.hook('creating', hook);
  db.items.hook('creating', hook);
  db.items.hook('updating', hook);
  db.customers.hook('creating', hook);
  db.customers.hook('updating', hook);
  db.attachments.hook('creating', hook);
  return () => {
    window.removeEventListener('online', onOnline);
    document.removeEventListener('visibilitychange', onVisible);
    window.clearInterval(every);
    db.operations.hook('creating').unsubscribe(hook);
    db.items.hook('creating').unsubscribe(hook);
    db.items.hook('updating').unsubscribe(hook);
    db.customers.hook('creating').unsubscribe(hook);
    db.customers.hook('updating').unsubscribe(hook);
    db.attachments.hook('creating').unsubscribe(hook);
  };
}

export function useSyncStatus() {
  const [, force] = useState(0);
  const [online, setOnline] = useState(navigator.onLine);
  const [session, setSession] = useState<Session | null>(null);
  useEffect(() => {
    const l = () => force((x) => x + 1);
    listeners.add(l);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    const sb = supabase();
    let unsub = () => {};
    if (sb) {
      sb.auth.getSession().then(({ data }) => setSession(data.session));
      const { data } = sb.auth.onAuthStateChange((_e, s) => {
        setSession(s);
        if (s) void syncNow();
      });
      unsub = () => data.subscription.unsubscribe();
    }
    return () => {
      listeners.delete(l);
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
      unsub();
    };
  }, []);
  const pending = useLiveQuery(() => pendingCount(db), []) ?? 0;
  const lastAt = useLiveQuery(async () => (await db.meta.get('sync:lastAt'))?.value as string | undefined, []);
  const lastError = useLiveQuery(async () => (await db.meta.get('sync:lastError'))?.value as string | null | undefined, []);
  return { configured: syncConfigured(), online, session, running, pending, lastAt, lastError: lastError ?? null };
}
