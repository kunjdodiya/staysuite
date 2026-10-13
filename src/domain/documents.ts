import { bookingLedger } from './finance';
import { purposeLabel, expenseCategoryLabel } from './labels';
import type { AppData, Booking, DocLine, DocSnapshot, DocumentKind, ISODate, Transaction } from './types';

export function docPrefix(kind: DocumentKind, b: AppData['business']) {
  switch (kind) {
    case 'invoice': return b.invoicePrefix || 'INV';
    case 'receipt': return b.receiptPrefix || 'RCP';
    case 'refund_receipt': return 'RFD';
    case 'expense_voucher': return 'EXP';
  }
}

export function formatDocNumber(kind: DocumentKind, seq: number, b: AppData['business'], date: ISODate) {
  return `${docPrefix(kind, b)}-${date.slice(0, 4)}-${String(seq).padStart(4, '0')}`;
}

function businessBlock(data: AppData): DocSnapshot['business'] {
  const b = data.business;
  return {
    name: b.name, legalName: b.legalName, email: b.email, phone: b.phone, address: b.address, website: b.website,
    logoDataUrl: b.logoDataUrl, brandColor: b.brandColor, documentFooter: b.documentFooter, paymentInstructions: b.paymentInstructions,
    taxLabel: b.tax.label, taxRegistrationNo: b.tax.enabled ? b.tax.registrationNo : '',
  };
}

function bookingContext(data: AppData, booking: Booking) {
  const guest = data.guests.find((g) => g.id === booking.guestId);
  const property = data.properties.find((p) => p.id === booking.propertyId);
  const unit = data.units.find((u) => u.id === booking.unitId);
  const ledger = bookingLedger(booking, data.transactions);
  return { guest, property, unit, ledger };
}

function stayLines(booking: Booking, unitName: string, totals: ReturnType<typeof bookingLedger>['totals']): DocLine[] {
  if (booking.status === 'cancelled' || booking.status === 'no_show') {
    return [{ label: booking.status === 'no_show' ? 'No-show charge' : 'Cancellation charge', detail: `${unitName} · ${booking.code}`, qty: 1, unit: totals.total, amount: totals.total }];
  }
  const lines: DocLine[] = [];
  // Group consecutive nights at the same rate for a cleaner invoice
  const groups: { rate: number; count: number }[] = [];
  for (const n of booking.nights) {
    const last = groups[groups.length - 1];
    if (last && last.rate === n.rate) last.count++;
    else groups.push({ rate: n.rate, count: 1 });
  }
  for (const g of groups) lines.push({ label: `Accommodation — ${unitName}`, detail: `${g.count} night${g.count > 1 ? 's' : ''}`, qty: g.count, unit: g.rate, amount: g.rate * g.count });
  if (booking.cleaningFee) lines.push({ label: 'Cleaning fee', qty: 1, unit: booking.cleaningFee, amount: booking.cleaningFee });
  for (const e of booking.extras) lines.push({ label: e.label, qty: 1, unit: e.amount, amount: e.amount });
  return lines;
}

export function invoiceSnapshot(data: AppData, booking: Booking, notes = ''): DocSnapshot {
  const { guest, property, unit, ledger } = bookingContext(data, booking);
  const t = ledger.totals;
  return {
    business: businessBlock(data),
    currency: data.business.currency,
    locale: data.business.locale,
    billTo: { name: guest ? `${guest.firstName} ${guest.lastName}` : 'Guest', email: guest?.email, phone: guest?.phone, address: [guest?.city, guest?.country].filter(Boolean).join(', ') },
    property: property ? { name: property.name, address: [property.address, property.city].filter(Boolean).join(', ') } : null,
    stay: { checkIn: booking.checkIn, checkOut: booking.checkOut, nights: booking.nights.length, unit: unit?.name ?? '', guests: booking.adults + booking.children, bookingCode: booking.code },
    lines: stayLines(booking, unit?.name ?? 'Stay', t),
    subtotal: booking.status === 'cancelled' || booking.status === 'no_show' ? t.total : t.subtotal,
    discount: t.discount,
    taxLabel: data.business.tax.label,
    taxRate: booking.status === 'cancelled' ? 0 : booking.taxRate,
    taxAmount: t.tax,
    total: t.total,
    paidToDate: ledger.paid,
    balanceDue: Math.max(0, ledger.balance),
    payment: null,
    notes: notes || (booking.taxInclusive && booking.taxRate ? `Prices include ${data.business.tax.label} at ${booking.taxRate}%.` : ''),
  };
}

export function receiptSnapshot(data: AppData, txn: Transaction, notes = ''): DocSnapshot {
  const booking = txn.bookingId ? data.bookings.find((b) => b.id === txn.bookingId) : undefined;
  const ctx = booking ? bookingContext(data, booking) : null;
  const guest = ctx?.guest ?? (txn.guestId ? data.guests.find((g) => g.id === txn.guestId) : undefined);
  const property = ctx?.property ?? (txn.propertyId ? data.properties.find((p) => p.id === txn.propertyId) : undefined);

  // Running totals as of this transaction (include txns on or before it)
  let paidToDate = 0;
  if (booking) {
    for (const t of data.transactions) {
      if (t.bookingId !== booking.id) continue;
      if (t.date > txn.date || (t.date === txn.date && t.createdAt > txn.createdAt)) continue;
      if (t.kind === 'payment') paidToDate += t.amount;
      if (t.kind === 'refund') paidToDate -= t.amount;
    }
  }
  const total = ctx ? ctx.ledger.totals.total : txn.amount;

  let label = 'Payment received';
  if (txn.kind === 'refund') label = 'Refund issued';
  else if (txn.kind === 'deposit') label = 'Refundable security deposit';
  else if (txn.kind === 'deposit_return') label = 'Security deposit returned';
  else if (txn.kind === 'expense') label = txn.expenseCategory ? expenseCategoryLabel[txn.expenseCategory] : 'Expense';
  else if (txn.purpose) label = purposeLabel[txn.purpose];

  const billTo = txn.kind === 'expense'
    ? { name: txn.vendor || 'Vendor' }
    : { name: guest ? `${guest.firstName} ${guest.lastName}` : 'Guest', email: guest?.email, phone: guest?.phone };

  return {
    business: businessBlock(data),
    currency: data.business.currency,
    locale: data.business.locale,
    billTo,
    property: property ? { name: property.name, address: [property.address, property.city].filter(Boolean).join(', ') } : null,
    stay: booking && ctx ? { checkIn: booking.checkIn, checkOut: booking.checkOut, nights: booking.nights.length, unit: ctx.unit?.name ?? '', guests: booking.adults + booking.children, bookingCode: booking.code } : null,
    lines: [{ label, detail: txn.notes || undefined, qty: 1, unit: txn.amount, amount: txn.amount }],
    subtotal: txn.amount,
    discount: 0,
    taxLabel: data.business.tax.label,
    taxRate: 0,
    taxAmount: 0,
    total: txn.kind === 'payment' || txn.kind === 'refund' ? total : txn.amount,
    paidToDate: booking ? paidToDate : txn.amount,
    balanceDue: booking && (txn.kind === 'payment' || txn.kind === 'refund') ? Math.max(0, total - paidToDate) : 0,
    payment: { amount: txn.amount, method: txn.method, reference: txn.reference, date: txn.date, purpose: txn.purpose },
    notes,
  };
}

export function kindForTxn(t: Transaction): DocumentKind {
  if (t.kind === 'refund' || t.kind === 'deposit_return') return 'refund_receipt';
  if (t.kind === 'expense') return 'expense_voucher';
  return 'receipt';
}
