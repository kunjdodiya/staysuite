import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, MapPin, Pencil, Plus, MoreHorizontal, Archive, Trash2, Clock, Wifi, FileText, Download, Tag, BedDouble, ArchiveRestore, Sparkles, Wrench } from 'lucide-react';
import { Button, Card, CardHeader, Badge, EmptyState, Tabs, Stat, Select } from '@/components/ui';
import { Menu, useConfirm } from '@/components/ui/overlay';
import { PropertyDot, readinessTone } from '@/components/domain';
import { useCan, useData, useLedgers, useMoney, useToday } from '@/data/hooks';
import { useStore } from '@/data/store';
import { openOverlay } from '@/data/ui';
import { addDaysISO, eachDay, endOfMonthISO, fmtDate, startOfMonthISO, isWeekendNight, nightsBetween } from '@/lib/dates';
import { nightlyRate } from '@/domain/pricing';
import { periodSummary } from '@/domain/finance';
import { docCategoryLabel, propertyTypeLabel, readinessLabel, unitTypeLabel, options } from '@/domain/labels';
import type { PropertyDocument, RateRule, Readiness, Unit } from '@/domain/types';
import { PropertyDocForm, PropertyForm, RateRuleForm, UnitForm } from './PropertyForms';
import { downloadBlob, dataUrlToBlob } from '@/lib/download';
import { cn } from '@/lib/cn';
import { parseISO } from 'date-fns';

type Tab = 'overview' | 'units' | 'pricing' | 'documents';

export default function PropertyDetailPage() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) ?? 'overview';
  const data = useData();
  const today = useToday();
  const money = useMoney({ cents: false });
  const ledgers = useLedgers();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const canEdit = useCan('properties.edit');
  const showMoney = useCan('finance.view');
  const archive = useStore((s) => s.archiveProperty);
  const deleteProperty = useStore((s) => s.deleteProperty);
  const [editing, setEditing] = useState(false);
  const p = data.properties.find((x) => x.id === id);
  const s = useMemo(() => (p ? periodSummary(data, { from: startOfMonthISO(today), to: endOfMonthISO(today), propertyId: p.id }, ledgers) : null), [data, p, today, ledgers]);
  if (!p || !s) return <EmptyState title="Property not found" action={<Link to="/properties"><Button>Back</Button></Link>} />;
  const units = data.units.filter((u) => u.propertyId === p.id);
  const docs = data.propertyDocs.filter((d) => d.propertyId === p.id);

  return (
    <div className="space-y-5">
      <button onClick={() => navigate('/properties')} className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-fg"><ArrowLeft className="h-4 w-4" />Properties</button>
      <div className="relative rounded-3xl overflow-hidden border border-border">
        <div className="aspect-[21/7] min-h-[160px] bg-surface-2">{p.photos[0] && <img src={p.photos[0]} alt="" className="h-full w-full object-cover" />}</div>
        <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent" />
        <div className="absolute bottom-0 inset-x-0 p-5 sm:p-7 flex flex-wrap items-end justify-between gap-3">
          <div className="text-white">
            <div className="flex items-center gap-2"><Badge className="!bg-white/20 !text-white !border-white/20 backdrop-blur">{propertyTypeLabel[p.type]}</Badge>{p.archived && <Badge tone="warning">Archived</Badge>}</div>
            <h1 className="mt-2 text-[24px] sm:text-[30px] font-semibold tracking-tight">{p.name}</h1>
            <p className="text-[13.5px] text-white/80 flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{[p.address, p.city].filter(Boolean).join(', ')}</p>
          </div>
          {canEdit && (
            <div className="flex gap-2">
              <Button icon={<Pencil className="h-4 w-4" />} onClick={() => setEditing(true)}>Edit</Button>
              <Menu trigger={({ onClick }) => <Button size="icon" onClick={onClick} aria-label="More"><MoreHorizontal className="h-4 w-4" /></Button>} items={[
                { label: p.archived ? 'Restore property' : 'Archive property', icon: p.archived ? <ArchiveRestore /> : <Archive />, onClick: () => { archive(p.id, !p.archived); toast.success(p.archived ? 'Property restored' : 'Property archived — history is kept'); } },
                { label: 'Delete property', icon: <Trash2 />, danger: true, onClick: async () => {
                  if (!(await confirm({ title: `Delete ${p.name}?`, body: 'Units, pricing rules and documents will be removed. Properties with bookings can only be archived.', danger: true, confirmLabel: 'Delete' }))) return;
                  const r = deleteProperty(p.id);
                  if (!r.ok) toast.error(r.error); else { toast.success('Property deleted'); navigate('/properties'); }
                } },
              ]} />
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        <Stat label="Occupancy this month" value={`${Math.round(s.occupancy * 100)}%`} sub={`${s.nightsSold} of ${s.availableNights} unit-nights`} />
        {showMoney && <Stat label="Revenue this month" value={money(s.revenue)} sub={`ADR ${money(s.adr)}`} />}
        {showMoney && <Stat label="Net profit this month" value={money(s.netProfit)} sub={`${money(s.expenses, { compact: true })} expenses`} />}
        <Stat label="Units" value={String(units.filter((u) => !u.archived).length)} sub={`${units.filter((u) => u.readiness === 'ready' && !u.archived).length} ready now`} />
      </div>

      <Tabs value={tab} onChange={(v) => setParams({ tab: v })} options={[{ value: 'overview', label: 'Overview' }, { value: 'units', label: 'Units', count: units.filter((u) => !u.archived).length }, { value: 'pricing', label: 'Pricing' }, { value: 'documents', label: 'Documents', count: docs.length }]} />

      {tab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5">
          <div className="lg:col-span-2 space-y-4 sm:space-y-5">
            {p.description && <Card className="p-5 text-[14px] leading-relaxed">{p.description}</Card>}
            {p.photos.length > 1 && <div className="grid grid-cols-3 gap-2">{p.photos.slice(1, 7).map((src, i) => <img key={i} src={src} alt="" className="aspect-[4/3] rounded-2xl object-cover border border-border" />)}</div>}
            <Card>
              <CardHeader title="Guest information" subtitle="Used in automated messages" />
              <div className="px-5 pb-5 space-y-4 text-[13.5px]">
                <div className="flex gap-6"><span className="flex items-center gap-2"><Clock className="h-4 w-4 text-subtle" />Check-in from <b>{p.checkInTime}</b></span><span>Check-out by <b>{p.checkOutTime}</b></span></div>
                {p.wifiName && <div className="flex items-center gap-2"><Wifi className="h-4 w-4 text-subtle" />{p.wifiName} <span className="text-muted">/ {p.wifiPassword}</span></div>}
                {p.checkInInstructions && <div><div className="eyebrow mb-1">Arrival instructions</div><p className="whitespace-pre-line text-muted">{p.checkInInstructions}</p></div>}
                {p.houseRules && <div><div className="eyebrow mb-1">House rules</div><p className="whitespace-pre-line text-muted">{p.houseRules}</p></div>}
              </div>
            </Card>
          </div>
          <Card>
            <CardHeader title="Amenities" />
            <div className="px-5 pb-5 flex flex-wrap gap-1.5">{p.amenities.length ? p.amenities.map((a) => <Badge key={a}>{a}</Badge>) : <span className="text-[13px] text-subtle">None listed</span>}</div>
          </Card>
        </div>
      )}
      {tab === 'units' && <UnitsTab propertyId={p.id} units={units} color={p.color} />}
      {tab === 'pricing' && <PricingTab propertyId={p.id} units={units.filter((u) => !u.archived)} />}
      {tab === 'documents' && <DocsTab propertyId={p.id} docs={docs} />}
      {editing && <PropertyForm propertyId={p.id} onClose={() => setEditing(false)} />}
    </div>
  );
}

function UnitsTab({ propertyId, units, color }: { propertyId: string; units: Unit[]; color: string }) {
  const data = useData();
  const today = useToday();
  const money = useMoney({ cents: false });
  const canEdit = useCan('properties.edit');
  const canTask = useCan('tasks.edit');
  const setReadiness = useStore((s) => s.setReadiness);
  const saveUnit = useStore((s) => s.saveUnit);
  const deleteUnit = useStore((s) => s.deleteUnit);
  const confirm = useConfirm();
  const [editing, setEditing] = useState<Unit | 'new' | null>(null);
  return (
    <Card>
      <CardHeader title="Rooms & units" subtitle="Each unit has its own calendar, rates and readiness" action={canEdit && <Button size="sm" variant="primary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setEditing('new')}>Add unit</Button>} />
      {units.length === 0 ? <EmptyState icon={<BedDouble className="h-5 w-5" />} title="No units" body="Add the rooms, cabins or apartments guests can book." /> : (
        <div className="divide-y divide-border border-t border-border">
          {units.map((u) => {
            const current = data.bookings.find((b) => b.unitId === u.id && ['checked_in', 'confirmed'].includes(b.status) && b.checkIn <= today && b.checkOut > today);
            const next = data.bookings.filter((b) => b.unitId === u.id && ['confirmed', 'tentative'].includes(b.status) && b.checkIn > today).sort((a, b) => a.checkIn.localeCompare(b.checkIn))[0];
            return (
              <div key={u.id} className={cn('flex flex-wrap sm:flex-nowrap items-center gap-3 px-4 sm:px-5 py-3.5', u.archived && 'opacity-50')}>
                <PropertyDot color={color} />
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-medium">{u.name} {u.archived && <Badge>Archived</Badge>}</div>
                  <div className="text-[12px] text-muted">{unitTypeLabel[u.type]} · sleeps {u.capacity} · {money(u.baseRate)}/night{u.weekendRate ? ` · ${money(u.weekendRate)} Fri–Sat` : ''}{u.cleaningFee ? ` · ${money(u.cleaningFee)} cleaning` : ''}</div>
                  <div className="text-[12px] text-subtle mt-0.5">{current ? `Occupied until ${fmtDate(current.checkOut, 'd MMM')}` : 'Vacant tonight'}{next ? ` · next arrival ${fmtDate(next.checkIn, 'd MMM')}` : ''}</div>
                </div>
                <Select className="w-40" value={u.readiness} onChange={(v) => { setReadiness(u.id, v as Readiness); toast.success(`${u.name}: ${readinessLabel[v as Readiness]}`); }} options={options(readinessLabel)} disabled={!canEdit && !canTask} />
                <span className={cn('h-2 w-2 rounded-full hidden sm:block', { success: 'bg-success', warning: 'bg-warning', info: 'bg-info', accent: 'bg-accent', danger: 'bg-danger', neutral: 'bg-subtle' }[readinessTone[u.readiness]])} />
                {(canEdit || canTask) && (
                  <Menu trigger={({ onClick }) => <Button size="icon-sm" variant="ghost" onClick={onClick}><MoreHorizontal className="h-4 w-4" /></Button>} items={[
                    { label: 'Edit unit', icon: <Pencil />, onClick: () => setEditing(u), hidden: !canEdit },
                    { label: 'Schedule cleaning', icon: <Sparkles />, onClick: () => openOverlay({ kind: 'task', propertyId, unitId: u.id, type: 'cleaning' }), hidden: !canTask },
                    { label: 'Report maintenance', icon: <Wrench />, onClick: () => openOverlay({ kind: 'task', propertyId, unitId: u.id, type: 'maintenance' }), hidden: !canTask },
                    { label: 'Export iCal feed', icon: <Download />, onClick: () => exportIcal(u, data.bookings, data.business.name) },
                    { label: u.archived ? 'Restore' : 'Archive', icon: <Archive />, onClick: () => saveUnit({ ...u, archived: !u.archived }), hidden: !canEdit },
                    { label: 'Delete', icon: <Trash2 />, danger: true, hidden: !canEdit, onClick: async () => { if (await confirm({ title: `Delete ${u.name}?`, danger: true, confirmLabel: 'Delete' })) { const r = deleteUnit(u.id); if (!r.ok) toast.error(r.error); } } },
                  ]} />
                )}
              </div>
            );
          })}
        </div>
      )}
      {editing && <UnitForm propertyId={propertyId} unit={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </Card>
  );
}

/** iCal export so a unit's availability can be imported by Airbnb / Booking.com (channel sync foundation). */
function exportIcal(u: Unit, bookings: import('@/domain/types').Booking[], biz: string) {
  const fmt = (d: string) => d.replace(/-/g, '');
  const now = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const events = bookings.filter((b) => b.unitId === u.id && ['tentative', 'confirmed', 'checked_in'].includes(b.status)).map((b) =>
    ['BEGIN:VEVENT', `UID:${b.id}@staysuite`, `DTSTAMP:${now}`, `DTSTART;VALUE=DATE:${fmt(b.checkIn)}`, `DTEND;VALUE=DATE:${fmt(b.checkOut)}`, `SUMMARY:Reserved (${b.code})`, 'END:VEVENT'].join('\r\n'));
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:-//StaySuite//${biz}//EN`, `X-WR-CALNAME:${u.name}`, ...events, 'END:VCALENDAR'].join('\r\n');
  downloadBlob(new Blob([ics], { type: 'text/calendar' }), `${u.name.replace(/\W+/g, '-')}.ics`);
  toast.success('Calendar exported', { description: `${events.length} reservations` });
}

function PricingTab({ propertyId, units }: { propertyId: string; units: Unit[] }) {
  const data = useData();
  const today = useToday();
  const money = useMoney({ cents: false });
  const canEdit = useCan('properties.edit');
  const del = useStore((s) => s.deleteRateRule);
  const save = useStore((s) => s.saveRateRule);
  const [editing, setEditing] = useState<RateRule | 'new' | null>(null);
  const [unitId, setUnitId] = useState(units[0]?.id ?? '');
  const rules = data.rateRules.filter((r) => r.propertyId === propertyId).sort((a, b) => a.startDate.localeCompare(b.startDate));
  const unit = units.find((u) => u.id === unitId);
  const days = eachDay(today, addDaysISO(today, 41));
  const kindLabel = { seasonal: 'Seasonal', special_offer: 'Special offer', custom: 'Custom' };
  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 sm:gap-5">
      <Card className="lg:col-span-2">
        <CardHeader title="Pricing rules" subtitle="Seasons, offers and custom rates" action={canEdit && <Button size="sm" variant="primary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setEditing('new')}>Rule</Button>} />
        {rules.length === 0 ? <EmptyState icon={<Tag className="h-5 w-5" />} title="No pricing rules" body="Base and weekend rates apply. Add seasons or offers to adjust automatically." /> : (
          <div className="divide-y divide-border border-t border-border">
            {rules.map((r) => {
              const past = r.endDate < today;
              return (
                <div key={r.id} className={cn('px-5 py-3 flex items-center gap-3', (past || !r.active) && 'opacity-50')}>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] font-medium flex items-center gap-2">{r.name}<Badge tone={r.kind === 'special_offer' ? 'success' : r.kind === 'seasonal' ? 'info' : 'neutral'}>{kindLabel[r.kind]}</Badge></div>
                    <div className="text-[12px] text-muted">{fmtDate(r.startDate, 'd MMM')} – {fmtDate(r.endDate, 'd MMM yyyy')} · {r.mode === 'percent' ? `${r.value > 0 ? '+' : ''}${r.value}%` : `${money(r.value)}/night`}{r.minNights > 1 ? ` · min ${r.minNights} nights` : ''}{r.unitId ? ` · ${units.find((u) => u.id === r.unitId)?.name}` : ''}</div>
                  </div>
                  {canEdit && <Menu trigger={({ onClick }) => <Button size="icon-sm" variant="ghost" onClick={onClick}><MoreHorizontal className="h-4 w-4" /></Button>} items={[
                    { label: 'Edit', icon: <Pencil />, onClick: () => setEditing(r) },
                    { label: r.active ? 'Turn off' : 'Turn on', icon: <Tag />, onClick: () => save({ ...r, active: !r.active }) },
                    { label: 'Delete', icon: <Trash2 />, danger: true, onClick: () => del(r.id) },
                  ]} />}
                </div>
              );
            })}
          </div>
        )}
      </Card>
      <Card className="lg:col-span-3">
        <CardHeader title="Rate preview" subtitle="Next 6 weeks — what a 1-night stay would cost" action={units.length > 1 && <Select className="w-44" value={unitId} onChange={setUnitId} options={units.map((u) => ({ value: u.id, label: u.name }))} />} />
        {unit ? (
          <div className="px-5 pb-5">
            <div className="grid grid-cols-7 gap-1.5">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d} className="text-center text-[10.5px] font-semibold text-subtle uppercase">{d}</div>)}
              {Array.from({ length: (parseISO(today).getDay() + 6) % 7 }, (_, i) => <div key={`pad${i}`} />)}
              {days.map((d) => {
                const n = nightlyRate(d, unit, data.rateRules, 1);
                const booked = data.bookings.some((b) => b.unitId === unit.id && ['confirmed', 'checked_in', 'tentative'].includes(b.status) && b.checkIn <= d && b.checkOut > d);
                const diff = n.rate - unit.baseRate;
                return (
                  <div key={d} title={n.ruleId ? data.rateRules.find((r) => r.id === n.ruleId)?.name : isWeekendNight(d) ? 'Weekend rate' : 'Base rate'}
                    className={cn('rounded-xl p-1.5 text-center border', booked ? 'bg-surface-2 border-transparent' : 'border-border', diff > 0 && !booked && 'border-s2/40 bg-s2/5', diff < 0 && !booked && 'border-s3/40 bg-s3/5')}>
                    <div className={cn('text-[11px] num', d === today ? 'text-accent font-bold' : 'text-muted')}>{fmtDate(d, 'd')}{d.endsWith('-01') ? ` ${fmtDate(d, 'MMM')}` : ''}</div>
                    <div className={cn('text-[11.5px] font-medium num', booked && 'line-through text-subtle')}>{money(n.rate, { compact: true })}</div>
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-4 mt-4 text-[12px] text-muted">
              <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded border border-s2/40 bg-s2/10" />Above base</span>
              <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded border border-s3/40 bg-s3/10" />Below base</span>
              <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-surface-2" />Booked</span>
            </div>
          </div>
        ) : <EmptyState title="Add a unit to preview rates" />}
      </Card>
      {editing && <RateRuleForm propertyId={propertyId} rule={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function DocsTab({ propertyId, docs }: { propertyId: string; docs: PropertyDocument[] }) {
  const today = useToday();
  const canEdit = useCan('properties.edit');
  const del = useStore((s) => s.deletePropertyDoc);
  const confirm = useConfirm();
  const [editing, setEditing] = useState<PropertyDocument | 'new' | null>(null);
  return (
    <Card>
      <CardHeader title="Licences, contracts & records" subtitle="Expiry reminders appear in notifications 45 days ahead" action={canEdit && <Button size="sm" variant="primary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setEditing('new')}>Add</Button>} />
      {docs.length === 0 ? <EmptyState icon={<FileText className="h-5 w-5" />} title="No documents" body="Keep registrations, leases, insurance and permits in one place." /> : (
        <div className="divide-y divide-border border-t border-border">
          {docs.map((d) => {
            const days = d.expiresOn ? nightsBetween(today, d.expiresOn) : null;
            return (
              <div key={d.id} className="flex items-center gap-3 px-5 py-3">
                <span className="h-9 w-9 rounded-xl bg-surface-2 border border-border grid place-items-center"><FileText className="h-4 w-4 text-muted" /></span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-medium truncate">{d.name}</div>
                  <div className="text-[12px] text-muted">{docCategoryLabel[d.category]}{d.fileName ? ` · ${d.fileName}` : ''}{d.notes ? ` · ${d.notes}` : ''}</div>
                </div>
                {days != null && <Badge tone={days < 0 ? 'danger' : days <= 45 ? 'warning' : 'neutral'}>{days < 0 ? 'Expired' : `Expires ${fmtDate(d.expiresOn!, 'd MMM yyyy')}`}</Badge>}
                {d.fileDataUrl && <Button size="icon-sm" variant="ghost" title="Download" onClick={() => downloadBlob(dataUrlToBlob(d.fileDataUrl!), d.fileName || `${d.name}.pdf`)}><Download className="h-4 w-4" /></Button>}
                {canEdit && <Menu trigger={({ onClick }) => <Button size="icon-sm" variant="ghost" onClick={onClick}><MoreHorizontal className="h-4 w-4" /></Button>} items={[
                  { label: 'Edit', icon: <Pencil />, onClick: () => setEditing(d) },
                  { label: 'Delete', icon: <Trash2 />, danger: true, onClick: async () => { if (await confirm({ title: `Delete ${d.name}?`, danger: true, confirmLabel: 'Delete' })) del(d.id); } },
                ]} />}
              </div>
            );
          })}
        </div>
      )}
      {editing && <PropertyDocForm propertyId={propertyId} doc={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </Card>
  );
}
