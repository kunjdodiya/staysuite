import { useState } from 'react';
import { Select, Input } from './ui';
import { addDaysISO, addMonthsISO, endOfMonthISO, startOfMonthISO } from '@/lib/dates';
import type { ISODate } from '@/domain/types';

export type PeriodKey = 'this_month' | 'last_month' | 'this_quarter' | 'last_quarter' | 'ytd' | 'last_12' | 'last_year' | 'custom';
export interface Period { key: PeriodKey; from: ISODate; to: ISODate; label: string }

const labels: Record<PeriodKey, string> = {
  this_month: 'This month', last_month: 'Last month', this_quarter: 'This quarter', last_quarter: 'Last quarter',
  ytd: 'Year to date', last_12: 'Last 12 months', last_year: 'Last year', custom: 'Custom range',
};

export function resolvePeriod(key: PeriodKey, today: ISODate, custom?: { from: ISODate; to: ISODate }): Period {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  const qStartMonth = Math.floor((m - 1) / 3) * 3 + 1;
  const qStart = `${y}-${String(qStartMonth).padStart(2, '0')}-01`;
  let from: ISODate, to: ISODate;
  switch (key) {
    case 'this_month': from = startOfMonthISO(today); to = endOfMonthISO(today); break;
    case 'last_month': from = addMonthsISO(startOfMonthISO(today), -1); to = endOfMonthISO(from); break;
    case 'this_quarter': from = qStart; to = endOfMonthISO(addMonthsISO(qStart, 2)); break;
    case 'last_quarter': from = addMonthsISO(qStart, -3); to = addDaysISO(qStart, -1); break;
    case 'ytd': from = `${y}-01-01`; to = today; break;
    case 'last_12': from = addMonthsISO(startOfMonthISO(today), -11); to = endOfMonthISO(today); break;
    case 'last_year': from = `${y - 1}-01-01`; to = `${y - 1}-12-31`; break;
    case 'custom': from = custom?.from ?? startOfMonthISO(today); to = custom?.to ?? today; break;
  }
  return { key, from, to, label: labels[key] };
}

/** Equivalent prior period of the same length, for comparisons. */
export function previousPeriod(p: Period): Period {
  if (['this_month', 'last_month'].includes(p.key)) {
    const from = addMonthsISO(p.from, -1);
    return { ...p, from, to: endOfMonthISO(from), label: 'previous month' };
  }
  if (['this_quarter', 'last_quarter'].includes(p.key)) {
    const from = addMonthsISO(p.from, -3);
    return { ...p, from, to: addDaysISO(p.from, -1), label: 'previous quarter' };
  }
  if (['ytd', 'last_year', 'last_12'].includes(p.key)) {
    return { ...p, from: addMonthsISO(p.from, -12), to: addMonthsISO(p.to, -12), label: 'same period last year' };
  }
  const len = Math.round((new Date(p.to).getTime() - new Date(p.from).getTime()) / 864e5) + 1;
  return { ...p, from: addDaysISO(p.from, -len), to: addDaysISO(p.from, -1), label: 'previous period' };
}

export function usePeriod(today: ISODate, initial: PeriodKey = 'this_month') {
  const [key, setKey] = useState<PeriodKey>(initial);
  const [custom, setCustom] = useState({ from: startOfMonthISO(today), to: today });
  const period = resolvePeriod(key, today, custom);
  return { period, key, setKey, custom, setCustom };
}

export function PeriodPicker({ state }: { state: ReturnType<typeof usePeriod> }) {
  const { key, setKey, custom, setCustom } = state;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select className="w-44" value={key} onChange={setKey} options={(Object.keys(labels) as PeriodKey[]).map((k) => ({ value: k, label: labels[k] }))} />
      {key === 'custom' && (
        <div className="flex items-center gap-1.5">
          <Input type="date" className="!w-40" value={custom.from} max={custom.to} onChange={(e) => e.target.value && setCustom({ ...custom, from: e.target.value })} />
          <span className="text-subtle">–</span>
          <Input type="date" className="!w-40" value={custom.to} min={custom.from} onChange={(e) => e.target.value && setCustom({ ...custom, to: e.target.value })} />
        </div>
      )}
    </div>
  );
}
