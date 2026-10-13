import { Bar, BarChart, CartesianGrid, Line, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Area, AreaChart } from 'recharts';
import type { ReactNode } from 'react';
import { useMoney } from '@/data/hooks';
import { cn } from '@/lib/cn';

/** Chart colors come from CSS tokens so light/dark are selected, not inverted. */
export const C = {
  income: 'rgb(var(--s1))',
  expense: 'rgb(var(--s2))',
  profit: 'rgb(var(--s3))',
  grid: 'rgb(var(--border))',
  axis: 'rgb(var(--subtle))',
};

export function ChartTooltip({ active, payload, label, format, labelFormat }: { active?: boolean; payload?: { name: string; value: number; color: string; dataKey: string }[]; label?: string; format: (v: number) => string; labelFormat?: (l: string) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border bg-surface/95 backdrop-blur px-3 py-2.5 shadow-pop text-[12.5px] min-w-[160px]">
      <div className="text-muted mb-1.5">{labelFormat ? labelFormat(String(label)) : label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-1.5 text-fg"><span className="h-2 w-2 rounded-full" style={{ background: p.color }} />{p.name}</span>
          <span className="num font-medium text-fg">{format(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

export function Legend({ items, className }: { items: { label: string; color: string; dashed?: boolean }[]; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted', className)}>
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          {i.dashed ? <span className="w-3.5 border-t-2" style={{ borderColor: i.color }} /> : <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: i.color }} />}
          {i.label}
        </span>
      ))}
    </div>
  );
}

export interface IEPoint { label: string; income: number; expense: number; profit: number }

export function IncomeExpenseChart({ data, height = 260, labelFormat }: { data: IEPoint[]; height?: number; labelFormat?: (l: string) => string }) {
  const money = useMoney();
  return (
    <div>
      <Legend className="mb-3" items={[{ label: 'Revenue', color: C.income }, { label: 'Expenses', color: C.expense }, { label: 'Net profit', color: C.profit, dashed: true }]} />
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barGap={2} barCategoryGap="28%">
            <CartesianGrid vertical={false} stroke={C.grid} strokeDasharray="0" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: C.axis, fontSize: 11.5 }} dy={6} />
            <YAxis tickLine={false} axisLine={false} tick={{ fill: C.axis, fontSize: 11.5 }} width={56} tickFormatter={(v) => money(v, { compact: true })} />
            <Tooltip cursor={{ fill: 'rgb(var(--surface-2))' }} content={<ChartTooltip format={(v) => money(v)} labelFormat={labelFormat} />} />
            <Bar dataKey="income" name="Revenue" fill={C.income} radius={[4, 4, 0, 0]} maxBarSize={28} />
            <Bar dataKey="expense" name="Expenses" fill={C.expense} radius={[4, 4, 0, 0]} maxBarSize={28} />
            <Line dataKey="profit" name="Net profit" stroke={C.profit} strokeWidth={2} dot={{ r: 3, strokeWidth: 2, fill: 'rgb(var(--surface))' }} activeDot={{ r: 5 }} type="monotone" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function SingleBarChart({ data, height = 220, color = C.income, format, name, labelFormat }: { data: { label: string; value: number }[]; height?: number; color?: string; format: (v: number) => string; name: string; labelFormat?: (l: string) => string }) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={C.grid} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: C.axis, fontSize: 11 }} dy={6} interval="preserveStartEnd" />
          <YAxis tickLine={false} axisLine={false} tick={{ fill: C.axis, fontSize: 11 }} width={48} tickFormatter={(v) => format(v)} />
          <Tooltip cursor={{ fill: 'rgb(var(--surface-2))' }} content={<ChartTooltip format={format} labelFormat={labelFormat} />} />
          <Bar dataKey="value" name={name} fill={color} radius={[4, 4, 0, 0]} maxBarSize={22} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TrendArea({ data, height = 200, format, name, color = C.income, labelFormat }: { data: { label: string; value: number }[]; height?: number; format: (v: number) => string; name: string; color?: string; labelFormat?: (l: string) => string }) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`grad-${name}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={color} stopOpacity={0.22} />
              <stop offset="1" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={C.grid} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: C.axis, fontSize: 11 }} dy={6} />
          <YAxis tickLine={false} axisLine={false} tick={{ fill: C.axis, fontSize: 11 }} width={44} tickFormatter={format} />
          <Tooltip cursor={{ stroke: C.axis, strokeDasharray: '3 3' }} content={<ChartTooltip format={format} labelFormat={labelFormat} />} />
          <Area dataKey="value" name={name} stroke={color} strokeWidth={2} fill={`url(#grad-${name})`} type="monotone" activeDot={{ r: 4 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Horizontal ranked bars — clearer than a donut for category breakdowns. */
export function BarList({ items, format, color = C.expense, empty }: { items: { label: ReactNode; value: number; key: string; sub?: ReactNode }[]; format: (v: number) => string; color?: string; empty?: ReactNode }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  const total = items.reduce((s, i) => s + i.value, 0);
  if (!items.length) return <>{empty}</>;
  return (
    <div className="space-y-2.5">
      {items.map((i) => (
        <div key={i.key} className="group" title={`${format(i.value)} · ${total ? Math.round((i.value / total) * 100) : 0}%`}>
          <div className="flex items-baseline justify-between gap-3 text-[13px] mb-1">
            <span className="text-fg truncate">{i.label}</span>
            <span className="num text-fg shrink-0">{format(i.value)} <span className="text-subtle text-[11.5px] ml-1">{total ? Math.round((i.value / total) * 100) : 0}%</span></span>
          </div>
          <div className="h-2 rounded-full bg-surface-2 overflow-hidden">
            <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${(i.value / max) * 100}%`, background: color }} />
          </div>
        </div>
      ))}
    </div>
  );
}
