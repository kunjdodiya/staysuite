import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { addDaysISO, todayISO } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import { ledgerMap } from '@/domain/finance';
import type { AppData } from '@/domain/types';

const HORIZON_DAYS = 14;
const ID_BASE = 7000; // our notification id range: 7000–7999

export async function nativeNotificationPermission(request = false): Promise<'granted' | 'denied' | 'prompt'> {
  if (!Capacitor.isNativePlatform()) return 'denied';
  const p = request ? await LocalNotifications.requestPermissions() : await LocalNotifications.checkPermissions();
  return p.display === 'granted' ? 'granted' : p.display === 'denied' ? 'denied' : 'prompt';
}

/**
 * Schedules on-device reminders for the next two weeks: a morning briefing on days with
 * arrivals/departures (with money to collect) and alerts for recurring bills.
 * Rebuilt from scratch on every change, so cancelled bookings never leave stale alerts.
 */
export async function syncReminders(data: AppData) {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const pending = await LocalNotifications.getPending();
    const ours = pending.notifications.filter((n) => n.id >= ID_BASE && n.id < ID_BASE + 1000);
    if (ours.length) await LocalNotifications.cancel({ notifications: ours.map((n) => ({ id: n.id })) });
    const prefs = data.business.notificationPrefs;
    if (!prefs.push || (await nativeNotificationPermission()) !== 'granted') return;

    const today = todayISO(data.business.timeZone);
    const money = (v: number) => formatMoney(v, data.business, { cents: false });
    const L = ledgerMap(data);
    const unit = (id: string) => data.units.find((u) => u.id === id)?.name ?? '';
    const guest = (id: string) => data.guests.find((g) => g.id === id)?.firstName ?? 'Guest';
    const now = Date.now();
    const notes: { id: number; title: string; body: string; at: Date }[] = [];

    for (let i = 0; i <= HORIZON_DAYS; i++) {
      const day = addDaysISO(today, i);
      const arrivals = data.bookings.filter((b) => b.checkIn === day && ['confirmed', 'tentative'].includes(b.status));
      const departures = data.bookings.filter((b) => b.checkOut === day && ['confirmed', 'checked_in'].includes(b.status));
      const tasks = data.tasks.filter((t) => t.dueDate === day && t.status !== 'done');
      if (!arrivals.length && !departures.length && !tasks.length) continue;
      const due = arrivals.reduce((s, b) => s + Math.max(0, L.get(b.id)!.balance), 0);
      const parts = [
        arrivals.length && `${arrivals.length} arrival${arrivals.length > 1 ? 's' : ''}`,
        departures.length && `${departures.length} departure${departures.length > 1 ? 's' : ''}`,
        tasks.length && `${tasks.length} task${tasks.length > 1 ? 's' : ''}`,
      ].filter(Boolean).join(' · ');
      const who = arrivals.slice(0, 3).map((b) => `${guest(b.guestId)} (${unit(b.unitId)})`).join(', ');
      notes.push({
        id: ID_BASE + i,
        title: `Today: ${parts}`,
        body: [who && `Arriving: ${who}`, due > 0 && `${money(due)} to collect`].filter(Boolean).join(' — ') || 'Open StaySuite for details',
        at: new Date(`${day}T08:00:00`),
      });
    }

    data.recurring.filter((r) => r.active && r.nextDue >= today && r.nextDue <= addDaysISO(today, HORIZON_DAYS)).slice(0, 20).forEach((r, i) => {
      const remind = addDaysISO(r.nextDue, -Math.min(prefs.recurringLeadDays, 3));
      notes.push({ id: ID_BASE + 100 + i, title: `Bill due: ${r.name}`, body: `${money(r.amount)} due ${r.nextDue === remind ? 'today' : `on ${r.nextDue}`}`, at: new Date(`${remind < today ? today : remind}T09:00:00`) });
    });

    const upcoming = notes.filter((n) => n.at.getTime() > now + 60_000).slice(0, 60); // iOS keeps at most 64
    if (upcoming.length) {
      await LocalNotifications.schedule({
        notifications: upcoming.map((n) => ({ id: n.id, title: n.title, body: n.body, schedule: { at: n.at, allowWhileIdle: true }, extra: { source: 'staysuite' } })),
      });
    }
  } catch (e) {
    console.warn('Reminder sync failed', e);
  }
}
