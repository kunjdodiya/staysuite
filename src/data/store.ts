import { create } from 'zustand';
import { addDaysISO, addMonthsISO, todayISO } from '@/lib/dates';
import { bookingCode, uid } from '@/lib/id';
import { findConflicts, validateStay } from '@/domain/availability';
import { ensureTurnoverTasks } from '@/domain/automation';
import { bookingLedger } from '@/domain/finance';
import { formatDocNumber, invoiceSnapshot, kindForTxn, receiptSnapshot } from '@/domain/documents';
import { formatMoney } from '@/lib/money';
import type {
  AppData, Booking, BookingStatus, BusinessSettings, DocumentKind, Guest, ID, IssuedDocument, MessageTemplate, Property,
  PropertyDocument, RateRule, Readiness, RecurringExpense, StaffMember, Task, TaskStatus, Transaction, Unit,
} from '@/domain/types';
import { buildSeed, DATA_VERSION, emptyWorkspace } from './seed';
import { loadData, saveData, autoBackup } from './persistence';
import { outbox } from './sync';

export type Result<T = void> = { ok: true; value: T } | { ok: false; error: string };
const ok = <T,>(value: T): Result<T> => ({ ok: true, value });
const fail = (error: string): Result<never> => ({ ok: false, error });

interface State {
  data: AppData;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  today: () => string;

  // settings
  updateBusiness: (patch: Partial<BusinessSettings>) => void;
  setCurrentUser: (id: ID) => void;
  // properties
  saveProperty: (p: Property) => void;
  archiveProperty: (id: ID, archived: boolean) => void;
  deleteProperty: (id: ID) => Result;
  saveUnit: (u: Unit) => void;
  deleteUnit: (id: ID) => Result;
  setReadiness: (unitId: ID, r: Readiness) => void;
  saveRateRule: (r: RateRule) => void;
  deleteRateRule: (id: ID) => void;
  savePropertyDoc: (d: PropertyDocument) => void;
  deletePropertyDoc: (id: ID) => void;
  // guests
  saveGuest: (g: Guest) => void;
  deleteGuest: (id: ID) => Result;
  // bookings
  saveBooking: (b: Booking) => Result<Booking>;
  setBookingStatus: (id: ID, status: BookingStatus, opts?: { cancellationFee?: number }) => Result;
  deleteBooking: (id: ID) => Result;
  // money
  addTransaction: (t: Transaction) => Result<Transaction>;
  updateTransaction: (t: Transaction) => Result<Transaction>;
  deleteTransaction: (id: ID) => Result;
  saveRecurring: (r: RecurringExpense) => void;
  deleteRecurring: (id: ID) => void;
  recordRecurring: (id: ID, date: string, amount?: number) => Result<Transaction>;
  skipRecurring: (id: ID) => void;
  // documents
  issueDocument: (kind: DocumentKind, ref: { bookingId?: ID; transactionId?: ID }, notes?: string) => Result<IssuedDocument>;
  voidDocument: (id: ID, isVoid: boolean) => void;
  // tasks
  saveTask: (t: Task) => void;
  setTaskStatus: (id: ID, status: TaskStatus) => void;
  deleteTask: (id: ID) => void;
  linkTaskExpense: (taskId: ID) => Result<Transaction>;
  // staff & templates
  saveStaff: (s: StaffMember) => void;
  deleteStaff: (id: ID) => Result;
  saveTemplate: (t: MessageTemplate) => void;
  deleteTemplate: (id: ID) => void;
  // alerts & data
  dismissAlert: (id: string) => void;
  restoreAlerts: () => void;
  runAutomation: () => number;
  resetDemo: () => void;
  startFresh: () => void;
  importData: (json: string) => Result;
}

const replace = <T extends { id: ID }>(list: T[], item: T) => {
  const i = list.findIndex((x) => x.id === item.id);
  if (i === -1) return [...list, item];
  const next = list.slice();
  next[i] = item;
  return next;
};

export const useStore = create<State>()((set, get) => {
  /** Apply a change, append to the activity log and queue it for sync. */
  const commit = (patch: Partial<AppData>, log?: { action: string; entity: string; entityId?: ID | null; summary: string }) => {
    set((s) => {
      const data = { ...s.data, ...patch };
      if (log) {
        data.activity = [{ id: uid('act'), at: new Date().toISOString(), actorId: s.data.currentUserId, entityId: log.entityId ?? null, ...log }, ...data.activity].slice(0, 500);
        outbox.push({ action: log.action, entity: log.entity, entityId: log.entityId ?? null });
      }
      return { data };
    });
  };
  const D = () => get().data;
  const money = (v: number) => formatMoney(v, D().business);
  const guestName = (id: ID) => { const g = D().guests.find((x) => x.id === id); return g ? `${g.firstName} ${g.lastName}` : 'guest'; };
  const today = () => todayISO(D().business.timeZone);

  const withAutomation = (data: AppData): Task[] => {
    const created = ensureTurnoverTasks(data, todayISO(data.business.timeZone));
    return created.length ? [...data.tasks, ...created] : data.tasks;
  };

  return {
    data: emptyWorkspace(),
    hydrated: false,
    today,

    hydrate: async () => {
      let data = await loadData();
      if (!data) data = buildSeed();
      if (data.version !== DATA_VERSION) data = { ...emptyWorkspace(), ...data, version: DATA_VERSION };
      data = { ...data, tasks: withAutomation(data) };
      set({ data, hydrated: true });
      autoBackup(data);
    },

    updateBusiness: (patch) => commit({ business: { ...D().business, ...patch } }, { action: 'settings.updated', entity: 'business', summary: 'Updated business settings' }),
    setCurrentUser: (id) => commit({ currentUserId: id }),

    saveProperty: (p) => {
      const exists = D().properties.some((x) => x.id === p.id);
      commit({ properties: replace(D().properties, p) }, { action: exists ? 'property.updated' : 'property.created', entity: 'property', entityId: p.id, summary: `${exists ? 'Updated' : 'Added'} property ${p.name}` });
    },
    archiveProperty: (id, archived) => {
      const p = D().properties.find((x) => x.id === id);
      if (!p) return;
      commit({ properties: replace(D().properties, { ...p, archived }) }, { action: 'property.archived', entity: 'property', entityId: id, summary: `${archived ? 'Archived' : 'Restored'} ${p.name}` });
    },
    deleteProperty: (id) => {
      const d = D();
      if (d.bookings.some((b) => b.propertyId === id)) return fail('This property has bookings. Archive it instead to keep your history.');
      const p = d.properties.find((x) => x.id === id);
      commit({
        properties: d.properties.filter((x) => x.id !== id), units: d.units.filter((u) => u.propertyId !== id),
        rateRules: d.rateRules.filter((r) => r.propertyId !== id), tasks: d.tasks.filter((t) => t.propertyId !== id), propertyDocs: d.propertyDocs.filter((x) => x.propertyId !== id),
      }, { action: 'property.deleted', entity: 'property', entityId: id, summary: `Deleted property ${p?.name}` });
      return ok(undefined);
    },
    saveUnit: (u) => {
      const exists = D().units.some((x) => x.id === u.id);
      commit({ units: replace(D().units, u) }, { action: exists ? 'unit.updated' : 'unit.created', entity: 'unit', entityId: u.id, summary: `${exists ? 'Updated' : 'Added'} unit ${u.name}` });
    },
    deleteUnit: (id) => {
      const d = D();
      if (d.bookings.some((b) => b.unitId === id)) return fail('This unit has bookings. Archive it instead.');
      const u = d.units.find((x) => x.id === id);
      commit({ units: d.units.filter((x) => x.id !== id) }, { action: 'unit.deleted', entity: 'unit', entityId: id, summary: `Deleted unit ${u?.name}` });
      return ok(undefined);
    },
    setReadiness: (unitId, readiness) => {
      const u = D().units.find((x) => x.id === unitId);
      if (!u) return;
      commit({ units: replace(D().units, { ...u, readiness }) }, { action: 'unit.readiness', entity: 'unit', entityId: unitId, summary: `${u.name} marked ${readiness.replace('_', ' ')}` });
    },
    saveRateRule: (r) => commit({ rateRules: replace(D().rateRules, r) }, { action: 'rate.saved', entity: 'rate', entityId: r.id, summary: `Saved rate rule ${r.name}` }),
    deleteRateRule: (id) => commit({ rateRules: D().rateRules.filter((r) => r.id !== id) }, { action: 'rate.deleted', entity: 'rate', entityId: id, summary: 'Deleted a rate rule' }),
    savePropertyDoc: (doc) => commit({ propertyDocs: replace(D().propertyDocs, doc) }, { action: 'document.saved', entity: 'property_doc', entityId: doc.id, summary: `Saved document ${doc.name}` }),
    deletePropertyDoc: (id) => commit({ propertyDocs: D().propertyDocs.filter((x) => x.id !== id) }, { action: 'document.deleted', entity: 'property_doc', entityId: id, summary: 'Deleted a property document' }),

    saveGuest: (g) => {
      const exists = D().guests.some((x) => x.id === g.id);
      commit({ guests: replace(D().guests, g) }, { action: exists ? 'guest.updated' : 'guest.created', entity: 'guest', entityId: g.id, summary: `${exists ? 'Updated' : 'Added'} guest ${g.firstName} ${g.lastName}` });
    },
    deleteGuest: (id) => {
      if (D().bookings.some((b) => b.guestId === id)) return fail('This guest has bookings and cannot be deleted. You can anonymise their details instead.');
      commit({ guests: D().guests.filter((g) => g.id !== id) }, { action: 'guest.deleted', entity: 'guest', entityId: id, summary: 'Deleted a guest' });
      return ok(undefined);
    },

    saveBooking: (b) => {
      const d = D();
      const err = validateStay(b.checkIn, b.checkOut);
      if (err) return fail(err);
      if (!d.units.some((u) => u.id === b.unitId)) return fail('Choose a unit');
      if (!d.guests.some((g) => g.id === b.guestId)) return fail('Choose a guest');
      if (b.adults < 1) return fail('At least one adult is required');
      const unit = d.units.find((u) => u.id === b.unitId)!;
      if (b.adults + b.children > unit.capacity) return fail(`${unit.name} sleeps up to ${unit.capacity}`);
      if (b.discount < 0 || b.extras.some((e) => e.amount < 0)) return fail('Amounts cannot be negative');
      if (['tentative', 'confirmed', 'checked_in', 'checked_out'].includes(b.status)) {
        const conflicts = findConflicts(d.bookings, b.unitId, b.checkIn, b.checkOut, b.id);
        if (conflicts.length) {
          const c = conflicts[0];
          return fail(`Double booking: ${unit.name} is taken by ${guestName(c.guestId)} (${c.code}) from ${c.checkIn} to ${c.checkOut}`);
        }
      }
      const exists = d.bookings.some((x) => x.id === b.id);
      const booking: Booking = { ...b, propertyId: unit.propertyId, code: b.code || bookingCode(), updatedAt: new Date().toISOString() };
      const bookings = replace(d.bookings, booking);
      // If dates moved, update the auto-created cleaning task
      let tasks = d.tasks.map((t) => (t.auto && t.bookingId === booking.id && t.status !== 'done' ? { ...t, dueDate: booking.checkOut, unitId: booking.unitId, propertyId: booking.propertyId } : t));
      tasks = withAutomation({ ...d, bookings, tasks });
      commit({ bookings, tasks }, {
        action: exists ? 'booking.updated' : 'booking.created', entity: 'booking', entityId: booking.id,
        summary: `${exists ? 'Updated' : 'New'} booking ${booking.code} · ${guestName(booking.guestId)} · ${unit.name}`,
      });
      return ok(booking);
    },

    setBookingStatus: (id, status, opts = {}) => {
      const d = D();
      const b = d.bookings.find((x) => x.id === id);
      if (!b) return fail('Booking not found');
      const now = new Date().toISOString();
      const next: Booking = { ...b, status, updatedAt: now };
      if (status === 'checked_in') next.checkedInAt = now;
      if (status === 'checked_out') next.checkedOutAt = now;
      if (status === 'cancelled' || status === 'no_show') { next.cancelledAt = now; next.cancellationFee = Math.max(0, opts.cancellationFee ?? 0); }
      if (['confirmed', 'tentative', 'checked_in'].includes(status) && ['cancelled', 'no_show', 'inquiry'].includes(b.status)) {
        const conflicts = findConflicts(d.bookings, b.unitId, b.checkIn, b.checkOut, b.id);
        if (conflicts.length) return fail(`Can't restore — the unit is now booked by ${guestName(conflicts[0].guestId)} (${conflicts[0].code})`);
        next.cancelledAt = null; next.cancellationFee = 0;
      }
      const bookings = replace(d.bookings, next);
      let units = d.units;
      let tasks = d.tasks;
      if (status === 'checked_out') {
        units = d.units.map((u) => (u.id === b.unitId ? { ...u, readiness: 'dirty' as Readiness } : u));
      }
      if (status === 'cancelled' || status === 'no_show') {
        tasks = d.tasks.filter((t) => !(t.auto && t.bookingId === id && t.status !== 'done'));
      }
      tasks = withAutomation({ ...d, bookings, tasks });
      const verb: Record<BookingStatus, string> = { inquiry: 'marked as inquiry', tentative: 'marked tentative', confirmed: 'confirmed', checked_in: 'checked in', checked_out: 'checked out', cancelled: 'cancelled', no_show: 'marked no-show' };
      commit({ bookings, units, tasks }, { action: `booking.${status}`, entity: 'booking', entityId: id, summary: `${guestName(b.guestId)} ${verb[status]} · ${b.code}` });
      return ok(undefined);
    },

    deleteBooking: (id) => {
      const d = D();
      if (d.transactions.some((t) => t.bookingId === id)) return fail('This booking has payments recorded. Cancel it instead so your books stay accurate.');
      if (d.documents.some((x) => x.bookingId === id && !x.void)) return fail('Documents were issued for this booking. Cancel it instead.');
      const b = d.bookings.find((x) => x.id === id);
      commit({ bookings: d.bookings.filter((x) => x.id !== id), tasks: d.tasks.filter((t) => !(t.bookingId === id && t.auto)) }, { action: 'booking.deleted', entity: 'booking', entityId: id, summary: `Deleted booking ${b?.code}` });
      return ok(undefined);
    },

    addTransaction: (t) => {
      const d = D();
      const v = validateTxn(d, t);
      if (v) return fail(v);
      const txn = { ...t, createdAt: t.createdAt || new Date().toISOString(), createdBy: d.currentUserId };
      const labels: Record<Transaction['kind'], string> = { payment: 'Payment', refund: 'Refund', deposit: 'Deposit', deposit_return: 'Deposit return', income: 'Income', expense: 'Expense' };
      commit({ transactions: [...d.transactions, txn] }, {
        action: `txn.${t.kind}`, entity: 'transaction', entityId: txn.id,
        summary: `${labels[t.kind]} ${money(t.amount)}${t.bookingId ? ` · ${guestName(t.guestId ?? '')}` : t.vendor ? ` · ${t.vendor}` : ''}`,
      });
      return ok(txn);
    },
    updateTransaction: (t) => {
      const d = D();
      const v = validateTxn({ ...d, transactions: d.transactions.filter((x) => x.id !== t.id) }, t);
      if (v) return fail(v);
      commit({ transactions: replace(d.transactions, t) }, { action: 'txn.updated', entity: 'transaction', entityId: t.id, summary: `Edited ${t.kind} of ${money(t.amount)}` });
      return ok(t);
    },
    deleteTransaction: (id) => {
      const d = D();
      const t = d.transactions.find((x) => x.id === id);
      if (!t) return fail('Not found');
      if (d.documents.some((x) => x.transactionId === id && !x.void)) return fail('A receipt was issued for this transaction. Void the receipt first.');
      commit({ transactions: d.transactions.filter((x) => x.id !== id), tasks: d.tasks.map((k) => (k.expenseId === id ? { ...k, expenseId: null } : k)) }, { action: 'txn.deleted', entity: 'transaction', entityId: id, summary: `Deleted ${t.kind} of ${money(t.amount)}` });
      return ok(undefined);
    },
    saveRecurring: (r) => commit({ recurring: replace(D().recurring, r) }, { action: 'recurring.saved', entity: 'recurring', entityId: r.id, summary: `Saved recurring expense ${r.name}` }),
    deleteRecurring: (id) => commit({ recurring: D().recurring.filter((r) => r.id !== id) }, { action: 'recurring.deleted', entity: 'recurring', entityId: id, summary: 'Deleted a recurring expense' }),
    recordRecurring: (id, date, amount) => {
      const d = D();
      const r = d.recurring.find((x) => x.id === id);
      if (!r) return fail('Not found');
      const res = get().addTransaction({
        id: uid('txn'), kind: 'expense', date, amount: amount ?? r.amount, method: r.method, propertyId: r.propertyId, bookingId: null, guestId: null,
        purpose: null, incomeCategory: null, expenseCategory: r.category, vendor: r.vendor, reference: '', notes: r.name, attachments: [], recurringId: r.id,
        taskId: null, createdAt: '', createdBy: '',
      });
      if (res.ok) commit({ recurring: replace(D().recurring, { ...r, nextDue: advance(r.nextDue, r.frequency) }) });
      return res;
    },
    skipRecurring: (id) => {
      const r = D().recurring.find((x) => x.id === id);
      if (r) commit({ recurring: replace(D().recurring, { ...r, nextDue: advance(r.nextDue, r.frequency) }) }, { action: 'recurring.skipped', entity: 'recurring', entityId: id, summary: `Skipped ${r.name} this cycle` });
    },

    issueDocument: (kind, ref, notes = '') => {
      const d = D();
      const date = today();
      let snapshot;
      let bookingId: ID | null = null, transactionId: ID | null = null, guestId: ID | null = null, propertyId: ID | null = null;
      if (ref.transactionId) {
        const t = d.transactions.find((x) => x.id === ref.transactionId);
        if (!t) return fail('Transaction not found');
        if (kind !== kindForTxn(t) && kind !== 'receipt') return fail('Document type does not match the transaction');
        snapshot = receiptSnapshot(d, t, notes);
        transactionId = t.id; bookingId = t.bookingId; guestId = t.guestId; propertyId = t.propertyId;
      } else if (ref.bookingId) {
        const b = d.bookings.find((x) => x.id === ref.bookingId);
        if (!b) return fail('Booking not found');
        if (b.status === 'inquiry') return fail('Confirm the booking before invoicing');
        snapshot = invoiceSnapshot(d, b, notes);
        bookingId = b.id; guestId = b.guestId; propertyId = b.propertyId;
      } else return fail('Nothing to document');
      const seq = (d.business.counters[kind] ?? 0) + 1;
      const doc: IssuedDocument = {
        id: uid('doc'), kind, number: formatDocNumber(kind, seq, d.business, date), issueDate: date,
        dueDate: kind === 'invoice' && bookingId ? d.bookings.find((b) => b.id === bookingId)!.checkIn : null,
        bookingId, transactionId, guestId, propertyId, snapshot, void: false, createdAt: new Date().toISOString(),
      };
      commit({ documents: [doc, ...d.documents], business: { ...d.business, counters: { ...d.business.counters, [kind]: seq } } }, { action: 'document.issued', entity: 'document', entityId: doc.id, summary: `Issued ${doc.number} · ${money(snapshot.total)}` });
      return ok(doc);
    },
    voidDocument: (id, isVoid) => {
      const doc = D().documents.find((x) => x.id === id);
      if (doc) commit({ documents: replace(D().documents, { ...doc, void: isVoid }) }, { action: isVoid ? 'document.voided' : 'document.restored', entity: 'document', entityId: id, summary: `${isVoid ? 'Voided' : 'Restored'} ${doc.number}` });
    },

    saveTask: (t) => {
      const exists = D().tasks.some((x) => x.id === t.id);
      commit({ tasks: replace(D().tasks, t) }, { action: exists ? 'task.updated' : 'task.created', entity: 'task', entityId: t.id, summary: `${exists ? 'Updated' : 'Created'} task “${t.title}”` });
    },
    setTaskStatus: (id, status) => {
      const d = D();
      const t = d.tasks.find((x) => x.id === id);
      if (!t) return;
      const next: Task = { ...t, status, completedAt: status === 'done' ? new Date().toISOString() : null };
      if (status === 'done' && t.type === 'cleaning') next.checklist = t.checklist.map((c) => ({ ...c, done: true }));
      let units = d.units;
      if (t.unitId && t.type === 'cleaning') {
        const readiness: Readiness | null = status === 'done' ? 'ready' : status === 'in_progress' ? 'cleaning' : null;
        if (readiness) units = d.units.map((u) => (u.id === t.unitId ? { ...u, readiness } : u));
      }
      commit({ tasks: replace(d.tasks, next), units }, { action: `task.${status}`, entity: 'task', entityId: id, summary: `“${t.title}” → ${status.replace('_', ' ')}` });
    },
    deleteTask: (id) => commit({ tasks: D().tasks.filter((t) => t.id !== id) }, { action: 'task.deleted', entity: 'task', entityId: id, summary: 'Deleted a task' }),
    linkTaskExpense: (taskId) => {
      const d = D();
      const t = d.tasks.find((x) => x.id === taskId);
      if (!t) return fail('Task not found');
      if (t.expenseId) return fail('Already linked to an expense');
      if (t.cost <= 0) return fail('Add a repair cost first');
      const res = get().addTransaction({
        id: uid('txn'), kind: 'expense', date: (t.completedAt ?? new Date().toISOString()).slice(0, 10), amount: t.cost, method: 'cash', propertyId: t.propertyId,
        bookingId: null, guestId: null, purpose: null, incomeCategory: null, expenseCategory: t.type === 'cleaning' ? 'cleaning' : 'repairs', vendor: '',
        reference: '', notes: t.title, attachments: t.photos, recurringId: null, taskId: t.id, createdAt: '', createdBy: '',
      });
      if (res.ok) commit({ tasks: replace(D().tasks, { ...t, expenseId: res.value.id }) });
      return res;
    },

    saveStaff: (s) => {
      const exists = D().staff.some((x) => x.id === s.id);
      commit({ staff: replace(D().staff, s) }, { action: exists ? 'staff.updated' : 'staff.invited', entity: 'staff', entityId: s.id, summary: exists ? `Updated ${s.name}` : `Invited ${s.name} as ${s.role}` });
    },
    deleteStaff: (id) => {
      const d = D();
      const s = d.staff.find((x) => x.id === id);
      if (!s) return fail('Not found');
      if (s.role === 'owner' && d.staff.filter((x) => x.role === 'owner').length === 1) return fail('A workspace needs at least one owner');
      commit({ staff: d.staff.filter((x) => x.id !== id), tasks: d.tasks.map((t) => (t.assigneeId === id ? { ...t, assigneeId: null } : t)) }, { action: 'staff.removed', entity: 'staff', entityId: id, summary: `Removed ${s.name}` });
      return ok(undefined);
    },
    saveTemplate: (t) => commit({ templates: replace(D().templates, t) }, { action: 'template.saved', entity: 'template', entityId: t.id, summary: `Saved template ${t.name}` }),
    deleteTemplate: (id) => commit({ templates: D().templates.filter((t) => t.id !== id) }),

    dismissAlert: (id) => commit({ dismissedAlerts: [...D().dismissedAlerts, id].slice(-400) }),
    restoreAlerts: () => commit({ dismissedAlerts: [] }),
    runAutomation: () => {
      const before = D().tasks.length;
      const tasks = withAutomation(D());
      if (tasks.length !== before) commit({ tasks }, { action: 'automation.ran', entity: 'task', summary: `Auto-created ${tasks.length - before} cleaning task(s)` });
      return tasks.length - before;
    },
    resetDemo: () => set({ data: buildSeed() }),
    startFresh: () => set({ data: emptyWorkspace(D().business) }),
    importData: (json) => {
      try {
        const parsed = JSON.parse(json) as AppData;
        if (!parsed || !Array.isArray(parsed.bookings) || !parsed.business) return fail('This file is not a StaySuite backup');
        set({ data: { ...emptyWorkspace(), ...parsed, version: DATA_VERSION } });
        return ok(undefined);
      } catch {
        return fail('Could not read the file — is it valid JSON?');
      }
    },
  };
});

function advance(date: string, f: RecurringExpense['frequency']) {
  switch (f) {
    case 'weekly': return addDaysISO(date, 7);
    case 'monthly': return addMonthsISO(date, 1);
    case 'quarterly': return addMonthsISO(date, 3);
    case 'yearly': return addMonthsISO(date, 12);
  }
}

/** Financial guard rails: no negative/zero amounts, no refunding more than was paid, etc. */
export function validateTxn(d: AppData, t: Transaction): string | null {
  if (!Number.isInteger(t.amount) || t.amount <= 0) return 'Amount must be greater than zero';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t.date)) return 'Choose a valid date';
  const today = todayISO(d.business.timeZone);
  if (t.date > addDaysISO(today, 1) && t.kind !== 'expense') return 'Payments cannot be dated in the future';
  if (t.kind === 'expense' && !t.expenseCategory) return 'Choose an expense category';
  if (t.kind === 'income' && !t.incomeCategory) return 'Choose an income category';
  if (['payment', 'refund', 'deposit', 'deposit_return'].includes(t.kind)) {
    const b = d.bookings.find((x) => x.id === t.bookingId);
    if (!b) return 'Link this to a booking';
    const led = bookingLedger(b, d.transactions);
    if (t.kind === 'refund' && t.amount > led.paid) return `Refund exceeds the ${formatMoney(led.paid, d.business)} paid on this booking`;
    if (t.kind === 'deposit_return' && t.amount > led.depositHeld) return `Only ${formatMoney(led.depositHeld, d.business)} deposit is held`;
  }
  return null;
}

// Persist every change (debounced) to IndexedDB, flushing immediately when the app is hidden or closed.
let timer: ReturnType<typeof setTimeout> | undefined;
let pending: AppData | null = null;
const flush = () => {
  clearTimeout(timer);
  if (pending) { const d = pending; pending = null; saveData(d); }
};
useStore.subscribe((s, prev) => {
  if (!s.hydrated || s.data === prev.data) return;
  pending = s.data;
  clearTimeout(timer);
  timer = setTimeout(flush, 200);
});
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
}
