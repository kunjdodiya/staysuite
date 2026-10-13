import { describe, expect, it } from 'vitest';
import { allocate, parseAmount, toMinor } from '@/lib/money';
import { bookingTotals, quoteNights } from './pricing';
import { findConflicts } from './availability';
import { bookingLedger, outstanding, periodSummary } from './finance';
import { validateTxn } from '@/data/store';
import { emptyWorkspace } from '@/data/seed';
import type { AppData, Booking, RateRule, Transaction, Unit } from './types';

const unit: Unit = { id: 'u1', propertyId: 'p1', name: 'Cabin', type: 'cabin', capacity: 2, bedrooms: 1, baseRate: 500000, weekendRate: 600000, cleaningFee: 50000, readiness: 'ready', archived: false };

function booking(over: Partial<Booking> = {}): Booking {
  const checkIn = over.checkIn ?? '2026-10-05';
  const checkOut = over.checkOut ?? '2026-10-08';
  return {
    id: 'b1', code: 'SS-TEST', propertyId: 'p1', unitId: 'u1', guestId: 'g1', checkIn, checkOut, adults: 2, children: 0, status: 'confirmed', source: 'direct', channelRef: '',
    nights: quoteNights(unit, [], checkIn, checkOut), cleaningFee: 50000, extras: [], discount: 0, commission: 0, taxRate: 5, taxInclusive: false, securityDeposit: 0,
    cancellationFee: 0, notes: '', arrivalTime: '', createdAt: '2026-09-01T00:00:00Z', updatedAt: '', checkedInAt: null, checkedOutAt: null, cancelledAt: null, review: null, ...over,
  };
}
function txn(over: Partial<Transaction>): Transaction {
  return { id: Math.random().toString(36), kind: 'payment', date: '2026-10-01', amount: 0, method: 'upi', propertyId: 'p1', bookingId: 'b1', guestId: 'g1', purpose: null, incomeCategory: null, expenseCategory: null, vendor: '', reference: '', notes: '', attachments: [], recurringId: null, taskId: null, createdAt: '2026-10-01T00:00:00Z', createdBy: 'x', ...over };
}
function world(bookings: Booking[], transactions: Transaction[] = []): AppData {
  const d = emptyWorkspace();
  return { ...d, properties: [{ id: 'p1' } as AppData['properties'][number]], units: [unit], bookings, transactions, guests: [{ id: 'g1', firstName: 'A', lastName: 'B' } as AppData['guests'][number]] };
}

describe('money', () => {
  it('converts and parses without float drift', () => {
    expect(toMinor(0.1 + 0.2, 'INR')).toBe(30);
    expect(parseAmount('1,234.56', 'INR')).toEqual({ value: 123456 });
    expect(parseAmount('12.345', 'INR')).toHaveProperty('error');
    expect(parseAmount('0', 'INR')).toHaveProperty('error');
  });
  it('allocates exactly', () => {
    const parts = allocate(1000, [1, 1, 1]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(1000);
    expect(parts).toEqual([334, 333, 333]);
  });
});

describe('pricing', () => {
  it('applies weekend rates on Fri & Sat nights', () => {
    // 2026-10-09 is a Friday
    const n = quoteNights(unit, [], '2026-10-08', '2026-10-11');
    expect(n.map((x) => x.rate)).toEqual([500000, 600000, 600000]);
  });
  it('applies the most specific rate rule', () => {
    const rules: RateRule[] = [
      { id: 'r1', propertyId: 'p1', unitId: null, name: 'Season', kind: 'seasonal', startDate: '2026-10-01', endDate: '2026-10-31', mode: 'percent', value: 20, minNights: 1, active: true },
      { id: 'r2', propertyId: 'p1', unitId: 'u1', name: 'Unit deal', kind: 'special_offer', startDate: '2026-10-06', endDate: '2026-10-06', mode: 'fixed', value: 300000, minNights: 1, active: true },
    ];
    const n = quoteNights(unit, rules, '2026-10-05', '2026-10-08');
    expect(n.map((x) => x.rate)).toEqual([600000, 300000, 600000]);
  });
  it('computes exclusive tax on top', () => {
    const t = bookingTotals(booking());
    expect(t.subtotal).toBe(1550000);
    expect(t.tax).toBe(77500);
    expect(t.total).toBe(1627500);
    expect(t.revenue).toBe(1550000);
  });
  it('extracts inclusive tax from the price', () => {
    const t = bookingTotals(booking({ taxInclusive: true }));
    expect(t.total).toBe(1550000);
    expect(t.revenue + t.tax).toBe(1550000);
    expect(t.revenue).toBe(1476190);
  });
  it('cancelled bookings are only worth the retained fee', () => {
    const t = bookingTotals(booking({ status: 'cancelled', cancellationFee: 200000 }));
    expect(t.total).toBe(200000);
    expect(t.revenue).toBe(200000);
  });
});

describe('availability', () => {
  it('detects overlaps but allows back-to-back stays', () => {
    const b = booking();
    expect(findConflicts([b], 'u1', '2026-10-07', '2026-10-09')).toHaveLength(1);
    expect(findConflicts([b], 'u1', '2026-10-08', '2026-10-10')).toHaveLength(0);
    expect(findConflicts([b], 'u1', '2026-10-02', '2026-10-05')).toHaveLength(0);
    expect(findConflicts([{ ...b, status: 'cancelled' }], 'u1', '2026-10-06', '2026-10-07')).toHaveLength(0);
    expect(findConflicts([{ ...b, status: 'inquiry' }], 'u1', '2026-10-06', '2026-10-07')).toHaveLength(0);
  });
});

describe('ledger & period summary', () => {
  it('tracks payments, refunds and deposits separately', () => {
    const b = booking({ securityDeposit: 100000 });
    const l = bookingLedger(b, [
      txn({ amount: 500000 }), txn({ kind: 'refund', amount: 100000 }), txn({ kind: 'deposit', amount: 100000 }), txn({ kind: 'deposit_return', amount: 40000 }),
    ]);
    expect(l.paid).toBe(400000);
    expect(l.balance).toBe(1627500 - 400000);
    expect(l.depositHeld).toBe(60000);
    expect(l.paymentState).toBe('partial');
  });

  it('recognises revenue per night across month boundaries', () => {
    const b = booking({ checkIn: '2026-09-29', checkOut: '2026-10-02', cleaningFee: 0, taxRate: 0, nights: [{ date: '2026-09-29', rate: 100000, ruleId: null }, { date: '2026-09-30', rate: 100000, ruleId: null }, { date: '2026-10-01', rate: 100000, ruleId: null }] });
    const d = world([b], [txn({ amount: 300000, date: '2026-09-20' })]);
    const sep = periodSummary(d, { from: '2026-09-01', to: '2026-09-30' });
    const oct = periodSummary(d, { from: '2026-10-01', to: '2026-10-31' });
    expect(sep.revenue).toBe(200000);
    expect(oct.revenue).toBe(100000);
    expect(sep.cashReceived).toBe(300000); // cash counted when received
    expect(oct.cashReceived).toBe(0);
    expect(sep.nightsSold + oct.nightsSold).toBe(3);
  });

  it('never counts deposits or tax as revenue', () => {
    const b = booking({ securityDeposit: 500000 });
    const d = world([b], [txn({ kind: 'deposit', amount: 500000, date: '2026-10-05' })]);
    const s = periodSummary(d, { from: '2026-10-01', to: '2026-10-31' });
    expect(s.revenue).toBe(1550000);
    expect(s.taxCollected).toBe(77500);
    expect(s.depositsReceived).toBe(500000);
    expect(s.cashReceived).toBe(0);
  });

  it('nets expenses into profit and cash flow', () => {
    const d = world([booking()], [txn({ amount: 1627500, date: '2026-10-05' }), txn({ kind: 'expense', amount: 300000, bookingId: null, guestId: null, expenseCategory: 'utilities', date: '2026-10-10' })]);
    const s = periodSummary(d, { from: '2026-10-01', to: '2026-10-31' });
    expect(s.netProfit).toBe(1550000 - 300000);
    expect(s.netCashFlow).toBe(1627500 - 300000);
    expect(s.expensesByCategory.utilities).toBe(300000);
  });

  it('splits outstanding into due now, overdue and upcoming', () => {
    const past = booking({ id: 'b1', checkIn: '2026-10-01', checkOut: '2026-10-03', status: 'checked_out' });
    const inHouse = booking({ id: 'b2', checkIn: '2026-10-10', checkOut: '2026-10-15', status: 'checked_in' });
    const future = booking({ id: 'b3', checkIn: '2026-11-01', checkOut: '2026-11-03' });
    const o = outstanding(world([past, inHouse, future]), '2026-10-12');
    const t = (b: Booking) => bookingTotals(b).total;
    expect(o.overdue).toBe(t(past));
    expect(o.dueNow).toBe(t(past) + t(inHouse));
    expect(o.upcoming).toBe(t(future));
  });
});

describe('transaction guard rails', () => {
  it('rejects refunds larger than what was paid', () => {
    const d = world([booking()], [txn({ amount: 100000 })]);
    d.business.timeZone = 'UTC';
    expect(validateTxn(d, txn({ kind: 'refund', amount: 200000, date: '2026-10-01' }))).toMatch(/Refund exceeds/);
    expect(validateTxn(d, txn({ kind: 'refund', amount: 100000, date: '2026-10-01' }))).toBeNull();
    expect(validateTxn(d, txn({ amount: -5 }))).toMatch(/greater than zero/);
    expect(validateTxn(d, txn({ kind: 'expense', amount: 100, bookingId: null }))).toMatch(/category/);
  });
});
