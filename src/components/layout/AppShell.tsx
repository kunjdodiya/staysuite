import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, CalendarDays, Building2, Users, Wallet, FileText, ClipboardCheck, BarChart3, Settings, Plus, Bell, Search,
  Moon, Sun, Monitor, MoreHorizontal, BedDouble, IndianRupee, Receipt, CreditCard, Wrench, CloudOff, Check, Eye, UserPlus,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { useCan, useCurrentUser, useData, useSyncStatus, useToday } from '@/data/hooks';
import { useStore } from '@/data/store';
import { openOverlay, useUI } from '@/data/ui';
import { alertsForUser, computeAlerts } from '@/domain/alerts';
import { roleLabel } from '@/domain/labels';
import type { Capability } from '@/domain/permissions';
import { useTheme } from '@/lib/theme';
import { Avatar, Button } from '../ui';
import { Menu, Drawer } from '../ui/overlay';

interface NavItem { to: string; label: string; icon: ReactNode; cap?: Capability; end?: boolean }
const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: <LayoutDashboard />, end: true },
  { to: '/bookings', label: 'Bookings', icon: <CalendarDays />, cap: 'bookings.view' },
  { to: '/properties', label: 'Properties', icon: <Building2 />, cap: 'properties.view' },
  { to: '/guests', label: 'Guests', icon: <Users />, cap: 'guests.view' },
  { to: '/finances', label: 'Finances', icon: <Wallet />, cap: 'finance.view' },
  { to: '/documents', label: 'Receipts & Invoices', icon: <FileText />, cap: 'documents.view' },
  { to: '/tasks', label: 'Tasks', icon: <ClipboardCheck />, cap: 'tasks.view' },
  { to: '/reports', label: 'Reports', icon: <BarChart3 />, cap: 'reports.view' },
  { to: '/settings', label: 'Settings', icon: <Settings /> },
];

function useNav() {
  const user = useCurrentUser();
  const caps = {
    'bookings.view': useCan('bookings.view'), 'properties.view': useCan('properties.view'), 'guests.view': useCan('guests.view'),
    'finance.view': useCan('finance.view'), 'documents.view': useCan('documents.view'), 'tasks.view': useCan('tasks.view'), 'reports.view': useCan('reports.view'),
  } as Record<string, boolean>;
  return useMemo(() => NAV.filter((n) => !n.cap || caps[n.cap]), [user?.role]); // eslint-disable-line react-hooks/exhaustive-deps
}

export function useAlertsCount() {
  const data = useData();
  const today = useToday();
  const user = useCurrentUser();
  return useMemo(() => alertsForUser(computeAlerts(data, today), user).length, [data, today, user]);
}

function QuickAddMenu({ compact }: { compact?: boolean }) {
  const canBook = useCan('bookings.edit');
  const canFin = useCan('finance.edit');
  const canDoc = useCan('documents.issue');
  const canTask = useCan('tasks.edit');
  const canGuest = useCan('guests.edit');
  return (
    <Menu
      placement={compact ? 'top' : 'bottom'}
      align={compact ? 'center' : 'right'}
      trigger={({ onClick }) => (
        <Button variant="primary" size={compact ? 'icon' : 'md'} onClick={onClick} icon={<Plus className="h-4 w-4" />} aria-label="Quick add">
          {!compact && 'New'}
        </Button>
      )}
      items={[
        { label: 'New booking', icon: <BedDouble />, onClick: () => openOverlay({ kind: 'booking' }), hidden: !canBook },
        { label: 'Record payment', icon: <CreditCard />, onClick: () => openOverlay({ kind: 'transaction', txnKind: 'payment' }), hidden: !canFin },
        { label: 'Add income', icon: <IndianRupee />, onClick: () => openOverlay({ kind: 'transaction', txnKind: 'income' }), hidden: !canFin },
        { label: 'Add expense', icon: <Wallet />, onClick: () => openOverlay({ kind: 'transaction', txnKind: 'expense' }), hidden: !canFin },
        { label: 'Generate receipt', icon: <Receipt />, onClick: () => openOverlay({ kind: 'document' }), hidden: !canDoc },
        { label: 'New guest', icon: <UserPlus />, onClick: () => openOverlay({ kind: 'guest' }), hidden: !canGuest },
        { label: 'Maintenance request', icon: <Wrench />, onClick: () => openOverlay({ kind: 'task', type: 'maintenance' }), hidden: !canTask },
      ]}
    />
  );
}

function ThemeToggle() {
  const [pref, setPref] = useTheme();
  const Icon = pref === 'dark' ? Moon : pref === 'light' ? Sun : Monitor;
  return (
    <Menu
      trigger={({ onClick }) => <Button variant="ghost" size="icon" onClick={onClick} aria-label="Theme"><Icon className="h-[18px] w-[18px]" /></Button>}
      items={[
        { label: <span className="flex-1 flex justify-between">Light {pref === 'light' && <Check className="h-4 w-4" />}</span>, icon: <Sun />, onClick: () => setPref('light') },
        { label: <span className="flex-1 flex justify-between">Dark {pref === 'dark' && <Check className="h-4 w-4" />}</span>, icon: <Moon />, onClick: () => setPref('dark') },
        { label: <span className="flex-1 flex justify-between">System {pref === 'system' && <Check className="h-4 w-4" />}</span>, icon: <Monitor />, onClick: () => setPref('system') },
      ]}
    />
  );
}

function UserMenu() {
  const user = useCurrentUser();
  const staff = useStore((s) => s.data.staff);
  const setCurrentUser = useStore((s) => s.setCurrentUser);
  const navigate = useNavigate();
  const owner = staff.find((s) => s.role === 'owner');
  return (
    <Menu
      trigger={({ onClick }) => (
        <button onClick={onClick} className="flex items-center gap-2.5 w-full p-2 rounded-xl hover:bg-surface-2 transition-colors text-left">
          <Avatar name={user?.name ?? '?'} size={32} />
          <span className="min-w-0 flex-1 hidden lg:block">
            <span className="block text-[13px] font-medium truncate">{user?.name}</span>
            <span className="block text-[11.5px] text-subtle">{user ? roleLabel[user.role] : ''}</span>
          </span>
        </button>
      )}
      align="left"
      items={[
        ...staff.filter((s) => s.id !== user?.id && s.status !== 'disabled').slice(0, 5).map((s) => ({
          label: <span className="flex flex-col"><span>Preview as {s.name.split(' ')[0]}</span><span className="text-[11.5px] text-subtle">{roleLabel[s.role]}</span></span>,
          icon: <Eye />, onClick: () => { setCurrentUser(s.id); navigate('/'); },
        })),
        ...(user?.role !== 'owner' && owner ? [{ label: 'Back to owner view', icon: <Check />, onClick: () => setCurrentUser(owner.id) }] : []),
        'divider' as const,
        { label: 'Settings', icon: <Settings />, onClick: () => navigate('/settings') },
      ]}
    />
  );
}

function Sidebar() {
  const nav = useNav();
  const business = useStore((s) => s.data.business);
  const { pending, online } = useSyncStatus();
  return (
    <aside className="hidden md:flex fixed inset-y-0 left-0 z-30 w-[72px] lg:w-[248px] flex-col border-r border-border bg-surface/70 backdrop-blur-xl">
      <div className="flex items-center gap-2.5 h-16 px-4 lg:px-5">
        <div className="grid place-items-center h-9 w-9 rounded-xl bg-accent text-accent-fg shrink-0 overflow-hidden">
          {business.logoDataUrl ? <img src={business.logoDataUrl} alt="" className="h-full w-full object-cover" /> : (
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor"><path d="M3 12 12 4l9 8v8a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /></svg>
          )}
        </div>
        <div className="hidden lg:block min-w-0">
          <div className="text-[14px] font-semibold tracking-tight truncate">{business.name}</div>
          <div className="text-[11.5px] text-subtle">StaySuite</div>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-0.5">
        {nav.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            title={n.label}
            className={({ isActive }) => cn(
              'group flex items-center gap-3 h-10 px-3 rounded-xl text-[13.5px] font-medium transition-colors [&>svg]:h-[18px] [&>svg]:w-[18px] justify-center lg:justify-start',
              isActive ? 'bg-surface-2 text-fg shadow-card border border-border' : 'text-muted hover:text-fg hover:bg-surface-2/70 border border-transparent',
            )}
          >
            {n.icon}
            <span className="hidden lg:inline truncate">{n.label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="p-3 border-t border-border space-y-2">
        <div className="hidden lg:flex items-center gap-2 px-2 text-[11.5px] text-subtle">
          {online ? <span className="h-1.5 w-1.5 rounded-full bg-success" /> : <CloudOff className="h-3.5 w-3.5 text-warning" />}
          {online ? (pending ? `Saving ${pending} change${pending > 1 ? 's' : ''}…` : 'All changes saved') : 'Offline — changes saved on device'}
        </div>
        <UserMenu />
      </div>
    </aside>
  );
}

function TopBar() {
  const alerts = useAlertsCount();
  const location = useLocation();
  const nav = useNav();
  const title = nav.find((n) => (n.end ? location.pathname === n.to : location.pathname.startsWith(n.to)))?.label ?? '';
  const user = useCurrentUser();
  const setCurrentUser = useStore((s) => s.setCurrentUser);
  const owner = useStore((s) => s.data.staff.find((x) => x.role === 'owner'));
  return (
    <>
      {user && user.role !== 'owner' && owner && (
        <div className="sticky top-0 z-30 flex items-center justify-center gap-3 h-9 bg-fg text-bg text-[12.5px] pt-safe">
          <Eye className="h-3.5 w-3.5" /> Previewing as {user.name} ({roleLabel[user.role]})
          <button className="underline underline-offset-2 font-medium" onClick={() => setCurrentUser(owner.id)}>Exit preview</button>
        </div>
      )}
      <header className="sticky top-0 z-20 bg-bg/80 backdrop-blur-xl border-b border-border/60 pt-safe">
        <div className="flex items-center gap-2 h-14 sm:h-16 px-4 sm:px-6 lg:px-8 max-w-[1440px] mx-auto">
          <h2 className="md:hidden text-[17px] font-semibold tracking-tight flex-1 truncate">{title}</h2>
          <button
            onClick={() => openOverlay({ kind: 'command' })}
            className="hidden md:flex items-center gap-2.5 h-10 w-full max-w-sm px-3 rounded-xl border border-border bg-surface text-sm text-subtle hover:border-border-strong transition-colors"
          >
            <Search className="h-4 w-4" />
            <span className="flex-1 text-left">Search guests, bookings, actions…</span>
            <kbd className="text-[11px] font-medium px-1.5 py-0.5 rounded-md bg-surface-2 border border-border">⌘K</kbd>
          </button>
          <div className="flex-1 hidden md:block" />
          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => openOverlay({ kind: 'command' })} aria-label="Search"><Search className="h-[18px] w-[18px]" /></Button>
          <ThemeToggle />
          <Button variant="ghost" size="icon" className="relative" onClick={() => openOverlay({ kind: 'notifications' })} aria-label="Notifications">
            <Bell className="h-[18px] w-[18px]" />
            {alerts > 0 && <span className="absolute top-1.5 right-1.5 min-w-[17px] h-[17px] px-1 grid place-items-center rounded-full bg-danger text-white text-[10px] font-semibold num">{alerts > 99 ? '99+' : alerts}</span>}
          </Button>
          <div className="hidden md:block"><QuickAddMenu /></div>
        </div>
      </header>
    </>
  );
}

function MobileNav() {
  const nav = useNav();
  const [more, setMore] = useState(false);
  const location = useLocation();
  useEffect(() => setMore(false), [location.pathname]);
  const primary = nav.filter((n) => ['/', '/bookings', '/finances', '/tasks'].includes(n.to)).slice(0, 4);
  const left = primary.slice(0, 2);
  const right = primary.slice(2, 4);
  const item = (n: NavItem) => (
    <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => cn('flex flex-col items-center justify-center gap-1 flex-1 h-full text-[10.5px] font-medium [&>svg]:h-[21px] [&>svg]:w-[21px] transition-colors', isActive ? 'text-fg' : 'text-subtle')}>
      {n.icon}
      {n.label.split(' ')[0]}
    </NavLink>
  );
  return (
    <>
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-surface/85 backdrop-blur-xl border-t border-border pb-safe no-print">
        <div className="flex items-center h-[62px] px-2">
          {left.map(item)}
          <div className="flex-1 flex justify-center"><QuickAddMenu compact /></div>
          {right.map(item)}
          <button onClick={() => setMore(true)} className="flex flex-col items-center justify-center gap-1 flex-1 h-full text-[10.5px] font-medium text-subtle">
            <MoreHorizontal className="h-[21px] w-[21px]" />More
          </button>
        </div>
      </nav>
      <Drawer open={more} onClose={() => setMore(false)} title="Menu">
        <div className="grid grid-cols-3 gap-2">
          {nav.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => cn('flex flex-col items-center gap-2 p-4 rounded-2xl border text-[12.5px] font-medium text-center [&>svg]:h-5 [&>svg]:w-5', isActive ? 'bg-accent-soft border-accent/30 text-accent' : 'border-border bg-surface-2/50 text-fg')}>
              {n.icon}{n.label}
            </NavLink>
          ))}
        </div>
        <div className="mt-6"><UserMenu /></div>
      </Drawer>
    </>
  );
}

export function AppShell() {
  const location = useLocation();
  const closeAll = useUI((s) => s.closeAll);
  useEffect(() => { window.scrollTo(0, 0); }, [location.pathname]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); closeAll(); openOverlay({ kind: 'command' }); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [closeAll]);
  return (
    <div className="min-h-screen">
      <Sidebar />
      <div className="md:pl-[72px] lg:pl-[248px]">
        <TopBar />
        <main className="px-4 sm:px-6 lg:px-8 pt-5 sm:pt-7 pb-28 md:pb-12 max-w-[1440px] mx-auto">
          <div key={location.pathname} className="animate-fade-in"><Outlet /></div>
        </main>
      </div>
      <MobileNav />
    </div>
  );
}
