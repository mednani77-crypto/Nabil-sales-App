import type { Customer, Operation, Posting } from '../domain/types';
import { BANK_LABEL, WALLET_LABEL } from './labels';

/** Arabic description of one posting line in a ledger (customer, wallet or company account). */
export function describePosting(p: Posting, op: Operation | undefined, customers?: Map<string, Customer>): string {
  if (!op) return '';
  const cname = (id: string | null | undefined) => (id ? customers?.get(id)?.name ?? 'عميل' : 'بيع نقدي');
  const ref = (r?: string) => (r ? ` · ${r}` : '');
  const onCustomer = p.account.startsWith('customer');
  const onWallet = p.account.startsWith('wallet');

  switch (op.type) {
    case 'opening':
      return 'رصيد افتتاحي';
    case 'receive':
      return `استلام بضاعة ${op.docNo}`;
    case 'sale': {
      if (onCustomer && p.debit > 0) return `فاتورة بيع ${op.docNo}`;
      const d = op.destination;
      const where = d ? (d.kind === 'wallet' ? WALLET_LABEL[d.wallet] : `${BANK_LABEL[d.bank]} (الشركة)`) : '';
      if (p.account === 'company') return `تحويل مباشر من ${cname(op.customerId)} · ${where} · ${op.docNo}`;
      if (onWallet) return `فاتورة ${op.docNo} · ${cname(op.customerId)}`;
      return `دفعة مع الفاتورة ${op.docNo} · ${where}`;
    }
    case 'collection': {
      const d = op.destination;
      if (onCustomer) return `تحصيل · ${d.kind === 'wallet' ? WALLET_LABEL[d.wallet] : `${BANK_LABEL[d.bank]} (الشركة)`}${ref(op.ref)}`;
      if (onWallet) return `تحصيل من ${cname(op.customerId)}`;
      return `تحويل مباشر من ${cname(op.customerId)} · ${d.kind === 'company' ? BANK_LABEL[d.bank] : ''}${ref(op.ref)}`;
    }
    case 'transfer':
      return p.credit > 0 ? `تحويل إلى ${WALLET_LABEL[op.to]}` : `تحويل من ${WALLET_LABEL[op.from]}`;
    case 'companyPayment':
      if (onWallet) return `سداد للشركة · ${BANK_LABEL[op.bank]}${ref(op.ref)}`;
      return `سداد من ${WALLET_LABEL[op.source]} · ${BANK_LABEL[op.bank]}${ref(op.ref)}`;
  }
}
