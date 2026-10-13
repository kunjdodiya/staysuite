import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, MapPin, Plus, BedDouble, Archive } from 'lucide-react';
import { PageHeader, Button, Card, EmptyState, Badge, Segmented, ProgressBar } from '@/components/ui';
import { PropertyDot } from '@/components/domain';
import { useCan, useData, useLedgers, useMoney, useToday, useVisiblePropertyIds } from '@/data/hooks';
import { addDaysISO, startOfMonthISO, endOfMonthISO } from '@/lib/dates';
import { periodSummary } from '@/domain/finance';
import { propertyTypeLabel } from '@/domain/labels';
import { PropertyForm } from './PropertyForms';

export default function PropertiesPage() {
  const data = useData();
  const today = useToday();
  const money = useMoney({ cents: false });
  const ledgers = useLedgers();
  const canEdit = useCan('properties.edit');
  const showMoney = useCan('finance.view');
  const visible = useVisiblePropertyIds();
  const [show, setShow] = useState<'active' | 'archived'>('active');
  const [creating, setCreating] = useState(false);
  const list = data.properties.filter((p) => (show === 'archived' ? p.archived : !p.archived) && (!visible || visible.has(p.id)));
  const stats = useMemo(() => new Map(data.properties.map((p) => [p.id, periodSummary(data, { from: startOfMonthISO(today), to: endOfMonthISO(today), propertyId: p.id }, ledgers)])), [data, today, ledgers]);

  return (
    <div>
      <PageHeader title="Properties" subtitle={`${data.properties.filter((p) => !p.archived).length} properties · ${data.units.filter((u) => !u.archived).length} rentable units`}
        actions={<>
          {data.properties.some((p) => p.archived) && <Segmented size="sm" value={show} onChange={setShow} options={[{ value: 'active', label: 'Active' }, { value: 'archived', label: 'Archived' }]} />}
          {canEdit && <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>Add property</Button>}
        </>} />
      {list.length === 0 ? (
        <Card><EmptyState icon={show === 'archived' ? <Archive className="h-5 w-5" /> : <Building2 className="h-5 w-5" />} title={show === 'archived' ? 'No archived properties' : 'Add your first property'} body="A property can be a single cabin, a homestay with rooms, or a whole villa." action={canEdit && show === 'active' ? <Button variant="primary" onClick={() => setCreating(true)}>Add property</Button> : undefined} /></Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5">
          {list.map((p) => {
            const units = data.units.filter((u) => u.propertyId === p.id && !u.archived);
            const s = stats.get(p.id)!;
            const tonight = data.bookings.filter((b) => b.propertyId === p.id && ['confirmed', 'checked_in'].includes(b.status) && b.checkIn <= today && b.checkOut > today).length;
            const nextArrival = data.bookings.filter((b) => b.propertyId === p.id && b.status === 'confirmed' && b.checkIn >= today && b.checkIn <= addDaysISO(today, 30)).length;
            const dirty = units.filter((u) => u.readiness !== 'ready').length;
            return (
              <Link key={p.id} to={`/properties/${p.id}`} className="card overflow-hidden group hover:shadow-pop hover:-translate-y-0.5 transition-all duration-200">
                <div className="aspect-[16/9] bg-surface-2 overflow-hidden relative">
                  {p.photos[0] ? <img src={p.photos[0]} alt="" className="h-full w-full object-cover group-hover:scale-[1.03] transition-transform duration-500" /> : <div className="h-full grid place-items-center text-subtle"><Building2 className="h-8 w-8" /></div>}
                  <div className="absolute top-3 left-3"><Badge className="!bg-surface/90 backdrop-blur !border-transparent !text-fg">{propertyTypeLabel[p.type]}</Badge></div>
                </div>
                <div className="p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="text-[16px] font-semibold tracking-tight flex items-center gap-2"><PropertyDot color={p.color} />{p.name}</h3>
                      <p className="text-[12.5px] text-muted flex items-center gap-1 mt-0.5"><MapPin className="h-3 w-3" />{p.city}</p>
                    </div>
                    <span className="text-[12px] text-muted flex items-center gap-1 whitespace-nowrap"><BedDouble className="h-3.5 w-3.5" />{units.length} unit{units.length !== 1 && 's'}</span>
                  </div>
                  <div className="mt-4">
                    <div className="flex justify-between text-[12px] mb-1.5"><span className="text-muted">Occupancy this month</span><span className="num font-medium">{Math.round(s.occupancy * 100)}%</span></div>
                    <ProgressBar value={s.occupancy} />
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                    <Mini label="Tonight" value={`${tonight}/${units.length}`} />
                    <Mini label="Arrivals 30d" value={String(nextArrival)} />
                    {showMoney ? <Mini label="Revenue MTD" value={money(s.revenue, { compact: true })} /> : <Mini label="Need cleaning" value={String(dirty)} />}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
      {creating && <PropertyForm onClose={() => setCreating(false)} />}
    </div>
  );
}

const Mini = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-xl bg-surface-2/60 py-2"><div className="text-[15px] font-semibold num">{value}</div><div className="text-[11px] text-muted">{label}</div></div>
);
