/**
 * Domain model. All money values are integers in minor units (paise / cents)
 * so sums never drift. Stay dates are property-local calendar dates (YYYY-MM-DD);
 * timestamps are ISO strings.
 */

export type ID = string;
export type ISODate = string; // YYYY-MM-DD
export type ISODateTime = string;
export type Minor = number; // integer minor units

// ── Business & settings ─────────────────────────────────────────

export interface TaxConfig {
  enabled: boolean;
  label: string; // e.g. "GST"
  rate: number; // percent, e.g. 12
  inclusive: boolean; // prices already include tax
  registrationNo: string;
}

export interface BusinessSettings {
  name: string;
  legalName: string;
  email: string;
  phone: string;
  address: string;
  website: string;
  logoDataUrl: string | null;
  brandColor: string; // hex, used on documents
  currency: string; // ISO 4217
  locale: string; // BCP 47
  timeZone: string; // IANA
  weekStartsOn: 0 | 1;
  tax: TaxConfig;
  invoicePrefix: string;
  receiptPrefix: string;
  documentFooter: string;
  paymentInstructions: string;
  counters: Record<DocumentKind, number>;
  notificationPrefs: NotificationPrefs;
}

export interface NotificationPrefs {
  inApp: boolean;
  push: boolean;
  email: boolean;
  dailySummary: boolean;
  monthlySummary: boolean;
  arrivalLeadDays: number;
  recurringLeadDays: number;
}

// ── Properties & units ──────────────────────────────────────────

export type PropertyType = 'cabin' | 'boutique_hotel' | 'homestay' | 'guesthouse' | 'villa' | 'apartment' | 'entire_home';
export type UnitType = 'room' | 'cabin' | 'apartment' | 'villa' | 'entire_home' | 'dorm_bed' | 'suite';
export type Readiness = 'ready' | 'dirty' | 'cleaning' | 'inspect' | 'out_of_order';

export interface Property {
  id: ID;
  name: string;
  type: PropertyType;
  address: string;
  city: string;
  description: string;
  photos: string[]; // URLs or data URLs
  amenities: string[];
  checkInTime: string; // HH:mm
  checkOutTime: string;
  checkInInstructions: string;
  houseRules: string;
  wifiName: string;
  wifiPassword: string;
  color: string; // series token key: s1..s8
  archived: boolean;
  createdAt: ISODateTime;
}

export interface Unit {
  id: ID;
  propertyId: ID;
  name: string;
  type: UnitType;
  capacity: number;
  bedrooms: number;
  baseRate: Minor; // per night
  weekendRate: Minor | null; // Fri & Sat nights
  cleaningFee: Minor;
  readiness: Readiness;
  archived: boolean;
}

export type RateRuleKind = 'seasonal' | 'special_offer' | 'custom';
export interface RateRule {
  id: ID;
  propertyId: ID;
  unitId: ID | null; // null = all units in property
  name: string;
  kind: RateRuleKind;
  startDate: ISODate;
  endDate: ISODate; // inclusive (night of)
  mode: 'fixed' | 'percent';
  value: number; // fixed: Minor nightly; percent: +/- adjustment (e.g. -15)
  minNights: number;
  active: boolean;
}

export type PropertyDocCategory = 'license' | 'contract' | 'insurance' | 'tax' | 'permit' | 'other';
export interface PropertyDocument {
  id: ID;
  propertyId: ID;
  name: string;
  category: PropertyDocCategory;
  fileName: string;
  fileDataUrl: string | null;
  expiresOn: ISODate | null;
  notes: string;
  uploadedAt: ISODateTime;
}

// ── Guests ──────────────────────────────────────────────────────

export interface Guest {
  id: ID;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  country: string;
  city: string;
  idType: string;
  idNumberMasked: string; // only last 4 kept — privacy by default
  preferences: string;
  notes: string;
  tags: string[];
  vip: boolean;
  marketingConsent: boolean;
  createdAt: ISODateTime;
}

// ── Bookings ────────────────────────────────────────────────────

export type BookingStatus = 'inquiry' | 'tentative' | 'confirmed' | 'checked_in' | 'checked_out' | 'cancelled' | 'no_show';
export type BookingSource = 'direct' | 'phone' | 'walk_in' | 'website' | 'airbnb' | 'booking_com' | 'expedia' | 'agoda' | 'other';

export interface LineItem {
  id: ID;
  label: string;
  amount: Minor; // total for this line
  kind: 'extra' | 'fee';
}

export interface NightRate {
  date: ISODate;
  rate: Minor;
  ruleId: ID | null;
}

export interface Booking {
  id: ID;
  code: string; // human readable, e.g. SS-24817
  propertyId: ID;
  unitId: ID;
  guestId: ID;
  checkIn: ISODate;
  checkOut: ISODate;
  adults: number;
  children: number;
  status: BookingStatus;
  source: BookingSource;
  channelRef: string; // OTA confirmation code
  nights: NightRate[];
  cleaningFee: Minor;
  extras: LineItem[];
  discount: Minor; // absolute
  commission: Minor; // OTA commission (cost — booked as expense via channel)
  taxRate: number; // snapshot at booking time
  taxInclusive: boolean;
  securityDeposit: Minor; // refundable, not revenue
  cancellationFee: Minor; // retained revenue if cancelled
  notes: string;
  arrivalTime: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  checkedInAt: ISODateTime | null;
  checkedOutAt: ISODateTime | null;
  cancelledAt: ISODateTime | null;
  review: { rating: number; comment: string; source: string; at: ISODate } | null;
}

// ── Money movement ──────────────────────────────────────────────

export type PaymentMethod = 'cash' | 'upi' | 'card' | 'bank_transfer' | 'cheque' | 'ota_payout' | 'wallet' | 'other';

/**
 * Every rupee that moves is a Transaction. The `kind` determines how it is classified:
 *  - payment         guest pays toward a booking (cash in, settles revenue)
 *  - refund          money returned to a guest against a booking (cash out)
 *  - deposit         refundable security deposit received (liability, NOT revenue)
 *  - deposit_return  security deposit returned (liability released)
 *  - income          other income not tied to a stay (e.g. tour commission)
 *  - expense         operating cost
 */
export type TxnKind = 'payment' | 'refund' | 'deposit' | 'deposit_return' | 'income' | 'expense';
export type PaymentPurpose = 'advance' | 'partial' | 'balance' | 'full';

export type IncomeCategory = 'room' | 'cleaning_fee' | 'extra_service' | 'food_beverage' | 'tours' | 'other';
export type ExpenseCategory =
  | 'cleaning' | 'laundry' | 'utilities' | 'maintenance' | 'repairs' | 'supplies' | 'staff'
  | 'rent' | 'commission' | 'marketing' | 'software' | 'insurance' | 'taxes' | 'food' | 'other';

export interface Attachment {
  id: ID;
  name: string;
  type: string;
  dataUrl: string;
  size: number;
}

export interface Transaction {
  id: ID;
  kind: TxnKind;
  date: ISODate;
  amount: Minor; // always positive; direction is implied by kind
  method: PaymentMethod;
  propertyId: ID | null;
  bookingId: ID | null;
  guestId: ID | null;
  purpose: PaymentPurpose | null; // for payments
  incomeCategory: IncomeCategory | null;
  expenseCategory: ExpenseCategory | null;
  vendor: string;
  reference: string; // UPI ref, cheque no, etc.
  notes: string;
  attachments: Attachment[];
  recurringId: ID | null;
  taskId: ID | null;
  createdAt: ISODateTime;
  createdBy: ID;
}

export type Frequency = 'weekly' | 'monthly' | 'quarterly' | 'yearly';
export interface RecurringExpense {
  id: ID;
  name: string;
  category: ExpenseCategory;
  amount: Minor;
  propertyId: ID | null;
  vendor: string;
  method: PaymentMethod;
  frequency: Frequency;
  nextDue: ISODate;
  active: boolean;
  notes: string;
}

// ── Documents (receipts & invoices) ─────────────────────────────

export type DocumentKind = 'invoice' | 'receipt' | 'refund_receipt' | 'expense_voucher';

export interface DocParty {
  name: string;
  email?: string;
  phone?: string;
  address?: string;
}
export interface DocLine {
  label: string;
  detail?: string;
  qty: number;
  unit: Minor;
  amount: Minor;
}
/** Immutable snapshot so a re-download always reproduces the original document. */
export interface DocSnapshot {
  business: Pick<BusinessSettings, 'name' | 'legalName' | 'email' | 'phone' | 'address' | 'website' | 'logoDataUrl' | 'brandColor' | 'documentFooter' | 'paymentInstructions'> & { taxLabel: string; taxRegistrationNo: string };
  currency: string;
  locale: string;
  billTo: DocParty;
  property: { name: string; address: string } | null;
  stay: { checkIn: ISODate; checkOut: ISODate; nights: number; unit: string; guests: number; bookingCode: string } | null;
  lines: DocLine[];
  subtotal: Minor;
  discount: Minor;
  taxLabel: string;
  taxRate: number;
  taxAmount: Minor;
  total: Minor;
  paidToDate: Minor;
  balanceDue: Minor;
  payment: { amount: Minor; method: PaymentMethod; reference: string; date: ISODate; purpose: PaymentPurpose | null } | null;
  notes: string;
}

export interface IssuedDocument {
  id: ID;
  kind: DocumentKind;
  number: string;
  issueDate: ISODate;
  dueDate: ISODate | null;
  bookingId: ID | null;
  transactionId: ID | null;
  guestId: ID | null;
  propertyId: ID | null;
  snapshot: DocSnapshot;
  void: boolean;
  createdAt: ISODateTime;
}

// ── Operations ──────────────────────────────────────────────────

export type TaskType = 'cleaning' | 'maintenance' | 'inspection' | 'other';
export type TaskStatus = 'todo' | 'in_progress' | 'blocked' | 'done';
export type Priority = 'low' | 'medium' | 'high' | 'urgent';

export interface ChecklistItem { id: ID; label: string; done: boolean }

export interface Task {
  id: ID;
  type: TaskType;
  title: string;
  propertyId: ID;
  unitId: ID | null;
  bookingId: ID | null;
  assigneeId: ID | null;
  dueDate: ISODate;
  dueTime: string;
  priority: Priority;
  status: TaskStatus;
  checklist: ChecklistItem[];
  notes: string;
  photos: Attachment[];
  cost: Minor; // repair cost; linked to an expense once recorded
  expenseId: ID | null;
  auto: boolean; // created by automation
  createdAt: ISODateTime;
  completedAt: ISODateTime | null;
}

// ── Staff & access ──────────────────────────────────────────────

export type Role = 'owner' | 'manager' | 'accountant' | 'caretaker' | 'cleaner';

export interface StaffMember {
  id: ID;
  name: string;
  email: string;
  phone: string;
  role: Role;
  propertyIds: ID[]; // empty = all properties
  status: 'invited' | 'active' | 'disabled';
  invitedAt: ISODateTime;
  color: string;
}

export interface ActivityEntry {
  id: ID;
  at: ISODateTime;
  actorId: ID;
  action: string; // e.g. "booking.created"
  entity: string;
  entityId: ID | null;
  summary: string;
}

export interface MessageTemplate {
  id: ID;
  name: string;
  trigger: 'booking_confirmed' | 'pre_arrival' | 'check_in' | 'check_out' | 'payment_reminder' | 'review_request' | 'custom';
  channel: 'whatsapp' | 'email' | 'sms';
  subject: string;
  body: string; // supports {{guest_first_name}} etc.
}

// ── Integrations (architecture placeholders) ────────────────────

export type ChannelProvider = 'airbnb' | 'booking_com' | 'expedia' | 'agoda' | 'ical';
export interface ChannelConnection {
  id: ID;
  provider: ChannelProvider;
  unitId: ID;
  importUrl: string; // iCal feed from the OTA
  status: 'connected' | 'error' | 'paused';
  lastSyncAt: ISODateTime | null;
}

export interface AppData {
  version: number;
  business: BusinessSettings;
  properties: Property[];
  units: Unit[];
  rateRules: RateRule[];
  propertyDocs: PropertyDocument[];
  guests: Guest[];
  bookings: Booking[];
  transactions: Transaction[];
  recurring: RecurringExpense[];
  documents: IssuedDocument[];
  tasks: Task[];
  staff: StaffMember[];
  activity: ActivityEntry[];
  templates: MessageTemplate[];
  channels: ChannelConnection[];
  dismissedAlerts: string[];
  currentUserId: ID;
}
