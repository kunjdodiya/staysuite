import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CalendarDays, Download, List, Plus, BedDouble } from 'lucide-react';
import { PageHeader, Button, Segmented, Card, SearchInput, Select, EmptyState, LoadMore, Tabs } from '@/components/ui';
import { PaymentBadge, PropertyDot, SourceTag, StatusBadge } from '@/components/domain';
import { useCan, useData, useLedgers, useLookup, useMoney, useToday, useVisiblePropertyIds } from '@/data/hooks';
import { openOverlay } from '@/data/ui';
import { fmtRange } from '@/lib/dates';
import { downloadCSV } from '@/lib/download';
import { toMajor } from '@/lib/money';
import { bookingStatusLabel, sourceLabel, options } from '@/domain/labels';
import { CalendarView } from './CalendarView';
import type { BookingSource } from '@/domain/types';

type Filter = 'upcoming' | 'inhouse' | 'past' | 'cancelled' | 'inquiries' | 'all';

export default function BookingsPage() {
  const [params, setParams] = useSearchParams();
  const view = (params.get('view') as 'calendar' | 'list') ?? 'calendar';
  const canEdit = useCan('bookings.edit');
  return (
    <div>
      <PageHeader
        title="Bookings"
        subtitle="Reservations across every property and channel"
        actions={<>
          <Segmented value={view} onChange={(v) => setParams({ view: v })} options={[{ value: 'calendar', label: <><CalendarDays className="h-3.5 w-3.5" />Calendar</> }, { value: 'list', label: <><List className="h-3.5 w-3.5" />List</> }]} />
          {canEdit && <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => openOverlay({ kind: 'booking' })}>New booking</Button>}
        </>}
      />
      {view === 'calendar' ? <CalendarView /> : <BookingList />}
    </div>
  );
}

function BookingList() {
  const data = useData();
  const today = useToday();
  const L = useLookup();
  const money = useMoney();
  const ledgers = useLedgers();
  const navigate = useNavigate();
  const showMoney = useCan('finance.view');
  const visible = useVisiblePropertyIds();
  const [filter, setFilter] = useState<Filter>('upcoming');
  const [q, setQ] = useState('');
  const [source, setSource] = useState<BookingSource | ''>('');
  const [pid, setPid] = useState('');
  const [limit, setLimit] = useState(40);

  const base = data.bookings.filter((b) => (!visible || visible.has(b.propertyId)) && (!pid || b.propertyId === pid) && (!source || b.source === source));
  const match: Record<Filter, (b: (typeof base)[number]) => boolean> = {
    upcoming: (b) => ['confirmed', 'tentative'].includes(b.status) && b.checkIn >= today,
    inhouse: (b) => b.status === 'checked_in',
    past: (b) => b.status === 'checked_out',
    cancelled: (b) => b.status === 'cancelled' || b.status === 'no_show',
    inquiries: (b) => b.status === 'inquiry',
    all: () => true,
  };
  const counts = Object.fromEntries((Object.keys(match) as Filter[]).map((k) => [k, base.filter(match[k]).length])) as Record<Filter, number>;

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return base
      .filter(match[filter])
      .filter((b) => !s || `${b.code} ${b.channelRef} ${L.guestName(b.guestId)} ${L.unit(b.unitId)?.name}`.toLowerCase().includes(s))
      .sort((a, b) => (filter === 'upcoming' || filter === 'inhouse' ? a.checkIn.localeCompare(b.checkIn) : b.checkIn.localeCompare(a.checkIn)));
  }, [base, filter, q, L]); // eslint-disable-line react-hooks/exhaustive-deps

  function exportCsv() {
    const cur = data.business.currency;
    downloadCSV(rows.map((b) => {
      const l = ledgers.get(b.id)!;
      return {
        Code: b.code, Guest: L.guestName(b.guestId), Property: L.property(b.propertyId)?.name, Unit: L.unit(b.unitId)?.name, 'Check-in': b.checkIn, 'Check-out': b.checkOut,
        Nights: b.nights.length, Guests: b.adults + b.children, Status: bookingStatusLabel[b.status], Source: sourceLabel[b.source], 'Channel ref': b.channelRef,
        ...(showMoney ? { Total: toMajor(l.totals.total, cur), Tax: toMajor(l.totals.tax, cur), Paid: toMajor(l.paid, cur), Balance: toMajor(l.balance, cur) } : {}),
      };
    }), `bookings-${filter}-${today}.csv`);
  }

  return (
    <Card>
      <div className="px-4 sm:px-5 pt-3">
        <Tabs value={filter} onChange={(v) => { setFilter(v); setLimit(40); }} options={[
          { value: 'upcoming', label: 'Upcoming', count: counts.upcoming }, { value: 'inhouse', label: 'In-house', count: counts.inhouse },
          { value: 'past', label: 'Past', count: counts.past }, { value: 'cancelled', label: 'Cancelled', count: counts.cancelled },
          { value: 'inquiries', label: 'Inquiries', count: counts.inquiries }, { value: 'all', label: 'All', count: counts.all },
        ]} />
      </div>
      <div className="flex flex-wrap gap-2 p-4 sm:px-5">
        <SearchInput className="flex-1 min-w-[200px]" value={q} onChange={setQ} placeholder="Guest, booking code, unit…" />
        <Select className="w-40" value={source} onChange={setSource} options={options(sourceLabel)} placeholder="All sources" />
        {data.properties.length > 1 && <Select className="w-44" value={pid} onChange={setPid} options={data.properties.map((p) => ({ value: p.id, label: p.name }))} placeholder="All properties" />}
        <Button icon={<Download className="h-4 w-4" />} onClick={exportCsv} disabled={!rows.length}>CSV</Button>
      </div>
      {rows.length === 0 ? <EmptyState icon={<BedDouble className="h-5 w-5" />} title="No bookings here" body={q ? 'Try a different search.' : 'Bookings matching this filter will appear here.'} /> : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-[13.5px]">
              <thead>
                <tr className="text-left text-[12px] text-muted border-y border-border bg-surface-2/40">
                  <th className="font-medium py-2.5 pl-5">Guest</th><th className="font-medium">Stay</th><th className="font-medium">Unit</th><th className="font-medium">Source</th><th className="font-medium">Status</th>
                  {showMoney && <><th className="font-medium text-right">Total</th><th className="font-medium text-right pr-5">Balance</th></>}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, limit).map((b) => {
                  const l = ledgers.get(b.id)!;
                  return (
                    <tr key={b.id} onClick={() => navigate(`/bookings/${b.id}`)} className="border-b border-border/70 hover:bg-surface-2/50 cursor-pointer transition-colors">
                      <td className="py-3 pl-5"><div className="font-medium">{L.guestName(b.guestId)}</div><div className="text-[12px] text-subtle">{b.code}</div></td>
                      <td><div>{fmtRange(b.checkIn, b.checkOut)}</div><div className="text-[12px] text-subtle">{b.nights.length} night{b.nights.length > 1 ? 's' : ''} · {b.adults + b.children} guests</div></td>
                      <td><span className="flex items-center gap-2"><PropertyDot color={L.property(b.propertyId)?.color ?? 's1'} />{L.unit(b.unitId)?.name}</span></td>
                      <td><SourceTag source={b.source} /></td>
                      <td><StatusBadge status={b.status} /></td>
                      {showMoney && <>
                        <td className="text-right num">{money(l.totals.total)}</td>
                        <td className="text-right pr-5"><div className="flex flex-col items-end gap-0.5"><span className="num">{l.balance ? money(Math.abs(l.balance)) : '—'}</span><PaymentBadge ledger={l} /></div></td>
                      </>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* Mobile cards */}
          <div className="md:hidden divide-y divide-border border-t border-border">
            {rows.slice(0, limit).map((b) => {
              const l = ledgers.get(b.id)!;
              return (
                <button key={b.id} onClick={() => navigate(`/bookings/${b.id}`)} className="w-full text-left px-4 py-3.5 flex gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2"><span className="font-medium text-[14px] truncate">{L.guestName(b.guestId)}</span></div>
                    <div className="text-[12.5px] text-muted mt-0.5">{fmtRange(b.checkIn, b.checkOut)} · {L.unit(b.unitId)?.name}</div>
                    <div className="mt-1.5 flex items-center gap-2"><StatusBadge status={b.status} />{showMoney && <PaymentBadge ledger={l} />}</div>
                  </div>
                  {showMoney && <div className="text-right"><div className="num font-medium text-[14px]">{money(l.totals.total)}</div>{l.balance > 0 && <div className="text-[12px] text-warning num">{money(l.balance)} due</div>}</div>}
                </button>
              );
            })}
          </div>
          <LoadMore shown={Math.min(limit, rows.length)} total={rows.length} onMore={() => setLimit((n) => n + 40)} />
        </>
      )}
    </Card>
  );
}
