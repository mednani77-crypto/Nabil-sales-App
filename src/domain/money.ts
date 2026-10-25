/**
 * Money is always an integer number of santim (1 birr = 100 santim).
 * Never do arithmetic on birr floats.
 */
export type Santim = number;

export const SANTIM_PER_BIRR = 100;

/** Parse what the user typed ("1,250.5", "1250", " 300 ") into santim. Returns null if invalid. */
export function parseBirr(input: string | number | null | undefined): Santim | null {
  if (input === null || input === undefined) return null;
  const s = String(input).replace(/[,\s]/g, '').replace('٫', '.');
  if (s === '') return null;
  if (!/^\d+(\.\d{0,2})?$/.test(s)) return null;
  const [whole, frac = ''] = s.split('.');
  return Number(whole) * SANTIM_PER_BIRR + Number((frac + '00').slice(0, 2));
}

/** Birr value for an <input> field (no separators). */
export function toBirrInput(v: Santim): string {
  const whole = Math.trunc(v / SANTIM_PER_BIRR);
  const frac = Math.abs(v % SANTIM_PER_BIRR);
  return frac ? `${whole}.${String(frac).padStart(2, '0')}` : String(whole);
}

/** Display: "12,600" or "12,600.50"; negative shown with a leading minus. */
export function fmtMoney(v: Santim): string {
  const neg = v < 0;
  const a = Math.abs(v);
  const whole = Math.trunc(a / SANTIM_PER_BIRR);
  const frac = a % SANTIM_PER_BIRR;
  const w = whole.toLocaleString('en-US');
  return (neg ? '−' : '') + (frac ? `${w}.${String(frac).padStart(2, '0')}` : w);
}

/** Integer multiply: quantity × unit price (santim). */
export function lineAmount(qty: number, unitPrice: Santim): Santim {
  if (!Number.isInteger(qty) || !Number.isInteger(unitPrice)) {
    throw new Error('qty and unitPrice must be integers');
  }
  return qty * unitPrice;
}
