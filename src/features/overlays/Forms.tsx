import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Camera, Copy, Mail, MessageCircle, Plus, Trash2, X } from 'lucide-react';
import { Drawer } from '@/components/ui/overlay';
import { Button, Checkbox, Field, Input, MoneyInput, Select, Switch, Textarea, Segmented } from '@/components/ui';
import { useStore } from '@/data/store';
import { useData, useLedgers, useToday } from '@/data/hooks';
import { uid } from '@/lib/id';
import { toMajor, toMinor } from '@/lib/money';
import { compressImage } from '@/lib/download';
import { checklist, DEFAULT_CLEANING_CHECKLIST } from '@/domain/automation';
import { priorityLabel, roleLabel, taskStatusLabel, taskTypeLabel, options } from '@/domain/labels';
import { mailtoLink, renderTemplate, whatsappLink } from '@/domain/templates';
import type { Attachment, Guest, ID, Priority, Task, TaskStatus, TaskType } from '@/domain/types';

// ── Guest ──────────────────────────────────────────────────────

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function GuestForm({ guestId, onCreated, onClose }: { guestId?: ID; onCreated?: (id: ID) => void; onClose: () => void }) {
  const existing = useStore((s) => s.data.guests.find((g) => g.id === guestId));
  const guests = useStore((s) => s.data.guests);
  const saveGuest = useStore((s) => s.saveGuest);
  const [g, setG] = useState<Guest>(() => existing ?? {
    id: uid('gst'), firstName: '', lastName: '', email: '', phone: '', country: 'India', city: '', idType: '', idNumberMasked: '',
    preferences: '', notes: '', tags: [], vip: false, marketingConsent: false, createdAt: new Date().toISOString(),
  });
  const [idInput, setIdInput] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = <K extends keyof Guest>(k: K, v: Guest[K]) => { setG((s) => ({ ...s, [k]: v })); setErrors((e) => ({ ...e, [k]: '' })); };

  const dupe = !existing && g.phone.replace(/\D/g, '').length >= 8 ? guests.find((x) => x.phone.replace(/\D/g, '').endsWith(g.phone.replace(/\D/g, '').slice(-10))) : undefined;

  function submit() {
    const e: Record<string, string> = {};
    if (!g.firstName.trim()) e.firstName = 'First name is required';
    if (g.email && !emailRe.test(g.email.trim())) e.email = 'Enter a valid email';
    if (g.phone && g.phone.replace(/\D/g, '').length < 7) e.phone = 'Enter a valid phone number';
    if (!g.email && !g.phone) e.phone = 'Add a phone number or email';
    if (Object.keys(e).length) { setErrors(e); return; }
    // Privacy: only the last four characters of an ID document are retained.
    const masked = idInput.trim() ? `•••• ${idInput.trim().slice(-4)}` : g.idNumberMasked;
    const guest = { ...g, firstName: g.firstName.trim(), lastName: g.lastName.trim(), email: g.email.trim().toLowerCase(), phone: g.phone.trim(), idNumberMasked: masked };
    saveGuest(guest);
    toast.success(existing ? 'Guest updated' : `${guest.firstName} added to guests`);
    onCreated?.(guest.id);
    onClose();
  }

  return (
    <Drawer open onClose={onClose} title={existing ? 'Edit guest' : 'New guest'} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submit}>{existing ? 'Save' : 'Add guest'}</Button></>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name" required error={errors.firstName}><Input autoFocus value={g.firstName} invalid={!!errors.firstName} onChange={(e) => set('firstName', e.target.value)} /></Field>
          <Field label="Last name"><Input value={g.lastName} onChange={(e) => set('lastName', e.target.value)} /></Field>
        </div>
        <Field label="Phone / WhatsApp" error={errors.phone} hint={dupe ? `Looks like ${dupe.firstName} ${dupe.lastName} already has this number` : 'Include country code, e.g. +91'}>
          <Input type="tel" value={g.phone} invalid={!!errors.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+91 98xxx xxxxx" />
        </Field>
        <Field label="Email" error={errors.email}><Input type="email" value={g.email} invalid={!!errors.email} onChange={(e) => set('email', e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="City"><Input value={g.city} onChange={(e) => set('city', e.target.value)} /></Field>
          <Field label="Country"><Input value={g.country} onChange={(e) => set('country', e.target.value)} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="ID type"><Select value={g.idType} onChange={(v) => set('idType', v)} placeholder="—" options={['Aadhaar', 'Passport', 'Driving licence', 'Voter ID', 'Other'].map((v) => ({ value: v, label: v }))} /></Field>
          <Field label="ID number" hint={g.idNumberMasked ? `On file: ${g.idNumberMasked}` : 'Only the last 4 digits are stored'}><Input value={idInput} onChange={(e) => setIdInput(e.target.value)} placeholder="Optional" autoComplete="off" /></Field>
        </div>
        <Field label="Preferences"><Textarea rows={2} value={g.preferences} onChange={(e) => set('preferences', e.target.value)} placeholder="Dietary needs, room preferences, allergies…" /></Field>
        <Field label="Private notes" hint="Visible to you and managers only"><Textarea rows={2} value={g.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
        <Field label="Tags">
          <div className="flex flex-wrap gap-1.5 items-center">
            {g.tags.map((t) => <span key={t} className="inline-flex items-center gap-1 h-7 pl-2.5 pr-1 rounded-lg bg-surface-2 border border-border text-[12.5px]">{t}<button onClick={() => set('tags', g.tags.filter((x) => x !== t))} className="p-0.5 text-subtle hover:text-fg"><X className="h-3 w-3" /></button></span>)}
            <Input className="!h-8 !w-36" value={tagInput} placeholder="Add tag ↵" onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && tagInput.trim()) { e.preventDefault(); if (!g.tags.includes(tagInput.trim())) set('tags', [...g.tags, tagInput.trim()]); setTagInput(''); } }} />
          </div>
        </Field>
        <div className="space-y-3 pt-1">
          <Switch checked={g.vip} onChange={(v) => set('vip', v)} label="VIP guest" description="Highlight on arrivals and in search" />
          <Switch checked={g.marketingConsent} onChange={(v) => set('marketingConsent', v)} label="Consents to offers & updates" description="Required before sending promotional messages" />
        </div>
      </div>
    </Drawer>
  );
}

// ── Task ───────────────────────────────────────────────────────

export function TaskForm({ taskId, propertyId, unitId, type, onClose }: { taskId?: ID; propertyId?: ID; unitId?: ID; type?: TaskType; onClose: () => void }) {
  const data = useData();
  const today = useToday();
  const saveTask = useStore((s) => s.saveTask);
  const linkTaskExpense = useStore((s) => s.linkTaskExpense);
  const existing = taskId ? data.tasks.find((t) => t.id === taskId) : undefined;
  const cur = data.business.currency;
  const fileRef = useRef<HTMLInputElement>(null);
  const [t, setT] = useState<Task>(() => existing ?? {
    id: uid('task'), type: type ?? 'maintenance', title: '', propertyId: propertyId ?? data.properties[0]?.id ?? '', unitId: unitId ?? null, bookingId: null,
    assigneeId: null, dueDate: today, dueTime: '', priority: type === 'cleaning' ? 'medium' : 'medium', status: 'todo',
    checklist: type === 'cleaning' ? checklist(DEFAULT_CLEANING_CHECKLIST) : [], notes: '', photos: [], cost: 0, expenseId: null, auto: false,
    createdAt: new Date().toISOString(), completedAt: null,
  });
  const [cost, setCost] = useState(existing?.cost ? String(toMajor(existing.cost, cur)) : '');
  const [newItem, setNewItem] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = <K extends keyof Task>(k: K, v: Task[K]) => { setT((s) => ({ ...s, [k]: v })); setErrors((e) => ({ ...e, [k]: '' })); };
  const units = data.units.filter((u) => u.propertyId === t.propertyId && !u.archived);
  const staff = data.staff.filter((s) => s.status !== 'disabled' && (s.propertyIds.length === 0 || s.propertyIds.includes(t.propertyId)));

  async function addPhotos(files: FileList | null) {
    if (!files) return;
    const out: Attachment[] = [];
    for (const f of Array.from(files).slice(0, 6)) {
      const dataUrl = await compressImage(f, 1280, 0.78);
      out.push({ id: uid('att'), name: f.name, type: 'image/jpeg', dataUrl, size: dataUrl.length });
    }
    set('photos', [...t.photos, ...out]);
  }

  function submit(linkExpense = false) {
    const e: Record<string, string> = {};
    if (!t.title.trim()) e.title = 'Describe the task';
    if (!t.propertyId) e.propertyId = 'Choose a property';
    if (!t.dueDate) e.dueDate = 'Choose a due date';
    if (cost && !/^\d+(\.\d{1,2})?$/.test(cost)) e.cost = 'Enter a valid amount';
    if (Object.keys(e).length) { setErrors(e); return; }
    const task: Task = { ...t, title: t.title.trim(), cost: cost ? toMinor(cost, cur) : 0, completedAt: t.status === 'done' ? t.completedAt ?? new Date().toISOString() : null };
    saveTask(task);
    if (linkExpense) {
      const r = linkTaskExpense(task.id);
      if (!r.ok) { toast.error(r.error); return; }
      toast.success('Repair cost added to expenses');
    } else toast.success(existing ? 'Task updated' : 'Task created');
    onClose();
  }

  return (
    <Drawer open onClose={onClose} title={existing ? 'Edit task' : t.type === 'maintenance' ? 'New maintenance request' : 'New task'}
      footer={<>
        {existing && t.cost > 0 && !t.expenseId && <Button variant="soft" className="mr-auto" onClick={() => submit(true)}>Save & record expense</Button>}
        <Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => submit()}>{existing ? 'Save' : 'Create task'}</Button>
      </>}>
      <div className="space-y-4">
        <Segmented value={t.type} onChange={(v) => { set('type', v); if (v === 'cleaning' && !t.checklist.length) set('checklist', checklist(DEFAULT_CLEANING_CHECKLIST)); }} options={options(taskTypeLabel)} />
        <Field label="Title" required error={errors.title}><Input autoFocus value={t.title} invalid={!!errors.title} onChange={(e) => set('title', e.target.value)} placeholder={t.type === 'maintenance' ? 'e.g. Leaking tap in River Room' : 'e.g. Deep clean before Diwali'} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Property" required error={errors.propertyId}><Select value={t.propertyId} onChange={(v) => { set('propertyId', v); set('unitId', null); }} options={data.properties.map((p) => ({ value: p.id, label: p.name }))} /></Field>
          <Field label="Unit"><Select value={t.unitId ?? ''} onChange={(v) => set('unitId', v || null)} options={units.map((u) => ({ value: u.id, label: u.name }))} placeholder="Whole property" /></Field>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Field label="Due" error={errors.dueDate} className="col-span-1"><Input type="date" value={t.dueDate} onChange={(e) => set('dueDate', e.target.value)} /></Field>
          <Field label="By"><Input type="time" value={t.dueTime} onChange={(e) => set('dueTime', e.target.value)} /></Field>
          <Field label="Priority"><Select value={t.priority} onChange={(v) => set('priority', v as Priority)} options={options(priorityLabel)} /></Field>
          <Field label="Status"><Select value={t.status} onChange={(v) => set('status', v as TaskStatus)} options={options(taskStatusLabel)} /></Field>
        </div>
        <Field label="Assign to"><Select value={t.assigneeId ?? ''} onChange={(v) => set('assigneeId', v || null)} options={staff.map((s) => ({ value: s.id, label: `${s.name} · ${roleLabel[s.role]}` }))} placeholder="Unassigned" /></Field>

        <div>
          <div className="label mb-2">Checklist</div>
          <div className="space-y-1.5">
            {t.checklist.map((c) => (
              <div key={c.id} className="flex items-center gap-2 group">
                <Checkbox checked={c.done} onChange={(v) => set('checklist', t.checklist.map((x) => (x.id === c.id ? { ...x, done: v } : x)))} label={c.label} className="flex-1" />
                <button className="opacity-0 group-hover:opacity-100 p-1 text-subtle hover:text-danger" onClick={() => set('checklist', t.checklist.filter((x) => x.id !== c.id))} aria-label="Remove"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-2">
            <Input value={newItem} onChange={(e) => setNewItem(e.target.value)} placeholder="Add checklist item" onKeyDown={(e) => { if (e.key === 'Enter' && newItem.trim()) { set('checklist', [...t.checklist, { id: uid('ck'), label: newItem.trim(), done: false }]); setNewItem(''); } }} />
            <Button size="icon" onClick={() => { if (newItem.trim()) { set('checklist', [...t.checklist, { id: uid('ck'), label: newItem.trim(), done: false }]); setNewItem(''); } }} aria-label="Add"><Plus className="h-4 w-4" /></Button>
          </div>
        </div>

        <Field label="Notes"><Textarea rows={3} value={t.notes} onChange={(e) => set('notes', e.target.value)} /></Field>

        <div>
          <div className="flex items-center justify-between"><span className="label">Photos</span><Button size="sm" variant="ghost" icon={<Camera className="h-3.5 w-3.5" />} onClick={() => fileRef.current?.click()}>Add photos</Button></div>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple hidden onChange={(e) => { addPhotos(e.target.files); e.target.value = ''; }} />
          {t.photos.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{t.photos.map((p) => (
            <div key={p.id} className="relative group h-20 w-20 rounded-xl overflow-hidden border border-border">
              <img src={p.dataUrl} alt="" className="h-full w-full object-cover" />
              <button onClick={() => set('photos', t.photos.filter((x) => x.id !== p.id))} className="absolute top-1 right-1 h-5 w-5 grid place-items-center rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100"><X className="h-3 w-3" /></button>
            </div>
          ))}</div>}
        </div>

        {t.type !== 'cleaning' && (
          <Field label="Repair / job cost" error={errors.cost} hint={t.expenseId ? 'Linked to an expense in Finances' : 'Record it as an expense once paid'}>
            <MoneyInput value={cost} onChange={setCost} disabled={!!t.expenseId} />
          </Field>
        )}
      </div>
    </Drawer>
  );
}

// ── Guest message composer ─────────────────────────────────────

export function MessageComposer({ bookingId, guestId, templateId, onClose }: { bookingId?: ID; guestId?: ID; templateId?: ID; onClose: () => void }) {
  const data = useData();
  const ledgers = useLedgers();
  const booking = bookingId ? data.bookings.find((b) => b.id === bookingId) : undefined;
  const guest = data.guests.find((g) => g.id === (booking?.guestId ?? guestId));
  const property = booking ? data.properties.find((p) => p.id === booking.propertyId) : undefined;
  const unit = booking ? data.units.find((u) => u.id === booking.unitId) : undefined;
  const led = booking ? ledgers.get(booking.id) : undefined;
  const [tplId, setTplId] = useState(templateId ?? data.templates[0]?.id ?? '');
  const tpl = data.templates.find((t) => t.id === tplId);
  const rendered = useMemo(() => tpl ? renderTemplate(tpl.body, { guest, booking, property, unit, business: data.business, balance: led?.balance, total: led?.totals.total }) : '', [tpl, guest, booking, property, unit, data.business, led]);
  const [body, setBody] = useState<string | null>(null);
  const text = body ?? rendered;
  const subject = tpl ? renderTemplate(tpl.subject, { guest, booking, property, unit, business: data.business }) : '';
  if (!guest) return null;
  return (
    <Drawer open onClose={onClose} title={`Message ${guest.firstName}`} subtitle={[guest.phone, guest.email].filter(Boolean).join(' · ')}
      footer={<>
        <Button icon={<Copy className="h-4 w-4" />} onClick={async () => { try { await navigator.clipboard.writeText(text); toast.success('Copied'); } catch { toast.error('Copy failed'); } }}>Copy</Button>
        {guest.email && <a href={mailtoLink(guest.email, subject, text)}><Button icon={<Mail className="h-4 w-4" />}>Email</Button></a>}
        {guest.phone && <a href={whatsappLink(guest.phone, text)} target="_blank" rel="noreferrer"><Button variant="primary" icon={<MessageCircle className="h-4 w-4" />}>WhatsApp</Button></a>}
      </>}>
      <div className="space-y-4">
        <Field label="Template"><Select value={tplId} onChange={(v) => { setTplId(v); setBody(null); }} options={data.templates.map((t) => ({ value: t.id, label: t.name }))} /></Field>
        <Field label="Message" hint="Edit freely before sending — templates live in Settings → Messages"><Textarea rows={12} value={text} onChange={(e) => setBody(e.target.value)} /></Field>
      </div>
    </Drawer>
  );
}
