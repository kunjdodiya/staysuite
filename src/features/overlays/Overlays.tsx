import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, BedDouble, Building2, CheckCheck, CreditCard, FileText, Search, User, Wallet, Wrench, X, CornerDownLeft, ClipboardCheck, Receipt } from 'lucide-react';
import { useUI, openOverlay, type Overlay } from '@/data/ui';
import { useStore } from '@/data/store';
import { useCan, useCurrentUser, useData, useToday } from '@/data/hooks';
import { alertsForUser, computeAlerts, type Alert } from '@/domain/alerts';
import { Drawer } from '@/components/ui/overlay';
import { Button, EmptyState, Segmented } from '@/components/ui';
import { cn } from '@/lib/cn';
import { fmtDate, relDay } from '@/lib/dates';
import { BookingForm } from '../bookings/BookingForm';
import { TransactionForm } from '../finance/TransactionForm';
import { DocumentViewer, IssueDocument } from '../documents/DocumentViewer';
import { GuestForm, MessageComposer, TaskForm } from './Forms';
import { createPortal } from 'react-dom';

export function Overlays() {
  const stack = useUI((s) => s.stack);
  const close = useUI((s) => s.close);
  return <>{stack.map((o, i) => <OverlayView key={i} o={o} onClose={close} />)}</>;
}

function OverlayView({ o, onClose }: { o: Overlay; onClose: () => void }) {
  switch (o.kind) {
    case 'booking': return <BookingForm {...o} onClose={onClose} />;
    case 'transaction': return <TransactionForm {...o} onClose={onClose} />;
    case 'document': return <IssueDocument {...o} onClose={onClose} />;
    case 'viewDocument': return <DocumentViewer documentId={o.documentId} onClose={onClose} />;
    case 'guest': return <GuestForm {...o} onClose={onClose} />;
    case 'task': return <TaskForm {...o} onClose={onClose} />;
    case 'message': return <MessageComposer {...o} onClose={onClose} />;
    case 'notifications': return <NotificationsPanel onClose={onClose} />;
    case 'command': return <CommandPalette onClose={onClose} />;
  }
}

const alertIcon: Record<Alert['category'], JSX.Element> = {
  arrival: <BedDouble />, departure: <BedDouble />, payment: <CreditCard />, task: <ClipboardCheck />, maintenance: <Wrench />, expense: <Wallet />, document: <FileText />, booking: <BedDouble />,
};
const toneCls = { danger: 'bg-danger/10 text-danger', warning: 'bg-warning/10 text-warning', info: 'bg-info/10 text-info', success: 'bg-success/10 text-success' };

function NotificationsPanel({ onClose }: { onClose: () => void }) {
  const data = useData();
  const today = useToday();
  const navigate = useNavigate();
  const dismiss = useStore((s) => s.dismissAlert);
  const [filter, setFilter] = useState<'all' | 'urgent'>('all');
  const user = useCurrentUser();
  const alerts = useMemo(() => alertsForUser(computeAlerts(data, today), user), [data, today, user]);
  const shown = filter === 'urgent' ? alerts.filter((a) => a.tone === 'danger' || a.tone === 'warning') : alerts;
  return (
    <Drawer open onClose={onClose} title="Notifications" subtitle={`${alerts.length} item${alerts.length === 1 ? '' : 's'} need attention`} width="sm:max-w-md"
      footer={alerts.length ? <Button variant="ghost" icon={<CheckCheck className="h-4 w-4" />} onClick={() => alerts.forEach((a) => dismiss(a.id))}>Clear all</Button> : undefined}>
      <Segmented value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All', count: alerts.length }, { value: 'urgent', label: 'Needs action', count: alerts.filter((a) => a.tone !== 'info').length }]} className="mb-4" />
      {shown.length === 0 ? <EmptyState icon={<Bell className="h-5 w-5" />} title="You're all caught up" body="Arrivals, payments, tasks and reminders will show up here." /> : (
        <div className="space-y-1.5">
          {shown.map((a) => (
            <div key={a.id} className="group flex gap-3 p-3 rounded-2xl hover:bg-surface-2 transition-colors cursor-pointer" onClick={() => { onClose(); navigate(a.href); }}>
              <span className={cn('h-9 w-9 shrink-0 grid place-items-center rounded-xl [&>svg]:h-4 [&>svg]:w-4', toneCls[a.tone])}>{alertIcon[a.category]}</span>
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] font-medium leading-snug">{a.title}</div>
                <div className="text-[12.5px] text-muted truncate">{a.body}</div>
              </div>
              <button className="opacity-60 sm:opacity-0 group-hover:opacity-100 self-start p-1 rounded-md text-subtle hover:text-fg" onClick={(e) => { e.stopPropagation(); dismiss(a.id); }} aria-label="Dismiss"><X className="h-3.5 w-3.5" /></button>
            </div>
          ))}
        </div>
      )}
    </Drawer>
  );
}

interface Cmd { id: string; label: string; hint?: string; icon: JSX.Element; group: string; run: () => void }

function CommandPalette({ onClose }: { onClose: () => void }) {
  const data = useData();
  const today = useToday();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const canBook = useCan('bookings.edit');
  const canFin = useCan('finance.edit');
  const canGuests = useCan('guests.view');
  const canBookings = useCan('bookings.view');
  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => { document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = ''; }; }, []);

  const go = (to: string) => () => { onClose(); navigate(to); };
  const act = (o: Overlay) => () => { onClose(); openOverlay(o); };

  const items = useMemo<Cmd[]>(() => {
    const s = q.trim().toLowerCase();
    const actions: Cmd[] = [
      canBook && { id: 'a-book', label: 'New booking', icon: <BedDouble />, group: 'Actions', run: act({ kind: 'booking' }) },
      canFin && { id: 'a-pay', label: 'Record payment', icon: <CreditCard />, group: 'Actions', run: act({ kind: 'transaction', txnKind: 'payment' }) },
      canFin && { id: 'a-exp', label: 'Add expense', icon: <Wallet />, group: 'Actions', run: act({ kind: 'transaction', txnKind: 'expense' }) },
      canFin && { id: 'a-rcpt', label: 'Generate receipt or invoice', icon: <Receipt />, group: 'Actions', run: act({ kind: 'document' }) },
      { id: 'a-task', label: 'Maintenance request', icon: <Wrench />, group: 'Actions', run: act({ kind: 'task', type: 'maintenance' }) },
      { id: 'p-cal', label: 'Open calendar', icon: <BedDouble />, group: 'Go to', run: go('/bookings') },
      { id: 'p-fin', label: 'Finances', icon: <Wallet />, group: 'Go to', run: go('/finances') },
      { id: 'p-rep', label: 'Reports', icon: <FileText />, group: 'Go to', run: go('/reports') },
      { id: 'p-set', label: 'Settings', icon: <Building2 />, group: 'Go to', run: go('/settings') },
    ].filter(Boolean) as Cmd[];
    if (!s) return actions;
    const out: Cmd[] = actions.filter((a) => a.label.toLowerCase().includes(s));
    if (canGuests) for (const g of data.guests) {
      const hay = `${g.firstName} ${g.lastName} ${g.email} ${g.phone}`.toLowerCase();
      if (hay.includes(s)) out.push({ id: g.id, label: `${g.firstName} ${g.lastName}`, hint: g.phone || g.email, icon: <User />, group: 'Guests', run: go(`/guests/${g.id}`) });
      if (out.length > 40) break;
    }
    if (canBookings) {
      const gname = new Map(data.guests.map((g) => [g.id, `${g.firstName} ${g.lastName}`]));
      for (const b of data.bookings.slice().sort((a, c) => c.checkIn.localeCompare(a.checkIn))) {
        const hay = `${b.code} ${b.channelRef} ${gname.get(b.guestId)}`.toLowerCase();
        if (hay.includes(s)) out.push({ id: b.id, label: `${gname.get(b.guestId)} · ${b.code}`, hint: `${relDay(b.checkIn, today)} → ${fmtDate(b.checkOut, 'd MMM')}`, icon: <BedDouble />, group: 'Bookings', run: go(`/bookings/${b.id}`) });
        if (out.length > 60) break;
      }
    }
    for (const p of data.properties) if (p.name.toLowerCase().includes(s)) out.push({ id: p.id, label: p.name, hint: p.city, icon: <Building2 />, group: 'Properties', run: go(`/properties/${p.id}`) });
    for (const d of data.documents) if (d.number.toLowerCase().includes(s)) out.push({ id: d.id, label: d.number, hint: d.snapshot.billTo.name, icon: <FileText />, group: 'Documents', run: act({ kind: 'viewDocument', documentId: d.id }) });
    return out.slice(0, 50);
  }, [q, data, today, canBook, canFin, canGuests, canBookings]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => setIdx(0), [q]);
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(items.length - 1, i + 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); }
    if (e.key === 'Enter') { e.preventDefault(); items[idx]?.run(); }
    if (e.key === 'Escape') onClose();
  };
  let lastGroup = '';
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-start justify-center p-3 sm:pt-[12vh]">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px] animate-fade-in" onClick={onClose} />
      <div className="relative w-full max-w-xl bg-surface rounded-2xl shadow-pop border border-border overflow-hidden animate-rise-in">
        <div className="flex items-center gap-3 px-4 h-14 border-b border-border">
          <Search className="h-4 w-4 text-subtle" />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} placeholder="Search guests, booking codes, invoice numbers…" className="flex-1 bg-transparent outline-none text-[15px] placeholder:text-subtle" />
          <kbd className="text-[11px] px-1.5 py-0.5 rounded-md bg-surface-2 border border-border text-subtle">esc</kbd>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-2">
          {items.length === 0 && <div className="py-10 text-center text-sm text-muted">No results for “{q}”</div>}
          {items.map((it, i) => {
            const header = it.group !== lastGroup ? it.group : null;
            lastGroup = it.group;
            return (
              <div key={it.id + i}>
                {header && <div className="px-2.5 pt-2.5 pb-1 eyebrow">{header}</div>}
                <button onMouseEnter={() => setIdx(i)} onClick={it.run} className={cn('w-full flex items-center gap-3 h-11 px-2.5 rounded-xl text-left [&>svg]:h-4 [&>svg]:w-4 [&>svg]:text-muted', i === idx && 'bg-surface-2')}>
                  {it.icon}
                  <span className="flex-1 min-w-0 truncate text-[14px]">{it.label}</span>
                  {it.hint && <span className="text-[12px] text-subtle truncate max-w-[40%]">{it.hint}</span>}
                  {i === idx && <CornerDownLeft className="h-3.5 w-3.5 text-subtle" />}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}
