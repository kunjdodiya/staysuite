import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowRight, BedDouble, CalendarCheck, CalendarX, CreditCard, LogIn, LogOut, Receipt, Wallet, Wrench, Sparkles, Plus, TrendingUp, AlertTriangle, IndianRupee, Percent,
} from 'lucide-react';
import { Card, CardHeader, Button, Stat, EmptyState, Avatar, Badge, Select, ProgressBar } from '@/components/ui';
import { IncomeExpenseChart } from '@/components/charts';
import { PaymentBadge, PropertyDot, PriorityBadge, ReadinessBadge, SourceTag, StatusBadge } from '@/components/domain';
import { useCan, useCurrentUser, useData, useLedgers, useLookup, useMoney, useToday, useVisiblePropertyIds } from '@/data/hooks';
import { useStore } from '@/data/store';
import { openOverlay, useUI } from '@/data/ui';
import { addDaysISO, addMonthsISO, endOfMonthISO, fmtDate, relDay, startOfMonthISO } from '@/lib/dates';
import { dailyOccupancy, monthlySeries, outstanding, pctChange, periodSummary } from '@/domain/finance';
import { txnKindLabel, expenseCategoryLabel, methodLabel } from '@/domain/labels';
import { cn } from '@/lib/cn';
import type { Booking } from '@/domain/types';
import { format, parseISO } from 'date-fns';

export default function DashboardPage() {
  const data = useData();
  const today = useToday();
  const money = useMoney({ cents: false });
  const L = useLookup();
  const ledgers = useLedgers();
  const navigate = useNavigate();
  const user = useCurrentUser();
  const showFinance = useCan('dashboard.finance');
  const canBook = useCan('bookings.edit');
  const canFin = useCan('finance.edit');
  const canBookings = useCan('bookings.view');
  const visible = useVisiblePropertyIds();
  const propertyFilter = useUI((s) => s.propertyFilter);
  const setPropertyFilter = useUI((s) => s.setPropertyFilter);
  const setStatus = useStore((s) => s.setBookingStatus);
  const pid = propertyFilter === 'all' ? null : propertyFilter;
  const inScope = (propertyId: string | null) => (!pid || propertyId === pid) && (!visible || !propertyId || visible.has(propertyId));

  const monthFrom = startOfMonthISO(today);
  const monthTo = endOfMonthISO(today);
  const prevFrom = addMonthsISO(monthFrom, -1);
  const prevTo = addDaysISO(prevFrom, Math.min(Number(today.slice(8)) - 1, Number(endOfMonthISO(prevFrom).slice(8)) - 1));

  const fin = useMemo(() => {
    if (!showFinance) return null;
    const mtd = periodSummary(data, { from: monthFrom, to: today, propertyId: pid }, ledgers);
    const month = periodSummary(data, { from: monthFrom, to: monthTo, propertyId: pid }, ledgers);
    const prev = periodSummary(data, { from: prevFrom, to: prevTo, propertyId: pid }, ledgers);
    const out = outstanding(data, today, pid, ledgers);
    const series = monthlySeries(data, today, 6, pid).map((m) => ({ label: format(parseISO(m.from), 'MMM'), full: format(parseISO(m.from), 'MMMM yyyy'), income: m.summary.revenue, expense: m.summary.expenses, profit: m.summary.netProfit }));
    return { mtd, month, prev, out, series };
  }, [data, ledgers, showFinance, monthFrom, monthTo, prevFrom, prevTo, today, pid]);

  const bookings = data.bookings.filter((b) => inScope(b.propertyId));
  const arrivals = bookings.filter((b) => b.checkIn === today && ['confirmed', 'tentative', 'checked_in'].includes(b.status));
  const departures = bookings.filter((b) => b.checkOut === today && ['checked_in', 'checked_out'].includes(b.status));
  const inHouse = bookings.filter((b) => b.status === 'checked_in' && b.checkOut > today);
  const upcoming = bookings.filter((b) => b.checkIn > today && b.checkIn <= addDaysISO(today, 10) && ['confirmed', 'tentative'].includes(b.status)).sort((a, b) => a.checkIn.localeCompare(b.checkIn));
  const units = data.units.filter((u) => !u.archived && inScope(u.propertyId));
  const occ14 = dailyOccupancy({ ...data, units }, today, addDaysISO(today, 13));
  const tasks = data.tasks.filter((t) => t.status !== 'done' && inScope(t.propertyId) && (user.role !== 'cleaner' || t.assigneeId === user.id))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || ['urgent', 'high', 'medium', 'low'].indexOf(a.priority) - ['urgent', 'high', 'medium', 'low'].indexOf(b.priority));
  const recentTxns = data.transactions.filter((t) => inScope(t.propertyId)).slice().sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)).slice(0, 7);
  const tonightOcc = units.length ? inHouse.length + arrivals.filter((a) => a.status !== 'checked_in' || a.checkOut > today).length : 0;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const properties = data.properties.filter((p) => !p.archived && (!visible || visible.has(p.id)));

  async function quickStatus(b: Booking, status: 'checked_in' | 'checked_out') {
    const r = setStatus(b.id, status);
    if (!r.ok) return toast.error(r.error);
    const led = ledgers.get(b.id)!;
    toast.success(`${L.guestName(b.guestId)} ${status === 'checked_in' ? 'checked in' : 'checked out'}`, {
      description: led.balance > 0 ? `${money(led.balance)} still due` : undefined,
      action: led.balance > 0 && canFin ? { label: 'Collect', onClick: () => openOverlay({ kind: 'transaction', txnKind: 'payment', bookingId: b.id }) } : undefined,
    });
  }

  const guestRow = (b: Booking, kind: 'arrive' | 'depart' | 'stay') => {
    const g = L.guest(b.guestId);
    const led = ledgers.get(b.id)!;
    return (
      <div key={b.id} className="flex items-center gap-3 py-2.5 group">
        <Avatar name={g ? `${g.firstName} ${g.lastName}` : '?'} size={36} />
        <Link to={`/bookings/${b.id}`} className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[13.5px] font-medium truncate">{g?.firstName} {g?.lastName}{g?.vip && <Badge tone="accent">VIP</Badge>}</div>
          <div className="text-[12px] text-muted truncate">{L.unit(b.unitId)?.name} · {b.nights.length}n{b.arrivalTime && kind === 'arrive' ? ` · ETA ${b.arrivalTime}` : ''}{led.balance > 0 && showFinance ? ` · ${money(led.balance)} due` : ''}</div>
        </Link>
        {canBook && kind === 'arrive' && b.status !== 'checked_in' && <Button size="sm" onClick={() => quickStatus(b, 'checked_in')}>Check in</Button>}
        {canBook && kind === 'depart' && b.status === 'checked_in' && <Button size="sm" onClick={() => quickStatus(b, 'checked_out')}>Check out</Button>}
        {kind === 'stay' && <span className="text-[12px] text-subtle whitespace-nowrap">until {fmtDate(b.checkOut, 'd MMM')}</span>}
        {((kind === 'arrive' && b.status === 'checked_in') || (kind === 'depart' && b.status === 'checked_out')) && <Badge tone="success">Done</Badge>}
      </div>
    );
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[13px] text-muted">{fmtDate(today, 'EEEE, d MMMM')}</p>
          <h1 className="text-[24px] sm:text-[28px] font-semibold tracking-tight">{greeting}{user.name !== 'You' ? `, ${user.name.split(' ')[0]}` : ''}</h1>
        </div>
        {properties.length > 1 && (
          <Select className="w-full sm:w-56" value={propertyFilter} onChange={(v) => setPropertyFilter(v)} options={[{ value: 'all', label: 'All properties' }, ...properties.map((p) => ({ value: p.id, label: p.name }))]} />
        )}
      </div>

      {data.properties.length === 0 && (
        <Card><EmptyState icon={<Sparkles className="h-5 w-5" />} title="Welcome to StaySuite" body="Add your first property and its rooms or cabins to start taking bookings." action={<Link to="/properties"><Button variant="primary" icon={<Plus className="h-4 w-4" />}>Add a property</Button></Link>} /></Card>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {[
          canBook && { label: 'New booking', icon: <BedDouble />, run: () => openOverlay({ kind: 'booking' }), tone: 'text-s1 bg-s1/10' },
          canFin && { label: 'Record income', icon: <IndianRupee />, run: () => openOverlay({ kind: 'transaction', txnKind: 'payment' }), tone: 'text-s3 bg-s3/10' },
          canFin && { label: 'Add expense', icon: <Wallet />, run: () => openOverlay({ kind: 'transaction', txnKind: 'expense' }), tone: 'text-s2 bg-s2/10' },
          canFin && { label: 'Generate receipt', icon: <Receipt />, run: () => openOverlay({ kind: 'document' }), tone: 'text-s7 bg-s7/10' },
          !canFin && { label: 'Report issue', icon: <Wrench />, run: () => openOverlay({ kind: 'task', type: 'maintenance' }), tone: 'text-s2 bg-s2/10' },
        ].filter(Boolean).map((a) => a && (
          <button key={a.label} onClick={a.run} className="card flex items-center gap-3 p-3 sm:p-3.5 hover:border-border-strong hover:-translate-y-px transition-all text-left active:scale-[.99]">
            <span className={cn('h-9 w-9 rounded-xl grid place-items-center [&>svg]:h-[18px] [&>svg]:w-[18px]', a.tone)}>{a.icon}</span>
            <span className="text-[13.5px] font-medium">{a.label}</span>
          </button>
        ))}
      </div>

      {fin && (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
          <Stat label="Revenue this month" value={money(fin.mtd.revenue)} delta={pctChange(fin.mtd.revenue, fin.prev.revenue)} sub="vs same days last month" icon={<TrendingUp className="h-4 w-4" />} onClick={() => navigate('/finances')} />
          <Stat label="Cash received" value={money(fin.mtd.cashReceived)} delta={pctChange(fin.mtd.cashReceived, fin.prev.cashReceived)} sub="net of refunds" icon={<CreditCard className="h-4 w-4" />} onClick={() => navigate('/finances?tab=transactions')} />
          <Stat label="Net profit (MTD)" value={money(fin.mtd.netProfit)} delta={pctChange(fin.mtd.netProfit, fin.prev.netProfit)} sub={`${money(fin.mtd.expenses, { compact: true })} expenses`} icon={<Wallet className="h-4 w-4" />} onClick={() => navigate('/finances')} />
          <Stat label="Guest balances due" value={money(fin.out.dueNow)} sub={fin.out.overdue ? <span className="text-danger">{money(fin.out.overdue)} overdue</span> : `${money(fin.out.upcoming, { compact: true })} on upcoming stays`} icon={<AlertTriangle className="h-4 w-4" />} onClick={() => navigate('/finances?tab=outstanding')} />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5">
        {/* Today */}
        {canBookings && (
          <Card className="lg:col-span-2">
            <CardHeader title="Today" subtitle={`${arrivals.length} arriving · ${departures.length} departing · ${inHouse.length} in-house`} action={<Link to="/bookings"><Button size="sm" variant="ghost">Calendar <ArrowRight className="h-3.5 w-3.5" /></Button></Link>} />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-x-6 px-5 pb-4">
              <div>
                <div className="flex items-center gap-2 text-[12px] font-semibold text-muted mb-1"><LogIn className="h-3.5 w-3.5 text-success" />ARRIVALS</div>
                {arrivals.length ? <div className="divide-y divide-border">{arrivals.map((b) => guestRow(b, 'arrive'))}</div> : <p className="py-4 text-[13px] text-subtle">No arrivals today</p>}
              </div>
              <div>
                <div className="flex items-center gap-2 text-[12px] font-semibold text-muted mb-1 mt-4 md:mt-0 lg:mt-4 xl:mt-0"><LogOut className="h-3.5 w-3.5 text-warning" />DEPARTURES</div>
                {departures.length ? <div className="divide-y divide-border">{departures.map((b) => guestRow(b, 'depart'))}</div> : <p className="py-4 text-[13px] text-subtle">No departures today</p>}
              </div>
            </div>
            {inHouse.length > 0 && (
              <div className="px-5 pb-4 border-t border-border pt-3">
                <div className="text-[12px] font-semibold text-muted mb-1">IN-HOUSE</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">{inHouse.slice(0, 6).map((b) => guestRow(b, 'stay'))}</div>
              </div>
            )}
          </Card>
        )}

        {/* Occupancy */}
        <Card>
          <CardHeader title="Occupancy" subtitle={`Tonight ${tonightOcc}/${units.length} units`} action={fin ? <Badge tone="accent"><Percent className="h-3 w-3" />{Math.round(fin.month.occupancy * 100)}% this month</Badge> : undefined} />
          <div className="px-5 pb-5">
            <div className="flex items-end gap-[3px] h-24" role="img" aria-label="Occupancy for the next 14 days">
              {occ14.map((d) => {
                const r = d.total ? d.occupied / d.total : 0;
                return (
                  <div key={d.date} className="flex-1 flex flex-col items-center gap-1 group relative" title={`${fmtDate(d.date, 'EEE d MMM')}: ${d.occupied}/${d.total} booked`}>
                    <div className="w-full rounded-[4px] bg-surface-2 relative overflow-hidden" style={{ height: 80 }}>
                      <div className={cn('absolute bottom-0 inset-x-0 rounded-[4px] transition-all', d.date === today ? 'bg-accent' : 'bg-s1/70')} style={{ height: `${Math.max(r * 100, r ? 6 : 0)}%` }} />
                    </div>
                    <span className={cn('text-[9.5px] num', d.date === today ? 'text-fg font-semibold' : 'text-subtle')}>{fmtDate(d.date, 'd')}</span>
                  </div>
                );
              })}
            </div>
            <div className="text-[11.5px] text-subtle mt-1">Next 14 days</div>
            <div className="mt-4 space-y-2">
              {units.slice(0, 6).map((u) => (
                <div key={u.id} className="flex items-center justify-between gap-2 text-[13px]">
                  <span className="flex items-center gap-2 min-w-0"><PropertyDot color={L.property(u.propertyId)?.color ?? 's1'} /><span className="truncate">{u.name}</span></span>
                  <ReadinessBadge value={u.readiness} />
                </div>
              ))}
              {units.length > 6 && <Link to="/properties" className="text-[12.5px] text-accent font-medium">+{units.length - 6} more units</Link>}
            </div>
          </div>
        </Card>
      </div>

      {fin && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5">
          <Card className="lg:col-span-2">
            <CardHeader title="Revenue vs expenses" subtitle="Last 6 months · revenue recognised per night stayed" action={<Link to="/reports"><Button size="sm" variant="ghost">Reports <ArrowRight className="h-3.5 w-3.5" /></Button></Link>} />
            <div className="px-3 sm:px-5 pb-5"><IncomeExpenseChart data={fin.series} labelFormat={(l) => fin.series.find((s) => s.label === l)?.full ?? l} /></div>
          </Card>
          <Card>
            <CardHeader title="This month" subtitle={fmtDate(today, 'MMMM yyyy')} />
            <div className="px-5 pb-5 space-y-3">
              <MiniRow label="Revenue (full month, booked)" value={money(fin.month.revenue)} />
              <MiniRow label="Expenses so far" value={money(fin.mtd.expenses)} />
              <MiniRow label="Avg nightly rate (ADR)" value={money(fin.month.adr)} />
              <MiniRow label="RevPAR" value={money(fin.month.revpar)} />
              <MiniRow label="Deposits held" value={money(fin.out.depositsHeld)} hint="Refundable, not revenue" />
              {fin.out.refundsDue > 0 && <MiniRow label="Refunds owed to guests" value={money(fin.out.refundsDue)} />}
              <div>
                <div className="flex justify-between text-[12.5px] mb-1.5"><span className="text-muted">Occupancy</span><span className="num">{Math.round(fin.month.occupancy * 100)}%</span></div>
                <ProgressBar value={fin.month.occupancy} />
              </div>
            </div>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5">
        {canBookings && (
          <Card className={fin ? '' : 'lg:col-span-2'}>
            <CardHeader title="Upcoming arrivals" subtitle="Next 10 days" />
            <div className="px-5 pb-4">
              {upcoming.length === 0 ? <EmptyState icon={<CalendarCheck className="h-5 w-5" />} title="No upcoming arrivals" className="py-8" /> : (
                <div className="divide-y divide-border">
                  {upcoming.slice(0, 7).map((b) => (
                    <Link key={b.id} to={`/bookings/${b.id}`} className="flex items-center gap-3 py-2.5 hover:opacity-80">
                      <div className="w-11 text-center shrink-0">
                        <div className="text-[10.5px] uppercase text-subtle font-semibold">{fmtDate(b.checkIn, 'EEE')}</div>
                        <div className="text-[17px] font-semibold num leading-tight">{fmtDate(b.checkIn, 'd')}</div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[13.5px] font-medium truncate">{L.guestName(b.guestId)}</div>
                        <div className="text-[12px] text-muted truncate">{L.unit(b.unitId)?.name} · {b.nights.length}n · <SourceTag source={b.source} className="!text-[12px]" /></div>
                      </div>
                      {showFinance ? <PaymentBadge ledger={ledgers.get(b.id)!} /> : <StatusBadge status={b.status} />}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </Card>
        )}

        <Card>
          <CardHeader title="Housekeeping & maintenance" subtitle={`${tasks.filter((t) => t.dueDate <= today).length} due today or overdue`} action={<Link to="/tasks"><Button size="sm" variant="ghost">All <ArrowRight className="h-3.5 w-3.5" /></Button></Link>} />
          <div className="px-5 pb-4">
            {tasks.length === 0 ? <EmptyState icon={<Sparkles className="h-5 w-5" />} title="Nothing pending" className="py-8" /> : (
              <div className="divide-y divide-border">
                {tasks.slice(0, 6).map((t) => (
                  <button key={t.id} onClick={() => openOverlay({ kind: 'task', taskId: t.id })} className="w-full flex items-center gap-3 py-2.5 text-left">
                    <span className={cn('h-8 w-8 rounded-lg grid place-items-center shrink-0 [&>svg]:h-4 [&>svg]:w-4', t.type === 'cleaning' ? 'bg-s1/10 text-s1' : 'bg-s2/10 text-s2')}>{t.type === 'cleaning' ? <Sparkles /> : <Wrench />}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13.5px] font-medium truncate">{t.title}</div>
                      <div className={cn('text-[12px] truncate', t.dueDate < today ? 'text-danger' : 'text-muted')}>{relDay(t.dueDate, today)}{t.dueTime ? ` · ${t.dueTime}` : ''} · {L.staff(t.assigneeId)?.name ?? 'Unassigned'}</div>
                    </div>
                    {t.priority !== 'medium' && <PriorityBadge value={t.priority} />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </Card>

        {fin && (
          <Card>
            <CardHeader title="Recent transactions" action={<Link to="/finances?tab=transactions"><Button size="sm" variant="ghost">All <ArrowRight className="h-3.5 w-3.5" /></Button></Link>} />
            <div className="px-5 pb-4 divide-y divide-border">
              {recentTxns.length === 0 && <EmptyState icon={<CalendarX className="h-5 w-5" />} title="No transactions yet" className="py-8" />}
              {recentTxns.map((t) => {
                const out = t.kind === 'expense' || t.kind === 'refund' || t.kind === 'deposit_return';
                return (
                  <div key={t.id} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="text-[13.5px] font-medium truncate">{t.kind === 'expense' ? (t.vendor || expenseCategoryLabel[t.expenseCategory!]) : t.guestId ? L.guestName(t.guestId) : t.notes || txnKindLabel[t.kind]}</div>
                      <div className="text-[12px] text-muted truncate">{relDay(t.date, today)} · {t.kind === 'expense' ? expenseCategoryLabel[t.expenseCategory!] : txnKindLabel[t.kind]} · {methodLabel[t.method]}</div>
                    </div>
                    <span className={cn('num text-[13.5px] font-medium', out ? 'text-fg' : 'text-success')}>{out ? '−' : '+'}{money(t.amount)}</span>
                  </div>
                );
              })}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

function MiniRow({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[13px] text-muted">{label}{hint && <span className="block text-[11px] text-subtle">{hint}</span>}</span>
      <span className="num text-[14px] font-medium">{value}</span>
    </div>
  );
}
