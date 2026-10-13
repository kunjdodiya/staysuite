/**
 * Realistic demo workspace, generated relative to "today" so the dashboard is always alive.
 * Deterministic (seeded RNG) so the numbers are stable between resets.
 */
import { addDaysISO, nightsBetween, todayISO, addMonthsISO, startOfMonthISO } from '@/lib/dates';
import { pct, toMinor } from '@/lib/money';
import { uid, bookingCode } from '@/lib/id';
import { quoteNights, bookingTotals } from '@/domain/pricing';
import { findConflicts } from '@/domain/availability';
import { checklist, DEFAULT_CLEANING_CHECKLIST, ensureTurnoverTasks } from '@/domain/automation';
import type {
  AppData, Booking, BookingSource, BusinessSettings, ExpenseCategory, Guest, ISODate, MessageTemplate, PaymentMethod, Property,
  RateRule, RecurringExpense, StaffMember, Task, Transaction, Unit,
} from '@/domain/types';

export const DATA_VERSION = 1;

function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r = (n: number) => toMinor(n, 'INR');

/** Simple SVG landscape covers so the demo works fully offline. */
export function coverArt(kind: 'mountain' | 'river' | 'beach' | 'forest', hueA: string, hueB: string): string {
  const shapes: Record<string, string> = {
    mountain: `<path d="M0 260 L120 140 L200 210 L300 90 L420 230 L520 150 L640 250 L640 360 L0 360Z" fill="${hueB}" opacity=".9"/><path d="M300 90 L330 125 L305 120 L285 135Z" fill="#fff" opacity=".8"/><path d="M0 300 L90 250 L180 290 L260 240 L380 300 L470 260 L640 300 L640 360 L0 360Z" fill="#0b2a22" opacity=".85"/>`,
    river: `<path d="M0 230 Q160 170 320 220 T640 210 L640 360 L0 360Z" fill="${hueB}"/><path d="M0 300 Q200 260 330 300 T640 290 L640 360 L0 360Z" fill="#9fd3e6" opacity=".7"/><circle cx="500" cy="90" r="34" fill="#fff6d5" opacity=".9"/>`,
    beach: `<rect y="230" width="640" height="130" fill="#f1dcb2"/><path d="M0 220 Q160 200 320 225 T640 215 L640 260 Q480 250 320 262 T0 258Z" fill="#5cc4c9"/><circle cx="140" cy="100" r="38" fill="#fff1c4"/><path d="M470 260 Q480 170 520 120" stroke="#3b2f1f" stroke-width="7" fill="none"/><path d="M520 120 q-40 -10 -70 15 M520 120 q-10 -40 -50 -45 M520 120 q30 -30 70 -15 M520 120 q40 10 50 45" stroke="#1f6b3a" stroke-width="10" fill="none" stroke-linecap="round"/>`,
    forest: `<path d="M0 270 L640 250 L640 360 L0 360Z" fill="#163d2c"/>${Array.from({ length: 9 }, (_, i) => `<path d="M${30 + i * 72} 280 l28 -${110 + (i % 3) * 30} l28 ${110 + (i % 3) * 30}Z" fill="${hueB}" opacity="${0.75 + (i % 2) * 0.2}"/>`).join('')}`,
  };
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${hueA}"/><stop offset="1" stop-color="#fdf6ec"/></linearGradient></defs><rect width="640" height="360" fill="url(#g)"/>${shapes[kind]}</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function defaultBusiness(): BusinessSettings {
  return {
    name: 'Pine & Pebble Stays',
    legalName: 'Pine & Pebble Hospitality LLP',
    email: 'hello@pineandpebble.in',
    phone: '+91 98160 24680',
    address: 'Old Manali Road, Manali, Himachal Pradesh 175131',
    website: 'pineandpebble.in',
    logoDataUrl: null,
    brandColor: '#0f766e',
    currency: 'INR',
    locale: 'en-IN',
    timeZone: 'Asia/Kolkata',
    weekStartsOn: 1,
    tax: { enabled: true, label: 'GST', rate: 5, inclusive: false, registrationNo: '02ABCDE1234F1Z5' },
    invoicePrefix: 'INV',
    receiptPrefix: 'RCP',
    documentFooter: 'Thank you for staying with us. We hope to welcome you back soon.',
    paymentInstructions: 'UPI: pineandpebble@okhdfc · A/C 50200012345678 · IFSC HDFC0001234',
    counters: { invoice: 0, receipt: 0, refund_receipt: 0, expense_voucher: 0 },
    notificationPrefs: { inApp: true, push: true, email: false, dailySummary: true, monthlySummary: true, arrivalLeadDays: 2, recurringLeadDays: 5 },
  };
}

const TEMPLATES: Omit<MessageTemplate, 'id'>[] = [
  { name: 'Booking confirmed', trigger: 'booking_confirmed', channel: 'whatsapp', subject: 'Your stay at {{property_name}} is confirmed',
    body: 'Hi {{guest_first_name}}! 🌲 Your stay at {{property_name}} ({{unit_name}}) is confirmed for {{check_in}} → {{check_out}} ({{nights}} nights).\n\nBooking ref: {{booking_code}}\nTotal: {{total}}\n\nWe can’t wait to host you. — {{business_name}}' },
  { name: 'Pre-arrival details', trigger: 'pre_arrival', channel: 'whatsapp', subject: 'Getting to {{property_name}}',
    body: 'Hi {{guest_first_name}}, looking forward to welcoming you on {{check_in}}! Check-in is from {{check_in_time}}.\n\n{{check_in_instructions}}\n\nWi-Fi: {{wifi_name}} / {{wifi_password}}\n\nCall us anytime on {{business_phone}}.' },
  { name: 'House rules', trigger: 'check_in', channel: 'whatsapp', subject: 'House rules',
    body: 'Welcome to {{property_name}}, {{guest_first_name}}! A few house rules to keep everyone comfortable:\n\n{{house_rules}}\n\nCheck-out is by {{check_out_time}} on {{check_out}}.' },
  { name: 'Balance reminder', trigger: 'payment_reminder', channel: 'whatsapp', subject: 'Balance for booking {{booking_code}}',
    body: 'Hi {{guest_first_name}}, a gentle reminder that {{balance_due}} is pending for your stay ({{booking_code}}). You can pay via UPI or at check-in. Thank you!' },
  { name: 'Thank-you & review', trigger: 'review_request', channel: 'email', subject: 'Thank you for staying at {{property_name}}',
    body: 'Dear {{guest_first_name}},\n\nThank you for staying with us at {{property_name}}. We would love to hear about your experience — a short review helps small hosts like us enormously.\n\nWarm regards,\n{{business_name}}' },
];

const FIRST = ['Aarav', 'Ananya', 'Rohan', 'Isha', 'Vikram', 'Neha', 'Kabir', 'Priya', 'Arjun', 'Meera', 'Siddharth', 'Tanvi', 'Karan', 'Riya', 'Aditya', 'Sneha', 'Nikhil', 'Pooja', 'Rahul', 'Diya', 'Emma', 'Lucas', 'Sofia', 'Noah', 'Hannah', 'Yuki', 'Liam', 'Chloe', 'Mateo', 'Zara', 'Dev', 'Kavya', 'Ishaan', 'Aisha', 'Varun', 'Nisha', 'Omar', 'Leah', 'Ravi', 'Tara'];
const LAST = ['Sharma', 'Iyer', 'Kapoor', 'Mehta', 'Reddy', 'Nair', 'Banerjee', 'Gupta', 'Singh', 'Desai', 'Patel', 'Chopra', 'Malhotra', 'Rao', 'Joshi', 'Müller', 'Martin', 'Rossi', 'Tanaka', 'Fischer', 'Brown', 'Khan', 'Bose', 'Menon', 'Verma'];
const CITIES: [string, string][] = [['Delhi', 'India'], ['Mumbai', 'India'], ['Bengaluru', 'India'], ['Chandigarh', 'India'], ['Pune', 'India'], ['Hyderabad', 'India'], ['Kolkata', 'India'], ['Ahmedabad', 'India'], ['Berlin', 'Germany'], ['London', 'United Kingdom'], ['Tel Aviv', 'Israel'], ['Melbourne', 'Australia']];

export function buildSeed(): AppData {
  const rand = rng(20261013);
  const pick = <T,>(a: readonly T[]) => a[Math.floor(rand() * a.length)];
  const between = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1));
  const today = todayISO('Asia/Kolkata');
  const nowIso = new Date().toISOString();
  const ts = (date: ISODate, hour = 10) => `${date}T${String(hour).padStart(2, '0')}:${String(between(0, 59)).padStart(2, '0')}:00.000Z`;

  // ── Staff
  const staff: StaffMember[] = [
    { id: 'usr_owner', name: 'You', email: 'owner@pineandpebble.in', phone: '+91 98160 24680', role: 'owner', propertyIds: [], status: 'active', invitedAt: nowIso, color: 's1' },
    { id: 'usr_meera', name: 'Meera Thakur', email: 'meera@pineandpebble.in', phone: '+91 94180 11223', role: 'manager', propertyIds: [], status: 'active', invitedAt: nowIso, color: 's3' },
    { id: 'usr_priya', name: 'Priya Shah', email: 'priya.accounts@gmail.com', phone: '+91 98990 55441', role: 'accountant', propertyIds: [], status: 'active', invitedAt: nowIso, color: 's7' },
  ];

  // ── Properties
  const properties: Property[] = [
    {
      id: 'prop_cedar', name: 'Cedar Ridge Cabins', type: 'cabin', address: 'Hadimba Temple Road, Dhungri', city: 'Manali',
      description: 'Three handcrafted timber cabins tucked into a deodar forest, ten minutes above Old Manali.',
      photos: [coverArt('mountain', '#9cc6e8', '#46607a'), coverArt('forest', '#bfe0d0', '#2f6b4f')],
      amenities: ['Wi-Fi', 'Parking', 'Heating', 'Fireplace', 'Hot water', 'Mountain view', 'Bonfire', 'Kitchen', 'Power backup'],
      checkInTime: '13:00', checkOutTime: '11:00',
      checkInInstructions: 'Drive past Hadimba Temple and take the left fork at the apple orchard. Park at the wooden gate — Ramesh will meet you with keys. Last 200 m is a short uphill walk; we can carry bags.',
      houseRules: '• Quiet hours 10 pm – 7 am\n• No smoking inside the cabins\n• Bonfire only in the fire pit, with staff present\n• Pets welcome with prior notice',
      wifiName: 'CedarRidge_Guest', wifiPassword: 'deodar2026', color: 's1', archived: false, createdAt: nowIso,
    },
    {
      id: 'prop_river', name: 'Riverstone Homestay', type: 'homestay', address: 'Chalal Trail, near Parvati bridge', city: 'Kasol',
      description: 'A family-run homestay on the Parvati river with four cosy rooms, home-cooked Himachali food and a riverside garden.',
      photos: [coverArt('river', '#bcd9f0', '#3f7d6a')],
      amenities: ['Wi-Fi', 'Hot water', 'Breakfast', 'Garden', 'Mountain view', 'Washing machine', 'First aid'],
      checkInTime: '12:00', checkOutTime: '10:30',
      checkInInstructions: 'From Kasol bus stand, cross the Parvati bridge towards Chalal. We are the blue-roofed house 400 m along the trail on your right.',
      houseRules: '• Breakfast 8–10 am in the garden\n• Please switch off geysers after use\n• Visitors must be registered at the front desk',
      wifiName: 'Riverstone', wifiPassword: 'parvati@24', color: 's2', archived: false, createdAt: nowIso,
    },
    {
      id: 'prop_alba', name: 'Villa Alba', type: 'villa', address: 'Assagao–Anjuna Road', city: 'Goa',
      description: 'A four-bedroom Portuguese villa with a private pool and garden, rented as one home.',
      photos: [coverArt('beach', '#f6c9a8', '#d48b5c')],
      amenities: ['Wi-Fi', 'Pool', 'Air conditioning', 'Kitchen', 'Parking', 'Garden', 'BBQ', 'Washing machine', 'TV', 'Workspace', 'Power backup'],
      checkInTime: '14:00', checkOutTime: '11:00',
      checkInInstructions: 'Anil (caretaker) will welcome you. The villa is the white house with blue shutters after St. Cajetan chapel. Gate code is shared on the day of arrival.',
      houseRules: '• No parties or events\n• Pool open 7 am – 9 pm, no glass at the pool\n• Refundable security deposit of ₹10,000 collected at check-in',
      wifiName: 'VillaAlba_5G', wifiPassword: 'azulejo2026', color: 's3', archived: false, createdAt: nowIso,
    },
  ];

  const mkUnit = (propertyId: string, name: string, type: Unit['type'], capacity: number, bedrooms: number, base: number, weekend: number | null, cleaning: number): Unit => ({
    id: uid('unit'), propertyId, name, type, capacity, bedrooms, baseRate: r(base), weekendRate: weekend ? r(weekend) : null, cleaningFee: r(cleaning), readiness: 'ready', archived: false,
  });
  const units: Unit[] = [
    mkUnit('prop_cedar', 'Deodar Cabin', 'cabin', 4, 2, 6500, 8000, 800),
    mkUnit('prop_cedar', 'Pinecone Cabin', 'cabin', 2, 1, 4800, 5800, 600),
    mkUnit('prop_cedar', 'Birch A-Frame', 'cabin', 3, 1, 5500, 6800, 700),
    mkUnit('prop_river', 'Garden Room', 'room', 2, 1, 2800, 3200, 0),
    mkUnit('prop_river', 'River Room', 'room', 2, 1, 3400, 3900, 0),
    mkUnit('prop_river', 'Attic Room', 'room', 2, 1, 2400, null, 0),
    mkUnit('prop_river', 'Family Suite', 'suite', 4, 2, 4800, 5600, 0),
    mkUnit('prop_alba', 'Villa Alba (entire)', 'entire_home', 8, 4, 18000, 22000, 2500),
  ];

  staff.push(
    { id: 'usr_ramesh', name: 'Ramesh Negi', email: 'ramesh.negi@gmail.com', phone: '+91 98058 77120', role: 'caretaker', propertyIds: ['prop_cedar'], status: 'active', invitedAt: nowIso, color: 's4' },
    { id: 'usr_sunita', name: 'Sunita Devi', email: 'sunita.d@gmail.com', phone: '+91 98163 40981', role: 'cleaner', propertyIds: ['prop_cedar', 'prop_river'], status: 'active', invitedAt: nowIso, color: 's5' },
    { id: 'usr_anil', name: 'Anil Fernandes', email: 'anil.goa@gmail.com', phone: '+91 98220 31876', role: 'cleaner', propertyIds: ['prop_alba'], status: 'invited', invitedAt: nowIso, color: 's6' },
  );

  // ── Rate rules
  const y = Number(today.slice(0, 4));
  const rateRules: RateRule[] = [
    { id: uid('rate'), propertyId: 'prop_cedar', unitId: null, name: 'Diwali peak', kind: 'seasonal', startDate: `${y}-11-06`, endDate: `${y}-11-12`, mode: 'percent', value: 25, minNights: 1, active: true },
    { id: uid('rate'), propertyId: 'prop_cedar', unitId: null, name: 'Christmas & New Year', kind: 'seasonal', startDate: `${y}-12-20`, endDate: `${y + 1}-01-03`, mode: 'percent', value: 40, minNights: 2, active: true },
    { id: uid('rate'), propertyId: 'prop_river', unitId: null, name: 'Monsoon offer', kind: 'special_offer', startDate: `${y}-07-01`, endDate: `${y}-08-31`, mode: 'percent', value: -15, minNights: 1, active: true },
    { id: uid('rate'), propertyId: 'prop_alba', unitId: null, name: 'Goa high season', kind: 'seasonal', startDate: `${y}-12-15`, endDate: `${y + 1}-01-05`, mode: 'fixed', value: r(32000), minNights: 3, active: true },
    { id: uid('rate'), propertyId: 'prop_alba', unitId: null, name: 'Monsoon villa deal', kind: 'special_offer', startDate: `${y}-06-15`, endDate: `${y}-09-15`, mode: 'percent', value: -30, minNights: 2, active: true },
  ];

  // ── Guests
  const guests: Guest[] = [];
  for (let i = 0; i < 46; i++) {
    const first = FIRST[i % FIRST.length];
    const last = pick(LAST);
    const [city, country] = pick(CITIES);
    guests.push({
      id: uid('gst'), firstName: first, lastName: last,
      email: `${first}.${last}`.toLowerCase().replace(/[^a-z.]/g, '') + `${between(1, 99)}@gmail.com`,
      phone: country === 'India' ? `+91 9${between(100000000, 999999999)}` : `+${between(30, 61)} ${between(100000000, 999999999)}`,
      country, city, idType: country === 'India' ? 'Aadhaar' : 'Passport', idNumberMasked: `•••• ${between(1000, 9999)}`,
      preferences: pick(['', '', 'Prefers ground floor', 'Vegetarian meals', 'Early check-in if possible', 'Allergic to feather pillows', 'Travels with a dog', 'Needs a workspace & fast Wi-Fi']),
      notes: '', tags: [], vip: false, marketingConsent: rand() > 0.4, createdAt: ts(addDaysISO(today, -between(30, 400))),
    });
  }
  guests[0].vip = true; guests[0].tags = ['Repeat', 'VIP']; guests[0].notes = 'Stayed 4 times. Loves the Deodar Cabin — offer it first.';
  guests[3].tags = ['Repeat']; guests[7].tags = ['Corporate'];

  // ── Bookings
  const bookings: Booking[] = [];
  const transactions: Transaction[] = [];
  const unitById = new Map(units.map((u) => [u.id, u]));
  const commissionRate: Partial<Record<BookingSource, number>> = { airbnb: 3, booking_com: 15, expedia: 18, agoda: 17 };
  const extrasPool = [
    { label: 'Breakfast for 2 × nights', per: 600 }, { label: 'Bonfire evening', per: 1200 }, { label: 'Airport / bus-stand pickup', per: 1800 },
    { label: 'Guided trek', per: 2500 }, { label: 'Late check-out', per: 1000 },
  ];

  function addBooking(unit: Unit, checkIn: ISODate, checkOut: ISODate, opts: Partial<Booking> & { guest?: Guest } = {}): Booking | null {
    if (findConflicts(bookings, unit.id, checkIn, checkOut).length) return null;
    const guest = opts.guest ?? (rand() < 0.18 ? guests[between(0, 6)] : pick(guests));
    const nights = quoteNights(unit, rateRules, checkIn, checkOut);
    const source: BookingSource = opts.source ?? pick(['airbnb', 'airbnb', 'airbnb', 'booking_com', 'booking_com', 'direct', 'direct', 'direct', 'phone', 'phone', 'walk_in', 'website'] as BookingSource[]);
    const extras = rand() < 0.35 ? [(() => { const e = pick(extrasPool); const amt = e.label.startsWith('Breakfast') ? e.per * nights.length : e.per; return { id: uid('li'), label: e.label.replace('× nights', `× ${nights.length} nights`), amount: r(amt), kind: 'extra' as const }; })()] : [];
    // Created before check-in, and never in the future
    const leadCreated = addDaysISO(checkIn, -between(3, 45));
    const latest = addDaysISO(today, -between(0, 12));
    const created = leadCreated < latest ? leadCreated : latest;
    const b: Booking = {
      id: uid('bk'), code: bookingCode(), propertyId: unit.propertyId, unitId: unit.id, guestId: guest.id, checkIn, checkOut,
      adults: Math.min(unit.capacity, between(1, Math.max(1, unit.capacity))), children: unit.capacity > 2 && rand() < 0.3 ? 1 : 0,
      status: 'confirmed', source, channelRef: commissionRate[source] ? `${source === 'airbnb' ? 'HM' : 'BC'}${between(10000000, 99999999)}` : '',
      nights, cleaningFee: unit.cleaningFee, extras, discount: source === 'direct' && rand() < 0.25 ? r(500) : 0, commission: 0,
      taxRate: 5, taxInclusive: false, securityDeposit: unit.propertyId === 'prop_alba' ? r(10000) : 0, cancellationFee: 0,
      notes: '', arrivalTime: pick(['', '13:30', '15:00', '17:00', '19:30']), createdAt: ts(created < checkIn ? created : addDaysISO(checkIn, -1), 8),
      updatedAt: nowIso, checkedInAt: null, checkedOutAt: null, cancelledAt: null, review: null, ...opts,
    };
    const t = bookingTotals(b);
    if (commissionRate[source]) b.commission = pct(commissionRate[source]!, t.total);
    bookings.push(b);
    return b;
  }

  // Force a lively "today": arrivals, departures and in-house guests
  const [deodar, pinecone, birch, garden, riverRoom, attic, family, villa] = units;
  addBooking(deodar, today, addDaysISO(today, 3), { guest: guests[0], source: 'direct', arrivalTime: '15:00' });
  addBooking(garden, today, addDaysISO(today, 2), { guest: guests[5], source: 'booking_com' });
  addBooking(pinecone, addDaysISO(today, -3), today, { guest: guests[9], source: 'airbnb' });
  addBooking(riverRoom, addDaysISO(today, -2), addDaysISO(today, 2), { guest: guests[11], source: 'phone' });
  addBooking(villa, addDaysISO(today, -2), addDaysISO(today, 3), { guest: guests[7], source: 'direct' });
  addBooking(birch, addDaysISO(today, 1), addDaysISO(today, 4), { guest: guests[3], source: 'direct' });
  addBooking(family, addDaysISO(today, 1), addDaysISO(today, 3), { guest: guests[14], source: 'airbnb' });

  // Random walk per unit over ~7 months back and ~2.5 months forward
  const start = addDaysISO(today, -205);
  const end = addDaysISO(today, 80);
  for (const unit of units) {
    let cur = addDaysISO(start, between(0, 3));
    const isVilla = unit.type === 'entire_home';
    while (cur < end) {
      const future = cur > today;
      const gap = future ? between(1, 6) : between(0, isVilla ? 5 : 3);
      const ci = addDaysISO(cur, gap);
      const len = isVilla ? between(2, 6) : between(1, 4);
      const co = addDaysISO(ci, len);
      const busyFuture = future && nightsBetween(today, ci) > 30 && rand() < 0.45; // sparser far future
      if (!busyFuture) addBooking(unit, ci, co);
      cur = co;
    }
  }

  // A few inquiries & cancellations
  addBooking(attic, addDaysISO(today, 18), addDaysISO(today, 20), { status: 'inquiry', source: 'phone' });
  addBooking(birch, addDaysISO(today, 26), addDaysISO(today, 29), { status: 'tentative', source: 'direct' });

  // Statuses, check-in/out stamps, payments, deposits, reviews
  const payMethod = (b: Booking): PaymentMethod => (b.source === 'walk_in' ? pick(['cash', 'cash', 'upi'] as PaymentMethod[]) : pick(['upi', 'upi', 'upi', 'card', 'bank_transfer', 'cash'] as PaymentMethod[]));
  const pushTxn = (t: Omit<Transaction, 'id' | 'createdAt' | 'createdBy' | 'attachments' | 'recurringId' | 'taskId' | 'vendor' | 'notes' | 'incomeCategory' | 'expenseCategory' | 'purpose' | 'reference'> & Partial<Transaction>) => {
    if (t.date > today) return;
    transactions.push({
      vendor: '', notes: '', incomeCategory: null, expenseCategory: null, purpose: null, reference: '', attachments: [], recurringId: null, taskId: null,
      ...t, id: uid('txn'), createdAt: ts(t.date, 12), createdBy: 'usr_owner',
    });
  };

  let overdueSeeded = 0;
  for (const b of bookings.sort((a, c) => a.checkIn.localeCompare(c.checkIn))) {
    const ota = !!commissionRate[b.source];
    if (b.status === 'inquiry' || b.status === 'tentative') continue;
    if (b.checkOut < today) b.status = 'checked_out';
    else if (b.checkIn < today) b.status = 'checked_in'; // includes guests departing today

    // Cancellations (~6%) and rare no-shows
    if (b.checkIn > addDaysISO(today, 0) && rand() < 0.06 && b.guestId !== guests[0].id && b.checkIn > addDaysISO(today, 1)) {
      b.status = 'cancelled';
      b.cancelledAt = ts(addDaysISO(today, -between(0, 6)), 9);
      b.cancellationFee = 0;
    } else if (b.checkOut < today && rand() < 0.035) {
      b.status = rand() < 0.5 ? 'no_show' : 'cancelled';
      b.cancelledAt = ts(addDaysISO(b.checkIn, -between(0, 5)), 9);
      b.cancellationFee = r(between(1, 3) * 1000);
    }
    if (b.status === 'checked_in' || b.status === 'checked_out') b.checkedInAt = ts(b.checkIn, 9);
    if (b.status === 'checked_out') b.checkedOutAt = ts(b.checkOut, 5);

    const totals = bookingTotals(b);
    const created = b.createdAt.slice(0, 10);
    const pid = b.propertyId;
    const base = { propertyId: pid, bookingId: b.id, guestId: b.guestId };

    if (b.status === 'cancelled' || b.status === 'no_show') {
      // advance paid then partially refunded
      if (!ota && rand() < 0.6) {
        const adv = Math.round(bookingTotals({ ...b, status: 'confirmed' }).total * 0.3);
        pushTxn({ ...base, kind: 'payment', date: created, amount: adv, method: 'upi', purpose: 'advance', reference: `UPI${between(100000000, 999999999)}` });
        const refund = adv - b.cancellationFee;
        if (refund > 0) pushTxn({ ...base, kind: 'refund', date: (b.cancelledAt ?? created).slice(0, 10), amount: refund, method: 'upi', notes: 'Cancellation refund' });
      }
      continue;
    }

    if (ota) {
      // OTA collects; payout on/after check-in. Commission booked as expense.
      const payout = addDaysISO(b.checkIn, b.source === 'airbnb' ? 1 : 3);
      pushTxn({ ...base, kind: 'payment', date: payout, amount: totals.total, method: 'ota_payout', purpose: 'full', reference: b.channelRef });
      pushTxn({ propertyId: pid, bookingId: b.id, guestId: null, kind: 'expense', date: payout, amount: b.commission, method: 'ota_payout', expenseCategory: 'commission', vendor: b.source === 'airbnb' ? 'Airbnb' : 'Booking.com', notes: `Commission on ${b.code}` });
    } else {
      const adv = Math.round(totals.total * pick([0.25, 0.3, 0.5]));
      const advDate = created <= today ? created : today;
      const takesAdvance = b.source !== 'walk_in' && rand() < 0.75;
      if (takesAdvance) pushTxn({ ...base, kind: 'payment', date: advDate, amount: adv, method: pick(['upi', 'upi', 'bank_transfer'] as PaymentMethod[]), purpose: 'advance', reference: `UPI${between(100000000, 999999999)}` });
      const paidSoFar = takesAdvance ? adv : 0;
      if (b.status === 'checked_out' || b.status === 'checked_in') {
        const skip = b.status === 'checked_out' && overdueSeeded < 2 && b.checkOut > addDaysISO(today, -25) && rand() < 0.3;
        const isInHouse = b.status === 'checked_in' && rand() < 0.5;
        if (skip) overdueSeeded++;
        else if (!isInHouse) pushTxn({ ...base, kind: 'payment', date: b.checkIn, amount: totals.total - paidSoFar, method: payMethod(b), purpose: paidSoFar ? 'balance' : 'full' });
      }
    }
    if (b.securityDeposit && (b.status === 'checked_in' || b.status === 'checked_out')) {
      pushTxn({ ...base, kind: 'deposit', date: b.checkIn, amount: b.securityDeposit, method: 'upi', notes: 'Refundable security deposit' });
      if (b.status === 'checked_out') pushTxn({ ...base, kind: 'deposit_return', date: b.checkOut, amount: b.securityDeposit, method: 'upi', notes: 'Deposit returned — no damages' });
    }
    if (b.status === 'checked_out' && rand() < 0.55) {
      const rating = pick([5, 5, 5, 4, 4, 5, 3]);
      b.review = { rating, comment: pick(['Absolutely magical stay, the hosts were wonderful.', 'Spotless, cosy and the view is unreal.', 'Great location, a bit of a climb with bags.', 'Loved the bonfire night and food!', 'Peaceful and well-kept. Would come back.', 'Hot water was patchy one morning, otherwise lovely.']), source: b.source === 'airbnb' ? 'Airbnb' : b.source === 'booking_com' ? 'Booking.com' : 'Direct', at: addDaysISO(b.checkOut, between(1, 4)) };
    }
  }

  // ── Operating expenses (monthly) + other income
  const expense = (date: ISODate, propertyId: string | null, category: ExpenseCategory, amount: number, vendor: string, method: PaymentMethod, notes = '', recurringId: string | null = null) =>
    pushTxn({ kind: 'expense', date, amount: r(amount), method, propertyId, bookingId: null, guestId: null, expenseCategory: category, vendor, notes, recurringId });

  const recurring: RecurringExpense[] = [
    { id: uid('rec'), name: 'Riverstone lease', category: 'rent', amount: r(35000), propertyId: 'prop_river', vendor: 'Thakur family', method: 'bank_transfer', frequency: 'monthly', nextDue: '', active: true, notes: 'Due on the 5th' },
    { id: uid('rec'), name: 'Electricity — Cedar Ridge', category: 'utilities', amount: r(7200), propertyId: 'prop_cedar', vendor: 'HPSEB', method: 'upi', frequency: 'monthly', nextDue: '', active: true, notes: '' },
    { id: uid('rec'), name: 'Fibre internet — all properties', category: 'utilities', amount: r(3600), propertyId: null, vendor: 'Airtel Xstream', method: 'card', frequency: 'monthly', nextDue: '', active: true, notes: '' },
    { id: uid('rec'), name: 'Staff salaries', category: 'staff', amount: r(84000), propertyId: null, vendor: 'Payroll', method: 'bank_transfer', frequency: 'monthly', nextDue: '', active: true, notes: 'Ramesh, Sunita, Anil, kitchen help' },
    { id: uid('rec'), name: 'Villa Alba insurance', category: 'insurance', amount: r(28500), propertyId: 'prop_alba', vendor: 'ICICI Lombard', method: 'card', frequency: 'yearly', nextDue: '', active: true, notes: '' },
    { id: uid('rec'), name: 'Villa Alba lease', category: 'rent', amount: r(110000), propertyId: 'prop_alba', vendor: 'D\'Souza family', method: 'bank_transfer', frequency: 'monthly', nextDue: '', active: true, notes: 'Due on the 7th' },
    { id: uid('rec'), name: 'Cedar Ridge land lease', category: 'rent', amount: r(45000), propertyId: 'prop_cedar', vendor: 'Thakur Estates', method: 'bank_transfer', frequency: 'monthly', nextDue: '', active: true, notes: 'Due on the 10th' },
    { id: uid('rec'), name: 'Channel manager subscription', category: 'software', amount: r(1499), propertyId: null, vendor: 'Software', method: 'card', frequency: 'monthly', nextDue: '', active: true, notes: '' },
  ];
  const day = (m: ISODate, d: number) => `${m.slice(0, 8)}${String(d).padStart(2, '0')}`;
  const monthStarts: ISODate[] = [];
  for (let i = 6; i >= 0; i--) monthStarts.push(addMonthsISO(startOfMonthISO(today), -i));
  for (const m of monthStarts) {
    const [lease, elec, net, salary, , villaLease, cedarLease, sw] = recurring;
    expense(day(m, 7), 'prop_alba', 'rent', 110000, villaLease.vendor, 'bank_transfer', 'Monthly lease', villaLease.id);
    expense(day(m, 10), 'prop_cedar', 'rent', 45000, cedarLease.vendor, 'bank_transfer', 'Monthly land lease', cedarLease.id);
    expense(day(m, 18), 'prop_alba', 'maintenance', between(5500, 8000), 'Goa Pool Care', 'upi', 'Pool & garden upkeep');
    expense(day(m, 5), 'prop_river', 'rent', 35000, lease.vendor, 'bank_transfer', 'Monthly lease', lease.id);
    expense(day(m, 8), 'prop_cedar', 'utilities', between(5800, 8900), elec.vendor, 'upi', 'Electricity bill', elec.id);
    expense(day(m, 9), 'prop_river', 'utilities', between(3200, 4800), 'HPSEB', 'upi', 'Electricity bill');
    expense(day(m, 11), 'prop_alba', 'utilities', between(9000, 14500), 'Goa Electricity Dept', 'upi', 'Electricity + water');
    expense(day(m, 3), null, 'utilities', 3600, net.vendor, 'card', '', net.id);
    expense(day(m, 1), null, 'staff', 84000, salary.vendor, 'bank_transfer', 'Monthly salaries', salary.id);
    expense(day(m, 2), null, 'software', 1499, sw.vendor, 'card', '', sw.id);
    expense(day(m, 14), 'prop_cedar', 'laundry', between(3500, 6200), 'Snow White Laundry', 'cash');
    expense(day(m, 15), 'prop_river', 'laundry', between(2400, 4100), 'Snow White Laundry', 'cash');
    expense(day(m, 16), 'prop_alba', 'cleaning', between(4000, 7000), 'Sparkle Housekeeping', 'upi', 'Deep clean');
    expense(day(m, 19), 'prop_river', 'food', between(9000, 15000), 'Kasol Mart', 'cash', 'Breakfast groceries');
    expense(day(m, 21), pick(['prop_cedar', 'prop_river', 'prop_alba']), 'supplies', between(1800, 5200), pick(['Amazon', 'D-Mart', 'Local hardware']), pick(['card', 'upi', 'cash']), 'Toiletries & consumables');
    if (rand() < 0.7) expense(day(m, between(4, 26)), pick(['prop_cedar', 'prop_alba']), pick(['maintenance', 'repairs']), between(1500, 12000), pick(['Rajesh Plumbing', 'Goa Pool Care', 'Sharma Electricals']), pick(['cash', 'upi']), pick(['Pool servicing', 'Geyser repair', 'Roof leak patch', 'Generator service']));
    if (rand() < 0.5) expense(day(m, 25), null, 'marketing', between(2000, 6000), 'Instagram Ads', 'card', 'Promoted posts');
    if (rand() < 0.6) pushTxn({ kind: 'income', date: day(m, between(5, 25)), amount: r(between(1500, 6000)), method: pick(['cash', 'upi']), propertyId: pick(['prop_cedar', 'prop_river']), bookingId: null, guestId: null, incomeCategory: pick(['tours', 'food_beverage', 'extra_service']), notes: pick(['Paragliding referral commission', 'Café sales — non-resident guests', 'Bike rental referral']) });
  }
  // Next due dates for recurring
  for (const rc of recurring) {
    const dom = rc.frequency === 'yearly' ? 0 : rc.name.startsWith('Villa') ? 7 : rc.name.startsWith('Cedar Ridge land') ? 10 : rc.category === 'rent' ? 5 : rc.category === 'staff' ? 1 : rc.category === 'software' ? 2 : rc.name.includes('internet') ? 3 : 8;
    rc.nextDue = rc.frequency === 'yearly' ? addDaysISO(today, 4) : (() => { const thisMonth = day(today, dom); return thisMonth > today ? thisMonth : day(addMonthsISO(startOfMonthISO(today), 1), dom); })();
  }
  recurring[0].nextDue = addDaysISO(today, 2);

  // ── Tasks
  const tasks: Task[] = [];
  const mkTask = (t: Partial<Task> & Pick<Task, 'title' | 'propertyId' | 'type'>): Task => ({
    id: uid('task'), unitId: null, bookingId: null, assigneeId: null, dueDate: today, dueTime: '', priority: 'medium', status: 'todo',
    checklist: [], notes: '', photos: [], cost: 0, expenseId: null, auto: false, createdAt: nowIso, completedAt: null, ...t,
  });
  tasks.push(
    mkTask({ type: 'maintenance', title: 'Geyser not heating — Pinecone Cabin', propertyId: 'prop_cedar', unitId: pinecone.id, assigneeId: 'usr_ramesh', priority: 'urgent', status: 'in_progress', dueDate: today, notes: 'Guest reported lukewarm water this morning. Electrician booked for 4 pm.', cost: r(2800) }),
    mkTask({ type: 'maintenance', title: 'Loose railing on Birch deck', propertyId: 'prop_cedar', unitId: birch.id, assigneeId: 'usr_ramesh', priority: 'high', dueDate: addDaysISO(today, 1), notes: 'Needs fixing before next arrival.' }),
    mkTask({ type: 'maintenance', title: 'Pool pump making noise', propertyId: 'prop_alba', unitId: villa.id, assigneeId: 'usr_anil', priority: 'medium', dueDate: addDaysISO(today, 3) }),
    mkTask({ type: 'inspection', title: 'Monthly fire-safety check', propertyId: 'prop_river', assigneeId: 'usr_meera', priority: 'low', dueDate: addDaysISO(today, 6), checklist: checklist(['Extinguishers in date', 'Smoke alarms tested', 'Exit signs lit', 'First-aid kit stocked']) }),
    mkTask({ type: 'other', title: 'Restock firewood for winter', propertyId: 'prop_cedar', assigneeId: 'usr_ramesh', priority: 'medium', dueDate: addDaysISO(today, -1), notes: 'Order 2 tonnes from forest depot.' }),
    mkTask({ type: 'maintenance', title: 'Replace Attic Room curtains', propertyId: 'prop_river', unitId: attic.id, priority: 'low', status: 'done', dueDate: addDaysISO(today, -9), completedAt: ts(addDaysISO(today, -8)), cost: r(3400) }),
  );
  // Past completed turnover cleans for recent checkouts
  for (const b of bookings.filter((x) => x.status === 'checked_out' && x.checkOut >= addDaysISO(today, -6))) {
    const u = unitById.get(b.unitId)!;
    tasks.push(mkTask({ type: 'cleaning', title: `Turnover clean — ${u.name}`, propertyId: b.propertyId, unitId: u.id, bookingId: b.id, assigneeId: b.propertyId === 'prop_alba' ? 'usr_anil' : 'usr_sunita', status: 'done', dueDate: b.checkOut, completedAt: ts(b.checkOut, 9), auto: true, checklist: checklist(DEFAULT_CLEANING_CHECKLIST).map((c) => ({ ...c, done: true })) }));
  }
  // Link the done repair to an expense
  const doneRepair = tasks.find((t) => t.status === 'done' && t.cost > 0)!;
  pushTxn({ kind: 'expense', date: doneRepair.completedAt!.slice(0, 10), amount: doneRepair.cost, method: 'cash', propertyId: doneRepair.propertyId, bookingId: null, guestId: null, expenseCategory: 'repairs', vendor: 'Kullu Furnishings', notes: doneRepair.title, taskId: doneRepair.id });
  doneRepair.expenseId = transactions[transactions.length - 1].id;

  // Unit readiness reflecting today
  pinecone.readiness = 'dirty';
  birch.readiness = 'inspect';

  const data: AppData = {
    version: DATA_VERSION,
    business: defaultBusiness(),
    properties, units, rateRules,
    propertyDocs: [
      { id: uid('pdoc'), propertyId: 'prop_river', name: 'Homestay registration (HP Tourism)', category: 'license', fileName: 'hp-homestay-registration.pdf', fileDataUrl: null, expiresOn: addDaysISO(today, 24), notes: 'Renew at DTDO office, Kullu', uploadedAt: nowIso },
      { id: uid('pdoc'), propertyId: 'prop_river', name: 'Lease agreement 2025–2028', category: 'contract', fileName: 'riverstone-lease.pdf', fileDataUrl: null, expiresOn: `${y + 2}-03-31`, notes: '', uploadedAt: nowIso },
      { id: uid('pdoc'), propertyId: 'prop_alba', name: 'Property insurance', category: 'insurance', fileName: 'villa-alba-policy.pdf', fileDataUrl: null, expiresOn: addDaysISO(today, 4), notes: 'ICICI Lombard — policy #VA-221908', uploadedAt: nowIso },
      { id: uid('pdoc'), propertyId: 'prop_cedar', name: 'Fire NOC', category: 'permit', fileName: 'cedar-fire-noc.pdf', fileDataUrl: null, expiresOn: `${y + 1}-06-30`, notes: '', uploadedAt: nowIso },
    ],
    guests, bookings, transactions, recurring, documents: [], tasks, staff,
    activity: [{ id: uid('act'), at: nowIso, actorId: 'usr_owner', action: 'workspace.created', entity: 'workspace', entityId: null, summary: 'Demo workspace created' }],
    templates: TEMPLATES.map((t) => ({ ...t, id: uid('tpl') })),
    channels: [],
    dismissedAlerts: [],
    currentUserId: 'usr_owner',
  };
  data.tasks.push(...ensureTurnoverTasks(data, today));
  return data;
}

export function emptyWorkspace(business = defaultBusiness()): AppData {
  return {
    version: DATA_VERSION, business, properties: [], units: [], rateRules: [], propertyDocs: [], guests: [], bookings: [], transactions: [],
    recurring: [], documents: [], tasks: [], activity: [], templates: TEMPLATES.map((t) => ({ ...t, id: uid('tpl') })), channels: [], dismissedAlerts: [],
    staff: [{ id: 'usr_owner', name: 'You', email: business.email, phone: business.phone, role: 'owner', propertyIds: [], status: 'active', invitedAt: new Date().toISOString(), color: 's1' }],
    currentUserId: 'usr_owner',
  };
}
