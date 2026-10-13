import { useMemo, useSyncExternalStore } from 'react';
import { useStore } from './store';
import { can, type Capability } from '@/domain/permissions';
import { formatMoney } from '@/lib/money';
import { todayISO } from '@/lib/dates';
import { ledgerMap } from '@/domain/finance';
import { outbox } from './sync';
import type { ID } from '@/domain/types';

export const useData = () => useStore((s) => s.data);
export const useBusiness = () => useStore((s) => s.data.business);
export const useToday = () => {
  const tz = useStore((s) => s.data.business.timeZone);
  return todayISO(tz);
};

export function useCurrentUser() {
  const staff = useStore((s) => s.data.staff);
  const id = useStore((s) => s.data.currentUserId);
  return staff.find((x) => x.id === id) ?? staff[0];
}

export function useCan(cap: Capability) {
  return can(useCurrentUser(), cap);
}

/** Properties the current user may access. */
export function useVisiblePropertyIds(): Set<ID> | null {
  const user = useCurrentUser();
  return useMemo(() => (user && user.role !== 'owner' && user.propertyIds.length ? new Set(user.propertyIds) : null), [user]);
}

/** Money formatter. Summary screens pass `{ cents: false }` to round to whole units; ledgers keep exact paise. */
export function useMoney(defaults?: { cents?: boolean }) {
  const { currency, locale } = useBusiness();
  const cents = defaults?.cents;
  return useMemo(() => {
    const f = (v: number, opts?: { compact?: boolean; cents?: boolean }) => formatMoney(v, { currency, locale }, { cents, ...opts });
    return f;
  }, [currency, locale, cents]);
}

export function useLedgers() {
  const bookings = useStore((s) => s.data.bookings);
  const transactions = useStore((s) => s.data.transactions);
  return useMemo(() => ledgerMap({ bookings, transactions }), [bookings, transactions]);
}

export function useLookup() {
  const d = useData();
  return useMemo(() => {
    const props = new Map(d.properties.map((p) => [p.id, p]));
    const units = new Map(d.units.map((u) => [u.id, u]));
    const guests = new Map(d.guests.map((g) => [g.id, g]));
    const staff = new Map(d.staff.map((s) => [s.id, s]));
    const bookings = new Map(d.bookings.map((b) => [b.id, b]));
    return {
      property: (id?: ID | null) => (id ? props.get(id) : undefined),
      unit: (id?: ID | null) => (id ? units.get(id) : undefined),
      guest: (id?: ID | null) => (id ? guests.get(id) : undefined),
      staff: (id?: ID | null) => (id ? staff.get(id) : undefined),
      booking: (id?: ID | null) => (id ? bookings.get(id) : undefined),
      guestName: (id?: ID | null) => { const g = id ? guests.get(id) : undefined; return g ? `${g.firstName} ${g.lastName}` : '—'; },
    };
  }, [d.properties, d.units, d.guests, d.staff, d.bookings]);
}

export function useSyncStatus() {
  const pending = useSyncExternalStore((l) => outbox.subscribe(l), () => outbox.pending);
  const online = useSyncExternalStore(
    (l) => { window.addEventListener('online', l); window.addEventListener('offline', l); return () => { window.removeEventListener('online', l); window.removeEventListener('offline', l); }; },
    () => navigator.onLine,
  );
  return { pending, online, adapter: outbox.adapter.name };
}
