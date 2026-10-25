import { noticeStatuses, sortOps, uniqueOps } from './balances';
import { companyTransfers, type CompanyTransfer } from './moneyOps';
import type { OpContext, Result } from './operations';
import type { NoticeStatus, NoticeStatusOp, Operation, WalletKey } from './types';

/** A bank-transfer notice to share in the WhatsApp group and get confirmed by the company. */
export interface Notice extends CompanyTransfer {
  status: NoticeStatus;
  /** Where the money came from. */
  from: { kind: 'wallet'; wallet: WalletKey } | { kind: 'customer'; customerId: string | null };
}

export function notices(ops: Operation[]): Notice[] {
  const st = noticeStatuses(ops);
  const list = companyTransfers(sortOps(uniqueOps(ops))).map<Notice>((t) => ({
    ...t,
    status: st.get(t.op.id) ?? 'recorded',
    from:
      t.op.type === 'companyPayment'
        ? { kind: 'wallet', wallet: t.op.source }
        : { kind: 'customer', customerId: t.op.type === 'collection' || t.op.type === 'sale' ? t.op.customerId : null },
  }));
  return list.reverse(); // newest first
}

export function noticeCounts(ops: Operation[]): Record<NoticeStatus, number> {
  const c: Record<NoticeStatus, number> = { recorded: 0, sent: 0, confirmed: 0 };
  for (const n of notices(ops)) c[n.status]++;
  return c;
}

export function buildNoticeStatus(
  targetOpId: string,
  status: NoticeStatus,
  ops: Operation[],
  ctx: OpContext,
): Result<NoticeStatusOp> {
  if (!companyTransfers(ops).some((t) => t.op.id === targetOpId)) {
    return { ok: false, errors: ['هذه العملية ليست حوالة إلى حساب الشركة'] };
  }
  return { ok: true, value: { ...ctx, type: 'noticeStatus', targetOpId, status, syncState: 'local' } };
}
