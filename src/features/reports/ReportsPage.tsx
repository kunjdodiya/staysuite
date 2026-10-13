import { useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { FileSpreadsheet, FileText, Download, BarChart3 } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader, Button, Card, CardHeader, Select, Tabs, EmptyState, Delta } from '@/components/ui';
import { Menu } from '@/components/ui/overlay';
import { BarList, IncomeExpenseChart, SingleBarChart, TrendArea, C } from '@/components/charts';
import { PeriodPicker, usePeriod } from '@/components/PeriodPicker';
import { useData, useLedgers, useLookup, useMoney, useToday, useVisiblePropertyIds } from '@/data/hooks';
import { addMonthsISO, endOfMonthISO, startOfMonthISO, fmtDate } from '@/lib/dates';
import { toMajor, toMinor } from '@/lib/money';
import { outstanding, pctChange, periodSummary, type PeriodSummary } from '@/domain/finance';
import { bookingTotals } from '@/domain/pricing';
import { expenseCategoryLabel, sourceLabel } from '@/domain/labels';
import type { BookingSource, ExpenseCategory } from '@/domain/types';
import { exportCSV, exportExcel, exportPDF, type ReportTable } from './exporters';
import { cn } from '@/lib/cn';

type Tab = 'pnl' | 'occupancy' | 'sources' | 'properties' | 'expenses' | 'outstanding' | 'tax' | 'compare';

export default function ReportsPage() {
  const data = useData();
  const today = useToday();
  const money = useMoney({ cents: false });
  const ledgers = useLedgers();
  const L = useLookup();
  const visible = useVisiblePropertyIds();
  const ps = usePeriod(today, 'last_12');
  const p = ps.period;
  const [tab, setTab] = useState<Tab>('pnl');
  const [pid, setPid] = useState('');
  const cur = data.business.currency;
  const M = (v: number) => toMajor(v, cur);
  const propertyId = pid || null;
  const props = data.properties.filter((x) => !visible || visible.has(x.id));

  const months = useMemo(() => {
    const out: { key: string; from: string; to: string; s: PeriodSummary }[] = [];
    for (let m = startOfMonthISO(p.from); m <= p.to; m = addMonthsISO(m, 1)) {
      const from = m < p.from ? p.from : m;
      const end = endOfMonthISO(m);
      const to = end > p.to ? p.to : end;
      out.push({ key: m, from, to, s: periodSummary(data, { from, to, propertyId }, ledgers) });
    }
    return out;
  }, [data, p.from, p.to, propertyId, ledgers]);
  const total = useMemo(() => periodSummary(data, { from: p.from, to: p.to, propertyId }, ledgers), [data, p.from, p.to, propertyId, ledgers]);

  const inPeriod = data.bookings.filter((b) => b.checkIn >= p.from && b.checkIn <= p.to && (!propertyId || b.propertyId === propertyId));

  // ── Tables ──
  const tables: Record<Exclude<Tab, 'compare'>, ReportTable> = useMemo(() => {
    const pnl: ReportTable = {
      title: 'Profit & loss', subtitle: 'Revenue recognised per night stayed, net of tax',
      columns: [
        { key: 'month', label: 'Month' }, { key: 'room', label: 'Room revenue', money: true }, { key: 'other', label: 'Other income', money: true },
        { key: 'revenue', label: 'Total revenue', money: true }, { key: 'expenses', label: 'Expenses', money: true }, { key: 'profit', label: 'Net profit', money: true },
        { key: 'margin', label: 'Margin', pct: true }, { key: 'cash', label: 'Cash received', money: true },
      ],
      rows: months.map(({ key, s }) => ({ month: format(parseISO(key), 'MMM yyyy'), room: M(s.revenue - s.otherIncome), other: M(s.otherIncome), revenue: M(s.revenue), expenses: M(s.expenses), profit: M(s.netProfit), margin: s.revenue ? (s.netProfit / s.revenue) * 100 : 0, cash: M(s.cashReceived) })),
      totals: { month: 'Total', room: M(total.revenue - total.otherIncome), other: M(total.otherIncome), revenue: M(total.revenue), expenses: M(total.expenses), profit: M(total.netProfit), margin: total.revenue ? (total.netProfit / total.revenue) * 100 : 0, cash: M(total.cashReceived) },
    };
    const occ: ReportTable = {
      title: 'Occupancy & rates',
      columns: [{ key: 'month', label: 'Month' }, { key: 'sold', label: 'Nights sold', align: 'right' }, { key: 'avail', label: 'Available', align: 'right' }, { key: 'occ', label: 'Occupancy', pct: true }, { key: 'adr', label: 'ADR', money: true }, { key: 'revpar', label: 'RevPAR', money: true }],
      rows: months.map(({ key, s }) => ({ month: format(parseISO(key), 'MMM yyyy'), sold: s.nightsSold, avail: s.availableNights, occ: s.occupancy * 100, adr: M(s.adr), revpar: M(s.revpar) })),
      totals: { month: 'Total', sold: total.nightsSold, avail: total.availableNights, occ: total.occupancy * 100, adr: M(total.adr), revpar: M(total.revpar) },
    };
    const bySource = new Map<BookingSource, { n: number; nights: number; rev: number; cancelled: number }>();
    for (const b of inPeriod) {
      if (b.status === 'inquiry') continue;
      const s = bySource.get(b.source) ?? { n: 0, nights: 0, rev: 0, cancelled: 0 };
      if (b.status === 'cancelled' || b.status === 'no_show') s.cancelled++;
      else { s.n++; s.nights += b.nights.length; s.rev += bookingTotals(b).revenue; }
      bySource.set(b.source, s);
    }
    const srcTotal = [...bySource.values()].reduce((a, s) => a + s.rev, 0);
    const sources: ReportTable = {
      title: 'Booking sources', subtitle: 'Bookings by check-in date in the period',
      columns: [{ key: 'source', label: 'Source' }, { key: 'n', label: 'Bookings', align: 'right' }, { key: 'nights', label: 'Nights', align: 'right' }, { key: 'avg', label: 'Avg stay', align: 'right' }, { key: 'rev', label: 'Revenue', money: true }, { key: 'share', label: 'Share', pct: true }, { key: 'cx', label: 'Cancel rate', pct: true }],
      rows: [...bySource.entries()].sort((a, b) => b[1].rev - a[1].rev).map(([k, s]) => ({ source: sourceLabel[k], n: s.n, nights: s.nights, avg: s.n ? Number((s.nights / s.n).toFixed(1)) : 0, rev: M(s.rev), share: srcTotal ? (s.rev / srcTotal) * 100 : 0, cx: s.n + s.cancelled ? (s.cancelled / (s.n + s.cancelled)) * 100 : 0 })),
    };
    const properties: ReportTable = {
      title: 'Property performance',
      columns: [{ key: 'name', label: 'Property' }, { key: 'revenue', label: 'Revenue', money: true }, { key: 'expenses', label: 'Expenses', money: true }, { key: 'profit', label: 'Net profit', money: true }, { key: 'occ', label: 'Occupancy', pct: true }, { key: 'adr', label: 'ADR', money: true }, { key: 'revpar', label: 'RevPAR', money: true }],
      rows: props.map((pr) => { const s = periodSummary(data, { from: p.from, to: p.to, propertyId: pr.id }, ledgers); return { name: pr.name, revenue: M(s.revenue), expenses: M(s.expenses), profit: M(s.netProfit), occ: s.occupancy * 100, adr: M(s.adr), revpar: M(s.revpar) }; }),
    };
    const sharedExp = data.transactions.filter((t) => t.kind === 'expense' && !t.propertyId && t.date >= p.from && t.date <= p.to).reduce((a, t) => a + t.amount, 0);
    if (sharedExp && !propertyId) properties.rows.push({ name: 'Shared / unassigned costs', revenue: 0, expenses: M(sharedExp), profit: -M(sharedExp), occ: '', adr: '', revpar: '' } as never);
    const expenses: ReportTable = {
      title: 'Expense breakdown',
      columns: [{ key: 'cat', label: 'Category' }, { key: 'amount', label: 'Amount', money: true }, { key: 'share', label: 'Share', pct: true }, { key: 'count', label: 'Entries', align: 'right' }],
      rows: (Object.entries(total.expensesByCategory) as [ExpenseCategory, number][]).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({
        cat: expenseCategoryLabel[k], amount: M(v), share: total.expenses ? (v / total.expenses) * 100 : 0,
        count: data.transactions.filter((t) => t.kind === 'expense' && t.expenseCategory === k && t.date >= p.from && t.date <= p.to && (!propertyId || t.propertyId === propertyId)).length,
      })),
      totals: { cat: 'Total', amount: M(total.expenses), share: 100, count: '' },
    };
    const out = outstanding(data, today, propertyId, ledgers);
    const outTable: ReportTable = {
      title: 'Outstanding payments', subtitle: `As of ${fmtDate(today)}`,
      columns: [{ key: 'code', label: 'Booking' }, { key: 'guest', label: 'Guest' }, { key: 'stay', label: 'Stay' }, { key: 'total', label: 'Total', money: true }, { key: 'paid', label: 'Paid', money: true }, { key: 'balance', label: 'Balance', money: true }, { key: 'status', label: 'Status' }],
      rows: out.rows.map((r) => ({ code: r.ledger.booking.code, guest: L.guestName(r.ledger.booking.guestId), stay: `${r.ledger.booking.checkIn} → ${r.ledger.booking.checkOut}`, total: M(r.ledger.totals.total), paid: M(r.ledger.paid), balance: M(r.ledger.balance), status: r.overdue ? 'Overdue' : r.dueNow ? 'Due now' : 'Upcoming' })),
      totals: { code: 'Total', guest: '', stay: '', total: '', paid: '', balance: M(out.total), status: '' },
    };
    const tax: ReportTable = {
      title: `${data.business.tax.label} summary`, subtitle: 'Tax on stays, recognised per night. Expenses shown for input-credit review.',
      columns: [{ key: 'month', label: 'Month' }, { key: 'taxable', label: 'Taxable value', money: true }, { key: 'tax', label: `${data.business.tax.label} collected`, money: true }, { key: 'expenses', label: 'Expenses', money: true }],
      rows: months.map(({ key, s }) => ({ month: format(parseISO(key), 'MMM yyyy'), taxable: M(s.revenue - s.otherIncome), tax: M(s.taxCollected), expenses: M(s.expenses) })),
      totals: { month: 'Total', taxable: M(total.revenue - total.otherIncome), tax: M(total.taxCollected), expenses: M(total.expenses) },
    };
    return { pnl, occupancy: occ, sources, properties, expenses, outstanding: outTable, tax };
  }, [months, total, inPeriod, props, data, p.from, p.to, propertyId, ledgers, today, L]); // eslint-disable-line react-hooks/exhaustive-deps

  const fname = `${tab}-${p.from}-to-${p.to}`;
  const meta = { business: data.business.name, period: `${fmtDate(p.from)} – ${fmtDate(p.to)}`, currency: cur, locale: data.business.locale };
  const current = tab === 'compare' ? null : tables[tab];
  const chartPts = months.map(({ key, s }) => ({ label: format(parseISO(key), 'MMM'), full: format(parseISO(key), 'MMMM yyyy'), income: s.revenue, expense: s.expenses, profit: s.netProfit }));

  return (
    <div>
      <PageHeader title="Reports" subtitle="Business insights from your recorded bookings and transactions"
        actions={<Menu trigger={({ onClick }) => <Button variant="primary" icon={<Download className="h-4 w-4" />} onClick={onClick}>Export</Button>} items={[
          { label: 'This report — CSV', icon: <FileText />, onClick: () => current && exportCSV(current, fname), disabled: !current },
          { label: 'This report — Excel', icon: <FileSpreadsheet />, onClick: () => current && exportExcel([current], fname), disabled: !current },
          { label: 'This report — PDF', icon: <FileText />, onClick: () => current && exportPDF([current], fname, meta), disabled: !current },
          'divider',
          { label: 'All reports — Excel workbook', icon: <FileSpreadsheet />, onClick: () => { exportExcel(Object.values(tables), `staysuite-reports-${p.from}-to-${p.to}`); toast.success('Workbook exported'); } },
          { label: 'All reports — PDF pack', icon: <FileText />, onClick: () => exportPDF(Object.values(tables), `staysuite-reports-${p.from}-to-${p.to}`, meta) },
        ]} />}>
        <div className="flex flex-wrap items-center gap-2">
          <PeriodPicker state={ps} />
          {props.length > 1 && <Select className="w-48" value={pid} onChange={setPid} options={props.map((x) => ({ value: x.id, label: x.name }))} placeholder="All properties" />}
        </div>
      </PageHeader>

      <Tabs value={tab} onChange={setTab} options={[
        { value: 'pnl', label: 'Profit & loss' }, { value: 'occupancy', label: 'Occupancy' }, { value: 'sources', label: 'Sources' }, { value: 'properties', label: 'Properties' },
        { value: 'expenses', label: 'Expenses' }, { value: 'outstanding', label: 'Outstanding' }, { value: 'tax', label: 'Tax' }, { value: 'compare', label: 'Compare' },
      ]} />

      <div className="mt-5 space-y-5">
        {tab === 'pnl' && <Card><CardHeader title="Revenue, expenses & profit" /><div className="px-3 sm:px-5 pb-5"><IncomeExpenseChart data={chartPts} height={300} labelFormat={(l) => chartPts.find((x) => x.label === l)?.full ?? l} /></div></Card>}
        {tab === 'occupancy' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Card><CardHeader title="Occupancy" /><div className="px-3 sm:px-5 pb-5"><TrendArea name="Occupancy" data={months.map(({ key, s }) => ({ label: format(parseISO(key), 'MMM'), value: Math.round(s.occupancy * 1000) / 10 }))} format={(v) => `${v}%`} /></div></Card>
            <Card><CardHeader title="Average nightly rate" /><div className="px-3 sm:px-5 pb-5"><SingleBarChart name="ADR" color={C.profit} data={months.map(({ key, s }) => ({ label: format(parseISO(key), 'MMM'), value: s.adr }))} format={(v) => money(v, { compact: true })} /></div></Card>
          </div>
        )}
        {tab === 'sources' && <Card><CardHeader title="Revenue by source" /><div className="px-5 pb-5"><BarList color={C.income} format={(v) => money(v)} items={tables.sources.rows.map((r) => ({ key: String(r.source), label: String(r.source), value: toMinor(Number(r.rev), cur) }))} empty={<p className="text-sm text-subtle">No bookings in this period</p>} /></div></Card>}
        {tab === 'expenses' && <Card><CardHeader title="Where the money goes" /><div className="px-5 pb-5"><BarList format={(v) => money(v)} items={(Object.entries(total.expensesByCategory) as [ExpenseCategory, number][]).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ key: k, label: expenseCategoryLabel[k], value: v }))} empty={<p className="text-sm text-subtle">No expenses in this period</p>} /></div></Card>}
        {tab === 'compare' ? <Compare /> : current && <TableView t={current} money={(v) => money(toMinor(v, cur))} />}
      </div>
    </div>
  );
}

function TableView({ t, money }: { t: ReportTable; money: (v: number) => string }) {
  const fmt = (v: string | number | undefined, c: ReportTable['columns'][number]) => (typeof v !== 'number' ? v ?? '' : c.pct ? `${v.toFixed(1)}%` : c.money ? money(v) : v.toLocaleString());
  return (
    <Card>
      <CardHeader title={t.title} subtitle={t.subtitle} />
      {t.rows.length === 0 ? <EmptyState icon={<BarChart3 className="h-5 w-5" />} title="No data for this period" /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] num">
            <thead><tr className="border-y border-border bg-surface-2/40 text-[12px] text-muted">{t.columns.map((c, i) => <th key={c.key} className={cn('font-medium py-2.5 px-3 whitespace-nowrap', i === 0 && 'pl-5', i === t.columns.length - 1 && 'pr-5', c.align === 'right' || c.money || c.pct ? 'text-right' : 'text-left')}>{c.label}</th>)}</tr></thead>
            <tbody>
              {t.rows.map((r, i) => <tr key={i} className="border-b border-border/70 hover:bg-surface-2/30">{t.columns.map((c, j) => <td key={c.key} className={cn('py-2.5 px-3 whitespace-nowrap', j === 0 && 'pl-5 font-medium', j === t.columns.length - 1 && 'pr-5', c.align === 'right' || c.money || c.pct ? 'text-right' : 'text-left', typeof r[c.key] === 'number' && (r[c.key] as number) < 0 && 'text-danger')}>{fmt(r[c.key], c)}</td>)}</tr>)}
            </tbody>
            {t.totals && <tfoot><tr className="bg-surface-2/60 font-semibold">{t.columns.map((c, j) => <td key={c.key} className={cn('py-3 px-3 whitespace-nowrap', j === 0 && 'pl-5', j === t.columns.length - 1 && 'pr-5', c.align === 'right' || c.money || c.pct ? 'text-right' : 'text-left')}>{fmt(t.totals![c.key], c)}</td>)}</tr></tfoot>}
          </table>
        </div>
      )}
    </Card>
  );
}

function Compare() {
  const data = useData();
  const today = useToday();
  const money = useMoney({ cents: false });
  const ledgers = useLedgers();
  const [mode, setMode] = useState<'month' | 'year'>('month');
  const [pid, setPid] = useState('');
  const monthOpts = Array.from({ length: 24 }, (_, i) => addMonthsISO(startOfMonthISO(today), -i)).map((m) => ({ value: m, label: format(parseISO(m), 'MMMM yyyy') }));
  const y = Number(today.slice(0, 4));
  const yearOpts = [y, y - 1, y - 2].map((v) => ({ value: String(v), label: String(v) }));
  const [a, setA] = useState(monthOpts[0].value);
  const [b, setB] = useState(monthOpts[12]?.value ?? monthOpts[1].value);
  const [ya, setYa] = useState(String(y));
  const [yb, setYb] = useState(String(y - 1));
  const range = (k: string) => (mode === 'month' ? { from: k, to: endOfMonthISO(k) } : { from: `${k}-01-01`, to: `${k}-12-31` });
  const A = periodSummary(data, { ...range(mode === 'month' ? a : ya), propertyId: pid || null }, ledgers);
  const B = periodSummary(data, { ...range(mode === 'month' ? b : yb), propertyId: pid || null }, ledgers);
  const rows: { label: string; a: number; b: number; f: (v: number) => string; inverse?: boolean }[] = [
    { label: 'Revenue', a: A.revenue, b: B.revenue, f: (v) => money(v) },
    { label: 'Expenses', a: A.expenses, b: B.expenses, f: (v) => money(v), inverse: true },
    { label: 'Net profit', a: A.netProfit, b: B.netProfit, f: (v) => money(v) },
    { label: 'Cash received', a: A.cashReceived, b: B.cashReceived, f: (v) => money(v) },
    { label: 'Nights sold', a: A.nightsSold, b: B.nightsSold, f: (v) => String(v) },
    { label: 'Occupancy', a: A.occupancy, b: B.occupancy, f: (v) => `${Math.round(v * 100)}%` },
    { label: 'Average nightly rate', a: A.adr, b: B.adr, f: (v) => money(v) },
    { label: 'RevPAR', a: A.revpar, b: B.revpar, f: (v) => money(v) },
    { label: 'New stays', a: A.bookingsCount, b: B.bookingsCount, f: (v) => String(v) },
  ];
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 p-4 sm:p-5">
        <Select className="w-32" value={mode} onChange={setMode} options={[{ value: 'month', label: 'Months' }, { value: 'year', label: 'Years' }]} />
        {mode === 'month' ? <><Select className="w-44" value={a} onChange={setA} options={monthOpts} /><span className="text-muted text-sm">vs</span><Select className="w-44" value={b} onChange={setB} options={monthOpts} /></>
          : <><Select className="w-28" value={ya} onChange={setYa} options={yearOpts} /><span className="text-muted text-sm">vs</span><Select className="w-28" value={yb} onChange={setYb} options={yearOpts} /></>}
        {data.properties.length > 1 && <Select className="w-48" value={pid} onChange={setPid} options={data.properties.map((x) => ({ value: x.id, label: x.name }))} placeholder="All properties" />}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[13.5px] num">
          <thead><tr className="border-y border-border bg-surface-2/40 text-[12px] text-muted"><th className="text-left font-medium py-2.5 pl-5">Metric</th><th className="text-right font-medium px-3">{mode === 'month' ? format(parseISO(a), 'MMM yyyy') : ya}</th><th className="text-right font-medium px-3">{mode === 'month' ? format(parseISO(b), 'MMM yyyy') : yb}</th><th className="text-right font-medium pr-5">Change</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.label} className="border-b border-border/70"><td className="py-3 pl-5 font-medium">{r.label}</td><td className="text-right px-3">{r.f(r.a)}</td><td className="text-right px-3 text-muted">{r.f(r.b)}</td><td className="text-right pr-5"><Delta value={pctChange(r.a, r.b)} inverse={r.inverse} /></td></tr>)}</tbody>
        </table>
      </div>
    </Card>
  );
}
