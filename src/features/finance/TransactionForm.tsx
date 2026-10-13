import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Paperclip, X, FileText } from 'lucide-react';
import { Drawer } from '@/components/ui/overlay';
import { Button, Field, Input, MoneyInput, Select, Textarea, Switch, Checkbox, Segmented } from '@/components/ui';
import { useStore } from '@/data/store';
import { useData, useLedgers, useMoney, useToday } from '@/data/hooks';
import { openOverlay } from '@/data/ui';
import { uid } from '@/lib/id';
import { parseAmount, toMajor } from '@/lib/money';
import { addMonthsISO, addDaysISO, fmtDate } from '@/lib/dates';
import { compressImage } from '@/lib/download';
import { expenseCategoryLabel, frequencyLabel, incomeCategoryLabel, methodLabel, options, purposeLabel } from '@/domain/labels';
import { kindForTxn } from '@/domain/documents';
import type { Attachment, ExpenseCategory, Frequency, ID, IncomeCategory, PaymentMethod, PaymentPurpose, Transaction, TxnKind } from '@/domain/types';

const titles: Record<TxnKind, string> = {
  payment: 'Record guest payment', refund: 'Issue refund', deposit: 'Collect security deposit', deposit_return: 'Return security deposit', income: 'Add income', expense: 'Add expense',
};

export function TransactionForm({ txnKind, bookingId, transactionId, propertyId, onClose }: { txnKind: TxnKind; bookingId?: ID; transactionId?: ID; propertyId?: ID; onClose: () => void }) {
  const data = useData();
  const today = useToday();
  const money = useMoney();
  const ledgers = useLedgers();
  const addTransaction = useStore((s) => s.addTransaction);
  const updateTransaction = useStore((s) => s.updateTransaction);
  const saveRecurring = useStore((s) => s.saveRecurring);
  const issueDocument = useStore((s) => s.issueDocument);
  const existing = transactionId ? data.transactions.find((t) => t.id === transactionId) : undefined;
  const cur = data.business.currency;
  const fileRef = useRef<HTMLInputElement>(null);

  const [kind, setKind] = useState<TxnKind>(existing?.kind ?? txnKind);
  const bookingKinds: TxnKind[] = ['payment', 'refund', 'deposit', 'deposit_return'];
  const isBookingTxn = bookingKinds.includes(kind);

  const [f, setF] = useState(() => ({
    bookingId: existing?.bookingId ?? bookingId ?? '',
    amount: existing ? String(toMajor(existing.amount, cur)) : '',
    method: existing?.method ?? ((kind === 'expense' ? 'upi' : 'upi') as PaymentMethod),
    date: existing?.date ?? today,
    purpose: existing?.purpose ?? ('' as PaymentPurpose | ''),
    propertyId: existing?.propertyId ?? propertyId ?? '',
    expenseCategory: existing?.expenseCategory ?? ('' as ExpenseCategory | ''),
    incomeCategory: existing?.incomeCategory ?? ('' as IncomeCategory | ''),
    vendor: existing?.vendor ?? '',
    reference: existing?.reference ?? '',
    notes: existing?.notes ?? '',
    attachments: existing?.attachments ?? ([] as Attachment[]),
    recurring: false,
    frequency: 'monthly' as Frequency,
    issueReceipt: !existing && kind !== 'expense' && kind !== 'income',
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => { setF((s) => ({ ...s, [k]: v })); setErrors((e) => ({ ...e, [k]: '' })); };

  const booking = f.bookingId ? data.bookings.find((b) => b.id === f.bookingId) : undefined;
  const ledger = booking ? ledgers.get(booking.id) : undefined;
  const guest = booking ? data.guests.find((g) => g.id === booking.guestId) : undefined;

  const bookingOptions = useMemo(() => data.bookings
    .filter((b) => b.status !== 'inquiry')
    .filter((b) => {
      const l = ledgers.get(b.id)!;
      if (b.id === f.bookingId) return true;
      if (kind === 'payment') return l.balance > 0;
      if (kind === 'refund') return l.paid > 0;
      if (kind === 'deposit') return b.securityDeposit > 0 || b.status === 'checked_in' || b.status === 'confirmed';
      if (kind === 'deposit_return') return l.depositHeld > 0;
      return true;
    })
    .sort((a, b) => b.checkIn.localeCompare(a.checkIn))
    .map((b) => {
      const g = data.guests.find((x) => x.id === b.guestId);
      const l = ledgers.get(b.id)!;
      const extra = kind === 'payment' ? ` · due ${money(l.balance)}` : kind === 'refund' ? ` · paid ${money(l.paid)}` : kind === 'deposit_return' ? ` · held ${money(l.depositHeld)}` : '';
      return { value: b.id, label: `${g?.firstName} ${g?.lastName} · ${b.code} · ${fmtDate(b.checkIn, 'd MMM')}${extra}` };
    }), [data.bookings, data.guests, ledgers, kind, f.bookingId, money]);

  const suggested = (() => {
    if (!ledger || !booking) return 0;
    if (kind === 'payment') return Math.max(0, ledger.balance);
    if (kind === 'refund') return ledger.balance < 0 ? -ledger.balance : 0;
    if (kind === 'deposit') return Math.max(0, booking.securityDeposit - ledger.depositHeld);
    if (kind === 'deposit_return') return ledger.depositHeld;
    return 0;
  })();

  async function onFiles(files: FileList | null) {
    if (!files) return;
    const added: Attachment[] = [];
    for (const file of Array.from(files).slice(0, 5)) {
      if (file.size > 8 * 1024 * 1024) { toast.error(`${file.name} is larger than 8 MB`); continue; }
      const dataUrl = await compressImage(file);
      added.push({ id: uid('att'), name: file.name, type: file.type, dataUrl, size: dataUrl.length });
    }
    set('attachments', [...f.attachments, ...added]);
  }

  function submit() {
    const errs: Record<string, string> = {};
    const parsed = parseAmount(f.amount, cur);
    if ('error' in parsed) errs.amount = parsed.error;
    if (isBookingTxn && !f.bookingId) errs.bookingId = 'Choose a booking';
    if (kind === 'expense' && !f.expenseCategory) errs.expenseCategory = 'Choose a category';
    if (kind === 'income' && !f.incomeCategory) errs.incomeCategory = 'Choose a category';
    if (!f.date) errs.date = 'Choose a date';
    if (Object.keys(errs).length) { setErrors(errs); return; }
    const amount = (parsed as { value: number }).value;

    let purpose: PaymentPurpose | null = null;
    if (kind === 'payment' && ledger) {
      purpose = (f.purpose || (amount >= ledger.totals.total && ledger.paid === 0 ? 'full' : amount >= ledger.balance ? (ledger.paid > 0 ? 'balance' : 'full') : ledger.paid === 0 && booking!.checkIn > today ? 'advance' : 'partial')) as PaymentPurpose;
    }
    const txn: Transaction = {
      id: existing?.id ?? uid('txn'), kind, date: f.date, amount, method: f.method,
      propertyId: booking?.propertyId ?? (f.propertyId || null), bookingId: isBookingTxn ? f.bookingId : null, guestId: booking?.guestId ?? null, purpose,
      incomeCategory: kind === 'income' ? (f.incomeCategory as IncomeCategory) : null,
      expenseCategory: kind === 'expense' ? (f.expenseCategory as ExpenseCategory) : null,
      vendor: f.vendor.trim(), reference: f.reference.trim(), notes: f.notes.trim(), attachments: f.attachments,
      recurringId: existing?.recurringId ?? null, taskId: existing?.taskId ?? null, createdAt: existing?.createdAt ?? '', createdBy: existing?.createdBy ?? '',
    };
    const res = existing ? updateTransaction(txn) : addTransaction(txn);
    if (!res.ok) { setErrors({ amount: res.error }); toast.error(res.error); return; }

    if (kind === 'expense' && f.recurring && !existing) {
      const step = { weekly: (d: string) => addDaysISO(d, 7), monthly: (d: string) => addMonthsISO(d, 1), quarterly: (d: string) => addMonthsISO(d, 3), yearly: (d: string) => addMonthsISO(d, 12) }[f.frequency];
      saveRecurring({ id: uid('rec'), name: f.vendor || expenseCategoryLabel[f.expenseCategory as ExpenseCategory], category: f.expenseCategory as ExpenseCategory, amount, propertyId: txn.propertyId, vendor: f.vendor, method: f.method, frequency: f.frequency, nextDue: step(f.date), active: true, notes: f.notes });
    }
    toast.success(existing ? 'Transaction updated' : `${titles[kind].replace(/^(Record|Add|Issue|Collect|Return) /, '').replace(/^./, (c) => c.toUpperCase())} saved`, { description: money(amount) });
    onClose();
    if (f.issueReceipt && !existing) {
      const doc = issueDocument(kindForTxn(txn), { transactionId: res.value.id });
      if (doc.ok) openOverlay({ kind: 'viewDocument', documentId: doc.value.id });
    }
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title={existing ? 'Edit transaction' : titles[kind]}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submit}>{existing ? 'Save' : 'Save'}</Button></>}
    >
      <div className="space-y-5">
        {!existing && !bookingId && (
          <Segmented
            value={isBookingTxn ? 'guest' : kind}
            onChange={(v) => { const k = v === 'guest' ? 'payment' : (v as TxnKind); setKind(k); set('issueReceipt', k !== 'expense' && k !== 'income'); }}
            options={[{ value: 'guest', label: 'Guest payment' }, { value: 'income', label: 'Other income' }, { value: 'expense', label: 'Expense' }]}
          />
        )}
        {isBookingTxn && !existing && (
          <Segmented size="sm" value={kind} onChange={(v) => setKind(v)} options={[
            { value: 'payment', label: 'Payment' }, { value: 'refund', label: 'Refund' }, { value: 'deposit', label: 'Deposit in' }, { value: 'deposit_return', label: 'Deposit out' },
          ]} />
        )}

        {isBookingTxn && (
          <Field label="Booking" required error={errors.bookingId}>
            <Select value={f.bookingId} onChange={(v) => { set('bookingId', v); set('amount', ''); }} options={bookingOptions} placeholder={bookingOptions.length ? 'Select a booking…' : 'No matching bookings'} invalid={!!errors.bookingId} />
          </Field>
        )}

        {booking && ledger && (
          <div className="grid grid-cols-3 gap-2 p-3 rounded-2xl bg-surface-2/60 border border-border text-center">
            <div><div className="text-[11.5px] text-muted">Total</div><div className="font-semibold num text-[14px]">{money(ledger.totals.total)}</div></div>
            <div><div className="text-[11.5px] text-muted">Paid</div><div className="font-semibold num text-[14px] text-success">{money(ledger.paid)}</div></div>
            <div><div className="text-[11.5px] text-muted">{ledger.balance < 0 ? 'Refund due' : 'Balance'}</div><div className={`font-semibold num text-[14px] ${ledger.balance > 0 ? 'text-warning' : ''}`}>{money(Math.abs(ledger.balance))}</div></div>
            {guest && <div className="col-span-3 text-[12px] text-subtle">{guest.firstName} {guest.lastName} · {fmtDate(booking.checkIn, 'd MMM')} → {fmtDate(booking.checkOut, 'd MMM')}{ledger.depositHeld ? ` · deposit held ${money(ledger.depositHeld)}` : ''}</div>}
          </div>
        )}

        {kind === 'expense' && (
          <Field label="Category" required error={errors.expenseCategory}>
            <div className="flex flex-wrap gap-1.5">
              {options(expenseCategoryLabel).map((o) => (
                <button key={o.value} onClick={() => set('expenseCategory', o.value)} className={`h-8 px-3 rounded-lg text-[13px] border transition-colors ${f.expenseCategory === o.value ? 'bg-fg text-bg border-fg dark:bg-accent dark:text-accent-fg dark:border-accent' : 'bg-surface border-border text-muted hover:text-fg hover:border-border-strong'}`}>{o.label}</button>
              ))}
            </div>
          </Field>
        )}
        {kind === 'income' && (
          <Field label="Category" required error={errors.incomeCategory}>
            <Select value={f.incomeCategory} onChange={(v) => set('incomeCategory', v)} options={options(incomeCategoryLabel)} placeholder="Choose…" invalid={!!errors.incomeCategory} />
          </Field>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount" required error={errors.amount}>
            <MoneyInput value={f.amount} onChange={(v) => set('amount', v)} invalid={!!errors.amount} autoFocus />
          </Field>
          <Field label="Date" required error={errors.date}><Input type="date" value={f.date} max={kind === 'expense' ? undefined : today} onChange={(e) => set('date', e.target.value)} /></Field>
        </div>
        {suggested > 0 && !existing && (
          <button onClick={() => set('amount', String(toMajor(suggested, cur)))} className="-mt-3 text-[12.5px] text-accent font-medium hover:underline">
            Use {kind === 'payment' ? 'full balance' : kind === 'refund' ? 'refund due' : kind === 'deposit' ? 'deposit amount' : 'held deposit'} · {money(suggested)}
          </button>
        )}

        <Field label="Payment method">
          <div className="flex flex-wrap gap-1.5">
            {options(methodLabel).filter((o) => kind === 'expense' || o.value !== 'ota_payout' || booking?.source !== 'direct').map((o) => (
              <button key={o.value} onClick={() => set('method', o.value)} className={`h-8 px-3 rounded-lg text-[13px] border transition-colors ${f.method === o.value ? 'bg-accent-soft text-accent border-accent/30 font-medium' : 'bg-surface border-border text-muted hover:text-fg'}`}>{o.label}</button>
            ))}
          </div>
        </Field>

        {kind === 'payment' && (
          <Field label="Payment type" hint="Detected automatically if left blank">
            <Select value={f.purpose} onChange={(v) => set('purpose', v)} options={options(purposeLabel)} placeholder="Auto-detect" />
          </Field>
        )}

        {!isBookingTxn && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Property">
              <Select value={f.propertyId} onChange={(v) => set('propertyId', v)} options={data.properties.map((p) => ({ value: p.id, label: p.name }))} placeholder="All / shared" />
            </Field>
            <Field label={kind === 'expense' ? 'Vendor / paid to' : 'Received from'}><Input value={f.vendor} onChange={(e) => set('vendor', e.target.value)} placeholder="Optional" /></Field>
          </div>
        )}

        <Field label="Reference" hint="UPI ref, UTR, cheque or bill number"><Input value={f.reference} onChange={(e) => set('reference', e.target.value)} placeholder="Optional" /></Field>
        <Field label="Notes"><Textarea rows={2} value={f.notes} onChange={(e) => set('notes', e.target.value)} /></Field>

        <div>
          <div className="flex items-center justify-between">
            <span className="label">Receipts & bills</span>
            <Button size="sm" variant="ghost" icon={<Paperclip className="h-3.5 w-3.5" />} onClick={() => fileRef.current?.click()}>Attach</Button>
            <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} />
          </div>
          {f.attachments.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {f.attachments.map((a) => (
                <div key={a.id} className="relative group h-16 w-16 rounded-xl overflow-hidden border border-border bg-surface-2">
                  {a.type.startsWith('image/') ? <img src={a.dataUrl} alt={a.name} className="h-full w-full object-cover" /> : <div className="h-full grid place-items-center text-muted"><FileText className="h-5 w-5" /></div>}
                  <button onClick={() => set('attachments', f.attachments.filter((x) => x.id !== a.id))} className="absolute top-1 right-1 h-5 w-5 grid place-items-center rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100" aria-label="Remove"><X className="h-3 w-3" /></button>
                </div>
              ))}
            </div>
          )}
        </div>

        {kind === 'expense' && !existing && (
          <div className="p-4 rounded-2xl border border-border space-y-3">
            <Switch checked={f.recurring} onChange={(v) => set('recurring', v)} label="Repeat this expense" description="Get reminders before it's due next" />
            {f.recurring && <Select value={f.frequency} onChange={(v) => set('frequency', v)} options={options(frequencyLabel)} />}
          </div>
        )}
        {!existing && (
          <Checkbox checked={f.issueReceipt} onChange={(v) => set('issueReceipt', v)} label={kind === 'expense' ? 'Generate an expense voucher' : 'Generate a receipt after saving'} />
        )}
      </div>
    </Drawer>
  );
}
