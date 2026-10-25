import type { CompanyBank, PayDestination, WalletKey } from '../domain/types';

export const WALLET_LABEL: Record<WalletKey, string> = { cash: 'النقد في اليد', cbe: 'CBE الشخصي', ebirr: 'Ebirr الشخصي' };
export const WALLET_SHORT: Record<WalletKey, string> = { cash: 'نقد', cbe: 'CBE', ebirr: 'Ebirr' };
export const BANK_LABEL: Record<CompanyBank, string> = { cbe: 'CBE', ebirr: 'Ebirr', abyssinia: 'Abyssinia', awash: 'Awash' };

export function destinationLabel(d: PayDestination | null): string {
  if (!d) return '—';
  return d.kind === 'wallet' ? WALLET_LABEL[d.wallet] : `حساب الشركة · ${BANK_LABEL[d.bank]}`;
}

export const PAY_MODE_LABEL = { cash: 'نقدي', credit: 'آجل', partial: 'جزئي' } as const;
