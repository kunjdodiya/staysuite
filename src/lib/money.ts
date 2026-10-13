import type { Minor } from '@/domain/types';

const ZERO_DECIMAL = new Set(['JPY', 'KRW', 'VND', 'IDR', 'CLP', 'ISK']);

export function minorDigits(currency: string) {
  return ZERO_DECIMAL.has(currency) ? 0 : 2;
}

export function toMinor(major: number | string, currency = 'INR'): Minor {
  const n = typeof major === 'string' ? Number(major.replace(/[^0-9.-]/g, '')) : major;
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 10 ** minorDigits(currency));
}

export function toMajor(minor: Minor, currency = 'INR'): number {
  return minor / 10 ** minorDigits(currency);
}

const fmtCache = new Map<string, Intl.NumberFormat>();
function nf(locale: string, currency: string, compact: boolean, fraction: boolean) {
  const key = `${locale}|${currency}|${compact}|${fraction}`;
  let f = fmtCache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      notation: compact ? 'compact' : 'standard',
      maximumFractionDigits: compact ? 1 : fraction ? minorDigits(currency) : 0,
      minimumFractionDigits: compact ? 0 : fraction ? minorDigits(currency) : 0,
    });
    fmtCache.set(key, f);
  }
  return f;
}

export interface MoneyFmt {
  currency: string;
  locale: string;
}

export function formatMoney(minor: Minor, { currency, locale }: MoneyFmt, opts: { compact?: boolean; cents?: boolean } = {}) {
  const major = toMajor(minor, currency);
  const cents = opts.cents ?? !Number.isInteger(major);
  return nf(locale, currency, !!opts.compact, cents).format(major);
}

/** Split an amount into n parts that sum exactly to the total. */
export function allocate(total: Minor, weights: number[]): Minor[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum === 0) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / sum);
  const floored = raw.map(Math.floor);
  let rem = total - floored.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) {
    if (rem <= 0) break;
    floored[i] += 1;
    rem -= 1;
  }
  return floored;
}

export function pct(rate: number, amount: Minor): Minor {
  return Math.round((amount * rate) / 100);
}

/** Validate a user-typed amount string. Returns minor units or an error message. */
export function parseAmount(input: string, currency: string, { allowZero = false, max = 1e10 } = {}): { value: Minor } | { error: string } {
  const s = input.trim().replace(/,/g, '');
  if (!s) return { error: 'Enter an amount' };
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return { error: 'Use numbers only, up to 2 decimals' };
  const n = Number(s);
  if (!allowZero && n <= 0) return { error: 'Amount must be greater than zero' };
  if (n > max) return { error: 'Amount is too large' };
  return { value: toMinor(n, currency) };
}
