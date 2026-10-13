import type {
  BookingSource, BookingStatus, DocumentKind, ExpenseCategory, Frequency, IncomeCategory, PaymentMethod,
  PaymentPurpose, Priority, PropertyDocCategory, PropertyType, Readiness, Role, TaskStatus, TaskType, TxnKind, UnitType,
} from './types';

export const propertyTypeLabel: Record<PropertyType, string> = {
  cabin: 'Cabin', boutique_hotel: 'Boutique hotel', homestay: 'Homestay', guesthouse: 'Guesthouse',
  villa: 'Villa', apartment: 'Apartment', entire_home: 'Entire home',
};
export const unitTypeLabel: Record<UnitType, string> = {
  room: 'Room', cabin: 'Cabin', apartment: 'Apartment', villa: 'Villa', entire_home: 'Entire home', dorm_bed: 'Dorm bed', suite: 'Suite',
};
export const readinessLabel: Record<Readiness, string> = {
  ready: 'Ready', dirty: 'Needs cleaning', cleaning: 'Cleaning', inspect: 'Inspect', out_of_order: 'Out of order',
};
export const bookingStatusLabel: Record<BookingStatus, string> = {
  inquiry: 'Inquiry', tentative: 'Tentative', confirmed: 'Confirmed', checked_in: 'Checked in',
  checked_out: 'Checked out', cancelled: 'Cancelled', no_show: 'No-show',
};
export const sourceLabel: Record<BookingSource, string> = {
  direct: 'Direct', phone: 'Phone', walk_in: 'Walk-in', website: 'Website', airbnb: 'Airbnb',
  booking_com: 'Booking.com', expedia: 'Expedia', agoda: 'Agoda', other: 'Other',
};
export const methodLabel: Record<PaymentMethod, string> = {
  cash: 'Cash', upi: 'UPI', card: 'Card', bank_transfer: 'Bank transfer', cheque: 'Cheque',
  ota_payout: 'OTA payout', wallet: 'Wallet', other: 'Other',
};
export const purposeLabel: Record<PaymentPurpose, string> = {
  advance: 'Advance payment', partial: 'Partial payment', balance: 'Balance payment', full: 'Full payment',
};
export const txnKindLabel: Record<TxnKind, string> = {
  payment: 'Guest payment', refund: 'Refund', deposit: 'Security deposit', deposit_return: 'Deposit returned',
  income: 'Other income', expense: 'Expense',
};
export const incomeCategoryLabel: Record<IncomeCategory, string> = {
  room: 'Room charges', cleaning_fee: 'Cleaning fees', extra_service: 'Extra services', food_beverage: 'Food & beverage', tours: 'Tours & activities', other: 'Other',
};
export const expenseCategoryLabel: Record<ExpenseCategory, string> = {
  cleaning: 'Cleaning', laundry: 'Laundry', utilities: 'Utilities', maintenance: 'Maintenance', repairs: 'Repairs',
  supplies: 'Supplies', staff: 'Staff payments', rent: 'Rent / lease', commission: 'Commissions', marketing: 'Marketing',
  software: 'Software', insurance: 'Insurance', taxes: 'Taxes & fees', food: 'Food & groceries', other: 'Other',
};
export const frequencyLabel: Record<Frequency, string> = { weekly: 'Weekly', monthly: 'Monthly', quarterly: 'Quarterly', yearly: 'Yearly' };
export const docKindLabel: Record<DocumentKind, string> = {
  invoice: 'Invoice', receipt: 'Payment receipt', refund_receipt: 'Refund receipt', expense_voucher: 'Expense voucher',
};
export const taskTypeLabel: Record<TaskType, string> = { cleaning: 'Cleaning', maintenance: 'Maintenance', inspection: 'Inspection', other: 'Other' };
export const taskStatusLabel: Record<TaskStatus, string> = { todo: 'To do', in_progress: 'In progress', blocked: 'Blocked', done: 'Done' };
export const priorityLabel: Record<Priority, string> = { low: 'Low', medium: 'Medium', high: 'High', urgent: 'Urgent' };
export const roleLabel: Record<Role, string> = { owner: 'Owner', manager: 'Manager', accountant: 'Accountant', caretaker: 'Caretaker', cleaner: 'Cleaner' };
export const docCategoryLabel: Record<PropertyDocCategory, string> = {
  license: 'License', contract: 'Contract', insurance: 'Insurance', tax: 'Tax', permit: 'Permit', other: 'Other',
};

export const AMENITIES = [
  'Wi-Fi', 'Parking', 'Kitchen', 'Air conditioning', 'Heating', 'Fireplace', 'Hot water', 'Breakfast', 'Mountain view',
  'Lake view', 'Garden', 'Bonfire', 'Pet friendly', 'Washing machine', 'TV', 'Workspace', 'Power backup', 'Pool', 'BBQ', 'First aid',
];

export const options = <T extends string>(rec: Record<T, string>) => (Object.keys(rec) as T[]).map((value) => ({ value, label: rec[value] }));
