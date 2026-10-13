import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { AlertCircle, CheckCircle2, Plus, Trash2, UserPlus } from 'lucide-react';
import { Drawer } from '@/components/ui/overlay';
import { Button, Field, Input, MoneyInput, Select, Textarea, Switch, Badge } from '@/components/ui';
import { useStore } from '@/data/store';
import { useData, useMoney, useToday } from '@/data/hooks';
import { openOverlay } from '@/data/ui';
import { addDaysISO, fmtDate, nightsBetween } from '@/lib/dates';
import { bookingCode, uid } from '@/lib/id';
import { toMajor, toMinor, parseAmount } from '@/lib/money';
import { quoteNights, bookingTotals } from '@/domain/pricing';
import { findConflicts, validateStay } from '@/domain/availability';
import { bookingStatusLabel, methodLabel, options, sourceLabel } from '@/domain/labels';
import type { Booking, BookingSource, BookingStatus, ID, ISODate, LineItem, PaymentMethod } from '@/domain/types';
import { cn } from '@/lib/cn';

interface Props { bookingId?: ID; unitId?: ID; checkIn?: ISODate; checkOut?: ISODate; guestId?: ID; onClose: () => void }

export function BookingForm({ bookingId, unitId, checkIn, checkOut, guestId, onClose }: Props) {
  const data = useData();
  const today = useToday();
  const money = useMoney();
  const navigate = useNavigate();
  const saveBooking = useStore((s) => s.saveBooking);
  const addTransaction = useStore((s) => s.addTransaction);
  const existing = bookingId ? data.bookings.find((b) => b.id === bookingId) : undefined;
  const cur = data.business.currency;
  const m = (v: number) => String(toMajor(v, cur));

  const units = data.units.filter((u) => !u.archived || u.id === existing?.unitId);
  const [f, setF] = useState(() => ({
    guestId: existing?.guestId ?? guestId ?? '',
    unitId: existing?.unitId ?? unitId ?? units[0]?.id ?? '',
    checkIn: existing?.checkIn ?? checkIn ?? today,
    checkOut: existing?.checkOut ?? checkOut ?? addDaysISO(checkIn ?? today, 2),
    adults: existing?.adults ?? 2,
    children: existing?.children ?? 0,
    status: existing?.status ?? ('confirmed' as BookingStatus),
    source: existing?.source ?? ('direct' as BookingSource),
    channelRef: existing?.channelRef ?? '',
    arrivalTime: existing?.arrivalTime ?? '',
    customRate: '' as string, // overrides every night if set
    cleaningFee: existing ? m(existing.cleaningFee) : '',
    discount: existing?.discount ? m(existing.discount) : '',
    commission: existing?.commission ? m(existing.commission) : '',
    deposit: existing?.securityDeposit ? m(existing.securityDeposit) : '',
    taxOn: existing ? existing.taxRate > 0 : data.business.tax.enabled,
    extras: existing?.extras.map((e) => ({ ...e, amountStr: m(e.amount) })) ?? ([] as (LineItem & { amountStr: string })[]),
    notes: existing?.notes ?? '',
    advance: '',
    advanceMethod: 'upi' as PaymentMethod,
    advanceRef: '',
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => { setF((s) => ({ ...s, [k]: v })); setErrors((e) => ({ ...e, [k]: '' })); };

  const unit = data.units.find((u) => u.id === f.unitId);
  const property = unit ? data.properties.find((p) => p.id === unit.propertyId) : undefined;
  const stayError = validateStay(f.checkIn, f.checkOut);
  const nightsCount = stayError ? 0 : nightsBetween(f.checkIn, f.checkOut);

  // Cleaning fee defaults to unit's fee when unit changes (unless user typed one)
  const cleaningFee = f.cleaningFee === '' ? unit?.cleaningFee ?? 0 : toMinor(f.cleaningFee, cur);

  const nights = useMemo(() => {
    if (!unit || stayError) return [];
    const keepOriginal = existing && existing.unitId === f.unitId && existing.checkIn === f.checkIn && existing.checkOut === f.checkOut;
    const base = keepOriginal ? existing.nights : quoteNights(unit, data.rateRules, f.checkIn, f.checkOut);
    if (f.customRate && Number(f.customRate) > 0) return base.map((n) => ({ ...n, rate: toMinor(f.customRate, cur), ruleId: null }));
    return base;
  }, [unit, stayError, f.checkIn, f.checkOut, f.customRate, f.unitId, existing, data.rateRules, cur]);

  const draft = {
    nights, cleaningFee, discount: f.discount ? toMinor(f.discount, cur) : 0,
    extras: f.extras.map((e) => ({ id: e.id, label: e.label, kind: e.kind, amount: toMinor(e.amountStr || '0', cur) })),
    taxRate: f.taxOn ? data.business.tax.rate : 0, taxInclusive: data.business.tax.inclusive, status: f.status, cancellationFee: existing?.cancellationFee ?? 0,
  };
  const totals = bookingTotals(draft);
  const conflicts = unit && !stayError && f.status !== 'inquiry' ? findConflicts(data.bookings, unit.id, f.checkIn, f.checkOut, existing?.id) : [];
  const freeUnits = conflicts.length && !stayError
    ? data.units.filter((u) => !u.archived && u.id !== f.unitId && u.capacity >= f.adults + f.children && !findConflicts(data.bookings, u.id, f.checkIn, f.checkOut, existing?.id).length)
    : [];
  const appliedRules = [...new Set(nights.map((n) => n.ruleId).filter(Boolean))].map((id) => data.rateRules.find((r) => r.id === id)?.name).filter(Boolean);

  const guestOptions = data.guests.slice().sort((a, b) => a.firstName.localeCompare(b.firstName)).map((g) => ({ value: g.id, label: `${g.firstName} ${g.lastName}${g.phone ? ` · ${g.phone}` : ''}` }));
  const unitOptions = data.properties.filter((p) => !p.archived).flatMap((p) => units.filter((u) => u.propertyId === p.id).map((u) => ({ value: u.id, label: `${p.name} — ${u.name} (sleeps ${u.capacity})` })));

  function submit() {
    const errs: Record<string, string> = {};
    if (!f.guestId) errs.guestId = 'Choose or add a guest';
    if (!f.unitId) errs.unitId = 'Choose a unit';
    if (stayError) errs.dates = stayError;
    if (unit && f.adults + f.children > unit.capacity) errs.adults = `${unit.name} sleeps up to ${unit.capacity}`;
    if (f.adults < 1) errs.adults = 'At least one adult';
    if (f.extras.some((e) => !e.label.trim())) errs.extras = 'Give every extra a name';
    if (draft.discount > totals.subtotal) errs.discount = 'Discount is larger than the subtotal';
    let advance = 0;
    if (!existing && f.advance) {
      const p = parseAmount(f.advance, cur);
      if ('error' in p) errs.advance = p.error;
      else if (p.value > totals.total) errs.advance = 'Advance exceeds the booking total';
      else advance = p.value;
    }
    if (Object.keys(errs).length) { setErrors(errs); return; }

    setSaving(true);
    const now = new Date().toISOString();
    const b: Booking = {
      ...(existing ?? {
        id: uid('bk'), code: bookingCode(), createdAt: now, checkedInAt: null, checkedOutAt: null, cancelledAt: null, review: null, cancellationFee: 0,
      }),
      propertyId: unit!.propertyId, unitId: f.unitId, guestId: f.guestId, checkIn: f.checkIn, checkOut: f.checkOut, adults: f.adults, children: f.children,
      status: f.status, source: f.source, channelRef: f.channelRef.trim(), nights, cleaningFee, extras: draft.extras, discount: draft.discount,
      commission: f.commission ? toMinor(f.commission, cur) : 0, taxRate: draft.taxRate, taxInclusive: draft.taxInclusive,
      securityDeposit: f.deposit ? toMinor(f.deposit, cur) : 0, notes: f.notes.trim(), arrivalTime: f.arrivalTime, updatedAt: now,
    } as Booking;
    const res = saveBooking(b);
    if (!res.ok) { setSaving(false); setErrors({ form: res.error }); toast.error(res.error); return; }
    if (advance > 0) {
      const t = addTransaction({
        id: uid('txn'), kind: 'payment', date: today, amount: advance, method: f.advanceMethod, propertyId: b.propertyId, bookingId: b.id, guestId: b.guestId,
        purpose: advance === totals.total ? 'full' : 'advance', incomeCategory: null, expenseCategory: null, vendor: '', reference: f.advanceRef, notes: '',
        attachments: [], recurringId: null, taskId: null, createdAt: '', createdBy: '',
      });
      if (!t.ok) toast.error(t.error);
    }
    toast.success(existing ? 'Booking updated' : `Booking ${res.value.code} created`, {
      description: `${data.guests.find((g) => g.id === f.guestId)?.firstName} · ${unit?.name} · ${fmtDate(f.checkIn, 'd MMM')} → ${fmtDate(f.checkOut, 'd MMM')}`,
    });
    onClose();
    if (!existing) navigate(`/bookings/${res.value.id}`);
  }

  return (
    <Drawer
      open
      onClose={onClose}
      width="sm:max-w-[760px]"
      title={existing ? `Edit booking ${existing.code}` : 'New booking'}
      subtitle={existing ? undefined : 'Phone, walk-in, direct or channel reservations'}
      footer={
        <>
          <div className="mr-auto hidden sm:block">
            <div className="text-[12px] text-muted">Total</div>
            <div className="text-lg font-semibold num">{money(totals.total)}</div>
          </div>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={saving} disabled={conflicts.length > 0}>{existing ? 'Save changes' : 'Create booking'}</Button>
        </>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-6">
        <div className="space-y-5">
          {errors.form && <div className="flex gap-2 p-3 rounded-xl bg-danger/10 text-danger text-sm"><AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />{errors.form}</div>}

          <Field label="Guest" required error={errors.guestId}>
            <div className="flex gap-2">
              <Select className="flex-1" value={f.guestId} onChange={(v) => set('guestId', v)} options={guestOptions} placeholder="Select a guest…" invalid={!!errors.guestId} />
              <Button icon={<UserPlus className="h-4 w-4" />} onClick={() => openOverlay({ kind: 'guest', onCreated: (id) => set('guestId', id) })}>New</Button>
            </div>
          </Field>

          <Field label="Unit" required error={errors.unitId}>
            <Select value={f.unitId} onChange={(v) => { set('unitId', v); set('cleaningFee', ''); }} options={unitOptions} placeholder="Select a unit…" />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Check-in" required error={errors.dates}>
              <Input type="date" value={f.checkIn} invalid={!!errors.dates} onChange={(e) => {
                const ci = e.target.value;
                setF((s) => ({ ...s, checkIn: ci, checkOut: s.checkOut <= ci ? addDaysISO(ci, Math.max(1, nightsCount || 1)) : s.checkOut }));
                setErrors((x) => ({ ...x, dates: '' }));
              }} />
            </Field>
            <Field label={`Check-out${nightsCount ? ` · ${nightsCount} night${nightsCount > 1 ? 's' : ''}` : ''}`} required>
              <Input type="date" value={f.checkOut} min={addDaysISO(f.checkIn, 1)} invalid={!!errors.dates} onChange={(e) => set('checkOut', e.target.value)} />
            </Field>
          </div>

          {unit && !stayError && f.status !== 'inquiry' && (
            conflicts.length ? (
              <div className="p-3.5 rounded-xl border border-danger/30 bg-danger/5 animate-fade-in">
                <div className="flex gap-2 text-sm text-danger font-medium"><AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />Not available — overlaps {conflicts.map((c) => `${c.code} (${fmtDate(c.checkIn, 'd MMM')}–${fmtDate(c.checkOut, 'd MMM')})`).join(', ')}</div>
                {freeUnits.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-muted">Free for these dates:</span>
                    {freeUnits.slice(0, 6).map((u) => <button key={u.id} onClick={() => set('unitId', u.id)} className="text-xs px-2 py-1 rounded-lg bg-surface border border-border hover:border-accent">{u.name}</button>)}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-[13px] text-success"><CheckCircle2 className="h-4 w-4" />{unit.name} is available{appliedRules.length ? <span className="text-muted">· {appliedRules.join(', ')} pricing applied</span> : null}</div>
            )
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Adults" error={errors.adults}><Input type="number" min={1} max={30} value={f.adults} onChange={(e) => set('adults', Math.max(0, Number(e.target.value)))} /></Field>
            <Field label="Children"><Input type="number" min={0} max={20} value={f.children} onChange={(e) => set('children', Math.max(0, Number(e.target.value)))} /></Field>
            <Field label="Status"><Select value={f.status} onChange={(v) => set('status', v)} options={options(bookingStatusLabel).filter((o) => !existing ? ['inquiry', 'tentative', 'confirmed', 'checked_in'].includes(o.value) : true)} /></Field>
            <Field label="Arrival time"><Input type="time" value={f.arrivalTime} onChange={(e) => set('arrivalTime', e.target.value)} /></Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Source"><Select value={f.source} onChange={(v) => set('source', v)} options={options(sourceLabel)} /></Field>
            <Field label="Channel ref" hint="OTA confirmation code"><Input value={f.channelRef} onChange={(e) => set('channelRef', e.target.value)} placeholder="Optional" /></Field>
          </div>

          <div className="pt-1">
            <div className="eyebrow mb-3">Pricing</div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Custom nightly rate" hint={unit ? `Leave blank to use ${money(unit.baseRate)}${unit.weekendRate ? ` / ${money(unit.weekendRate)} weekends` : ''} & rate rules` : undefined}>
                <MoneyInput value={f.customRate} onChange={(v) => set('customRate', v)} placeholder="Auto" />
              </Field>
              <Field label="Cleaning fee"><MoneyInput value={f.cleaningFee === '' ? m(unit?.cleaningFee ?? 0) : f.cleaningFee} onChange={(v) => set('cleaningFee', v)} /></Field>
              <Field label="Discount" error={errors.discount}><MoneyInput value={f.discount} onChange={(v) => set('discount', v)} /></Field>
              <Field label="Security deposit" hint="Refundable, not revenue"><MoneyInput value={f.deposit} onChange={(v) => set('deposit', v)} /></Field>
              {['airbnb', 'booking_com', 'expedia', 'agoda'].includes(f.source) && (
                <Field label="Channel commission" hint="Record as an expense when paid"><MoneyInput value={f.commission} onChange={(v) => set('commission', v)} /></Field>
              )}
            </div>
            {data.business.tax.enabled && (
              <div className="mt-4"><Switch checked={f.taxOn} onChange={(v) => set('taxOn', v)} label={`Charge ${data.business.tax.label} (${data.business.tax.rate}%${data.business.tax.inclusive ? ', included in price' : ''})`} /></div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="eyebrow">Extras & services</div>
              <Button size="sm" variant="ghost" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => set('extras', [...f.extras, { id: uid('li'), label: '', amount: 0, kind: 'extra', amountStr: '' }])}>Add extra</Button>
            </div>
            {f.extras.length === 0 && <p className="text-[13px] text-subtle">Breakfast, transfers, late check-out, tours…</p>}
            <div className="space-y-2">
              {f.extras.map((e, i) => (
                <div key={e.id} className="flex gap-2">
                  <Input value={e.label} placeholder="Description" onChange={(ev) => set('extras', f.extras.map((x, j) => (j === i ? { ...x, label: ev.target.value } : x)))} />
                  <MoneyInput className="w-36 shrink-0" value={e.amountStr} onChange={(v) => set('extras', f.extras.map((x, j) => (j === i ? { ...x, amountStr: v } : x)))} />
                  <Button variant="ghost" size="icon" onClick={() => set('extras', f.extras.filter((_, j) => j !== i))} aria-label="Remove"><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
            </div>
            {errors.extras && <p className="text-xs text-danger mt-1">{errors.extras}</p>}
          </div>

          {!existing && f.status !== 'inquiry' && (
            <div className="p-4 rounded-2xl bg-surface-2/60 border border-border">
              <div className="eyebrow mb-3">Advance received (optional)</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <Field error={errors.advance}><MoneyInput value={f.advance} onChange={(v) => set('advance', v)} invalid={!!errors.advance} /></Field>
                <Field><Select value={f.advanceMethod} onChange={(v) => set('advanceMethod', v)} options={options(methodLabel)} /></Field>
                <Field className="col-span-2 sm:col-span-1"><Input value={f.advanceRef} onChange={(e) => set('advanceRef', e.target.value)} placeholder="Ref / UTR" /></Field>
              </div>
              <div className="flex gap-1.5 mt-2.5">
                {[0.25, 0.5, 1].map((p) => (
                  <button key={p} onClick={() => set('advance', String(toMajor(Math.round(totals.total * p), cur)))} className="text-xs px-2 py-1 rounded-lg border border-border bg-surface hover:border-border-strong">{p === 1 ? 'Full' : `${p * 100}%`}</button>
                ))}
              </div>
            </div>
          )}

          <Field label="Internal notes"><Textarea value={f.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Special requests, arrival details…" /></Field>
        </div>

        {/* Live summary */}
        <aside className="lg:sticky lg:top-0 self-start">
          <div className="rounded-2xl border border-border bg-surface-2/50 p-4">
            {property && <div className="text-[12px] text-muted mb-0.5">{property.name}</div>}
            <div className="font-semibold">{unit?.name ?? 'Choose a unit'}</div>
            {!stayError && <div className="text-[13px] text-muted mt-0.5">{fmtDate(f.checkIn, 'EEE d MMM')} → {fmtDate(f.checkOut, 'EEE d MMM')}</div>}
            <div className="my-4 divide" />
            <div className="space-y-1.5 text-[13px]">
              {nights.length > 0 && (
                <details className="group">
                  <summary className="flex justify-between cursor-pointer list-none"><span className="text-muted underline decoration-dotted underline-offset-2">{nights.length} night{nights.length > 1 ? 's' : ''}</span><span className="num">{money(totals.accommodation)}</span></summary>
                  <div className="mt-1.5 mb-2 space-y-1 pl-2 border-l border-border">
                    {nights.map((n) => <div key={n.date} className={cn('flex justify-between text-[12px]', n.ruleId ? 'text-accent' : 'text-subtle')}><span>{fmtDate(n.date, 'EEE d MMM')}</span><span className="num">{money(n.rate)}</span></div>)}
                  </div>
                </details>
              )}
              {cleaningFee > 0 && <Row l="Cleaning" v={money(cleaningFee)} />}
              {totals.extras > 0 && <Row l="Extras" v={money(totals.extras)} />}
              {totals.discount > 0 && <Row l="Discount" v={`−${money(totals.discount)}`} />}
              {totals.tax > 0 && <Row l={`${data.business.tax.label} ${draft.taxRate}%${draft.taxInclusive ? ' (incl.)' : ''}`} v={money(totals.tax)} />}
            </div>
            <div className="my-3 divide" />
            <div className="flex justify-between items-baseline"><span className="text-sm font-medium">Total</span><span className="text-xl font-semibold num">{money(totals.total)}</span></div>
            {draft.taxInclusive || totals.tax > 0 ? <div className="text-[11.5px] text-subtle mt-1 text-right">Revenue excl. tax {money(totals.revenue)}</div> : null}
            {f.deposit && Number(f.deposit) > 0 && <div className="mt-3"><Badge tone="info">+ {money(toMinor(f.deposit, cur))} refundable deposit</Badge></div>}
          </div>
        </aside>
      </div>
    </Drawer>
  );
}

const Row = ({ l, v }: { l: string; v: string }) => <div className="flex justify-between"><span className="text-muted">{l}</span><span className="num">{v}</span></div>;
