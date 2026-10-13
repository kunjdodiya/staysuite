import { eachNight, isWeekendNight, nightsBetween } from '@/lib/dates';
import { pct } from '@/lib/money';
import type { Booking, ISODate, Minor, NightRate, RateRule, Unit } from './types';

const kindPriority: Record<RateRule['kind'], number> = { custom: 3, special_offer: 2, seasonal: 1 };

/** Picks the single most specific active rule for a night: unit-level beats property-level, then by kind. */
export function ruleFor(date: ISODate, unit: Unit, rules: RateRule[], stayNights: number): RateRule | null {
  let best: RateRule | null = null;
  let bestScore = -1;
  for (const r of rules) {
    if (!r.active || r.propertyId !== unit.propertyId) continue;
    if (r.unitId && r.unitId !== unit.id) continue;
    if (date < r.startDate || date > r.endDate) continue;
    if (stayNights < (r.minNights || 1)) continue;
    const score = (r.unitId ? 10 : 0) + kindPriority[r.kind];
    if (score > bestScore) { best = r; bestScore = score; }
  }
  return best;
}

export function nightlyRate(date: ISODate, unit: Unit, rules: RateRule[], stayNights = 1): NightRate {
  const base = isWeekendNight(date) && unit.weekendRate ? unit.weekendRate : unit.baseRate;
  const rule = ruleFor(date, unit, rules, stayNights);
  if (!rule) return { date, rate: base, ruleId: null };
  const rate = rule.mode === 'fixed' ? rule.value : Math.max(0, base + pct(rule.value, base));
  return { date, rate, ruleId: rule.id };
}

export function quoteNights(unit: Unit, rules: RateRule[], checkIn: ISODate, checkOut: ISODate): NightRate[] {
  const n = nightsBetween(checkIn, checkOut);
  return eachNight(checkIn, checkOut).map((d) => nightlyRate(d, unit, rules, n));
}

export interface BookingTotals {
  accommodation: Minor;
  cleaning: Minor;
  extras: Minor;
  subtotal: Minor;
  discount: Minor;
  taxable: Minor;
  tax: Minor;
  total: Minor; // what the guest owes
  revenue: Minor; // earned revenue, net of tax
  nights: number;
}

/** Single source of truth for what a booking is worth. */
export function bookingTotals(b: Pick<Booking, 'nights' | 'cleaningFee' | 'extras' | 'discount' | 'taxRate' | 'taxInclusive' | 'status' | 'cancellationFee'>): BookingTotals {
  const accommodation = b.nights.reduce((s, n) => s + n.rate, 0);
  const extras = b.extras.reduce((s, e) => s + e.amount, 0);
  const subtotal = accommodation + b.cleaningFee + extras;
  if (b.status === 'cancelled' || b.status === 'no_show') {
    return { accommodation, cleaning: b.cleaningFee, extras, subtotal, discount: 0, taxable: b.cancellationFee, tax: 0, total: b.cancellationFee, revenue: b.cancellationFee, nights: b.nights.length };
  }
  const discount = Math.min(b.discount, subtotal);
  const taxable = subtotal - discount;
  let tax = 0;
  let total = taxable;
  let revenue = taxable;
  if (b.taxRate > 0) {
    if (b.taxInclusive) {
      revenue = Math.round(taxable / (1 + b.taxRate / 100));
      tax = taxable - revenue;
    } else {
      tax = pct(b.taxRate, taxable);
      total = taxable + tax;
    }
  }
  return { accommodation, cleaning: b.cleaningFee, extras, subtotal, discount, taxable, tax, total, revenue, nights: b.nights.length };
}
