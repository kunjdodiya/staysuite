import { useMemo, useRef, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, LogIn, LogOut, BedDouble } from 'lucide-react';
import { Button, Segmented, Select, Card, EmptyState, Badge } from '@/components/ui';
import { PropertyDot, ReadinessBadge, StatusBadge } from '@/components/domain';
import { useCan, useData, useLedgers, useLookup, useMoney, useToday, useVisiblePropertyIds } from '@/data/hooks';
import { openOverlay } from '@/data/ui';
import { addDaysISO, addMonthsISO, eachDay, endOfMonthISO, fmtDate, nightsBetween, startOfMonthISO } from '@/lib/dates';
import { findConflicts } from '@/domain/availability';
import { cn } from '@/lib/cn';
import type { Booking, ISODate } from '@/domain/types';
import { parseISO, startOfWeek, format } from 'date-fns';
import { toast } from 'sonner';

type View = 'month' | 'week' | 'day';

const barStyle: Record<Booking['status'], string> = {
  inquiry: 'bg-surface-2 text-muted border border-dashed border-border-strong',
  tentative: 'bg-warning/15 text-warning border border-warning/40 [background-image:repeating-linear-gradient(135deg,transparent,transparent_6px,rgb(var(--warning)/0.12)_6px,rgb(var(--warning)/0.12)_12px)]',
  confirmed: 'bg-s1 text-white',
  checked_in: 'bg-accent text-accent-fg',
  checked_out: 'bg-surface-3 text-muted',
  cancelled: 'hidden',
  no_show: 'hidden',
};

export function CalendarView() {
  const data = useData();
  const today = useToday();
  const L = useLookup();
  const money = useMoney();
  const ledgers = useLedgers();
  const navigate = useNavigate();
  const canEdit = useCan('bookings.edit');
  const visible = useVisiblePropertyIds();
  const [view, setView] = useState<View>(() => (typeof window !== 'undefined' && window.innerWidth < 640 ? 'week' : 'month'));
  const [anchor, setAnchor] = useState<ISODate>(today);
  const [pid, setPid] = useState<string>('all');
  const scroller = useRef<HTMLDivElement>(null);

  const weekStart = data.business.weekStartsOn;
  const range = useMemo(() => {
    if (view === 'month') { const from = startOfMonthISO(anchor); return { from, to: endOfMonthISO(from) }; }
    if (view === 'week') { const from = format(startOfWeek(parseISO(anchor), { weekStartsOn: weekStart }), 'yyyy-MM-dd'); return { from, to: addDaysISO(from, 13) }; }
    return { from: anchor, to: anchor };
  }, [view, anchor, weekStart]);
  const days = eachDay(range.from, range.to);
  const compact = typeof window !== 'undefined' && window.innerWidth < 640;
  const colW = view === 'month' ? (compact ? 40 : 46) : compact ? 64 : 92;
  const labelW = compact ? 116 : 168;

  const properties = data.properties.filter((p) => !p.archived && (!visible || visible.has(p.id)) && (pid === 'all' || p.id === pid));
  const groups = properties.map((p) => ({ property: p, units: data.units.filter((u) => u.propertyId === p.id && !u.archived) })).filter((g) => g.units.length);
  const byUnit = useMemo(() => {
    const m = new Map<string, Booking[]>();
    for (const b of data.bookings) {
      if (b.status === 'cancelled' || b.status === 'no_show') continue;
      if (b.checkOut <= range.from || b.checkIn > range.to) continue;
      (m.get(b.unitId) ?? m.set(b.unitId, []).get(b.unitId)!).push(b);
    }
    return m;
  }, [data.bookings, range]);

  // Scroll today into view
  useEffect(() => {
    const i = days.indexOf(today);
    if (i > 3 && scroller.current) scroller.current.scrollLeft = (i - 3) * colW;
  }, [range.from, view]); // eslint-disable-line react-hooks/exhaustive-deps

  // Drag-to-select a date range on a unit row
  const [drag, setDragState] = useState<{ unitId: string; start: number; end: number } | null>(null);
  // Ref mirrors state so mouseup + mouseleave in the same tick can't open two drawers
  const dragRef = useRef(drag);
  const setDrag = (v: typeof drag) => { dragRef.current = v; setDragState(v); };
  const finishDrag = () => {
    const drag = dragRef.current;
    if (!drag) return;
    const a = Math.min(drag.start, drag.end);
    const b = Math.max(drag.start, drag.end);
    const checkIn = days[a];
    const checkOut = addDaysISO(days[b], 1);
    setDrag(null);
    if (!canEdit) return;
    if (findConflicts(data.bookings, drag.unitId, checkIn, checkOut).length) { toast.error('Those dates overlap an existing booking'); return; }
    openOverlay({ kind: 'booking', unitId: drag.unitId, checkIn, checkOut });
  };

  const step = (dir: number) => setAnchor((a) => (view === 'month' ? addMonthsISO(startOfMonthISO(a), dir) : addDaysISO(a, dir * (view === 'week' ? 7 : 1))));
  const title = view === 'month' ? fmtDate(range.from, 'MMMM yyyy') : view === 'week' ? `${fmtDate(range.from, 'd MMM')} – ${fmtDate(range.to, 'd MMM yyyy')}` : fmtDate(anchor, 'EEEE, d MMMM yyyy');

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 p-3 sm:p-4 border-b border-border">
        <div className="flex items-center gap-1">
          <Button size="icon-sm" variant="ghost" onClick={() => step(-1)} aria-label="Previous"><ChevronLeft className="h-4 w-4" /></Button>
          <Button size="sm" onClick={() => setAnchor(today)}>Today</Button>
          <Button size="icon-sm" variant="ghost" onClick={() => step(1)} aria-label="Next"><ChevronRight className="h-4 w-4" /></Button>
        </div>
        <h3 className="text-[15px] font-semibold tracking-tight mr-auto">{title}</h3>
        {data.properties.length > 1 && <Select className="w-44" value={pid} onChange={setPid} options={[{ value: 'all', label: 'All properties' }, ...data.properties.filter((p) => !p.archived).map((p) => ({ value: p.id, label: p.name }))]} />}
        <Segmented size="sm" value={view} onChange={setView} options={[{ value: 'day', label: 'Day' }, { value: 'week', label: '2 weeks' }, { value: 'month', label: 'Month' }]} />
      </div>

      {groups.length === 0 ? <EmptyState icon={<BedDouble className="h-5 w-5" />} title="No units yet" body="Add a property with rooms or cabins to see the calendar." /> : view === 'day' ? (
        <DayView date={anchor} groups={groups} />
      ) : (
        <>
          <div ref={scroller} className="overflow-x-auto select-none" onMouseUp={finishDrag} onMouseLeave={finishDrag}>
            <div style={{ width: labelW + days.length * colW }} className="relative">
              {/* Header */}
              <div className="flex sticky top-0 z-20 bg-surface border-b border-border">
                <div className="sticky left-0 z-10 bg-surface border-r border-border" style={{ width: labelW, minWidth: labelW }} />
                {days.map((d) => {
                  const dt = parseISO(d);
                  const wk = dt.getDay() === 0 || dt.getDay() === 6;
                  return (
                    <div key={d} style={{ width: colW }} className={cn('text-center py-2 border-r border-border/60', wk && 'bg-surface-2/50', d === today && 'bg-accent-soft')}>
                      <div className={cn('text-[10px] uppercase font-semibold', d === today ? 'text-accent' : 'text-subtle')}>{format(dt, view === 'month' ? 'EEEEE' : 'EEE')}</div>
                      <div className={cn('text-[13px] num font-medium', d === today ? 'text-accent' : 'text-fg')}>{format(dt, 'd')}</div>
                    </div>
                  );
                })}
              </div>
              {groups.map(({ property, units }) => (
                <div key={property.id}>
                  <div className="flex border-b border-border bg-surface-2/40">
                    <div className="sticky left-0 z-10 bg-surface-2 px-3 py-1.5 text-[11.5px] font-semibold text-muted flex items-center gap-2 border-r border-border" style={{ width: labelW, minWidth: labelW }}>
                      <PropertyDot color={property.color} />{property.name}
                    </div>
                    <div style={{ width: days.length * colW }} />
                  </div>
                  {units.map((u) => {
                    const list = byUnit.get(u.id) ?? [];
                    return (
                      <div key={u.id} className="flex border-b border-border/70 relative h-[52px] group/row">
                        <button onClick={() => navigate(`/properties/${u.propertyId}`)} className="sticky left-0 z-10 bg-surface px-3 text-left border-r border-border hover:bg-surface-2 transition-colors" style={{ width: labelW, minWidth: labelW }}>
                          <div className="text-[13px] font-medium truncate">{u.name}</div>
                          <div className="text-[11px] text-subtle">{money(u.baseRate, { compact: true })} · sleeps {u.capacity}</div>
                        </button>
                        {days.map((d, i) => {
                          const dt = parseISO(d);
                          const wk = dt.getDay() === 0 || dt.getDay() === 6;
                          const sel = drag && drag.unitId === u.id && i >= Math.min(drag.start, drag.end) && i <= Math.max(drag.start, drag.end);
                          return (
                            <div
                              key={d}
                              style={{ width: colW }}
                              className={cn('border-r border-border/50 h-full transition-colors', wk && 'bg-surface-2/40', d === today && 'bg-accent-soft/60', canEdit && 'hover:bg-accent/5 cursor-cell', sel && '!bg-accent/20')}
                              onMouseDown={() => canEdit && setDrag({ unitId: u.id, start: i, end: i })}
                              onMouseEnter={() => drag && drag.unitId === u.id && setDrag({ ...drag, end: i })}
                              onTouchEnd={() => { if (canEdit && !findConflicts(data.bookings, u.id, d, addDaysISO(d, 1)).length) openOverlay({ kind: 'booking', unitId: u.id, checkIn: d, checkOut: addDaysISO(d, 2) }); }}
                            />
                          );
                        })}
                        {list.map((b) => {
                          const startIdx = nightsBetween(range.from, b.checkIn);
                          const endIdx = nightsBetween(range.from, b.checkOut);
                          // Bars run from mid check-in day to mid check-out day, like a hotel tape chart
                          const left = labelW + Math.max(startIdx + 0.5, 0) * colW + 2;
                          const right = labelW + Math.min(endIdx + 0.5, days.length) * colW - 2;
                          const width = right - left;
                          if (width <= 4) return null;
                          const led = ledgers.get(b.id)!;
                          const g = L.guest(b.guestId);
                          return (
                            <button
                              key={b.id}
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={() => navigate(`/bookings/${b.id}`)}
                              title={`${g?.firstName} ${g?.lastName} · ${fmtDate(b.checkIn, 'd MMM')} → ${fmtDate(b.checkOut, 'd MMM')} · ${money(led.totals.total)}${led.balance > 0 ? ` · ${money(led.balance)} due` : ''}`}
                              className={cn('absolute top-2 h-9 rounded-lg px-2 text-left text-[12px] font-medium flex items-center gap-1.5 overflow-hidden shadow-sm hover:brightness-105 hover:shadow-md transition-all z-[5]', barStyle[b.status],
                                startIdx < 0 && 'rounded-l-none', endIdx > days.length && 'rounded-r-none')}
                              style={{ left, width }}
                            >
                              {led.balance > 0 && b.status !== 'inquiry' && <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80 shrink-0" title="Balance due" />}
                              <span className="truncate">{g?.firstName} {view !== 'month' || width > 90 ? g?.lastName : ''}</span>
                              {width > 140 && <span className="ml-auto opacity-70 num text-[11px] shrink-0">{b.nights.length}n</span>}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 border-t border-border text-[12px] text-muted">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-4 rounded bg-s1" />Confirmed</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-4 rounded bg-accent" />In-house</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-4 rounded bg-warning/30 border border-warning/50" />Tentative</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-4 rounded bg-surface-3" />Checked out</span>
            <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-fg" />Balance due</span>
            {canEdit && <span className="ml-auto text-subtle hidden sm:inline">Drag across empty days to create a booking</span>}
          </div>
        </>
      )}
    </Card>
  );
}

function DayView({ date, groups }: { date: ISODate; groups: { property: { id: string; name: string; color: string }; units: { id: string; name: string; readiness: import('@/domain/types').Readiness }[] }[] }) {
  const data = useData();
  const L = useLookup();
  const canEdit = useCan('bookings.edit');
  const navigate = useNavigate();
  const unitIds = new Set(groups.flatMap((g) => g.units.map((u) => u.id)));
  const live = data.bookings.filter((b) => unitIds.has(b.unitId) && !['cancelled', 'no_show', 'inquiry'].includes(b.status));
  const arrivals = live.filter((b) => b.checkIn === date);
  const departures = live.filter((b) => b.checkOut === date);
  const staying = live.filter((b) => b.checkIn < date && b.checkOut > date);
  const occupant = (unitId: string) => live.find((b) => b.unitId === unitId && b.checkIn <= date && b.checkOut > date);

  const List = ({ title, icon, items }: { title: string; icon: JSX.Element; items: Booking[] }) => (
    <div>
      <div className="flex items-center gap-2 text-[12px] font-semibold text-muted mb-2">{icon}{title} <span className="num text-subtle">{items.length}</span></div>
      {items.length === 0 ? <p className="text-[13px] text-subtle">None</p> : items.map((b) => (
        <button key={b.id} onClick={() => navigate(`/bookings/${b.id}`)} className="w-full flex items-center justify-between gap-2 py-2 border-b border-border last:border-0 text-left">
          <span className="min-w-0"><span className="block text-[13.5px] font-medium truncate">{L.guestName(b.guestId)}</span><span className="block text-[12px] text-muted">{L.unit(b.unitId)?.name}</span></span>
          <StatusBadge status={b.status} />
        </button>
      ))}
    </div>
  );

  return (
    <div className="p-4 sm:p-5 space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <List title="ARRIVING" icon={<LogIn className="h-3.5 w-3.5 text-success" />} items={arrivals} />
        <List title="DEPARTING" icon={<LogOut className="h-3.5 w-3.5 text-warning" />} items={departures} />
        <List title="STAYING" icon={<BedDouble className="h-3.5 w-3.5 text-info" />} items={staying} />
      </div>
      <div>
        <div className="eyebrow mb-3">Units on {fmtDate(date, 'd MMM')}</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          {groups.flatMap((g) => g.units.map((u) => {
            const b = occupant(u.id);
            return (
              <div key={u.id} className={cn('rounded-2xl border p-3.5', b ? 'border-s1/30 bg-s1/5' : 'border-border')}>
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-[13.5px] font-medium min-w-0"><PropertyDot color={g.property.color} /><span className="truncate">{u.name}</span></span>
                  <ReadinessBadge value={u.readiness} />
                </div>
                <div className="mt-2 text-[12.5px]">
                  {b ? <button onClick={() => navigate(`/bookings/${b.id}`)} className="text-fg hover:underline">{L.guestName(b.guestId)} <span className="text-muted">until {fmtDate(b.checkOut, 'd MMM')}</span></button>
                    : canEdit ? <button className="text-accent font-medium" onClick={() => openOverlay({ kind: 'booking', unitId: u.id, checkIn: date, checkOut: addDaysISO(date, 1) })}>Available — book</button>
                    : <Badge tone="success">Available</Badge>}
                </div>
              </div>
            );
          }))}
        </div>
      </div>
    </div>
  );
}
