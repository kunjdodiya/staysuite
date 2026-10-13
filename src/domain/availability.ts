import { overlaps } from '@/lib/dates';
import type { Booking, BookingStatus, ID, ISODate } from './types';

/** Statuses that hold inventory. Inquiries never block a calendar. */
export const BLOCKING: BookingStatus[] = ['tentative', 'confirmed', 'checked_in', 'checked_out'];
export const ACTIVE: BookingStatus[] = ['tentative', 'confirmed', 'checked_in', 'checked_out'];

export function isBlocking(b: Booking) {
  return BLOCKING.includes(b.status);
}

export function findConflicts(bookings: Booking[], unitId: ID, checkIn: ISODate, checkOut: ISODate, ignoreId?: ID): Booking[] {
  return bookings.filter(
    (b) => b.id !== ignoreId && b.unitId === unitId && isBlocking(b) && overlaps(checkIn, checkOut, b.checkIn, b.checkOut),
  );
}

export function isUnitFree(bookings: Booking[], unitId: ID, checkIn: ISODate, checkOut: ISODate, ignoreId?: ID) {
  return findConflicts(bookings, unitId, checkIn, checkOut, ignoreId).length === 0;
}

export function validateStay(checkIn: string, checkOut: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkIn)) return 'Choose a check-in date';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkOut)) return 'Choose a check-out date';
  if (checkOut <= checkIn) return 'Check-out must be after check-in';
  return null;
}
