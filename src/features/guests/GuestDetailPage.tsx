import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Mail, MessageCircle, Pencil, Phone, Plus, Star, Trash2, MapPin, IdCard, ShieldCheck, EyeOff } from 'lucide-react';
import { Avatar, Badge, Button, Card, CardHeader, EmptyState, Stat, KV } from '@/components/ui';
import { useConfirm } from '@/components/ui/overlay';
import { PaymentBadge, PropertyDot, StatusBadge } from '@/components/domain';
import { useCan, useData, useLedgers, useLookup, useMoney } from '@/data/hooks';
import { useStore } from '@/data/store';
import { openOverlay } from '@/data/ui';
import { fmtDate, fmtRange } from '@/lib/dates';
import { methodLabel, purposeLabel, txnKindLabel } from '@/domain/labels';
import { cn } from '@/lib/cn';

export default function GuestDetailPage() {
  const { id } = useParams();
  const data = useData();
  const money = useMoney({ cents: false });
  const L = useLookup();
  const ledgers = useLedgers();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const deleteGuest = useStore((s) => s.deleteGuest);
  const saveGuest = useStore((s) => s.saveGuest);
  const canEdit = useCan('guests.edit');
  const canPII = useCan('guests.pii');
  const canBook = useCan('bookings.edit');
  const showMoney = useCan('finance.view');
  const g = data.guests.find((x) => x.id === id);
  if (!g) return <EmptyState title="Guest not found" action={<Link to="/guests"><Button>Back</Button></Link>} />;
  const bookings = data.bookings.filter((b) => b.guestId === g.id).sort((a, b) => b.checkIn.localeCompare(a.checkIn));
  const stays = bookings.filter((b) => ['checked_out', 'checked_in'].includes(b.status));
  const paid = bookings.reduce((s, b) => s + ledgers.get(b.id)!.paid, 0);
  const due = bookings.reduce((s, b) => s + Math.max(0, ledgers.get(b.id)!.balance), 0);
  const txns = data.transactions.filter((t) => t.guestId === g.id).sort((a, b) => b.date.localeCompare(a.date));
  const reviews = bookings.filter((b) => b.review);

  async function anonymise() {
    if (!(await confirm({ title: 'Anonymise this guest?', body: 'Name, contact details, ID and notes are erased. Bookings and financial records are kept for your accounts. This cannot be undone.', danger: true, confirmLabel: 'Anonymise' }))) return;
    saveGuest({ ...g!, firstName: 'Anonymised', lastName: 'guest', email: '', phone: '', city: '', idType: '', idNumberMasked: '', preferences: '', notes: '', tags: [], marketingConsent: false, vip: false });
    toast.success('Personal data removed');
  }

  return (
    <div className="space-y-5">
      <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-fg"><ArrowLeft className="h-4 w-4" />Back</button>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Avatar name={`${g.firstName} ${g.lastName}`} size={56} />
          <div>
            <h1 className="text-[24px] font-semibold tracking-tight flex items-center gap-2">{g.firstName} {g.lastName}{g.vip && <Badge tone="accent">VIP</Badge>}</h1>
            <div className="flex flex-wrap gap-1.5 mt-1">{g.tags.map((t) => <Badge key={t}>{t}</Badge>)}<span className="text-[12.5px] text-muted flex items-center gap-1"><MapPin className="h-3 w-3" />{[g.city, g.country].filter(Boolean).join(', ') || '—'}</span></div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {canPII && (g.phone || g.email) && <Button icon={<MessageCircle className="h-4 w-4" />} onClick={() => openOverlay({ kind: 'message', guestId: g.id, bookingId: bookings[0]?.id })}>Message</Button>}
          {canEdit && <Button icon={<Pencil className="h-4 w-4" />} onClick={() => openOverlay({ kind: 'guest', guestId: g.id })}>Edit</Button>}
          {canBook && <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => openOverlay({ kind: 'booking', guestId: g.id })}>New booking</Button>}
        </div>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        <Stat label="Stays" value={String(stays.length)} sub={`${stays.reduce((s, b) => s + b.nights.length, 0)} nights`} />
        {showMoney && <Stat label="Total paid" value={money(paid)} />}
        {showMoney && <Stat label="Outstanding" value={<span className={due ? 'text-warning' : ''}>{money(due)}</span>} />}
        <Stat label="Rating given" value={reviews.length ? <span className="flex items-center gap-1.5">{(reviews.reduce((s, b) => s + b.review!.rating, 0) / reviews.length).toFixed(1)}<Star className="h-5 w-5 fill-s4 text-s4" /></span> : '—'} sub={`${reviews.length} reviews`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5">
        <div className="lg:col-span-2 space-y-4 sm:space-y-5">
          <Card>
            <CardHeader title="Bookings" subtitle={`${bookings.length} total`} />
            {bookings.length === 0 ? <EmptyState title="No bookings yet" /> : (
              <div className="divide-y divide-border border-t border-border">
                {bookings.map((b) => (
                  <Link key={b.id} to={`/bookings/${b.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-surface-2/40">
                    <PropertyDot color={L.property(b.propertyId)?.color ?? 's1'} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[13.5px] font-medium">{fmtRange(b.checkIn, b.checkOut)}</div>
                      <div className="text-[12px] text-muted">{L.unit(b.unitId)?.name} · {b.nights.length} nights · {b.code}</div>
                    </div>
                    <StatusBadge status={b.status} />
                    {showMoney && <span className="num text-[13.5px] w-24 text-right hidden sm:block">{money(ledgers.get(b.id)!.totals.total)}</span>}
                    {showMoney && <span className="hidden sm:block"><PaymentBadge ledger={ledgers.get(b.id)!} /></span>}
                  </Link>
                ))}
              </div>
            )}
          </Card>
          {showMoney && (
            <Card>
              <CardHeader title="Payment history" />
              {txns.length === 0 ? <p className="px-5 pb-5 text-[13px] text-subtle">No payments yet</p> : (
                <div className="divide-y divide-border border-t border-border">
                  {txns.map((t) => {
                    const out = t.kind === 'refund' || t.kind === 'deposit_return';
                    return (
                      <div key={t.id} className="flex items-center gap-3 px-5 py-2.5 text-[13.5px]">
                        <span className="w-20 text-muted text-[12.5px]">{fmtDate(t.date, 'd MMM yy')}</span>
                        <span className="flex-1 min-w-0 truncate">{t.purpose ? purposeLabel[t.purpose] : txnKindLabel[t.kind]} <span className="text-muted">· {methodLabel[t.method]} · {L.booking(t.bookingId)?.code}</span></span>
                        <span className={cn('num font-medium', !out && t.kind === 'payment' && 'text-success')}>{out ? '−' : '+'}{money(t.amount)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          )}
          {reviews.length > 0 && (
            <Card>
              <CardHeader title="Reviews & feedback" />
              <div className="px-5 pb-5 space-y-4">
                {reviews.map((b) => (
                  <div key={b.id}>
                    <div className="flex items-center gap-1">{Array.from({ length: 5 }, (_, i) => <Star key={i} className={cn('h-3.5 w-3.5', i < b.review!.rating ? 'fill-s4 text-s4' : 'text-border-strong')} />)}<span className="ml-2 text-[12px] text-muted">{b.review!.source} · {fmtDate(b.review!.at, 'd MMM yyyy')} · {L.unit(b.unitId)?.name}</span></div>
                    <p className="text-[13.5px] mt-1">“{b.review!.comment}”</p>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        <div className="space-y-4 sm:space-y-5">
          <Card>
            <CardHeader title="Contact" />
            <div className="px-5 pb-5 space-y-2.5 text-[13.5px]">
              {canPII ? (
                <>
                  {g.phone && <a href={`tel:${g.phone}`} className="flex items-center gap-2.5 hover:text-accent"><Phone className="h-4 w-4 text-subtle" />{g.phone}</a>}
                  {g.email && <a href={`mailto:${g.email}`} className="flex items-center gap-2.5 hover:text-accent break-all"><Mail className="h-4 w-4 text-subtle" />{g.email}</a>}
                  {g.idType && <div className="flex items-center gap-2.5"><IdCard className="h-4 w-4 text-subtle" />{g.idType} {g.idNumberMasked}</div>}
                </>
              ) : <div className="flex items-center gap-2 text-[12.5px] text-subtle"><EyeOff className="h-4 w-4" />Contact details are hidden for your role</div>}
              <div className="flex items-center gap-2.5 text-[12.5px] text-muted"><ShieldCheck className="h-4 w-4 text-subtle" />{g.marketingConsent ? 'Opted in to offers' : 'No marketing consent'}</div>
            </div>
          </Card>
          <Card>
            <CardHeader title="Preferences & notes" />
            <div className="px-5 pb-5 space-y-3 text-[13.5px]">
              <div><div className="eyebrow mb-1">Preferences</div><p className="text-muted whitespace-pre-line">{g.preferences || 'None recorded'}</p></div>
              {canPII && <div><div className="eyebrow mb-1">Private notes</div><p className="text-muted whitespace-pre-line">{g.notes || '—'}</p></div>}
              <KV label="Guest since">{fmtDate(g.createdAt.slice(0, 10), 'MMM yyyy')}</KV>
            </div>
          </Card>
          {canEdit && (
            <Card className="p-5 space-y-2">
              <div className="eyebrow">Privacy</div>
              <p className="text-[12.5px] text-muted">Erase personal details on request while keeping your financial records intact.</p>
              <div className="flex gap-2">
                <Button size="sm" onClick={anonymise}>Anonymise</Button>
                {bookings.length === 0 && <Button size="sm" variant="ghost" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={async () => { if (await confirm({ title: 'Delete guest?', danger: true, confirmLabel: 'Delete' })) { const r = deleteGuest(g.id); if (r.ok) navigate('/guests'); else toast.error(r.error); } }}>Delete</Button>}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
