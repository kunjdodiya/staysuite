import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ImagePlus, X, Upload, FileText } from 'lucide-react';
import { Drawer, Modal } from '@/components/ui/overlay';
import { Button, Field, Input, MoneyInput, Select, Textarea, Switch, Segmented } from '@/components/ui';
import { seriesBg } from '@/components/domain';
import { useStore } from '@/data/store';
import { useData, useToday } from '@/data/hooks';
import { uid } from '@/lib/id';
import { parseAmount, toMajor, toMinor } from '@/lib/money';
import { addDaysISO } from '@/lib/dates';
import { compressImage, readFileAsDataURL } from '@/lib/download';
import { AMENITIES, docCategoryLabel, options, propertyTypeLabel, unitTypeLabel } from '@/domain/labels';
import type { ID, Property, PropertyDocument, RateRule, Unit, UnitType } from '@/domain/types';
import { cn } from '@/lib/cn';

const COLORS = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'];

export function PropertyForm({ propertyId, onClose }: { propertyId?: ID; onClose: () => void }) {
  const data = useData();
  const navigate = useNavigate();
  const saveProperty = useStore((s) => s.saveProperty);
  const saveUnit = useStore((s) => s.saveUnit);
  const existing = data.properties.find((p) => p.id === propertyId);
  const cur = data.business.currency;
  const fileRef = useRef<HTMLInputElement>(null);
  const [p, setP] = useState<Property>(() => existing ?? {
    id: uid('prop'), name: '', type: 'cabin', address: '', city: '', description: '', photos: [], amenities: ['Wi-Fi', 'Hot water'],
    checkInTime: '13:00', checkOutTime: '11:00', checkInInstructions: '', houseRules: '', wifiName: '', wifiPassword: '',
    color: COLORS[data.properties.length % COLORS.length], archived: false, createdAt: new Date().toISOString(),
  });
  // First-unit quick setup when creating
  const [unitMode, setUnitMode] = useState<'single' | 'multi'>('single');
  const [unitCount, setUnitCount] = useState(3);
  const [rate, setRate] = useState('');
  const [capacity, setCapacity] = useState(2);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = <K extends keyof Property>(k: K, v: Property[K]) => { setP((s) => ({ ...s, [k]: v })); setErrors((e) => ({ ...e, [k]: '' })); };

  async function addPhotos(files: FileList | null) {
    if (!files) return;
    const urls: string[] = [];
    for (const f of Array.from(files).slice(0, 8)) {
      if (!f.type.startsWith('image/')) continue;
      urls.push(await compressImage(f));
    }
    set('photos', [...p.photos, ...urls]);
  }

  function submit() {
    const e: Record<string, string> = {};
    if (!p.name.trim()) e.name = 'Name your property';
    if (!existing) {
      const r = parseAmount(rate, cur);
      if ('error' in r) e.rate = r.error;
      if (unitMode === 'multi' && (unitCount < 1 || unitCount > 60)) e.units = '1 to 60 units';
    }
    if (Object.keys(e).length) return setErrors(e);
    saveProperty({ ...p, name: p.name.trim() });
    if (!existing) {
      const unitType: UnitType = p.type === 'cabin' ? 'cabin' : p.type === 'villa' ? 'villa' : p.type === 'apartment' ? 'apartment' : p.type === 'entire_home' ? 'entire_home' : 'room';
      const n = unitMode === 'single' ? 1 : unitCount;
      for (let i = 0; i < n; i++) {
        saveUnit({
          id: uid('unit'), propertyId: p.id, name: n === 1 ? (unitMode === 'single' ? `${p.name.trim()}` : 'Unit 1') : `${unitTypeLabel[unitType]} ${i + 1}`, type: unitMode === 'single' && p.type !== 'cabin' ? 'entire_home' : unitType,
          capacity, bedrooms: Math.max(1, Math.ceil(capacity / 2)), baseRate: toMinor(rate, cur), weekendRate: null, cleaningFee: 0, readiness: 'ready', archived: false,
        });
      }
      toast.success(`${p.name} added`, { description: `${n} unit${n > 1 ? 's' : ''} ready to book` });
      onClose();
      navigate(`/properties/${p.id}`);
    } else {
      toast.success('Property updated');
      onClose();
    }
  }

  return (
    <Drawer open onClose={onClose} title={existing ? 'Edit property' : 'Add property'} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submit}>{existing ? 'Save' : 'Create property'}</Button></>}>
      <div className="space-y-5">
        <Field label="Property name" required error={errors.name}><Input autoFocus value={p.name} invalid={!!errors.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Cedar Ridge Cabins" /></Field>
        <Field label="Type"><Select value={p.type} onChange={(v) => set('type', v)} options={options(propertyTypeLabel)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Address"><Input value={p.address} onChange={(e) => set('address', e.target.value)} /></Field>
          <Field label="City / area"><Input value={p.city} onChange={(e) => set('city', e.target.value)} /></Field>
        </div>

        {!existing && (
          <div className="p-4 rounded-2xl border border-border bg-surface-2/40 space-y-4">
            <div className="eyebrow">Rentable units</div>
            <Segmented value={unitMode} onChange={setUnitMode} options={[{ value: 'single', label: 'Rented as one' }, { value: 'multi', label: 'Several rooms / cabins' }]} />
            <div className="grid grid-cols-3 gap-3">
              {unitMode === 'multi' && <Field label="How many" error={errors.units}><Input type="number" min={1} max={60} value={unitCount} onChange={(e) => setUnitCount(Number(e.target.value))} /></Field>}
              <Field label="Nightly rate" required error={errors.rate}><MoneyInput value={rate} onChange={(v) => { setRate(v); setErrors((x) => ({ ...x, rate: '' })); }} /></Field>
              <Field label="Sleeps"><Input type="number" min={1} max={40} value={capacity} onChange={(e) => setCapacity(Math.max(1, Number(e.target.value)))} /></Field>
            </div>
            <p className="text-[12px] text-subtle">You can rename units and set weekend rates, cleaning fees and seasonal pricing afterwards.</p>
          </div>
        )}

        <Field label="Photos">
          <div className="flex flex-wrap gap-2">
            {p.photos.map((src, i) => (
              <div key={i} className="relative group h-20 w-28 rounded-xl overflow-hidden border border-border">
                <img src={src} alt="" className="h-full w-full object-cover" />
                {i === 0 && <span className="absolute bottom-1 left-1 text-[10px] px-1.5 rounded bg-black/60 text-white">Cover</span>}
                <button onClick={() => set('photos', p.photos.filter((_, j) => j !== i))} className="absolute top-1 right-1 h-5 w-5 grid place-items-center rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100"><X className="h-3 w-3" /></button>
              </div>
            ))}
            <button onClick={() => fileRef.current?.click()} className="h-20 w-28 rounded-xl border border-dashed border-border-strong grid place-items-center text-subtle hover:text-fg hover:border-fg/40 transition-colors"><ImagePlus className="h-5 w-5" /></button>
            <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { addPhotos(e.target.files); e.target.value = ''; }} />
          </div>
        </Field>

        <Field label="Description"><Textarea rows={3} value={p.description} onChange={(e) => set('description', e.target.value)} /></Field>
        <Field label="Amenities">
          <div className="flex flex-wrap gap-1.5">
            {AMENITIES.map((a) => {
              const on = p.amenities.includes(a);
              return <button key={a} onClick={() => set('amenities', on ? p.amenities.filter((x) => x !== a) : [...p.amenities, a])} className={cn('h-8 px-3 rounded-lg text-[12.5px] border transition-colors', on ? 'bg-accent-soft text-accent border-accent/30 font-medium' : 'border-border text-muted hover:text-fg')}>{a}</button>;
            })}
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Check-in from"><Input type="time" value={p.checkInTime} onChange={(e) => set('checkInTime', e.target.value)} /></Field>
          <Field label="Check-out by"><Input type="time" value={p.checkOutTime} onChange={(e) => set('checkOutTime', e.target.value)} /></Field>
        </div>
        <Field label="Check-in instructions" hint="Used in pre-arrival messages"><Textarea rows={3} value={p.checkInInstructions} onChange={(e) => set('checkInInstructions', e.target.value)} /></Field>
        <Field label="House rules"><Textarea rows={3} value={p.houseRules} onChange={(e) => set('houseRules', e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Wi-Fi name"><Input value={p.wifiName} onChange={(e) => set('wifiName', e.target.value)} /></Field>
          <Field label="Wi-Fi password"><Input value={p.wifiPassword} onChange={(e) => set('wifiPassword', e.target.value)} /></Field>
        </div>
        <Field label="Calendar colour">
          <div className="flex gap-2">{COLORS.map((c) => <button key={c} onClick={() => set('color', c)} className={cn('h-7 w-7 rounded-full transition-transform', seriesBg[c], p.color === c && 'ring-2 ring-offset-2 ring-offset-surface ring-fg scale-110')} aria-label={c} />)}</div>
        </Field>
      </div>
    </Drawer>
  );
}

export function UnitForm({ propertyId, unit, onClose }: { propertyId: ID; unit?: Unit; onClose: () => void }) {
  const cur = useStore((s) => s.data.business.currency);
  const saveUnit = useStore((s) => s.saveUnit);
  const m = (v: number | null) => (v ? String(toMajor(v, cur)) : '');
  const [u, setU] = useState<Unit>(() => unit ?? { id: uid('unit'), propertyId, name: '', type: 'room', capacity: 2, bedrooms: 1, baseRate: 0, weekendRate: null, cleaningFee: 0, readiness: 'ready', archived: false });
  const [base, setBase] = useState(m(unit?.baseRate ?? null));
  const [weekend, setWeekend] = useState(m(unit?.weekendRate ?? null));
  const [cleaning, setCleaning] = useState(m(unit?.cleaningFee ?? null));
  const [errors, setErrors] = useState<Record<string, string>>({});
  function submit() {
    const e: Record<string, string> = {};
    if (!u.name.trim()) e.name = 'Name this unit';
    const b = parseAmount(base, cur);
    if ('error' in b) e.base = b.error;
    if (u.capacity < 1) e.capacity = 'At least 1';
    if (Object.keys(e).length) return setErrors(e);
    saveUnit({ ...u, name: u.name.trim(), baseRate: (b as { value: number }).value, weekendRate: weekend ? toMinor(weekend, cur) : null, cleaningFee: cleaning ? toMinor(cleaning, cur) : 0 });
    toast.success(unit ? 'Unit updated' : `${u.name} added`);
    onClose();
  }
  return (
    <Modal open onClose={onClose} title={unit ? `Edit ${unit.name}` : 'Add unit'} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submit}>Save</Button></>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name" error={errors.name}><Input autoFocus value={u.name} onChange={(e) => setU({ ...u, name: e.target.value })} placeholder="e.g. River Room" /></Field>
          <Field label="Type"><Select value={u.type} onChange={(v) => setU({ ...u, type: v })} options={options(unitTypeLabel)} /></Field>
          <Field label="Sleeps" error={errors.capacity}><Input type="number" min={1} value={u.capacity} onChange={(e) => setU({ ...u, capacity: Number(e.target.value) })} /></Field>
          <Field label="Bedrooms"><Input type="number" min={0} value={u.bedrooms} onChange={(e) => setU({ ...u, bedrooms: Number(e.target.value) })} /></Field>
          <Field label="Nightly rate" error={errors.base}><MoneyInput value={base} onChange={setBase} /></Field>
          <Field label="Fri & Sat rate" hint="Blank = same as nightly"><MoneyInput value={weekend} onChange={setWeekend} /></Field>
          <Field label="Cleaning fee" hint="Per stay"><MoneyInput value={cleaning} onChange={setCleaning} /></Field>
        </div>
      </div>
    </Modal>
  );
}

export function RateRuleForm({ propertyId, rule, onClose }: { propertyId: ID; rule?: RateRule; onClose: () => void }) {
  const data = useData();
  const today = useToday();
  const cur = data.business.currency;
  const save = useStore((s) => s.saveRateRule);
  const [r, setR] = useState<RateRule>(() => rule ?? { id: uid('rate'), propertyId, unitId: null, name: '', kind: 'seasonal', startDate: today, endDate: addDaysISO(today, 14), mode: 'percent', value: 20, minNights: 1, active: true });
  const [fixed, setFixed] = useState(rule?.mode === 'fixed' ? String(toMajor(rule.value, cur)) : '');
  const [err, setErr] = useState<Record<string, string>>({});
  function submit() {
    const e: Record<string, string> = {};
    if (!r.name.trim()) e.name = 'Name this rule';
    if (r.endDate < r.startDate) e.dates = 'End date is before start date';
    if (r.mode === 'percent' && (r.value <= -100 || r.value > 500 || r.value === 0)) e.value = 'Between −99% and +500%, not zero';
    let value = r.value;
    if (r.mode === 'fixed') { const p = parseAmount(fixed, cur); if ('error' in p) e.value = p.error; else value = p.value; }
    if (Object.keys(e).length) return setErr(e);
    save({ ...r, name: r.name.trim(), value });
    toast.success('Pricing rule saved');
    onClose();
  }
  return (
    <Modal open onClose={onClose} title={rule ? 'Edit pricing rule' : 'New pricing rule'} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submit}>Save</Button></>}>
      <div className="space-y-4">
        <Field label="Name" error={err.name}><Input autoFocus value={r.name} onChange={(e) => setR({ ...r, name: e.target.value })} placeholder="e.g. Diwali peak, Monsoon offer" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Type"><Select value={r.kind} onChange={(v) => setR({ ...r, kind: v })} options={[{ value: 'seasonal', label: 'Seasonal rate' }, { value: 'special_offer', label: 'Special offer' }, { value: 'custom', label: 'Custom rate' }]} /></Field>
          <Field label="Applies to"><Select value={r.unitId ?? ''} onChange={(v) => setR({ ...r, unitId: v || null })} options={data.units.filter((u) => u.propertyId === propertyId).map((u) => ({ value: u.id, label: u.name }))} placeholder="All units" /></Field>
          <Field label="From (night of)" error={err.dates}><Input type="date" value={r.startDate} onChange={(e) => setR({ ...r, startDate: e.target.value })} /></Field>
          <Field label="To (night of)"><Input type="date" value={r.endDate} onChange={(e) => setR({ ...r, endDate: e.target.value })} /></Field>
        </div>
        <Segmented value={r.mode} onChange={(v) => setR({ ...r, mode: v, value: v === 'percent' ? 20 : r.value })} options={[{ value: 'percent', label: 'Adjust by %' }, { value: 'fixed', label: 'Fixed nightly price' }]} />
        <div className="grid grid-cols-2 gap-3">
          {r.mode === 'percent'
            ? <Field label="Adjustment %" hint="Negative for discounts, e.g. −15" error={err.value}><Input type="number" value={r.value} onChange={(e) => setR({ ...r, value: Number(e.target.value) })} /></Field>
            : <Field label="Nightly price" error={err.value}><MoneyInput value={fixed} onChange={setFixed} /></Field>}
          <Field label="Minimum nights" hint="Rule applies only to stays this long"><Input type="number" min={1} value={r.minNights} onChange={(e) => setR({ ...r, minNights: Math.max(1, Number(e.target.value)) })} /></Field>
        </div>
        <Switch checked={r.active} onChange={(v) => setR({ ...r, active: v })} label="Active" />
        <p className="text-[12px] text-subtle">When rules overlap, unit-specific rules win over property-wide ones, then custom › special offer › seasonal. Existing bookings keep the price they were booked at.</p>
      </div>
    </Modal>
  );
}

export function PropertyDocForm({ propertyId, doc, onClose }: { propertyId: ID; doc?: PropertyDocument; onClose: () => void }) {
  const save = useStore((s) => s.savePropertyDoc);
  const fileRef = useRef<HTMLInputElement>(null);
  const [d, setD] = useState<PropertyDocument>(() => doc ?? { id: uid('pdoc'), propertyId, name: '', category: 'license', fileName: '', fileDataUrl: null, expiresOn: null, notes: '', uploadedAt: new Date().toISOString() });
  const [err, setErr] = useState('');
  async function onFile(f?: File) {
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) return toast.error('Files must be under 10 MB');
    const url = f.type.startsWith('image/') ? await compressImage(f) : await readFileAsDataURL(f);
    setD((x) => ({ ...x, fileName: f.name, fileDataUrl: url, name: x.name || f.name.replace(/\.[^.]+$/, '') }));
  }
  return (
    <Modal open onClose={onClose} title={doc ? 'Edit document' : 'Add document'} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => { if (!d.name.trim()) return setErr('Name the document'); save({ ...d, name: d.name.trim() }); toast.success('Document saved'); onClose(); }}>Save</Button></>}>
      <div className="space-y-4">
        <button onClick={() => fileRef.current?.click()} className="w-full p-5 rounded-2xl border border-dashed border-border-strong text-center hover:border-fg/40 transition-colors">
          {d.fileName ? <span className="flex items-center justify-center gap-2 text-[13.5px]"><FileText className="h-4 w-4" />{d.fileName}</span> : <span className="flex flex-col items-center gap-1.5 text-[13px] text-muted"><Upload className="h-5 w-5" />Upload PDF or image</span>}
        </button>
        <input ref={fileRef} type="file" accept="application/pdf,image/*" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
        <Field label="Name" error={err}><Input value={d.name} onChange={(e) => { setD({ ...d, name: e.target.value }); setErr(''); }} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Category"><Select value={d.category} onChange={(v) => setD({ ...d, category: v })} options={options(docCategoryLabel)} /></Field>
          <Field label="Expires on" hint="You'll get a reminder"><Input type="date" value={d.expiresOn ?? ''} onChange={(e) => setD({ ...d, expiresOn: e.target.value || null })} /></Field>
        </div>
        <Field label="Notes"><Textarea rows={2} value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}
