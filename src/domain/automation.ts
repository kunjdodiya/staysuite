import { addDaysISO } from '@/lib/dates';
import { uid } from '@/lib/id';
import type { AppData, ChecklistItem, ISODate, Task } from './types';

export const DEFAULT_CLEANING_CHECKLIST = [
  'Strip & replace linen', 'Clean bathroom & restock toiletries', 'Vacuum and mop floors', 'Wipe kitchen & empty bins',
  'Restock tea, coffee & water', 'Check for damage or lost items', 'Final walkthrough & photos',
];

export const checklist = (labels: string[]): ChecklistItem[] => labels.map((label) => ({ id: uid('ck'), label, done: false }));

/**
 * Creates a turnover cleaning task for every upcoming check-out that doesn't have one.
 * Idempotent: safe to run on every load and after every booking change.
 */
export function ensureTurnoverTasks(data: AppData, today: ISODate, lookAheadDays = 21): Task[] {
  const horizon = addDaysISO(today, lookAheadDays);
  const existing = new Set(data.tasks.filter((t) => t.type === 'cleaning' && t.bookingId).map((t) => t.bookingId));
  const created: Task[] = [];
  for (const b of data.bookings) {
    if (!['confirmed', 'checked_in', 'tentative'].includes(b.status)) continue;
    if (b.checkOut < today || b.checkOut > horizon || existing.has(b.id)) continue;
    const unit = data.units.find((u) => u.id === b.unitId);
    const property = data.properties.find((p) => p.id === b.propertyId);
    if (!unit || !property) continue;
    const cleaner = data.staff.find((s) => s.role === 'cleaner' && s.status !== 'disabled' && (s.propertyIds.length === 0 || s.propertyIds.includes(b.propertyId)));
    const nextArrival = data.bookings
      .filter((x) => x.unitId === b.unitId && x.id !== b.id && x.checkIn >= b.checkOut && !['cancelled', 'no_show', 'inquiry'].includes(x.status))
      .sort((x, y) => x.checkIn.localeCompare(y.checkIn))[0];
    created.push({
      id: uid('task'), type: 'cleaning', title: `Turnover clean — ${unit.name}`, propertyId: b.propertyId, unitId: b.unitId, bookingId: b.id,
      assigneeId: cleaner?.id ?? null, dueDate: b.checkOut, dueTime: property.checkInTime || '14:00',
      priority: nextArrival?.checkIn === b.checkOut ? 'high' : 'medium', status: 'todo',
      checklist: checklist(DEFAULT_CLEANING_CHECKLIST),
      notes: nextArrival?.checkIn === b.checkOut ? 'Same-day turnover — next guest arrives today.' : '',
      photos: [], cost: 0, expenseId: null, auto: true, createdAt: new Date().toISOString(), completedAt: null,
    });
  }
  return created;
}
