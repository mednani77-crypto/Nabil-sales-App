import { describe, expect, it } from 'vitest';
import type { SaleOp } from '../domain/types';
import { INV, invoiceText } from './invoiceDoc';

const sale: SaleOp = {
  id: 's1', type: 'sale', date: '2026-10-26', createdAt: '2026-10-26T09:00:00Z', deviceId: 'd', syncState: 'local', docNo: 'C-1001', customerId: 'c1',
  lines: [{ itemId: 'r', itemName: 'رز مايا 25', unitName: 'كنتال', factor: 1, qty: 5, unitPrice: 1880000 }],
  payMode: 'partial', paid: 5000000, destination: { kind: 'wallet', wallet: 'cash' },
};

describe('invoice message', () => {
  it('keeps names, numbers and invoice number; shows the remaining balance', () => {
    const t = invoiceText(sale, 'عبد الفتاح', 'en');
    expect(t).toContain('*Sales Invoice C-1001*');
    expect(t).toContain('Customer: عبد الفتاح');
    expect(t).toContain('• رز مايا 25\n\u200E   5 × 18,800 = 94,000  (كنتال)');
    expect(t.split('\n').filter(Boolean).every((l) => l.startsWith('\u200E'))).toBe(true);
    expect(invoiceText(sale, 'x', 'ar').startsWith('\u200F')).toBe(true);
    expect(t).toContain('*Total: 94,000 ETB*');
    expect(t).toContain('Paid (Part payment): 50,000');
    expect(t).toContain('*Balance due: 44,000 ETB*');
    expect(t).toContain('26/10/2026');
  });

  it('has every label in all 5 languages and omits the balance line when fully paid', () => {
    for (const lang of ['ar', 'en', 'so', 'am', 'om'] as const) {
      expect(Object.values(INV[lang]).every((v) => v !== '')).toBe(true);
      const paid = invoiceText({ ...sale, payMode: 'cash', paid: 9400000 }, undefined, lang);
      expect(paid).toContain(INV[lang].cashCustomer);
      expect(paid).not.toContain(INV[lang].remaining);
    }
    expect(invoiceText(sale, 'x', 'ar', true)).toContain('ملغاة');
  });
});
