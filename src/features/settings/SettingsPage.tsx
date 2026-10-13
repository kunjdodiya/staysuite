import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Building, Receipt, Globe, Users, MessageSquare, Bell, Plug, Database, History, ImagePlus, Plus, Pencil, Trash2, MoreHorizontal, Download, Upload,
  RotateCcw, Check, X, Mail, Smartphone, Lock, Sun, Moon, Monitor, CalendarClock, CreditCard, BookOpen, UserX, UserCheck, Eye,
} from 'lucide-react';
import { PageHeader, Button, Card, CardHeader, Field, Input, Select, Textarea, Switch, Badge, Avatar, EmptyState, Segmented } from '@/components/ui';
import { Menu, Modal, useConfirm } from '@/components/ui/overlay';
import { useCan, useCurrentUser, useData, useLookup, useToday } from '@/data/hooks';
import { useStore } from '@/data/store';
import { listBackups, loadBackup } from '@/data/persistence';
import { useTheme } from '@/lib/theme';
import { compressImage, downloadBlob } from '@/lib/download';
import { uid } from '@/lib/id';
import { fmtDate } from '@/lib/dates';
import { ROLE_CAPS, ROLE_SUMMARY, type Capability } from '@/domain/permissions';
import { roleLabel, options } from '@/domain/labels';
import { TEMPLATE_VARS } from '@/domain/templates';
import { formatDocNumber } from '@/domain/documents';
import type { BusinessSettings, MessageTemplate, Role, StaffMember } from '@/domain/types';
import { cn } from '@/lib/cn';
import { isNative } from '@/native';
import { nativeNotificationPermission } from '@/native/reminders';

type Section = 'business' | 'invoicing' | 'locale' | 'team' | 'messages' | 'notifications' | 'integrations' | 'data' | 'activity';

export default function SettingsPage() {
  const [params, setParams] = useSearchParams();
  const canSettings = useCan('settings.manage');
  const canStaff = useCan('staff.manage');
  const canData = useCan('data.manage');
  const sections: { value: Section; label: string; icon: JSX.Element; show: boolean }[] = [
    { value: 'business', label: 'Business & branding', icon: <Building />, show: canSettings },
    { value: 'invoicing', label: 'Invoices & tax', icon: <Receipt />, show: canSettings },
    { value: 'locale', label: 'Currency & region', icon: <Globe />, show: canSettings },
    { value: 'team', label: 'Team & access', icon: <Users />, show: canStaff || canSettings },
    { value: 'messages', label: 'Message templates', icon: <MessageSquare />, show: canSettings },
    { value: 'notifications', label: 'Notifications & display', icon: <Bell />, show: true },
    { value: 'integrations', label: 'Integrations', icon: <Plug />, show: canSettings },
    { value: 'data', label: 'Data & backups', icon: <Database />, show: canData },
    { value: 'activity', label: 'Activity log', icon: <History />, show: canSettings },
  ];
  const visible = sections.filter((s) => s.show);
  const section = (visible.find((s) => s.value === params.get('s'))?.value ?? visible[0].value) as Section;
  return (
    <div>
      <PageHeader title="Settings" subtitle="Your business, team and preferences" />
      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-5">
        <nav className="flex lg:flex-col gap-1 overflow-x-auto -mx-4 px-4 lg:mx-0 lg:px-0 pb-1">
          {visible.map((s) => (
            <button key={s.value} onClick={() => setParams({ s: s.value })} className={cn('flex items-center gap-2.5 h-9 px-3 rounded-xl text-[13.5px] font-medium whitespace-nowrap transition-colors [&>svg]:h-4 [&>svg]:w-4',
              section === s.value ? 'bg-surface border border-border shadow-card text-fg' : 'text-muted hover:text-fg hover:bg-surface-2 border border-transparent')}>
              {s.icon}{s.label}
            </button>
          ))}
        </nav>
        <div className="min-w-0 space-y-5 animate-fade-in" key={section}>
          {section === 'business' && <BusinessSection />}
          {section === 'invoicing' && <InvoicingSection />}
          {section === 'locale' && <LocaleSection />}
          {section === 'team' && <TeamSection />}
          {section === 'messages' && <MessagesSection />}
          {section === 'notifications' && <NotificationsSection />}
          {section === 'integrations' && <IntegrationsSection />}
          {section === 'data' && <DataSection />}
          {section === 'activity' && <ActivitySection />}
        </div>
      </div>
    </div>
  );
}

/** Local draft of business settings with explicit save, so half-typed values never leak into documents. */
function useBusinessDraft() {
  const business = useStore((s) => s.data.business);
  const update = useStore((s) => s.updateBusiness);
  const [draft, setDraft] = useState<BusinessSettings>(business);
  useEffect(() => setDraft(business), [business]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(business);
  const set = <K extends keyof BusinessSettings>(k: K, v: BusinessSettings[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const save = (validate?: () => string | null) => {
    const err = validate?.();
    if (err) return toast.error(err);
    update(draft);
    toast.success('Settings saved');
  };
  return { draft, set, setDraft, dirty, save, reset: () => setDraft(business) };
}

function SaveBar({ dirty, onSave, onReset }: { dirty: boolean; onSave: () => void; onReset: () => void }) {
  if (!dirty) return null;
  return (
    <div className="sticky bottom-20 md:bottom-4 z-10 flex items-center justify-between gap-3 p-3 pl-4 rounded-2xl bg-fg text-bg shadow-pop animate-rise-in">
      <span className="text-[13.5px]">You have unsaved changes</span>
      <div className="flex gap-2"><Button size="sm" variant="ghost" className="!text-bg/80 hover:!bg-bg/10" onClick={onReset}>Discard</Button><Button size="sm" className="!bg-bg !text-fg !border-transparent" onClick={onSave}>Save changes</Button></div>
    </div>
  );
}

function BusinessSection() {
  const { draft, set, dirty, save, reset } = useBusinessDraft();
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <Card>
        <CardHeader title="Business details" subtitle="Shown on invoices, receipts and guest messages" />
        <div className="px-5 pb-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Business name" required><Input value={draft.name} onChange={(e) => set('name', e.target.value)} /></Field>
          <Field label="Legal / registered name"><Input value={draft.legalName} onChange={(e) => set('legalName', e.target.value)} /></Field>
          <Field label="Email"><Input type="email" value={draft.email} onChange={(e) => set('email', e.target.value)} /></Field>
          <Field label="Phone"><Input value={draft.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
          <Field label="Address" className="sm:col-span-2"><Textarea rows={2} value={draft.address} onChange={(e) => set('address', e.target.value)} /></Field>
          <Field label="Website"><Input value={draft.website} onChange={(e) => set('website', e.target.value)} /></Field>
        </div>
      </Card>
      <Card>
        <CardHeader title="Branding" subtitle="Logo and accent colour for your documents" />
        <div className="px-5 pb-5 flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-2xl border border-border bg-surface-2 overflow-hidden grid place-items-center">
              {draft.logoDataUrl ? <img src={draft.logoDataUrl} alt="Logo" className="h-full w-full object-cover" /> : <ImagePlus className="h-5 w-5 text-subtle" />}
            </div>
            <div className="flex flex-col gap-1.5">
              <Button size="sm" onClick={() => fileRef.current?.click()}>{draft.logoDataUrl ? 'Replace logo' : 'Upload logo'}</Button>
              {draft.logoDataUrl && <Button size="sm" variant="ghost" onClick={() => set('logoDataUrl', null)}>Remove</Button>}
            </div>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) set('logoDataUrl', await compressImage(f, 400, 0.9)); e.target.value = ''; }} />
          </div>
          <Field label="Document colour">
            <div className="flex items-center gap-2">
              {['#0f766e', '#1d4ed8', '#7c3aed', '#be123c', '#b45309', '#111827'].map((c) => <button key={c} onClick={() => set('brandColor', c)} className={cn('h-8 w-8 rounded-full', draft.brandColor === c && 'ring-2 ring-offset-2 ring-offset-surface ring-fg')} style={{ background: c }} aria-label={c} />)}
              <input type="color" value={draft.brandColor} onChange={(e) => set('brandColor', e.target.value)} className="h-8 w-10 rounded-lg border border-border bg-transparent cursor-pointer" />
            </div>
          </Field>
        </div>
      </Card>
      <SaveBar dirty={dirty} onReset={reset} onSave={() => save(() => (!draft.name.trim() ? 'Business name is required' : null))} />
    </>
  );
}

function InvoicingSection() {
  const { draft, set, dirty, save, reset } = useBusinessDraft();
  const today = useToday();
  return (
    <>
      <Card>
        <CardHeader title="Tax" subtitle="Applied to new bookings. Existing bookings keep the rate they were made with." />
        <div className="px-5 pb-5 space-y-4">
          <Switch checked={draft.tax.enabled} onChange={(v) => set('tax', { ...draft.tax, enabled: v })} label="Charge tax on stays" description="e.g. GST, VAT or occupancy tax" />
          {draft.tax.enabled && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label="Tax name"><Input value={draft.tax.label} onChange={(e) => set('tax', { ...draft.tax, label: e.target.value })} /></Field>
              <Field label="Rate %"><Input type="number" min={0} max={50} step={0.5} value={draft.tax.rate} onChange={(e) => set('tax', { ...draft.tax, rate: Number(e.target.value) })} /></Field>
              <Field label="Registration no."><Input value={draft.tax.registrationNo} onChange={(e) => set('tax', { ...draft.tax, registrationNo: e.target.value.toUpperCase() })} /></Field>
              <div className="sm:col-span-3"><Switch checked={draft.tax.inclusive} onChange={(v) => set('tax', { ...draft.tax, inclusive: v })} label="My prices already include tax" description="Tax is extracted from the price instead of added on top" /></div>
            </div>
          )}
        </div>
      </Card>
      <Card>
        <CardHeader title="Numbering" subtitle="Sequential numbers are assigned automatically and never reused" />
        <div className="px-5 pb-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Invoice prefix" hint={`Next: ${formatDocNumber('invoice', draft.counters.invoice + 1, draft, today)}`}><Input value={draft.invoicePrefix} maxLength={8} onChange={(e) => set('invoicePrefix', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} /></Field>
          <Field label="Receipt prefix" hint={`Next: ${formatDocNumber('receipt', draft.counters.receipt + 1, draft, today)}`}><Input value={draft.receiptPrefix} maxLength={8} onChange={(e) => set('receiptPrefix', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} /></Field>
        </div>
      </Card>
      <Card>
        <CardHeader title="Document text" />
        <div className="px-5 pb-5 space-y-4">
          <Field label="Payment instructions" hint="Shown when a balance is due — UPI ID, bank details"><Textarea rows={2} value={draft.paymentInstructions} onChange={(e) => set('paymentInstructions', e.target.value)} /></Field>
          <Field label="Footer note"><Textarea rows={2} value={draft.documentFooter} onChange={(e) => set('documentFooter', e.target.value)} /></Field>
        </div>
      </Card>
      <SaveBar dirty={dirty} onReset={reset} onSave={() => save(() => (draft.tax.rate < 0 || draft.tax.rate > 50 ? 'Tax rate must be between 0 and 50%' : !draft.invoicePrefix || !draft.receiptPrefix ? 'Prefixes cannot be empty' : null))} />
    </>
  );
}

const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AUD', 'CAD', 'SGD', 'AED', 'THB', 'IDR', 'LKR', 'NPR', 'JPY', 'ZAR'];
const LOCALES = [['en-IN', 'English (India)'], ['en-US', 'English (US)'], ['en-GB', 'English (UK)'], ['en-AU', 'English (Australia)'], ['de-DE', 'Deutsch'], ['fr-FR', 'Français'], ['es-ES', 'Español'], ['hi-IN', 'हिन्दी']];

function LocaleSection() {
  const { draft, set, dirty, save, reset } = useBusinessDraft();
  const zones = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? ['Asia/Kolkata', 'UTC', 'Europe/London', 'America/New_York'];
  const sample = new Intl.NumberFormat(draft.locale, { style: 'currency', currency: draft.currency }).format(124500.5);
  const hasMoney = useStore((s) => s.data.transactions.length > 0);
  return (
    <>
      <Card>
        <CardHeader title="Currency & region" subtitle={`Preview: ${sample} · ${new Date().toLocaleDateString(draft.locale, { dateStyle: 'long' })}`} />
        <div className="px-5 pb-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Currency" hint={hasMoney && draft.currency !== useStore.getState().data.business.currency ? 'Existing amounts are not converted — only the symbol changes' : undefined}>
            <Select value={draft.currency} onChange={(v) => set('currency', v)} options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
          </Field>
          <Field label="Number & date format"><Select value={draft.locale} onChange={(v) => set('locale', v)} options={LOCALES.map(([v, l]) => ({ value: v, label: l }))} /></Field>
          <Field label="Time zone" hint="Decides what “today” means for arrivals and reports"><Select value={draft.timeZone} onChange={(v) => set('timeZone', v)} options={zones.map((z) => ({ value: z, label: z.replace(/_/g, ' ') }))} /></Field>
          <Field label="Week starts on"><Select value={String(draft.weekStartsOn)} onChange={(v) => set('weekStartsOn', Number(v) as 0 | 1)} options={[{ value: '1', label: 'Monday' }, { value: '0', label: 'Sunday' }]} /></Field>
        </div>
      </Card>
      <SaveBar dirty={dirty} onReset={reset} onSave={() => save()} />
    </>
  );
}

const CAP_GROUPS: { label: string; caps: Capability[] }[] = [
  { label: 'Bookings & calendar', caps: ['bookings.view', 'bookings.edit'] },
  { label: 'Guest contact details', caps: ['guests.pii'] },
  { label: 'Finances', caps: ['finance.view', 'finance.edit'] },
  { label: 'Receipts & invoices', caps: ['documents.issue'] },
  { label: 'Reports', caps: ['reports.view'] },
  { label: 'Tasks', caps: ['tasks.view', 'tasks.edit'] },
  { label: 'Properties & pricing', caps: ['properties.edit'] },
  { label: 'Staff management', caps: ['staff.manage'] },
];

function TeamSection() {
  const data = useData();
  const me = useCurrentUser();
  const canStaff = useCan('staff.manage');
  const save = useStore((s) => s.saveStaff);
  const del = useStore((s) => s.deleteStaff);
  const setCurrentUser = useStore((s) => s.setCurrentUser);
  const confirm = useConfirm();
  const [editing, setEditing] = useState<StaffMember | null>(null);
  const roles: Role[] = ['owner', 'manager', 'accountant', 'caretaker', 'cleaner'];
  return (
    <>
      <Card>
        <CardHeader title="Team" subtitle="Invite cleaners, caretakers, managers and your accountant" action={canStaff && <Button size="sm" variant="primary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setEditing({ id: uid('usr'), name: '', email: '', phone: '', role: 'cleaner', propertyIds: [], status: 'invited', invitedAt: new Date().toISOString(), color: 's1' })}>Invite</Button>} />
        <div className="divide-y divide-border border-t border-border">
          {data.staff.map((s) => (
            <div key={s.id} className={cn('flex flex-wrap sm:flex-nowrap items-center gap-3 px-5 py-3', s.status === 'disabled' && 'opacity-50')}>
              <Avatar name={s.name} size={36} />
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] font-medium flex items-center gap-2">{s.name}{s.id === me.id && <Badge>You</Badge>}{s.status === 'invited' && <Badge tone="warning">Invite pending</Badge>}{s.status === 'disabled' && <Badge tone="danger">Disabled</Badge>}</div>
                <div className="text-[12px] text-muted truncate">{s.email} · {s.propertyIds.length ? s.propertyIds.map((id) => data.properties.find((p) => p.id === id)?.name).filter(Boolean).join(', ') : 'All properties'}</div>
              </div>
              <Badge tone={s.role === 'owner' ? 'accent' : 'neutral'}>{roleLabel[s.role]}</Badge>
              {canStaff && (
                <Menu trigger={({ onClick }) => <Button size="icon-sm" variant="ghost" onClick={onClick}><MoreHorizontal className="h-4 w-4" /></Button>} items={[
                  { label: 'Edit role & access', icon: <Pencil />, onClick: () => setEditing(s) },
                  { label: 'Preview their view', icon: <Eye />, onClick: () => setCurrentUser(s.id), hidden: s.id === me.id },
                  { label: 'Resend invite', icon: <Mail />, onClick: () => { window.location.href = `mailto:${s.email}?subject=${encodeURIComponent(`Join ${data.business.name} on StaySuite`)}&body=${encodeURIComponent(`Hi ${s.name.split(' ')[0]}, you've been invited to help manage ${data.business.name} as ${roleLabel[s.role]}.`)}`; }, hidden: s.status !== 'invited' },
                  { label: s.status === 'disabled' ? 'Re-enable access' : 'Disable access', icon: s.status === 'disabled' ? <UserCheck /> : <UserX />, onClick: () => save({ ...s, status: s.status === 'disabled' ? 'active' : 'disabled' }), hidden: s.id === me.id },
                  { label: 'Remove', icon: <Trash2 />, danger: true, hidden: s.id === me.id, onClick: async () => { if (await confirm({ title: `Remove ${s.name}?`, body: 'Their tasks become unassigned. Activity history is kept.', danger: true, confirmLabel: 'Remove' })) { const r = del(s.id); if (!r.ok) toast.error(r.error); } } },
                ]} />
              )}
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <CardHeader title="What each role can do" subtitle="Staff only see the properties they're assigned to" />
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead><tr className="border-y border-border bg-surface-2/40 text-[12px] text-muted"><th className="text-left font-medium py-2.5 pl-5">Permission</th>{roles.map((r) => <th key={r} className="font-medium px-3">{roleLabel[r]}</th>)}</tr></thead>
            <tbody>
              {CAP_GROUPS.map((g) => (
                <tr key={g.label} className="border-b border-border/70">
                  <td className="py-2.5 pl-5">{g.label}</td>
                  {roles.map((r) => {
                    const has = g.caps.filter((c) => ROLE_CAPS[r].includes(c)).length;
                    return <td key={r} className="text-center px-3">{has === g.caps.length ? <Check className="h-4 w-4 text-success inline" /> : has ? <span className="text-[11px] text-muted">view</span> : <X className="h-3.5 w-3.5 text-subtle inline" />}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      {editing && <StaffModal value={editing} onClose={() => setEditing(null)} onSave={(s) => { save(s); setEditing(null); toast.success(data.staff.some((x) => x.id === s.id) ? 'Access updated' : `Invite ready for ${s.name}`, { description: data.staff.some((x) => x.id === s.id) ? undefined : 'They will get access once they accept the invite' }); }} />}
    </>
  );
}

function StaffModal({ value, onClose, onSave }: { value: StaffMember; onClose: () => void; onSave: (s: StaffMember) => void }) {
  const properties = useStore((s) => s.data.properties);
  const [s, setS] = useState(value);
  const [err, setErr] = useState<Record<string, string>>({});
  const submit = () => {
    const e: Record<string, string> = {};
    if (!s.name.trim()) e.name = 'Name is required';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.email.trim())) e.email = 'Enter a valid email';
    if (Object.keys(e).length) return setErr(e);
    onSave({ ...s, name: s.name.trim(), email: s.email.trim().toLowerCase(), propertyIds: s.role === 'owner' ? [] : s.propertyIds });
  };
  return (
    <Modal open onClose={onClose} title={value.name ? `Edit ${value.name}` : 'Invite team member'} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submit}>{value.name ? 'Save' : 'Send invite'}</Button></>}>
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Name" error={err.name}><Input autoFocus value={s.name} onChange={(e) => setS({ ...s, name: e.target.value })} /></Field>
          <Field label="Email" error={err.email}><Input type="email" value={s.email} onChange={(e) => setS({ ...s, email: e.target.value })} /></Field>
          <Field label="Phone"><Input value={s.phone} onChange={(e) => setS({ ...s, phone: e.target.value })} /></Field>
          <Field label="Role"><Select value={s.role} onChange={(v) => setS({ ...s, role: v })} options={options(roleLabel)} /></Field>
        </div>
        <p className="text-[12.5px] text-muted p-3 rounded-xl bg-surface-2/60 flex gap-2"><Lock className="h-4 w-4 shrink-0 mt-0.5" />{ROLE_SUMMARY[s.role]}</p>
        {s.role !== 'owner' && (
          <Field label="Property access" hint="Leave all unticked to give access to every property">
            <div className="flex flex-wrap gap-1.5">
              {properties.map((p) => {
                const on = s.propertyIds.includes(p.id);
                return <button key={p.id} onClick={() => setS({ ...s, propertyIds: on ? s.propertyIds.filter((x) => x !== p.id) : [...s.propertyIds, p.id] })} className={cn('h-8 px-3 rounded-lg text-[12.5px] border', on ? 'bg-accent-soft text-accent border-accent/30 font-medium' : 'border-border text-muted')}>{p.name}</button>;
              })}
            </div>
          </Field>
        )}
      </div>
    </Modal>
  );
}

function MessagesSection() {
  const templates = useStore((s) => s.data.templates);
  const save = useStore((s) => s.saveTemplate);
  const del = useStore((s) => s.deleteTemplate);
  const [editing, setEditing] = useState<MessageTemplate | null>(null);
  return (
    <Card>
      <CardHeader title="Message templates" subtitle="Reusable WhatsApp & email messages with guest details filled in" action={<Button size="sm" variant="primary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setEditing({ id: uid('tpl'), name: '', trigger: 'custom', channel: 'whatsapp', subject: '', body: '' })}>Template</Button>} />
      <div className="divide-y divide-border border-t border-border">
        {templates.map((t) => (
          <div key={t.id} className="flex items-start gap-3 px-5 py-3.5">
            <span className="h-8 w-8 rounded-lg bg-surface-2 border border-border grid place-items-center shrink-0">{t.channel === 'email' ? <Mail className="h-4 w-4 text-muted" /> : <Smartphone className="h-4 w-4 text-muted" />}</span>
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] font-medium">{t.name}</div>
              <div className="text-[12.5px] text-muted line-clamp-2 whitespace-pre-line">{t.body}</div>
            </div>
            <Menu trigger={({ onClick }) => <Button size="icon-sm" variant="ghost" onClick={onClick}><MoreHorizontal className="h-4 w-4" /></Button>} items={[{ label: 'Edit', icon: <Pencil />, onClick: () => setEditing(t) }, { label: 'Delete', icon: <Trash2 />, danger: true, onClick: () => del(t.id) }]} />
          </div>
        ))}
      </div>
      {editing && (
        <Modal open size="lg" onClose={() => setEditing(null)} title={editing.name ? `Edit “${editing.name}”` : 'New template'} footer={<><Button onClick={() => setEditing(null)}>Cancel</Button><Button variant="primary" onClick={() => { if (!editing.name.trim() || !editing.body.trim()) return toast.error('Name and message are required'); save(editing); setEditing(null); toast.success('Template saved'); }}>Save</Button></>}>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Name" className="sm:col-span-2"><Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></Field>
              <Field label="Channel"><Select value={editing.channel} onChange={(v) => setEditing({ ...editing, channel: v })} options={[{ value: 'whatsapp', label: 'WhatsApp' }, { value: 'email', label: 'Email' }, { value: 'sms', label: 'SMS' }]} /></Field>
            </div>
            {editing.channel === 'email' && <Field label="Subject"><Input value={editing.subject} onChange={(e) => setEditing({ ...editing, subject: e.target.value })} /></Field>}
            <Field label="Message"><Textarea rows={8} value={editing.body} onChange={(e) => setEditing({ ...editing, body: e.target.value })} /></Field>
            <div>
              <div className="text-[12px] text-muted mb-1.5">Insert a detail</div>
              <div className="flex flex-wrap gap-1">{TEMPLATE_VARS.map((v) => <button key={v} onClick={() => setEditing({ ...editing, body: `${editing.body}{{${v}}}` })} className="text-[11.5px] px-2 py-1 rounded-md bg-surface-2 border border-border hover:border-border-strong font-mono">{v}</button>)}</div>
            </div>
          </div>
        </Modal>
      )}
    </Card>
  );
}

function NotificationsSection() {
  const canSettings = useCan('settings.manage');
  const prefs = useStore((s) => s.data.business.notificationPrefs);
  const update = useStore((s) => s.updateBusiness);
  const restore = useStore((s) => s.restoreAlerts);
  const [theme, setTheme] = useTheme();
  const set = (patch: Partial<typeof prefs>) => update({ notificationPrefs: { ...prefs, ...patch } });
  const [perm, setPerm] = useState<string>(isNative ? 'prompt' : typeof Notification !== 'undefined' ? Notification.permission : 'denied');
  useEffect(() => { if (isNative) nativeNotificationPermission().then(setPerm); }, []);
  return (
    <>
      <Card>
        <CardHeader title="Appearance" />
        <div className="px-5 pb-5">
          <Segmented value={theme} onChange={setTheme} options={[{ value: 'light', label: <><Sun className="h-3.5 w-3.5" />Light</> }, { value: 'dark', label: <><Moon className="h-3.5 w-3.5" />Dark</> }, { value: 'system', label: <><Monitor className="h-3.5 w-3.5" />System</> }]} />
        </div>
      </Card>
      <Card>
        <CardHeader title="Notifications" subtitle="What reaches you, and how" />
        <div className="px-5 pb-5 space-y-5">
          <Switch checked={prefs.inApp} onChange={(v) => set({ inApp: v })} label="In-app alerts" description="Arrivals, balances, tasks, renewals — in the bell menu" disabled={!canSettings} />
          <Switch checked={prefs.push && perm === 'granted'} onChange={async (v) => {
            if (v) {
              const r = isNative ? await nativeNotificationPermission(true) : typeof Notification !== 'undefined' ? await Notification.requestPermission() : 'denied';
              setPerm(r === 'granted' ? 'granted' : 'denied');
              if (r !== 'granted') return toast.error(isNative ? 'Allow notifications for StaySuite in your phone settings' : 'Notifications are blocked in your browser settings');
            }
            set({ push: v });
            if (v && !isNative) new Notification('StaySuite', { body: 'Push notifications are on for this device.' });
            if (v && isNative) toast.success('Reminders on', { description: 'Morning briefings on busy days and alerts before bills are due' });
          }} label={isNative ? 'Phone notifications' : 'Push notifications on this device'} description={perm === 'denied' ? (isNative ? 'Turn on notifications for StaySuite in your phone settings' : 'Blocked by the browser — allow notifications for this site first') : isNative ? '8 am briefing on days with arrivals, departures or tasks, plus bill reminders — even when the app is closed' : 'Phone and desktop alerts, even when the app is closed (installed app)'} />
          <Switch checked={prefs.email} onChange={(v) => set({ email: v })} label="Email notifications" description="Delivered once cloud sync is enabled for your account" disabled={!canSettings} />
          <Switch checked={prefs.dailySummary} onChange={(v) => set({ dailySummary: v })} label="Daily summary" description="Today's arrivals, departures, tasks and money due" disabled={!canSettings} />
          <Switch checked={prefs.monthlySummary} onChange={(v) => set({ monthlySummary: v })} label="Monthly financial summary" description="Revenue, expenses and profit on the 1st" disabled={!canSettings} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            <Field label="Arrival reminders" hint="Days ahead"><Select value={String(prefs.arrivalLeadDays)} onChange={(v) => set({ arrivalLeadDays: Number(v) })} options={[1, 2, 3, 5, 7].map((n) => ({ value: String(n), label: `${n} day${n > 1 ? 's' : ''} before` }))} disabled={!canSettings} /></Field>
            <Field label="Bill reminders" hint="Days before a recurring expense"><Select value={String(prefs.recurringLeadDays)} onChange={(v) => set({ recurringLeadDays: Number(v) })} options={[1, 3, 5, 7, 14].map((n) => ({ value: String(n), label: `${n} day${n > 1 ? 's' : ''} before` }))} disabled={!canSettings} /></Field>
          </div>
          <Button size="sm" variant="ghost" icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={() => { restore(); toast.success('Dismissed alerts restored'); }}>Restore dismissed alerts</Button>
        </div>
      </Card>
    </>
  );
}

function IntegrationsSection() {
  const groups = [
    { title: 'Booking channels', subtitle: 'Two-way calendar sync prevents double bookings across platforms', items: [
      { name: 'Airbnb', desc: 'Import reservations via iCal; export your availability from each unit', status: 'iCal ready', icon: <CalendarClock /> },
      { name: 'Booking.com', desc: 'Calendar sync via iCal today; full rates & availability via channel manager API', status: 'iCal ready', icon: <CalendarClock /> },
      { name: 'Expedia, Agoda & others', desc: 'Any platform that supports iCal calendar feeds', status: 'iCal ready', icon: <CalendarClock /> },
    ] },
    { title: 'Payments', subtitle: 'Send payment links and record payments automatically', items: [
      { name: 'Razorpay / UPI links', desc: 'Payment links on invoices, auto-matched to bookings', status: 'Planned', icon: <CreditCard /> },
      { name: 'Stripe', desc: 'Card payments for international guests', status: 'Planned', icon: <CreditCard /> },
    ] },
    { title: 'Accounting', subtitle: 'Push income and expenses to your books', items: [
      { name: 'Tally / Zoho Books', desc: 'Export ledgers with categories and GST', status: 'Excel export available', icon: <BookOpen /> },
      { name: 'QuickBooks / Xero', desc: 'Sync transactions automatically', status: 'Planned', icon: <BookOpen /> },
    ] },
  ];
  return (
    <>
      {groups.map((g) => (
        <Card key={g.title}>
          <CardHeader title={g.title} subtitle={g.subtitle} />
          <div className="divide-y divide-border border-t border-border">
            {g.items.map((i) => (
              <div key={i.name} className="flex items-center gap-3 px-5 py-3.5">
                <span className="h-9 w-9 rounded-xl bg-surface-2 border border-border grid place-items-center [&>svg]:h-4 [&>svg]:w-4 text-muted">{i.icon}</span>
                <div className="min-w-0 flex-1"><div className="text-[13.5px] font-medium">{i.name}</div><div className="text-[12.5px] text-muted">{i.desc}</div></div>
                <Badge tone={i.status === 'Planned' ? 'neutral' : 'success'}>{i.status}</Badge>
              </div>
            ))}
          </div>
        </Card>
      ))}
      <p className="text-[12.5px] text-subtle px-1">Export a unit's iCal feed from Properties → Units → ⋯ → Export iCal feed.</p>
    </>
  );
}

function DataSection() {
  const data = useData();
  const today = useToday();
  const confirm = useConfirm();
  const importData = useStore((s) => s.importData);
  const resetDemo = useStore((s) => s.resetDemo);
  const startFresh = useStore((s) => s.startFresh);
  const fileRef = useRef<HTMLInputElement>(null);
  const [backups, setBackups] = useState<string[]>([]);
  useEffect(() => { listBackups().then(setBackups); }, []);
  const size = new Blob([JSON.stringify(data)]).size;
  return (
    <>
      <Card>
        <CardHeader title="Backup & restore" subtitle={`${data.bookings.length} bookings · ${data.transactions.length} transactions · ${(size / 1024 / 1024).toFixed(2)} MB on this device`} />
        <div className="px-5 pb-5 space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button icon={<Download className="h-4 w-4" />} onClick={() => { downloadBlob(new Blob([JSON.stringify(data)], { type: 'application/json' }), `staysuite-backup-${today}.json`); toast.success('Backup downloaded'); }}>Download full backup</Button>
            <Button icon={<Upload className="h-4 w-4" />} onClick={() => fileRef.current?.click()}>Restore from file</Button>
            <input ref={fileRef} type="file" accept="application/json" hidden onChange={async (e) => {
              const f = e.target.files?.[0]; e.target.value = '';
              if (!f || !(await confirm({ title: 'Replace all data with this backup?', body: 'Everything currently in the app will be overwritten.', danger: true, confirmLabel: 'Restore' }))) return;
              const r = importData(await f.text());
              if (r.ok) toast.success('Backup restored'); else toast.error(r.error);
            }} />
          </div>
          <div>
            <div className="eyebrow mb-2">Automatic daily snapshots (last 7 days)</div>
            {backups.length === 0 ? <p className="text-[13px] text-subtle">The first snapshot is taken today.</p> : (
              <div className="flex flex-wrap gap-2">{backups.map((b) => (
                <Button key={b} size="sm" icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={async () => {
                  if (!(await confirm({ title: `Roll back to ${fmtDate(b)}?`, body: 'Changes made after this snapshot will be lost.', danger: true, confirmLabel: 'Roll back' }))) return;
                  const snap = await loadBackup(b);
                  if (snap) { importData(JSON.stringify(snap)); toast.success(`Restored snapshot from ${fmtDate(b)}`); }
                }}>{fmtDate(b, 'd MMM')}</Button>
              ))}</div>
            )}
          </div>
        </div>
      </Card>
      <Card>
        <CardHeader title="Workspace" />
        <div className="px-5 pb-5 flex flex-wrap gap-2">
          <Button icon={<RotateCcw className="h-4 w-4" />} onClick={async () => { if (await confirm({ title: 'Reload the demo data?', body: 'Replaces everything with the sample cabins, homestay and villa.', danger: true, confirmLabel: 'Reload demo' })) { resetDemo(); toast.success('Demo data loaded'); } }}>Reload demo data</Button>
          <Button variant="danger" icon={<Trash2 className="h-4 w-4" />} onClick={async () => { if (await confirm({ title: 'Start with an empty workspace?', body: 'All properties, bookings, guests and transactions will be erased. Business settings and templates are kept. Download a backup first.', danger: true, confirmLabel: 'Erase & start fresh' })) { startFresh(); toast.success('Fresh workspace ready'); } }}>Start fresh</Button>
        </div>
      </Card>
    </>
  );
}

function ActivitySection() {
  const activity = useStore((s) => s.data.activity);
  const L = useLookup();
  const [limit, setLimit] = useState(60);
  return (
    <Card>
      <CardHeader title="Activity log" subtitle="Important changes, who made them and when" />
      {activity.length === 0 ? <EmptyState title="No activity yet" /> : (
        <div className="divide-y divide-border border-t border-border">
          {activity.slice(0, limit).map((a) => (
            <div key={a.id} className="flex items-center gap-3 px-5 py-2.5">
              <Avatar name={L.staff(a.actorId)?.name ?? 'System'} size={26} />
              <div className="min-w-0 flex-1 text-[13px]"><span className="font-medium">{L.staff(a.actorId)?.name ?? 'System'}</span> <span className="text-muted">{a.summary}</span></div>
              <span className="text-[11.5px] text-subtle whitespace-nowrap">{new Date(a.at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          ))}
          {activity.length > limit && <div className="p-3 text-center"><Button size="sm" onClick={() => setLimit((n) => n + 60)}>Show more</Button></div>}
        </div>
      )}
    </Card>
  );
}
