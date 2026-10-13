import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeft, LogIn, LogOut, MoreHorizontal, Pencil, Ban, UserX, RotateCcw, Trash2, CreditCard, Undo2, ShieldCheck, FileText, MessageCircle,
  Receipt, Phone, Mail, Star, Sparkles, CalendarDays, Users, Clock, Plus,
} from 'lucide-react';
import { Button, Card, CardHeader, KV, EmptyState, Avatar, Field, MoneyInput, Textarea, Select } from '@/components/ui';
import { Menu, Modal, useConfirm } from '@/components/ui/overlay';
import { PaymentBadge, PropertyDot, SourceTag, StatusBadge, TaskStatusBadge } from '@/components/domain';
import { useCan, useData, useLedgers, useLookup, useMoney, useToday } from '@/data/hooks';
import { useStore } from '@/data/store';
import { openOverlay } from '@/data/ui';
import { fmtDate, relDay } from '@/lib/dates';
import { parseAmount, toMajor } from '@/lib/money';
import { docKindLabel, methodLabel, purposeLabel, txnKindLabel } from '@/domain/labels';
import { kindForTxn } from '@/domain/documents';
import { cn } from '@/lib/cn';

export default function BookingDetailPage() {
  const { id } = useParams();
  const data = useData();
  const today = useToday();
  const money = useMoney();
  const L = useLookup();
  const ledgers = useLedgers();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const setStatus = useStore((s) => s.setBookingStatus);
  const deleteBooking = useStore((s) => s.deleteBooking);
  const saveBooking = useStore((s) => s.saveBooking);
  const issueDocument = useStore((s) => s.issueDocument);
  const canEdit = useCan('bookings.edit');
  const canFin = useCan('finance.edit');
  const showMoney = useCan('finance.view');
  const canDocs = useCan('documents.issue');
  const canPII = useCan('guests.pii');
  const [cancelOpen, setCancelOpen] = useState<null | 'cancelled' | 'no_show'>(null);
  const [reviewOpen, setReviewOpen] = useState(false);

  const b = data.bookings.find((x) => x.id === id);
  if (!b) return <EmptyState title="Booking not found" action={<Link to="/bookings"><Button>Back to bookings</Button></Link>} />;
  const led = ledgers.get(b.id)!;
  const guest = L.guest(b.guestId);
  const unit = L.unit(b.unitId);
  const property = L.property(b.propertyId);
  const txns = data.transactions.filter((t) => t.bookingId === b.id).sort((a, c) => a.date.localeCompare(c.date) || a.createdAt.localeCompare(c.createdAt));
  const docs = data.documents.filter((d) => d.bookingId === b.id);
  const tasks = data.tasks.filter((t) => t.bookingId === b.id);
  const isActive = !['cancelled', 'no_show'].includes(b.status);
  const t = led.totals;

  const doStatus = (status: typeof b.status, msg: string, fee?: number) => {
    const r = setStatus(b.id, status, { cancellationFee: fee });
    if (!r.ok) return toast.error(r.error);
    toast.success(msg, {
      description: status === 'checked_out' && led.balance > 0 ? `${money(led.balance)} still due` : status === 'checked_out' ? 'Turnover clean is on the task list' : undefined,
    });
  };

  const primary = (() => {
    if (!canEdit) return null;
    if (b.status === 'inquiry' || b.status === 'tentative') return <Button variant="primary" icon={<ShieldCheck className="h-4 w-4" />} onClick={() => doStatus('confirmed', 'Booking confirmed')}>Confirm</Button>;
    if (b.status === 'confirmed') return <Button variant="primary" icon={<LogIn className="h-4 w-4" />} onClick={() => doStatus('checked_in', `${guest?.firstName} checked in`)}>Check in</Button>;
    if (b.status === 'checked_in') return <Button variant="primary" icon={<LogOut className="h-4 w-4" />} onClick={async () => {
      if (led.balance > 0 && !(await confirm({ title: 'Balance still due', body: `${money(led.balance)} hasn't been paid. Check out anyway?`, confirmLabel: 'Check out' }))) return;
      if (led.depositHeld > 0) toast.info(`Remember to return the ${money(led.depositHeld)} security deposit`);
      doStatus('checked_out', `${guest?.firstName} checked out`);
    }}>Check out</Button>;
    if (!isActive) return <Button icon={<RotateCcw className="h-4 w-4" />} onClick={() => doStatus('confirmed', 'Booking restored')}>Restore</Button>;
    return null;
  })();

  return (
    <div className="space-y-5">
      <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-fg"><ArrowLeft className="h-4 w-4" />Back</button>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <Avatar name={guest ? `${guest.firstName} ${guest.lastName}` : '?'} size={52} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[22px] sm:text-[26px] font-semibold tracking-tight truncate">{guest?.firstName} {guest?.lastName}</h1>
              <StatusBadge status={b.status} />
              {showMoney && <PaymentBadge ledger={led} />}
            </div>
            <p className="text-[13.5px] text-muted mt-0.5 flex flex-wrap items-center gap-x-2">
              <span className="font-medium text-fg">{b.code}</span>·<span className="flex items-center gap-1.5"><PropertyDot color={property?.color ?? 's1'} />{property?.name} — {unit?.name}</span>·<SourceTag source={b.source} />
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canPII && guest && <Button icon={<MessageCircle className="h-4 w-4" />} onClick={() => openOverlay({ kind: 'message', bookingId: b.id })}>Message</Button>}
          {primary}
          <Menu
            trigger={({ onClick }) => <Button size="icon" onClick={onClick} aria-label="More actions"><MoreHorizontal className="h-4 w-4" /></Button>}
            items={[
              { label: 'Edit booking', icon: <Pencil />, onClick: () => openOverlay({ kind: 'booking', bookingId: b.id }), hidden: !canEdit },
              { label: 'Record payment', icon: <CreditCard />, onClick: () => openOverlay({ kind: 'transaction', txnKind: 'payment', bookingId: b.id }), hidden: !canFin },
              { label: 'Issue refund', icon: <Undo2 />, onClick: () => openOverlay({ kind: 'transaction', txnKind: 'refund', bookingId: b.id }), hidden: !canFin || led.paid <= 0 },
              { label: 'Collect deposit', icon: <ShieldCheck />, onClick: () => openOverlay({ kind: 'transaction', txnKind: 'deposit', bookingId: b.id }), hidden: !canFin },
              { label: 'Return deposit', icon: <ShieldCheck />, onClick: () => openOverlay({ kind: 'transaction', txnKind: 'deposit_return', bookingId: b.id }), hidden: !canFin || led.depositHeld <= 0 },
              { label: 'Create invoice', icon: <FileText />, onClick: () => { const r = issueDocument('invoice', { bookingId: b.id }); if (r.ok) openOverlay({ kind: 'viewDocument', documentId: r.value.id }); else toast.error(r.error); }, hidden: !canDocs || b.status === 'inquiry' },
              { label: 'Log guest review', icon: <Star />, onClick: () => setReviewOpen(true), hidden: !canEdit },
              'divider',
              { label: 'Mark no-show', icon: <UserX />, onClick: () => setCancelOpen('no_show'), hidden: !canEdit || !['confirmed', 'tentative'].includes(b.status) || b.checkIn > today },
              { label: 'Cancel booking', icon: <Ban />, danger: true, onClick: () => setCancelOpen('cancelled'), hidden: !canEdit || !isActive || b.status === 'checked_out' },
              { label: 'Delete booking', icon: <Trash2 />, danger: true, hidden: !canEdit, onClick: async () => {
                if (!(await confirm({ title: 'Delete this booking?', body: 'This permanently removes it. Bookings with payments can only be cancelled.', confirmLabel: 'Delete', danger: true }))) return;
                const r = deleteBooking(b.id);
                if (!r.ok) toast.error(r.error); else { toast.success('Booking deleted'); navigate('/bookings'); }
              } },
            ]}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5">
        <div className="lg:col-span-2 space-y-4 sm:space-y-5">
          {/* Stay */}
          <Card className="p-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Info icon={<CalendarDays />} label="Check-in" value={fmtDate(b.checkIn, 'EEE d MMM')} sub={`${relDay(b.checkIn, today)} · from ${property?.checkInTime}`} />
              <Info icon={<CalendarDays />} label="Check-out" value={fmtDate(b.checkOut, 'EEE d MMM')} sub={`by ${property?.checkOutTime}`} />
              <Info icon={<Clock />} label="Nights" value={String(b.nights.length)} sub={b.arrivalTime ? `ETA ${b.arrivalTime}` : 'ETA not set'} />
              <Info icon={<Users />} label="Guests" value={`${b.adults + b.children}`} sub={`${b.adults} adult${b.adults > 1 ? 's' : ''}${b.children ? `, ${b.children} child` : ''}`} />
            </div>
            {b.notes && <div className="mt-4 p-3 rounded-xl bg-surface-2/60 text-[13px] whitespace-pre-line">{b.notes}</div>}
            {b.channelRef && <div className="mt-3 text-[12.5px] text-muted">Channel reference: <span className="text-fg font-medium">{b.channelRef}</span></div>}
          </Card>

          {/* Charges & payments */}
          {showMoney && (
            <Card>
              <CardHeader title="Payments" subtitle="Every payment, refund and deposit on this booking"
                action={canFin && isActive ? <Button size="sm" variant="primary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => openOverlay({ kind: 'transaction', txnKind: 'payment', bookingId: b.id })}>Record payment</Button> : canFin && led.balance < 0 ? <Button size="sm" onClick={() => openOverlay({ kind: 'transaction', txnKind: 'refund', bookingId: b.id })}>Refund {money(-led.balance)}</Button> : undefined} />
              <div className="px-5 pb-2">
                <div className="grid grid-cols-3 gap-3 p-4 rounded-2xl bg-surface-2/60 border border-border">
                  <Money label="Total" value={money(t.total)} />
                  <Money label="Paid" value={money(led.paid)} tone="text-success" />
                  <Money label={led.balance < 0 ? 'Refund due' : 'Balance'} value={money(Math.abs(led.balance))} tone={led.balance > 0 ? 'text-warning' : led.balance < 0 ? 'text-info' : ''} />
                </div>
                {led.balance > 0 && t.total > 0 && <div className="mt-3 h-1.5 rounded-full bg-surface-3 overflow-hidden"><div className="h-full bg-success rounded-full" style={{ width: `${Math.min(100, (led.paid / t.total) * 100)}%` }} /></div>}
              </div>
              <div className="px-5 pb-4">
                {txns.length === 0 ? <p className="py-6 text-center text-[13px] text-subtle">No payments recorded yet</p> : (
                  <div className="divide-y divide-border">
                    {txns.map((x) => {
                      const out = x.kind === 'refund' || x.kind === 'deposit_return';
                      const doc = data.documents.find((d) => d.transactionId === x.id && !d.void);
                      return (
                        <div key={x.id} className="flex items-center gap-3 py-3">
                          <span className={cn('h-8 w-8 rounded-lg grid place-items-center shrink-0 [&>svg]:h-4 [&>svg]:w-4', out ? 'bg-s2/10 text-s2' : x.kind.startsWith('deposit') ? 'bg-info/10 text-info' : 'bg-success/10 text-success')}>{out ? <Undo2 /> : x.kind === 'deposit' ? <ShieldCheck /> : <CreditCard />}</span>
                          <div className="min-w-0 flex-1">
                            <div className="text-[13.5px] font-medium">{x.purpose ? purposeLabel[x.purpose] : txnKindLabel[x.kind]}</div>
                            <div className="text-[12px] text-muted truncate">{fmtDate(x.date, 'd MMM yyyy')} · {methodLabel[x.method]}{x.reference ? ` · ${x.reference}` : ''}</div>
                          </div>
                          <span className={cn('num text-[14px] font-medium', out ? '' : x.kind === 'payment' ? 'text-success' : '')}>{out ? '−' : '+'}{money(x.amount)}</span>
                          {canDocs && (doc
                            ? <Button size="icon-sm" variant="ghost" title={`View ${doc.number}`} onClick={() => openOverlay({ kind: 'viewDocument', documentId: doc.id })}><FileText className="h-4 w-4 text-accent" /></Button>
                            : <Button size="icon-sm" variant="ghost" title="Generate receipt" onClick={() => { const r = issueDocument(kindForTxn(x), { transactionId: x.id }); if (r.ok) openOverlay({ kind: 'viewDocument', documentId: r.value.id }); else toast.error(r.error); }}><Receipt className="h-4 w-4" /></Button>)}
                          {canFin && <Button size="icon-sm" variant="ghost" title="Edit" onClick={() => openOverlay({ kind: 'transaction', txnKind: x.kind, transactionId: x.id })}><Pencil className="h-3.5 w-3.5" /></Button>}
                        </div>
                      );
                    })}
                  </div>
                )}
                {led.depositHeld > 0 && <div className="mt-2 flex items-center justify-between p-3 rounded-xl bg-info/5 border border-info/20 text-[13px]"><span className="text-info font-medium">Security deposit held</span><span className="num">{money(led.depositHeld)}</span></div>}
              </div>
            </Card>
          )}

          {/* Tasks */}
          <Card>
            <CardHeader title="Housekeeping" action={<Button size="sm" variant="ghost" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => openOverlay({ kind: 'task', propertyId: b.propertyId, unitId: b.unitId, type: 'cleaning' })}>Task</Button>} />
            <div className="px-5 pb-4">
              {tasks.length === 0 ? <p className="text-[13px] text-subtle pb-2">A turnover clean is scheduled automatically ahead of check-out.</p> : tasks.map((k) => (
                <button key={k.id} onClick={() => openOverlay({ kind: 'task', taskId: k.id })} className="w-full flex items-center gap-3 py-2.5 border-b border-border last:border-0 text-left">
                  <Sparkles className="h-4 w-4 text-s1" />
                  <span className="flex-1 min-w-0"><span className="block text-[13.5px] font-medium truncate">{k.title}</span><span className="block text-[12px] text-muted">{relDay(k.dueDate, today)} · {L.staff(k.assigneeId)?.name ?? 'Unassigned'} · {k.checklist.filter((c) => c.done).length}/{k.checklist.length}</span></span>
                  <TaskStatusBadge value={k.status} />
                </button>
              ))}
            </div>
          </Card>
        </div>

        <div className="space-y-4 sm:space-y-5">
          {showMoney && (
            <Card>
              <CardHeader title="Charges" />
              <div className="px-5 pb-5">
                {isActive ? (
                  <>
                    <KV label={`${b.nights.length} nights accommodation`}>{money(t.accommodation)}</KV>
                    {b.cleaningFee > 0 && <KV label="Cleaning fee">{money(b.cleaningFee)}</KV>}
                    {b.extras.map((e) => <KV key={e.id} label={e.label}>{money(e.amount)}</KV>)}
                    {t.discount > 0 && <KV label="Discount">−{money(t.discount)}</KV>}
                    {t.tax > 0 && <KV label={`${data.business.tax.label} ${b.taxRate}%${b.taxInclusive ? ' (incl.)' : ''}`}>{money(t.tax)}</KV>}
                    <div className="my-2 divide" />
                    <KV label={<span className="font-medium text-fg">Total</span>}><span className="font-semibold">{money(t.total)}</span></KV>
                    <KV label="Revenue (excl. tax)">{money(t.revenue)}</KV>
                    {b.commission > 0 && <KV label="Channel commission">{money(b.commission)}</KV>}
                    {b.securityDeposit > 0 && <KV label="Security deposit (refundable)">{money(b.securityDeposit)}</KV>}
                  </>
                ) : (
                  <>
                    <KV label={b.status === 'no_show' ? 'No-show charge' : 'Cancellation charge'}>{money(b.cancellationFee)}</KV>
                    <p className="text-[12px] text-subtle mt-2">Cancelled {b.cancelledAt ? fmtDate(b.cancelledAt.slice(0, 10)) : ''}. Original value {money(t.subtotal)}.</p>
                  </>
                )}
              </div>
            </Card>
          )}

          {guest && (
            <Card>
              <CardHeader title="Guest" action={<Link to={`/guests/${guest.id}`}><Button size="sm" variant="ghost">Profile</Button></Link>} />
              <div className="px-5 pb-5 space-y-2.5 text-[13.5px]">
                {canPII ? (
                  <>
                    {guest.phone && <a href={`tel:${guest.phone}`} className="flex items-center gap-2.5 hover:text-accent"><Phone className="h-4 w-4 text-subtle" />{guest.phone}</a>}
                    {guest.email && <a href={`mailto:${guest.email}`} className="flex items-center gap-2.5 hover:text-accent truncate"><Mail className="h-4 w-4 text-subtle" />{guest.email}</a>}
                  </>
                ) : <p className="text-[12.5px] text-subtle">Contact details are hidden for your role.</p>}
                {guest.preferences && <div className="p-3 rounded-xl bg-warning/5 border border-warning/20 text-[13px]"><span className="font-medium">Preferences: </span>{guest.preferences}</div>}
                <div className="text-[12.5px] text-muted">{data.bookings.filter((x) => x.guestId === guest.id && x.status === 'checked_out').length} previous stays</div>
              </div>
            </Card>
          )}

          {canDocs && (
            <Card>
              <CardHeader title="Documents" action={b.status !== 'inquiry' ? <Button size="sm" variant="ghost" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => { const r = issueDocument('invoice', { bookingId: b.id }); if (r.ok) openOverlay({ kind: 'viewDocument', documentId: r.value.id }); else toast.error(r.error); }}>Invoice</Button> : undefined} />
              <div className="px-5 pb-4">
                {docs.length === 0 ? <p className="text-[13px] text-subtle pb-2">No invoices or receipts yet.</p> : docs.map((d) => (
                  <button key={d.id} onClick={() => openOverlay({ kind: 'viewDocument', documentId: d.id })} className="w-full flex items-center gap-3 py-2 text-left">
                    <FileText className="h-4 w-4 text-subtle" />
                    <span className="flex-1 min-w-0"><span className={cn('block text-[13.5px] font-medium', d.void && 'line-through text-subtle')}>{d.number}</span><span className="block text-[12px] text-muted">{docKindLabel[d.kind]} · {fmtDate(d.issueDate, 'd MMM')}</span></span>
                    <span className="num text-[13px]">{money(d.snapshot.payment?.amount ?? d.snapshot.total)}</span>
                  </button>
                ))}
              </div>
            </Card>
          )}

          {b.review && (
            <Card className="p-5">
              <div className="flex items-center gap-1 mb-2">{Array.from({ length: 5 }, (_, i) => <Star key={i} className={cn('h-4 w-4', i < b.review!.rating ? 'fill-s4 text-s4' : 'text-border-strong')} />)}<span className="ml-2 text-[12px] text-muted">{b.review.source} · {fmtDate(b.review.at, 'd MMM')}</span></div>
              <p className="text-[13.5px]">“{b.review.comment}”</p>
            </Card>
          )}
        </div>
      </div>

      <CancelModal open={cancelOpen} onClose={() => setCancelOpen(null)} paid={led.paid} defaultFee={0} onConfirm={(fee) => {
        doStatus(cancelOpen!, cancelOpen === 'no_show' ? 'Marked as no-show' : 'Booking cancelled', fee);
        setCancelOpen(null);
        if (led.paid > fee && canFin) setTimeout(() => toast.info(`Refund due: ${money(led.paid - fee)}`, { action: { label: 'Refund now', onClick: () => openOverlay({ kind: 'transaction', txnKind: 'refund', bookingId: b.id }) } }), 300);
      }} />
      <ReviewModal open={reviewOpen} onClose={() => setReviewOpen(false)} initial={b.review} onSave={(review) => { const r = saveBooking({ ...b, review }); if (r.ok) toast.success('Review saved'); else toast.error(r.error); setReviewOpen(false); }} />
    </div>
  );
}

function Info({ icon, label, value, sub }: { icon: JSX.Element; label: string; value: string; sub?: string }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[12px] text-muted [&>svg]:h-3.5 [&>svg]:w-3.5">{icon}{label}</div>
      <div className="text-[16px] font-semibold mt-1">{value}</div>
      {sub && <div className="text-[12px] text-subtle">{sub}</div>}
    </div>
  );
}
function Money({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return <div className="text-center"><div className="text-[11.5px] text-muted">{label}</div><div className={cn('text-[17px] font-semibold num', tone)}>{value}</div></div>;
}

function CancelModal({ open, onClose, onConfirm, paid }: { open: null | 'cancelled' | 'no_show'; onClose: () => void; onConfirm: (fee: number) => void; paid: number; defaultFee: number }) {
  const money = useMoney();
  const cur = useStore((s) => s.data.business.currency);
  const [fee, setFee] = useState('');
  const [err, setErr] = useState('');
  if (!open) return null;
  return (
    <Modal open onClose={onClose} title={open === 'no_show' ? 'Mark as no-show' : 'Cancel booking'} size="sm"
      footer={<><Button onClick={onClose}>Keep booking</Button><Button variant="danger" onClick={() => {
        if (!fee) return onConfirm(0);
        const p = parseAmount(fee, cur, { allowZero: true });
        if ('error' in p) return setErr(p.error);
        onConfirm(p.value);
      }}>{open === 'no_show' ? 'Mark no-show' : 'Cancel booking'}</Button></>}>
      <div className="space-y-4">
        <p className="text-[13.5px] text-muted">The dates will be released on the calendar. {paid > 0 && <>The guest has paid <span className="text-fg font-medium">{money(paid)}</span>.</>}</p>
        <Field label="Charge retained" hint="Kept as revenue — anything above this that was paid becomes a refund due" error={err}>
          <MoneyInput value={fee} onChange={(v) => { setFee(v); setErr(''); }} />
        </Field>
        {paid > 0 && <div className="flex gap-1.5">{[0, 0.5, 1].map((p) => <button key={p} onClick={() => setFee(String(toMajor(Math.round(paid * p), cur)))} className="text-xs px-2 py-1 rounded-lg border border-border hover:border-border-strong">{p === 0 ? 'Full refund' : p === 1 ? 'Keep all' : 'Keep 50%'}</button>)}</div>}
      </div>
    </Modal>
  );
}

function ReviewModal({ open, onClose, onSave, initial }: { open: boolean; onClose: () => void; onSave: (r: { rating: number; comment: string; source: string; at: string }) => void; initial: { rating: number; comment: string; source: string } | null }) {
  const today = useToday();
  const [rating, setRating] = useState(initial?.rating ?? 5);
  const [comment, setComment] = useState(initial?.comment ?? '');
  const [source, setSource] = useState(initial?.source ?? 'Direct');
  return (
    <Modal open={open} onClose={onClose} title="Guest review" size="sm" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => onSave({ rating, comment: comment.trim(), source, at: today })}>Save review</Button></>}>
      <div className="space-y-4">
        <div className="flex gap-1">{Array.from({ length: 5 }, (_, i) => <button key={i} onClick={() => setRating(i + 1)} aria-label={`${i + 1} stars`}><Star className={cn('h-7 w-7 transition-colors', i < rating ? 'fill-s4 text-s4' : 'text-border-strong')} /></button>)}</div>
        <Field label="Source"><Select value={source} onChange={setSource} options={['Direct', 'Airbnb', 'Booking.com', 'Google', 'TripAdvisor', 'Other'].map((v) => ({ value: v, label: v }))} /></Field>
        <Field label="Comment"><Textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
