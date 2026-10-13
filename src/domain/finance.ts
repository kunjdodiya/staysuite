/**
 * Financial engine. Every figure is derived from recorded bookings and transactions.
 *
 *  Revenue (earned)  booking revenue net of tax, recognised per night stayed in the period
 *                    + retained cancellation fees (on cancellation date) + other income.
 *  Cash received     guest payments + other income received in the period, minus refunds.
 *  Deposits held     refundable security deposits received minus returned — a liability, never revenue.
 *  Expenses          expense transactions dated in the period.
 *  Net profit        revenue − expenses (accrual view).
 *  Net cash flow     cash received − expenses paid.
 *  Outstanding       what guests still owe on bookings (total − payments + refunds), as of today.
 */
import { allocate } from '@/lib/money';
import { addMonthsISO, eachDay, endOfMonthISO, inRange, monthKey, nightsBetween, startOfMonthISO } from '@/lib/dates';
import { bookingTotals, type BookingTotals } from './pricing';
import { ACTIVE } from './availability';
import type { AppData, Booking, ExpenseCategory, ID, ISODate, Minor, PaymentMethod, Transaction } from './types';

export interface BookingLedger {
  booking: Booking;
  totals: BookingTotals;
  paid: Minor; // payments − refunds
  payments: Minor;
  refunds: Minor;
  depositHeld: Minor;
  balance: Minor; // >0 guest owes, <0 refund due
  paymentState: 'unpaid' | 'partial' | 'paid' | 'overpaid' | 'n/a';
}

export function bookingLedger(b: Booking, txns: Transaction[]): BookingLedger {
  const totals = bookingTotals(b);
  let payments = 0, refunds = 0, deposits = 0, depositReturns = 0;
  for (const t of txns) {
    if (t.bookingId !== b.id) continue;
    if (t.kind === 'payment') payments += t.amount;
    else if (t.kind === 'refund') refunds += t.amount;
    else if (t.kind === 'deposit') deposits += t.amount;
    else if (t.kind === 'deposit_return') depositReturns += t.amount;
  }
  const paid = payments - refunds;
  const balance = b.status === 'inquiry' ? 0 : totals.total - paid;
  let paymentState: BookingLedger['paymentState'] = 'n/a';
  if (b.status !== 'inquiry') {
    if (totals.total === 0 && paid === 0) paymentState = 'paid';
    else if (balance < 0) paymentState = 'overpaid';
    else if (balance === 0) paymentState = 'paid';
    else if (paid > 0) paymentState = 'partial';
    else paymentState = 'unpaid';
  }
  return { booking: b, totals, paid, payments, refunds, depositHeld: deposits - depositReturns, balance, paymentState };
}

/** Index transactions by booking for O(n) ledgers over large datasets. */
export function ledgerMap(data: Pick<AppData, 'bookings' | 'transactions'>): Map<ID, BookingLedger> {
  const byBooking = new Map<ID, Transaction[]>();
  for (const t of data.transactions) {
    if (!t.bookingId) continue;
    const arr = byBooking.get(t.bookingId);
    if (arr) arr.push(t); else byBooking.set(t.bookingId, [t]);
  }
  const m = new Map<ID, BookingLedger>();
  for (const b of data.bookings) m.set(b.id, bookingLedger(b, byBooking.get(b.id) ?? []));
  return m;
}

export interface Filter {
  from: ISODate;
  to: ISODate; // inclusive
  propertyId?: ID | null;
}

export interface PeriodSummary {
  revenue: Minor;
  roomRevenue: Minor; // accommodation share, net of tax & discounts
  otherIncome: Minor;
  cancellationRevenue: Minor;
  taxCollected: Minor;
  cashReceived: Minor;
  refunds: Minor;
  depositsReceived: Minor;
  depositsReturned: Minor;
  expenses: Minor;
  netProfit: Minor;
  netCashFlow: Minor;
  nightsSold: number;
  availableNights: number;
  occupancy: number; // 0..1
  adr: Minor;
  revpar: Minor;
  bookingsCount: number;
  cashByMethod: Record<PaymentMethod, Minor>;
  expensesByCategory: Partial<Record<ExpenseCategory, Minor>>;
}

const emptyMethods = (): Record<PaymentMethod, Minor> => ({ cash: 0, upi: 0, card: 0, bank_transfer: 0, cheque: 0, ota_payout: 0, wallet: 0, other: 0 });

/** Split one booking's revenue and tax across its nights proportionally to nightly rates. */
function perNight(b: Booking, t: BookingTotals) {
  const weights = b.nights.map((n) => n.rate || 1);
  const rev = allocate(t.revenue, weights);
  const tax = allocate(t.tax, weights);
  // Room share of revenue: proportion of accommodation in pre-discount subtotal
  const roomShare = t.subtotal > 0 ? t.accommodation / t.subtotal : 0;
  const room = allocate(Math.round(t.revenue * roomShare), weights);
  return b.nights.map((n, i) => ({ date: n.date, revenue: rev[i], tax: tax[i], room: room[i] }));
}

export function periodSummary(data: AppData, f: Filter, ledgers?: Map<ID, BookingLedger>): PeriodSummary {
  const L = ledgers ?? ledgerMap(data);
  const matchProp = (pid: ID | null | undefined) => !f.propertyId || pid === f.propertyId;
  let revenue = 0, roomRevenue = 0, cancellationRevenue = 0, taxCollected = 0, nightsSold = 0, bookingsCount = 0;

  for (const b of data.bookings) {
    if (!matchProp(b.propertyId)) continue;
    const led = L.get(b.id)!;
    if (b.status === 'cancelled' || b.status === 'no_show') {
      const when = (b.cancelledAt ?? b.checkIn).slice(0, 10);
      if (b.cancellationFee > 0 && inRange(when, f.from, f.to)) {
        cancellationRevenue += b.cancellationFee;
      }
      continue;
    }
    if (!ACTIVE.includes(b.status)) continue;
    if (b.checkOut <= f.from || b.checkIn > f.to) continue;
    let touched = false;
    for (const n of perNight(b, led.totals)) {
      if (!inRange(n.date, f.from, f.to)) continue;
      revenue += n.revenue;
      roomRevenue += n.room;
      taxCollected += n.tax;
      nightsSold += 1;
      touched = true;
    }
    if (touched && inRange(b.checkIn, f.from, f.to)) bookingsCount += 1;
  }

  let otherIncome = 0, cashReceived = 0, refunds = 0, depositsReceived = 0, depositsReturned = 0, expenses = 0;
  const cashByMethod = emptyMethods();
  const expensesByCategory: Partial<Record<ExpenseCategory, Minor>> = {};
  for (const t of data.transactions) {
    if (!inRange(t.date, f.from, f.to) || !matchProp(t.propertyId)) continue;
    switch (t.kind) {
      case 'payment': cashReceived += t.amount; cashByMethod[t.method] += t.amount; break;
      case 'income': otherIncome += t.amount; cashReceived += t.amount; cashByMethod[t.method] += t.amount; break;
      case 'refund': refunds += t.amount; cashByMethod[t.method] -= t.amount; break;
      case 'deposit': depositsReceived += t.amount; break;
      case 'deposit_return': depositsReturned += t.amount; break;
      case 'expense':
        expenses += t.amount;
        if (t.expenseCategory) expensesByCategory[t.expenseCategory] = (expensesByCategory[t.expenseCategory] ?? 0) + t.amount;
        break;
    }
  }
  revenue += otherIncome + cancellationRevenue;

  const days = nightsBetween(f.from, f.to) + 1;
  const units = data.units.filter((u) => !u.archived && matchProp(u.propertyId)).length;
  const availableNights = Math.max(0, days * units);
  const occupancy = availableNights ? Math.min(1, nightsSold / availableNights) : 0;
  const adr = nightsSold ? Math.round(roomRevenue / nightsSold) : 0;
  const revpar = availableNights ? Math.round(roomRevenue / availableNights) : 0;

  return {
    revenue, roomRevenue, otherIncome, cancellationRevenue, taxCollected,
    cashReceived: cashReceived - refunds, refunds, depositsReceived, depositsReturned, expenses,
    netProfit: revenue - expenses, netCashFlow: cashReceived - refunds - expenses,
    nightsSold, availableNights, occupancy, adr, revpar, bookingsCount, cashByMethod, expensesByCategory,
  };
}

export interface OutstandingRow {
  ledger: BookingLedger;
  overdue: boolean;
  dueNow: boolean;
  dueDate: ISODate;
}

/**
 * Balances still owed by guests. A balance falls due at check-in ("due now" once the guest has arrived)
 * and is overdue once the stay has ended without full payment. Future stays are "upcoming".
 */
export function outstanding(data: AppData, today: ISODate, propertyId?: ID | null, L = ledgerMap(data)): {
  rows: OutstandingRow[]; total: Minor; dueNow: Minor; overdue: Minor; upcoming: Minor; refundsDue: Minor; depositsHeld: Minor;
} {
  const rows: OutstandingRow[] = [];
  let total = 0, dueNow = 0, overdue = 0, upcoming = 0, refundsDue = 0, depositsHeld = 0;
  for (const b of data.bookings) {
    if (propertyId && b.propertyId !== propertyId) continue;
    const led = L.get(b.id)!;
    depositsHeld += led.depositHeld;
    if (b.status === 'inquiry') continue;
    if (led.balance > 0) {
      const ended = b.checkOut < today || b.status === 'checked_out' || b.status === 'cancelled' || b.status === 'no_show';
      const isDue = ended || b.checkIn <= today;
      rows.push({ ledger: led, overdue: ended, dueNow: isDue, dueDate: b.checkIn });
      total += led.balance;
      if (isDue) dueNow += led.balance; else upcoming += led.balance;
      if (ended) overdue += led.balance;
    } else if (led.balance < 0) refundsDue += -led.balance;
  }
  rows.sort((a, b) => Number(b.overdue) - Number(a.overdue) || a.dueDate.localeCompare(b.dueDate));
  return { rows, total, dueNow, overdue, upcoming, refundsDue, depositsHeld };
}

export interface MonthPoint {
  key: string; // YYYY-MM
  from: ISODate;
  to: ISODate;
  summary: PeriodSummary;
}

export function monthlySeries(data: AppData, endDate: ISODate, months: number, propertyId?: ID | null): MonthPoint[] {
  const L = ledgerMap(data);
  const out: MonthPoint[] = [];
  const start = startOfMonthISO(addMonthsISO(startOfMonthISO(endDate), -(months - 1)));
  for (let i = 0; i < months; i++) {
    const from = addMonthsISO(start, i);
    const to = endOfMonthISO(from);
    out.push({ key: monthKey(from), from, to, summary: periodSummary(data, { from, to, propertyId }, L) });
  }
  return out;
}

/** Daily occupied-unit counts — powers the occupancy strip & heatmap. */
export function dailyOccupancy(data: AppData, from: ISODate, to: ISODate, propertyId?: ID | null) {
  const units = data.units.filter((u) => !u.archived && (!propertyId || u.propertyId === propertyId));
  const unitIds = new Set(units.map((u) => u.id));
  const counts = new Map<ISODate, number>();
  for (const b of data.bookings) {
    if (!ACTIVE.includes(b.status) || !unitIds.has(b.unitId)) continue;
    if (b.checkOut <= from || b.checkIn > to) continue;
    for (const n of b.nights) if (n.date >= from && n.date <= to) counts.set(n.date, (counts.get(n.date) ?? 0) + 1);
  }
  return eachDay(from, to).map((date) => ({ date, occupied: counts.get(date) ?? 0, total: units.length }));
}

export function pctChange(cur: number, prev: number): number | null {
  if (prev === 0) return cur === 0 ? 0 : null;
  return (cur - prev) / Math.abs(prev);
}
