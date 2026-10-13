import { addDaysISO, nightsBetween, relDay } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import { ledgerMap } from './finance';
import type { AppData, ISODate, StaffMember } from './types';
import { can, canSeeProperty } from './permissions';

export type AlertTone = 'info' | 'warning' | 'danger' | 'success';
export interface Alert {
  id: string; // stable, so dismissals stick
  tone: AlertTone;
  category: 'arrival' | 'departure' | 'payment' | 'task' | 'maintenance' | 'expense' | 'document' | 'booking';
  title: string;
  body: string;
  href: string;
  date: ISODate;
  propertyId: string | null;
}

/** Derives the in-app notification feed from current data. Push/email delivery would hook in here. */
export function computeAlerts(data: AppData, today: ISODate): Alert[] {
  const out: Alert[] = [];
  const money = (v: number) => formatMoney(v, data.business);
  const prefs = data.business.notificationPrefs;
  const L = ledgerMap(data);
  const guestName = (id: string) => {
    const g = data.guests.find((x) => x.id === id);
    return g ? `${g.firstName} ${g.lastName}` : 'Guest';
  };
  const unitName = (id: string) => data.units.find((u) => u.id === id)?.name ?? '';
  const horizon = addDaysISO(today, Math.max(1, prefs.arrivalLeadDays));

  for (const b of data.bookings) {
    const led = L.get(b.id)!;
    if (b.status === 'confirmed' || b.status === 'tentative') {
      if (b.checkIn >= today && b.checkIn <= horizon) {
        out.push({
          id: `arr:${b.id}:${b.checkIn}`, tone: 'info', category: 'arrival', date: b.checkIn,
          title: `${relDay(b.checkIn, today)}: ${guestName(b.guestId)} arrives`,
          body: `${unitName(b.unitId)} · ${b.nights.length} night${b.nights.length > 1 ? 's' : ''}${b.arrivalTime ? ` · ETA ${b.arrivalTime}` : ''}`,
          href: `/bookings/${b.id}`, propertyId: b.propertyId,
        });
        if (led.balance > 0) out.push({
          id: `due:${b.id}:${led.balance}`, tone: 'warning', category: 'payment', date: b.checkIn,
          title: `Collect ${money(led.balance)} from ${guestName(b.guestId)}`,
          body: `Balance due at check-in ${relDay(b.checkIn, today).toLowerCase()} · ${b.code}`,
          href: `/bookings/${b.id}`, propertyId: b.propertyId,
        });
      }
      if (b.checkIn < today && b.status === 'confirmed') out.push({
        id: `late:${b.id}`, tone: 'danger', category: 'arrival', date: b.checkIn,
        title: `${guestName(b.guestId)} not checked in`, body: `Was due ${relDay(b.checkIn, today).toLowerCase()} — mark checked-in or no-show`, href: `/bookings/${b.id}`, propertyId: b.propertyId,
      });
    }
    if (b.status === 'checked_in' && b.checkOut <= addDaysISO(today, 1)) out.push({
      id: `dep:${b.id}:${b.checkOut}`, tone: b.checkOut < today ? 'danger' : 'info', category: 'departure', date: b.checkOut,
      title: `${relDay(b.checkOut, today)}: ${guestName(b.guestId)} checks out`, body: `${unitName(b.unitId)}${led.balance > 0 ? ` · ${money(led.balance)} unpaid` : ''}`, href: `/bookings/${b.id}`, propertyId: b.propertyId,
    });
    if (b.status === 'checked_out' && led.balance > 0) out.push({
      id: `overdue:${b.id}:${led.balance}`, tone: 'danger', category: 'payment', date: b.checkOut,
      title: `Overdue: ${money(led.balance)} from ${guestName(b.guestId)}`, body: `${b.code} · checked out ${Math.abs(nightsBetween(today, b.checkOut))} days ago`, href: `/bookings/${b.id}`, propertyId: b.propertyId,
    });
    else if (b.status === 'checked_in' && led.balance > 0 && b.checkIn < today) out.push({
      id: `inhouse-due:${b.id}:${led.balance}`, tone: 'warning', category: 'payment', date: b.checkOut,
      title: `Collect ${money(led.balance)} from ${guestName(b.guestId)}`, body: `In-house until ${relDay(b.checkOut, today).toLowerCase()} · ${b.code}`, href: `/bookings/${b.id}`, propertyId: b.propertyId,
    });
    if (b.status === 'cancelled' && b.cancelledAt && nightsBetween(b.cancelledAt.slice(0, 10), today) <= 3) out.push({
      id: `cxl:${b.id}`, tone: 'warning', category: 'booking', date: b.cancelledAt.slice(0, 10),
      title: `Cancelled: ${guestName(b.guestId)}`, body: `${unitName(b.unitId)} · ${b.code}${led.balance < 0 ? ` · refund ${money(-led.balance)} due` : ''}`, href: `/bookings/${b.id}`, propertyId: b.propertyId,
    });
  }

  for (const t of data.tasks) {
    if (t.status === 'done') continue;
    if (t.dueDate < today) out.push({ id: `task-late:${t.id}`, tone: 'danger', category: t.type === 'maintenance' ? 'maintenance' : 'task', date: t.dueDate, title: `Overdue: ${t.title}`, body: `${unitName(t.unitId ?? '') || 'Property'} · due ${relDay(t.dueDate, today).toLowerCase()}`, href: `/tasks?task=${t.id}`, propertyId: t.propertyId });
    else if (t.dueDate === today) out.push({ id: `task-today:${t.id}`, tone: 'info', category: 'task', date: t.dueDate, title: t.title, body: `Due today${t.dueTime ? ` by ${t.dueTime}` : ''}`, href: `/tasks?task=${t.id}`, propertyId: t.propertyId });
    else if (t.type === 'maintenance' && (t.priority === 'urgent' || t.priority === 'high')) out.push({ id: `maint:${t.id}`, tone: 'warning', category: 'maintenance', date: t.dueDate, title: `${t.priority === 'urgent' ? 'Urgent' : 'High priority'}: ${t.title}`, body: `Unresolved maintenance`, href: `/tasks?task=${t.id}`, propertyId: t.propertyId });
  }

  const recurHorizon = addDaysISO(today, prefs.recurringLeadDays);
  for (const r of data.recurring) {
    if (!r.active || r.nextDue > recurHorizon) continue;
    out.push({ id: `rec:${r.id}:${r.nextDue}`, tone: r.nextDue < today ? 'danger' : 'warning', category: 'expense', date: r.nextDue, title: `${r.name} — ${money(r.amount)}`, body: r.nextDue < today ? `Was due ${relDay(r.nextDue, today).toLowerCase()}` : `Due ${relDay(r.nextDue, today).toLowerCase()}`, href: `/finances?tab=recurring`, propertyId: r.propertyId });
  }

  const docHorizon = addDaysISO(today, 45);
  for (const doc of data.propertyDocs) {
    if (!doc.expiresOn || doc.expiresOn > docHorizon) continue;
    out.push({ id: `doc:${doc.id}:${doc.expiresOn}`, tone: doc.expiresOn < today ? 'danger' : 'warning', category: 'document', date: doc.expiresOn, title: `${doc.name} ${doc.expiresOn < today ? 'expired' : 'expires soon'}`, body: relDay(doc.expiresOn, today), href: `/properties/${doc.propertyId}?tab=documents`, propertyId: doc.propertyId });
  }

  const rank = { danger: 0, warning: 1, info: 2, success: 3 };
  return out
    .filter((a) => !data.dismissedAlerts.includes(a.id))
    .sort((a, b) => rank[a.tone] - rank[b.tone] || a.date.localeCompare(b.date));
}

/** Only show alerts the viewer is allowed to act on. */
export function alertsForUser(alerts: Alert[], user: StaffMember | undefined): Alert[] {
  if (!user) return [];
  return alerts.filter((a) => {
    if (!canSeeProperty(user, a.propertyId)) return false;
    if ((a.category === 'payment' || a.category === 'expense') && !can(user, 'finance.view')) return false;
    if (['arrival', 'departure', 'booking'].includes(a.category) && !can(user, 'bookings.view')) return false;
    if (a.category === 'document' && !can(user, 'properties.edit')) return false;
    if ((a.category === 'task' || a.category === 'maintenance') && !can(user, 'tasks.view')) return false;
    return true;
  });
}
