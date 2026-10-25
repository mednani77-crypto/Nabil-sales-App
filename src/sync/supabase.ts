import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Operation } from '../domain/types';
import type { MasterRow, MasterTable, RemoteAttachment, RemoteMaster, RemoteOp, Transport } from './engine';

/**
 * Public project settings. The URL and the publishable (anon) key are safe to ship in the app:
 * every table is protected by row-level security tied to the signed-in user.
 * Set them at build time (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) or fill them here.
 */
export const SUPABASE_URL: string = import.meta.env.VITE_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY: string = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

export const syncConfigured = () => Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

let client: SupabaseClient | null = null;
export function supabase(): SupabaseClient | null {
  if (!syncConfigured()) return null;
  if (!client) client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
  return client;
}

function check<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return (r.data ?? ([] as unknown)) as T;
}

export function supabaseTransport(sb: SupabaseClient, userId: string): Transport {
  return {
    async registerDevice(id, preferredCode, label) {
      const existing = check(await sb.from('devices').select('id, code'));
      const mine = existing.find((d) => d.id === id);
      if (mine) return mine.code as string;
      const used = new Set(existing.map((d) => d.code as string));
      const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
      const code = !used.has(preferredCode) ? preferredCode : [...letters].find((l) => !used.has(l)) ?? preferredCode + existing.length;
      check(await sb.from('devices').insert({ id, code, label }));
      return code;
    },

    async pushOps(ops: Operation[]) {
      const rows = ops.map((o) => ({ id: o.id, device_id: o.deviceId, type: o.type, op_date: o.date, created_at: o.createdAt, payload: o }));
      check(await sb.from('operations').upsert(rows, { onConflict: 'id', ignoreDuplicates: true }));
    },

    async pullOps(afterSeq, limit): Promise<RemoteOp[]> {
      const data = check(await sb.from('operations').select('server_seq, payload').gt('server_seq', afterSeq).order('server_seq').limit(limit));
      return data.map((r) => ({ seq: r.server_seq as number, payload: r.payload as Operation }));
    },

    async pushMaster<T>(table: MasterTable, rows: MasterRow<T>[]) {
      check(await sb.from(table).upsert(rows.map((r) => ({ id: r.id, payload: r.payload, updated_at: r.updatedAt })), { onConflict: 'id' }));
    },

    async pullMaster<T>(table: MasterTable, afterSeq: number, limit: number): Promise<RemoteMaster<T>[]> {
      const data = check(await sb.from(table).select('id, payload, updated_at, server_seq').gt('server_seq', afterSeq).order('server_seq').limit(limit));
      return data.map((r) => ({ id: r.id as string, payload: r.payload as T, updatedAt: new Date(r.updated_at as string).toISOString(), seq: r.server_seq as number }));
    },

    async pushAttachment(a) {
      const path = `${userId}/${a.opId}/${a.id}.jpg`;
      const up = await sb.storage.from('attachments').upload(path, a.blob, { contentType: a.mime, upsert: false });
      if (up.error && !/exists|duplicate/i.test(up.error.message)) throw new Error(up.error.message);
      check(await sb.from('attachments').upsert({ id: a.id, op_id: a.opId, path, mime: a.mime, created_at: a.createdAt }, { onConflict: 'id', ignoreDuplicates: true }));
    },

    async pullAttachments(afterSeq, limit): Promise<RemoteAttachment[]> {
      const data = check(await sb.from('attachments').select('id, op_id, path, mime, created_at, server_seq').gt('server_seq', afterSeq).order('server_seq').limit(limit));
      return data.map((r) => ({ seq: r.server_seq as number, id: r.id as string, opId: r.op_id as string, path: r.path as string, mime: r.mime as string, createdAt: r.created_at as string }));
    },

    async downloadAttachment(path) {
      const r = await sb.storage.from('attachments').download(path);
      if (r.error || !r.data) throw new Error(r.error?.message ?? 'download failed');
      return r.data;
    },
  };
}
