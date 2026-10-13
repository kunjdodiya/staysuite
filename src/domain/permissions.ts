import type { ID, Role, StaffMember } from './types';

export type Capability =
  | 'dashboard.finance' | 'bookings.view' | 'bookings.edit' | 'guests.view' | 'guests.pii' | 'guests.edit'
  | 'properties.view' | 'properties.edit' | 'finance.view' | 'finance.edit' | 'documents.view' | 'documents.issue'
  | 'tasks.view' | 'tasks.edit' | 'tasks.assign' | 'reports.view' | 'staff.manage' | 'settings.manage' | 'data.manage';

const ALL: Capability[] = [
  'dashboard.finance', 'bookings.view', 'bookings.edit', 'guests.view', 'guests.pii', 'guests.edit', 'properties.view', 'properties.edit',
  'finance.view', 'finance.edit', 'documents.view', 'documents.issue', 'tasks.view', 'tasks.edit', 'tasks.assign', 'reports.view',
  'staff.manage', 'settings.manage', 'data.manage',
];

export const ROLE_CAPS: Record<Role, Capability[]> = {
  owner: ALL,
  manager: ALL.filter((c) => !['staff.manage', 'data.manage'].includes(c)),
  accountant: ['dashboard.finance', 'bookings.view', 'guests.view', 'properties.view', 'finance.view', 'finance.edit', 'documents.view', 'documents.issue', 'reports.view'],
  caretaker: ['bookings.view', 'bookings.edit', 'guests.view', 'guests.pii', 'properties.view', 'tasks.view', 'tasks.edit', 'tasks.assign'],
  cleaner: ['tasks.view', 'tasks.edit', 'properties.view'],
};

export const ROLE_SUMMARY: Record<Role, string> = {
  owner: 'Full access to everything, including staff, billing and data.',
  manager: 'Runs day-to-day operations and finances. Cannot manage staff or erase data.',
  accountant: 'Finances, documents and reports. Read-only bookings; no guest contact details.',
  caretaker: 'Bookings, check-ins, guests and tasks. No financial figures.',
  cleaner: 'Only their housekeeping and maintenance tasks on assigned properties.',
};

export function can(user: StaffMember | undefined, cap: Capability) {
  if (!user || user.status === 'disabled') return false;
  return ROLE_CAPS[user.role].includes(cap);
}

/** Owners see every property; others only what they are assigned (empty list = all). */
export function canSeeProperty(user: StaffMember | undefined, propertyId: ID | null | undefined) {
  if (!user) return false;
  if (user.role === 'owner' || user.propertyIds.length === 0 || !propertyId) return true;
  return user.propertyIds.includes(propertyId);
}
