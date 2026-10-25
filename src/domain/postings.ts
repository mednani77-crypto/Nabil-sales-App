import { lineAmount, type Santim } from './money';
import {
  customerAccount,
  walletAccount,
  WALLETS,
  type OpLine,
  type Operation,
  type Posting,
  type StockMove,
} from './types';

export function linesTotal(lines: OpLine[]): Santim {
  return lines.reduce((t, l) => t + lineAmount(l.qty, l.unitPrice), 0);
}

/** The single source of truth for how an operation affects money accounts. */
export function postingsOf(op: Operation): Posting[] {
  const base = { opId: op.id, opType: op.type, date: op.date };
  const out: Posting[] = [];
  const dr = (account: Posting['account'], amount: Santim, extra?: Partial<Posting>) => {
    if (amount !== 0) out.push({ ...base, account, debit: amount, credit: 0, ...extra });
  };
  const cr = (account: Posting['account'], amount: Santim, extra?: Partial<Posting>) => {
    if (amount !== 0) out.push({ ...base, account, debit: 0, credit: amount, ...extra });
  };
  // A negative opening balance is a credit balance.
  const signed = (account: Posting['account'], amount: Santim) =>
    amount >= 0 ? dr(account, amount) : cr(account, -amount);

  switch (op.type) {
    case 'receive':
      dr('company', linesTotal(op.lines));
      break;

    case 'sale': {
      const total = linesTotal(op.lines);
      if (op.customerId) {
        dr(customerAccount(op.customerId), total);
        cr(customerAccount(op.customerId), op.paid);
      }
      if (op.paid > 0 && op.destination) {
        if (op.destination.kind === 'wallet') dr(walletAccount(op.destination.wallet), op.paid);
        else cr('company', op.paid, { unconfirmed: true });
      }
      break;
    }

    case 'opening':
      signed('company', op.company);
      for (const c of op.customers) signed(customerAccount(c.customerId), c.balance);
      for (const w of WALLETS) dr(walletAccount(w), op.wallets[w] ?? 0);
      // Opening stock is intentionally NOT posted to the company account (spec rule 8).
      break;

    case 'collection':
      cr(customerAccount(op.customerId), op.amount);
      if (op.destination.kind === 'wallet') dr(walletAccount(op.destination.wallet), op.amount);
      else cr('company', op.amount, { unconfirmed: true });
      break;

    case 'transfer':
      cr(walletAccount(op.from), op.amount);
      dr(walletAccount(op.to), op.amount);
      break;

    case 'companyPayment':
      cr(walletAccount(op.source), op.amount);
      cr('company', op.amount, { unconfirmed: true });
      break;

    case 'noticeStatus':
      // Tracking only — never moves money. Confirmation is applied in balances.allPostings().
      break;
  }
  return out;
}

export function stockMovesOf(op: Operation): StockMove[] {
  const base = { opId: op.id, opType: op.type, date: op.date };
  switch (op.type) {
    case 'receive':
      return op.lines.map((l) => ({ ...base, itemId: l.itemId, qty: l.qty * l.factor }));
    case 'sale':
      return op.lines.map((l) => ({ ...base, itemId: l.itemId, qty: -l.qty * l.factor }));
    case 'opening':
      return op.stock.filter((s) => s.qty !== 0).map((s) => ({ ...base, itemId: s.itemId, qty: s.qty }));
    case 'collection':
    case 'transfer':
    case 'companyPayment':
    case 'noticeStatus':
      return [];
  }
}
