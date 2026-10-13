import { Badge, type Tone } from './ui';
import { bookingStatusLabel, priorityLabel, readinessLabel, sourceLabel, taskStatusLabel } from '@/domain/labels';
import type { BookingSource, BookingStatus, Priority, Readiness, TaskStatus } from '@/domain/types';
import type { BookingLedger } from '@/domain/finance';
import { cn } from '@/lib/cn';

export const statusTone: Record<BookingStatus, Tone> = {
  inquiry: 'neutral', tentative: 'warning', confirmed: 'info', checked_in: 'accent', checked_out: 'neutral', cancelled: 'danger', no_show: 'danger',
};
export function StatusBadge({ status }: { status: BookingStatus }) {
  return <Badge tone={statusTone[status]} dot>{bookingStatusLabel[status]}</Badge>;
}

export function PaymentBadge({ ledger }: { ledger: BookingLedger }) {
  const map: Record<BookingLedger['paymentState'], [Tone, string]> = {
    paid: ['success', 'Paid'], partial: ['warning', 'Partly paid'], unpaid: ['danger', 'Unpaid'], overpaid: ['info', 'Refund due'], 'n/a': ['neutral', '—'],
  };
  const [tone, label] = map[ledger.paymentState];
  if (ledger.paymentState === 'n/a') return null;
  return <Badge tone={tone}>{label}</Badge>;
}

export const readinessTone: Record<Readiness, Tone> = { ready: 'success', dirty: 'warning', cleaning: 'info', inspect: 'accent', out_of_order: 'danger' };
export function ReadinessBadge({ value }: { value: Readiness }) {
  return <Badge tone={readinessTone[value]} dot>{readinessLabel[value]}</Badge>;
}

export const priorityTone: Record<Priority, Tone> = { low: 'neutral', medium: 'info', high: 'warning', urgent: 'danger' };
export function PriorityBadge({ value }: { value: Priority }) {
  return <Badge tone={priorityTone[value]}>{priorityLabel[value]}</Badge>;
}
export const taskStatusTone: Record<TaskStatus, Tone> = { todo: 'neutral', in_progress: 'info', blocked: 'danger', done: 'success' };
export function TaskStatusBadge({ value }: { value: TaskStatus }) {
  return <Badge tone={taskStatusTone[value]} dot>{taskStatusLabel[value]}</Badge>;
}

const sourceDot: Record<BookingSource, string> = {
  direct: 'bg-s3', phone: 'bg-s7', walk_in: 'bg-s4', website: 'bg-s6', airbnb: 'bg-s8', booking_com: 'bg-s1', expedia: 'bg-s4', agoda: 'bg-s5', other: 'bg-subtle',
};
export function SourceTag({ source, className }: { source: BookingSource; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-[12.5px] text-muted', className)}>
      <span className={cn('h-2 w-2 rounded-full', sourceDot[source])} />
      {sourceLabel[source]}
    </span>
  );
}

/** Property color swatch — maps the stored series key (s1..s8) to a class. */
export const seriesBg: Record<string, string> = { s1: 'bg-s1', s2: 'bg-s2', s3: 'bg-s3', s4: 'bg-s4', s5: 'bg-s5', s6: 'bg-s6', s7: 'bg-s7', s8: 'bg-s8' };
export const seriesText: Record<string, string> = { s1: 'text-s1', s2: 'text-s2', s3: 'text-s3', s4: 'text-s4', s5: 'text-s5', s6: 'text-s6', s7: 'text-s7', s8: 'text-s8' };
export const seriesVar = (key: string) => `rgb(var(--${key || 's1'}))`;
export function PropertyDot({ color, className }: { color: string; className?: string }) {
  return <span className={cn('inline-block h-2.5 w-2.5 rounded-full shrink-0', seriesBg[color] ?? 'bg-s1', className)} />;
}
