import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns';
import type { ISODate } from '@/domain/types';

/** Today's calendar date in the business time zone. */
export function todayISO(timeZone?: string): ISODate {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const g = (t: string) => parts.find((p) => p.type === t)?.value;
    return `${g('year')}-${g('month')}-${g('day')}`;
  } catch {
    return format(new Date(), 'yyyy-MM-dd');
  }
}

export const d = (iso: ISODate) => parseISO(iso);
export const iso = (date: Date): ISODate => format(date, 'yyyy-MM-dd');
export const addDaysISO = (date: ISODate, n: number): ISODate => iso(addDays(parseISO(date), n));
export const nightsBetween = (a: ISODate, b: ISODate) => differenceInCalendarDays(parseISO(b), parseISO(a));
export const daysBetween = nightsBetween;

/** Each night of a stay [checkIn, checkOut). */
export function eachNight(checkIn: ISODate, checkOut: ISODate): ISODate[] {
  const n = nightsBetween(checkIn, checkOut);
  const out: ISODate[] = [];
  for (let i = 0; i < n; i++) out.push(addDaysISO(checkIn, i));
  return out;
}

/** Inclusive range [from, to]. */
export function eachDay(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let cur = from; cur <= to; cur = addDaysISO(cur, 1)) out.push(cur);
  return out;
}

export const inRange = (date: ISODate, from: ISODate, to: ISODate) => date >= from && date <= to;
export const overlaps = (aStart: ISODate, aEnd: ISODate, bStart: ISODate, bEnd: ISODate) => aStart < bEnd && bStart < aEnd;

export function fmtDate(dt: ISODate | Date, pattern = 'd MMM yyyy') {
  return format(typeof dt === 'string' ? parseISO(dt) : dt, pattern);
}
export function fmtRange(a: ISODate, b: ISODate) {
  const A = parseISO(a);
  const B = parseISO(b);
  if (A.getFullYear() === B.getFullYear()) {
    if (A.getMonth() === B.getMonth()) return `${format(A, 'd')}–${format(B, 'd MMM yyyy')}`;
    return `${format(A, 'd MMM')} – ${format(B, 'd MMM yyyy')}`;
  }
  return `${format(A, 'd MMM yyyy')} – ${format(B, 'd MMM yyyy')}`;
}
export function relDay(date: ISODate, today: ISODate) {
  const n = nightsBetween(today, date);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  if (n > 1 && n < 7) return format(parseISO(date), 'EEEE');
  return fmtDate(date, 'd MMM');
}
export const isWeekendNight = (date: ISODate) => {
  const day = parseISO(date).getDay();
  return day === 5 || day === 6; // Fri & Sat nights
};
export function monthKey(date: ISODate) { return date.slice(0, 7); }
export function startOfMonthISO(date: ISODate) { return `${date.slice(0, 7)}-01`; }
export function endOfMonthISO(date: ISODate) {
  const dt = parseISO(startOfMonthISO(date));
  return iso(new Date(dt.getFullYear(), dt.getMonth() + 1, 0));
}
export function addMonthsISO(date: ISODate, n: number) {
  const dt = parseISO(date);
  const target = new Date(dt.getFullYear(), dt.getMonth() + n, 1);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(dt.getDate(), last));
  return iso(target);
}
