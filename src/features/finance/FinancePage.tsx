import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';
import { Download, Plus, Pencil, Trash2, FileText, Paperclip, MessageCircle, CalendarClock, Pause, Play, SkipForward, Info, Wallet, CreditCard, Banknote, Smartphone, Repeat } from 'lucide-react';
import { PageHeader, Button, Card, CardHeader, Stat, Tabs, SearchInput, Select, EmptyState, LoadMore, Badge, Segmented, Field, MoneyInput, Input, Switch } from '@/components/ui';
import { Modal, Menu, useConfirm } from '@/components/ui/overlay';
import { BarList, IncomeExpenseChart, C } from '@/components/charts';
import { PeriodPicker, previousPeriod, usePeriod } from '@/components/PeriodPicker';
import { PropertyDot } from '@/components/domain';
import { useCan, useData, useLedgers, useLookup, useMoney, useToday } from '@/data/hooks';
import { useStore } from '@/data/store';
import { openOverlay } from '@/data/ui';
import { addMonthsISO, fmtDate, monthKey, relDay, startOfMonthISO, endOfMonthISO, nightsBetween } from '@/lib/dates';
import { downloadCSV } from '@/lib/download';
import { parseAmount, toMajor } from '@/lib/money';
import { outstanding, pctChange, periodSummary } from '@/domain/finance';
import { expenseCategoryLabel, frequencyLabel, incomeCategoryLabel, methodLabel, options, purposeLabel, txnKindLabel } from '@/domain/labels';
import type { ExpenseCategory, PaymentMethod, RecurringExpense, Transaction, TxnKind } from '@/domain/types';
import { cn } from '@/lib/cn';
import { uid } from '@/lib/id';

type Tab = 'overview' | 'transactions' | 'outstanding' | 'recurring';

export default function FinancePage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) ?? 'overview';
  const canEdit = useCan('finance.edit');
  const data = useData();
  const today = useToday();
  const dueSoon = data.recurring.filter((r) => r.active && nightsBetween(today, r.nextDue) <= data.business.notificationPrefs.recurringLeadDays).length;
  const out = useMemo(() => outstanding(data, today), [data, today]);
  return (
    <div>
      <PageHeader title="Finances" subtitle="Income, expenses and cash — calculated from your recorded transactions"
        actions={canEdit && <>
          <Button icon={<Wallet className="h-4 w-4" />} onClick={() => openOverlay({ kind: 'transaction', txnKind: 'expense' })}>Add expense</Button>
          <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => openOverlay({ kind: 'transaction', txnKind: 'payment' })}>Record income</Button>
        </>}>
        <Tabs value={tab} onChange={(v) => setParams({ tab: v })} options={[
          { value: 'overview', label: 'Overview' }, { value: 'transactions', label: 'Transactions', count: data.transactions.length },
          { value: 'outstanding', label: 'Outstanding', count: out.rows.filter((r) => r.dueNow).length }, { value: 'recurring', label: 'Recurring', count: dueSoon || undefined },
        ]} />
      </PageHeader>
      {tab === 'overview' && <Overview />}
      {tab === 'transactions' && <Transactions />}
      {tab === 'outstanding' && <Outstanding />}
      {tab === 'recurring' && <Recurring />}
    </div>
  );
}

function Overview() {
  const data = useData();
  const today = useToday();
  const money = useMoney({ cents: false });
  const ledgers = useLedgers();
  const ps = usePeriod(today, 'this_month');
  const [pid, setPid] = useState('');
  const p = ps.period;
  const prev = previousPeriod(p);
  const s = useMemo(() => periodSummary(data, { from: p.from, to: p.to, propertyId: pid || null }, ledgers), [data, p.from, p.to, pid, ledgers]);
  const sp = useMemo(() => periodSummary(data, { from: prev.from, to: prev.to, propertyId: pid || null }, ledgers), [data, prev.from, prev.to, pid, ledgers]);
  const out = useMemo(() => outstanding(data, today, pid || null, ledgers), [data, today, pid, ledgers]);

  // Chart months: span of the period, minimum 6 months for context
  const series = useMemo(() => {
    let start = startOfMonthISO(p.from);
    const end = startOfMonthISO(p.to);
    if (nightsBetween(start, end) < 150) start = addMonthsISO(end, -5);
    const pts = [];
    for (let m = start; m <= end; m = addMonthsISO(m, 1)) {
      const x = periodSummary(data, { from: m, to: endOfMonthISO(m), propertyId: pid || null }, ledgers);
      pts.push({ label: format(parseISO(m), 'MMM'), full: format(parseISO(m), 'MMMM yyyy'), income: x.revenue, expense: x.expenses, profit: x.netProfit });
    }
    return pts;
  }, [data, p.from, p.to, pid, ledgers]);

  const byProperty = data.properties.map((pr) => {
    const x = periodSummary(data, { from: p.from, to: p.to, propertyId: pr.id }, ledgers);
    return { pr, ...x };
  });
  // Shared (unassigned) expenses
  const shared = data.transactions.filter((t) => t.kind === 'expense' && !t.propertyId && t.date >= p.from && t.date <= p.to).reduce((a, t) => a + t.amount, 0);
  const cash = s.cashByMethod.cash;
  const digital = Object.entries(s.cashByMethod).filter(([k]) => k !== 'cash').reduce((a, [, v]) => a + v, 0);
  const cashExp = data.transactions.filter((t) => t.kind === 'expense' && t.method === 'cash' && t.date >= p.from && t.date <= p.to && (!pid || t.propertyId === pid)).reduce((a, t) => a + t.amount, 0);
  const vs = `vs ${prev.label}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <PeriodPicker state={ps} />
        {data.properties.length > 1 && <Select className="w-48" value={pid} onChange={setPid} options={data.properties.map((x) => ({ value: x.id, label: x.name }))} placeholder="All properties" />}
        <span className="text-[12.5px] text-subtle ml-auto">{fmtDate(p.from)} – {fmtDate(p.to)}</span>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        <Stat label="Revenue" value={money(s.revenue)} delta={pctChange(s.revenue, sp.revenue)} sub={vs} />
        <Stat label="Expenses" value={money(s.expenses)} delta={pctChange(s.expenses, sp.expenses)} inverse sub={vs} />
        <Stat label="Net profit" value={<span className={s.netProfit < 0 ? 'text-danger' : ''}>{money(s.netProfit)}</span>} delta={pctChange(s.netProfit, sp.netProfit)} sub={s.revenue ? `${Math.round((s.netProfit / s.revenue) * 100)}% margin` : vs} />
        <Stat label="Cash received" value={money(s.cashReceived)} delta={pctChange(s.cashReceived, sp.cashReceived)} sub="net of refunds" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5">
        <Card className="lg:col-span-2">
          <CardHeader title="Revenue, expenses & profit" subtitle="By month" />
          <div className="px-3 sm:px-5 pb-5"><IncomeExpenseChart data={series} height={280} labelFormat={(l) => series.find((x) => x.label === l)?.full ?? l} /></div>
        </Card>
        <Card>
          <CardHeader title="What makes up these numbers" />
          <div className="px-5 pb-5 space-y-2.5 text-[13px]">
            <Line label="Room & stay revenue" value={money(s.revenue - s.otherIncome - s.cancellationRevenue)} />
            {s.cancellationRevenue > 0 && <Line label="Cancellation charges kept" value={money(s.cancellationRevenue)} />}
            <Line label="Other income" value={money(s.otherIncome)} />
            <Line label="Total revenue" value={money(s.revenue)} strong />
            <div className="divide my-1" />
            <Line label={`${data.business.tax.label} collected (not revenue)`} value={money(s.taxCollected)} />
            <Line label="Refunds paid" value={`−${money(s.refunds)}`} />
            <Line label="Deposits received / returned" value={`${money(s.depositsReceived, { compact: true })} / ${money(s.depositsReturned, { compact: true })}`} />
            <Line label="Deposits held now" value={money(out.depositsHeld)} />
            <div className="divide my-1" />
            <Line label="Net cash flow" value={money(s.netCashFlow)} strong tone={s.netCashFlow < 0 ? 'text-danger' : 'text-success'} />
            <p className="flex gap-2 text-[12px] text-subtle pt-2"><Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />Revenue is earned per night stayed, net of tax. Cash received counts money on the day it arrived. Deposits are refundable and never counted as revenue.</p>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5">
        <Card>
          <CardHeader title="Expenses by category" subtitle={money(s.expenses)} />
          <div className="px-5 pb-5">
            <BarList format={(v) => money(v)} items={Object.entries(s.expensesByCategory).sort((a, b) => b[1]! - a[1]!).map(([k, v]) => ({ key: k, label: expenseCategoryLabel[k as ExpenseCategory], value: v! }))} empty={<p className="text-[13px] text-subtle">No expenses in this period</p>} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Profit by property" />
          <div className="px-5 pb-5 space-y-3">
            {byProperty.map(({ pr, revenue, expenses, netProfit, occupancy }) => (
              <div key={pr.id}>
                <div className="flex items-center justify-between text-[13.5px]">
                  <span className="flex items-center gap-2 font-medium"><PropertyDot color={pr.color} />{pr.name}</span>
                  <span className={cn('num font-medium', netProfit < 0 && 'text-danger')}>{money(netProfit)}</span>
                </div>
                <div className="text-[12px] text-muted mt-0.5 num">{money(revenue, { compact: true })} in · {money(expenses, { compact: true })} out · {Math.round(occupancy * 100)}% occupied</div>
              </div>
            ))}
            {shared > 0 && <div className="pt-2 border-t border-border text-[12.5px] text-muted flex justify-between"><span>Shared costs (not assigned)</span><span className="num">−{money(shared)}</span></div>}
          </div>
        </Card>
        <Card>
          <CardHeader title="Cash vs digital" subtitle="Money received this period" />
          <div className="px-5 pb-5">
            <div className="flex h-3 rounded-full overflow-hidden bg-surface-2 gap-[2px]">
              <div style={{ width: `${(cash / Math.max(1, cash + digital)) * 100}%`, background: C.expense }} />
              <div style={{ width: `${(digital / Math.max(1, cash + digital)) * 100}%`, background: C.income }} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-[13px]">
              <div><div className="flex items-center gap-1.5 text-muted"><span className="h-2 w-2 rounded-sm" style={{ background: C.expense }} />Cash</div><div className="font-semibold num">{money(cash)}</div></div>
              <div><div className="flex items-center gap-1.5 text-muted"><span className="h-2 w-2 rounded-sm" style={{ background: C.income }} />Bank, UPI & cards</div><div className="font-semibold num">{money(digital)}</div></div>
            </div>
            <div className="mt-4 space-y-1.5">
              {(Object.entries(s.cashByMethod) as [PaymentMethod, number][]).filter(([, v]) => v).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                <div key={k} className="flex justify-between text-[13px]"><span className="flex items-center gap-2 text-muted">{methodIcon(k)}{methodLabel[k]}</span><span className="num">{money(v)}</span></div>
              ))}
            </div>
            <div className="mt-4 pt-3 border-t border-border flex justify-between text-[13px]"><span className="text-muted">Cash expenses paid</span><span className="num">{money(cashExp)}</span></div>
            <div className="flex justify-between text-[13px] mt-1"><span className="text-muted">Net cash in hand (period)</span><span className="num font-medium">{money(cash - cashExp)}</span></div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        <Stat label="Occupancy" value={`${Math.round(s.occupancy * 100)}%`} delta={pctChange(s.occupancy, sp.occupancy)} sub={`${s.nightsSold}/${s.availableNights} unit-nights`} />
        <Stat label="Avg nightly rate" value={money(s.adr)} delta={pctChange(s.adr, sp.adr)} sub="ADR" />
        <Stat label="RevPAR" value={money(s.revpar)} delta={pctChange(s.revpar, sp.revpar)} sub="revenue per available unit-night" />
        <Stat label="Guest balances due" value={money(out.dueNow)} sub={out.overdue ? <span className="text-danger">{money(out.overdue)} overdue</span> : `${money(out.upcoming, { compact: true })} on upcoming stays`} />
      </div>
    </div>
  );
}

const methodIcon = (m: PaymentMethod) => {
  const cls = 'h-3.5 w-3.5';
  if (m === 'cash') return <Banknote className={cls} />;
  if (m === 'upi' || m === 'wallet') return <Smartphone className={cls} />;
  if (m === 'card') return <CreditCard className={cls} />;
  return <Wallet className={cls} />;
};

function Line({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: string }) {
  return <div className="flex justify-between gap-3"><span className={strong ? 'font-medium' : 'text-muted'}>{label}</span><span className={cn('num', strong && 'font-semibold', tone)}>{value}</span></div>;
}

type KindFilter = 'all' | 'in' | 'out' | 'refunds' | 'deposits';

function Transactions() {
  const data = useData();
  const today = useToday();
  const money = useMoney();
  const L = useLookup();
  const confirm = useConfirm();
  const canEdit = useCan('finance.edit');
  const canDocs = useCan('documents.issue');
  const del = useStore((s) => s.deleteTransaction);
  const issue = useStore((s) => s.issueDocument);
  const ps = usePeriod(today, 'this_month');
  const [kind, setKind] = useState<KindFilter>('all');
  const [method, setMethod] = useState<'' | 'cash' | 'digital'>('');
  const [category, setCategory] = useState<ExpenseCategory | ''>('');
  const [pid, setPid] = useState('');
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(50);
  const p = ps.period;

  const kinds: Record<KindFilter, TxnKind[]> = { all: ['payment', 'income', 'expense', 'refund', 'deposit', 'deposit_return'], in: ['payment', 'income'], out: ['expense'], refunds: ['refund'], deposits: ['deposit', 'deposit_return'] };
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return data.transactions
      .filter((t) => t.date >= p.from && t.date <= p.to && kinds[kind].includes(t.kind))
      .filter((t) => !pid || t.propertyId === pid)
      .filter((t) => !method || (method === 'cash' ? t.method === 'cash' : t.method !== 'cash'))
      .filter((t) => !category || t.expenseCategory === category)
      .filter((t) => !s || `${t.vendor} ${t.notes} ${t.reference} ${L.guestName(t.guestId)} ${L.booking(t.bookingId)?.code ?? ''}`.toLowerCase().includes(s))
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  }, [data.transactions, p.from, p.to, kind, pid, method, category, q, L]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalIn = rows.filter((t) => t.kind === 'payment' || t.kind === 'income').reduce((a, t) => a + t.amount, 0);
  const totalOut = rows.filter((t) => t.kind === 'expense' || t.kind === 'refund').reduce((a, t) => a + t.amount, 0);
  const isOut = (t: Transaction) => ['expense', 'refund', 'deposit_return'].includes(t.kind);
  const title = (t: Transaction) => t.kind === 'expense' ? (t.vendor || expenseCategoryLabel[t.expenseCategory!]) : t.guestId ? L.guestName(t.guestId) : t.vendor || t.notes || txnKindLabel[t.kind];
  const sub = (t: Transaction) => t.kind === 'expense' ? expenseCategoryLabel[t.expenseCategory!] : t.kind === 'income' ? incomeCategoryLabel[t.incomeCategory!] : t.purpose ? purposeLabel[t.purpose] : txnKindLabel[t.kind];

  function exportCsv() {
    const cur = data.business.currency;
    downloadCSV(rows.map((t) => ({
      Date: t.date, Type: txnKindLabel[t.kind], Category: t.kind === 'expense' ? expenseCategoryLabel[t.expenseCategory!] : t.kind === 'income' ? incomeCategoryLabel[t.incomeCategory!] : t.purpose ? purposeLabel[t.purpose] : '',
      Description: title(t), Property: L.property(t.propertyId)?.name ?? 'Shared', Booking: L.booking(t.bookingId)?.code ?? '', Method: methodLabel[t.method],
      Reference: t.reference, 'Amount in': isOut(t) ? '' : toMajor(t.amount, cur), 'Amount out': isOut(t) ? toMajor(t.amount, cur) : '', Notes: t.notes,
    })), `transactions-${p.from}-to-${p.to}.csv`);
  }

  async function remove(t: Transaction) {
    if (!(await confirm({ title: 'Delete this transaction?', body: `${txnKindLabel[t.kind]} of ${money(t.amount)} on ${fmtDate(t.date)}. Totals will be recalculated.`, confirmLabel: 'Delete', danger: true }))) return;
    const r = del(t.id);
    if (!r.ok) toast.error(r.error); else toast.success('Transaction deleted');
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 p-4 sm:p-5 pb-3">
        <PeriodPicker state={ps} />
        <Segmented size="sm" value={kind} onChange={(v) => { setKind(v); setLimit(50); }} options={[{ value: 'all', label: 'All' }, { value: 'in', label: 'Income' }, { value: 'out', label: 'Expenses' }, { value: 'refunds', label: 'Refunds' }, { value: 'deposits', label: 'Deposits' }]} />
      </div>
      <div className="flex flex-wrap gap-2 px-4 sm:px-5 pb-4">
        <SearchInput className="flex-1 min-w-[180px]" value={q} onChange={setQ} placeholder="Guest, vendor, reference…" />
        <Select className="w-36" value={method} onChange={setMethod} options={[{ value: 'cash', label: 'Cash only' }, { value: 'digital', label: 'Bank & digital' }]} placeholder="All methods" />
        {kind === 'out' && <Select className="w-40" value={category} onChange={setCategory} options={options(expenseCategoryLabel)} placeholder="All categories" />}
        {data.properties.length > 1 && <Select className="w-44" value={pid} onChange={setPid} options={data.properties.map((x) => ({ value: x.id, label: x.name }))} placeholder="All properties" />}
        <Button icon={<Download className="h-4 w-4" />} onClick={exportCsv} disabled={!rows.length}>CSV</Button>
      </div>
      <div className="grid grid-cols-3 border-y border-border bg-surface-2/40 text-center divide-x divide-border">
        <div className="py-2.5"><div className="text-[11.5px] text-muted">Money in</div><div className="num font-semibold text-success">{money(totalIn)}</div></div>
        <div className="py-2.5"><div className="text-[11.5px] text-muted">Money out</div><div className="num font-semibold">{money(totalOut)}</div></div>
        <div className="py-2.5"><div className="text-[11.5px] text-muted">Net</div><div className={cn('num font-semibold', totalIn - totalOut < 0 && 'text-danger')}>{money(totalIn - totalOut)}</div></div>
      </div>
      {rows.length === 0 ? <EmptyState icon={<Wallet className="h-5 w-5" />} title="No transactions" body="Nothing matches these filters for the selected period." action={canEdit ? <Button variant="primary" onClick={() => openOverlay({ kind: 'transaction', txnKind: kind === 'out' ? 'expense' : 'payment' })}>Add a transaction</Button> : undefined} /> : (
        <div className="divide-y divide-border">
          {rows.slice(0, limit).map((t) => {
            const doc = data.documents.find((d) => d.transactionId === t.id && !d.void);
            const prop = L.property(t.propertyId);
            return (
              <div key={t.id} className="flex items-center gap-3 px-4 sm:px-5 py-3 hover:bg-surface-2/40 group">
                <div className="w-12 shrink-0 text-center hidden sm:block">
                  <div className="text-[10.5px] uppercase text-subtle font-semibold">{fmtDate(t.date, 'MMM')}</div>
                  <div className="text-[16px] font-semibold num leading-tight">{fmtDate(t.date, 'd')}</div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-[13.5px] font-medium truncate">
                    {t.bookingId ? <Link to={`/bookings/${t.bookingId}`} className="hover:underline truncate">{title(t)}</Link> : <span className="truncate">{title(t)}</span>}
                    {t.attachments.length > 0 && <Paperclip className="h-3.5 w-3.5 text-subtle shrink-0" />}
                    {t.recurringId && <Repeat className="h-3.5 w-3.5 text-subtle shrink-0" />}
                  </div>
                  <div className="text-[12px] text-muted truncate flex items-center gap-1.5">
                    <span className="sm:hidden">{fmtDate(t.date, 'd MMM')} ·</span>
                    {sub(t)} · {methodLabel[t.method]}{prop ? <> · <PropertyDot color={prop.color} className="!h-1.5 !w-1.5" />{prop.name}</> : ' · Shared'}{t.reference ? ` · ${t.reference}` : ''}
                  </div>
                </div>
                {t.kind.startsWith('deposit') && <Badge tone="info" className="hidden sm:inline-flex">Deposit</Badge>}
                <span className={cn('num text-[14px] font-medium whitespace-nowrap', !isOut(t) && t.kind !== 'deposit' && 'text-success')}>{isOut(t) ? '−' : '+'}{money(t.amount)}</span>
                <Menu trigger={({ onClick }) => <Button size="icon-sm" variant="ghost" onClick={onClick} aria-label="Actions"><Pencil className="h-3.5 w-3.5" /></Button>} items={[
                  { label: 'Edit', icon: <Pencil />, onClick: () => openOverlay({ kind: 'transaction', txnKind: t.kind, transactionId: t.id }), hidden: !canEdit },
                  { label: doc ? `View ${doc.number}` : 'Generate receipt', icon: <FileText />, hidden: !canDocs, onClick: () => {
                    if (doc) return openOverlay({ kind: 'viewDocument', documentId: doc.id });
                    const r = issue(t.kind === 'expense' ? 'expense_voucher' : t.kind === 'refund' || t.kind === 'deposit_return' ? 'refund_receipt' : 'receipt', { transactionId: t.id });
                    if (r.ok) openOverlay({ kind: 'viewDocument', documentId: r.value.id }); else toast.error(r.error);
                  } },
                  ...t.attachments.map((a) => ({ label: `Open ${a.name}`, icon: <Paperclip />, onClick: () => { const w = window.open(); if (w) w.document.write(`<title>${a.name}</title><img src="${a.dataUrl}" style="max-width:100%">`); } })),
                  { label: 'Delete', icon: <Trash2 />, danger: true, onClick: () => remove(t), hidden: !canEdit },
                ]} />
              </div>
            );
          })}
        </div>
      )}
      <LoadMore shown={Math.min(limit, rows.length)} total={rows.length} onMore={() => setLimit((n) => n + 50)} />
    </Card>
  );
}

function Outstanding() {
  const data = useData();
  const today = useToday();
  const money = useMoney();
  const L = useLookup();
  const ledgers = useLedgers();
  const canEdit = useCan('finance.edit');
  const [show, setShow] = useState<'due' | 'upcoming' | 'refunds'>('due');
  const out = useMemo(() => outstanding(data, today, null, ledgers), [data, today, ledgers]);
  const reminder = data.templates.find((t) => t.trigger === 'payment_reminder');
  const refunds = data.bookings.map((b) => ledgers.get(b.id)!).filter((l) => l.balance < 0);
  const rows = show === 'due' ? out.rows.filter((r) => r.dueNow) : out.rows.filter((r) => !r.dueNow);

  function exportCsv() {
    const cur = data.business.currency;
    downloadCSV(out.rows.map((r) => ({
      Booking: r.ledger.booking.code, Guest: L.guestName(r.ledger.booking.guestId), Phone: L.guest(r.ledger.booking.guestId)?.phone ?? '', 'Check-in': r.ledger.booking.checkIn,
      'Check-out': r.ledger.booking.checkOut, Total: toMajor(r.ledger.totals.total, cur), Paid: toMajor(r.ledger.paid, cur), Balance: toMajor(r.ledger.balance, cur),
      Status: r.overdue ? 'Overdue' : r.dueNow ? 'Due now' : 'Upcoming',
    })), `outstanding-${today}.csv`);
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        <Stat label="Due now" value={money(out.dueNow)} sub="guests who have arrived" />
        <Stat label="Overdue" value={<span className={out.overdue ? 'text-danger' : ''}>{money(out.overdue)}</span>} sub="stay ended, still unpaid" />
        <Stat label="Upcoming stays" value={money(out.upcoming)} sub="balance due at check-in" />
        <Stat label="Refunds owed" value={money(out.refundsDue)} sub={`${money(out.depositsHeld, { compact: true })} deposits held`} />
      </div>
      <Card>
        <div className="flex flex-wrap items-center gap-2 p-4 sm:p-5">
          <Segmented value={show} onChange={setShow} options={[{ value: 'due', label: 'Due now', count: out.rows.filter((r) => r.dueNow).length }, { value: 'upcoming', label: 'Upcoming', count: out.rows.filter((r) => !r.dueNow).length }, { value: 'refunds', label: 'Refunds owed', count: refunds.length }]} />
          <Button className="ml-auto" icon={<Download className="h-4 w-4" />} onClick={exportCsv}>CSV</Button>
        </div>
        {show === 'refunds' ? (
          refunds.length === 0 ? <EmptyState title="No refunds owed" /> : <div className="divide-y divide-border border-t border-border">{refunds.map((l) => (
            <div key={l.booking.id} className="flex items-center gap-3 px-4 sm:px-5 py-3">
              <Link to={`/bookings/${l.booking.id}`} className="min-w-0 flex-1"><div className="text-[13.5px] font-medium">{L.guestName(l.booking.guestId)}</div><div className="text-[12px] text-muted">{l.booking.code} · paid {money(l.paid)} · kept {money(l.totals.total)}</div></Link>
              <span className="num font-medium text-info">{money(-l.balance)}</span>
              {canEdit && <Button size="sm" onClick={() => openOverlay({ kind: 'transaction', txnKind: 'refund', bookingId: l.booking.id })}>Refund</Button>}
            </div>
          ))}</div>
        ) : rows.length === 0 ? <EmptyState icon={<CalendarClock className="h-5 w-5" />} title="Nothing outstanding" body="Every guest is paid up." /> : (
          <div className="divide-y divide-border border-t border-border">
            {rows.map(({ ledger: l, overdue }) => {
              const g = L.guest(l.booking.guestId);
              return (
                <div key={l.booking.id} className="flex flex-wrap sm:flex-nowrap items-center gap-3 px-4 sm:px-5 py-3">
                  <Link to={`/bookings/${l.booking.id}`} className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-[13.5px] font-medium">{g?.firstName} {g?.lastName}{overdue && <Badge tone="danger">Overdue</Badge>}</div>
                    <div className="text-[12px] text-muted">{l.booking.code} · {L.unit(l.booking.unitId)?.name} · {fmtDate(l.booking.checkIn, 'd MMM')} → {fmtDate(l.booking.checkOut, 'd MMM')} · {relDay(l.booking.checkIn, today)}</div>
                    <div className="mt-1.5 h-1 w-40 rounded-full bg-surface-3 overflow-hidden"><div className="h-full bg-success" style={{ width: `${Math.min(100, (l.paid / Math.max(1, l.totals.total)) * 100)}%` }} /></div>
                  </Link>
                  <div className="text-right"><div className="num font-semibold text-[14px]">{money(l.balance)}</div><div className="text-[11.5px] text-subtle num">of {money(l.totals.total)}</div></div>
                  <div className="flex gap-1.5">
                    {g?.phone && reminder && <Button size="icon-sm" title="Send reminder" onClick={() => openOverlay({ kind: 'message', bookingId: l.booking.id, templateId: reminder.id })}><MessageCircle className="h-4 w-4" /></Button>}
                    {canEdit && <Button size="sm" variant="primary" onClick={() => openOverlay({ kind: 'transaction', txnKind: 'payment', bookingId: l.booking.id })}>Collect</Button>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

function Recurring() {
  const data = useData();
  const today = useToday();
  const money = useMoney();
  const L = useLookup();
  const canEdit = useCan('finance.edit');
  const confirm = useConfirm();
  const save = useStore((s) => s.saveRecurring);
  const del = useStore((s) => s.deleteRecurring);
  const skip = useStore((s) => s.skipRecurring);
  const record = useStore((s) => s.recordRecurring);
  const [editing, setEditing] = useState<RecurringExpense | null>(null);
  const [recording, setRecording] = useState<RecurringExpense | null>(null);
  const list = data.recurring.slice().sort((a, b) => Number(b.active) - Number(a.active) || a.nextDue.localeCompare(b.nextDue));
  const monthly = data.recurring.filter((r) => r.active).reduce((s, r) => s + (r.frequency === 'monthly' ? r.amount : r.frequency === 'weekly' ? Math.round((r.amount * 52) / 12) : r.frequency === 'quarterly' ? Math.round(r.amount / 3) : Math.round(r.amount / 12)), 0);
  const thisMonthPaid = data.transactions.filter((t) => t.recurringId && monthKey(t.date) === monthKey(today)).reduce((s, t) => s + t.amount, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        <Stat label="Fixed costs / month" value={money(monthly)} sub={`${data.recurring.filter((r) => r.active).length} active`} />
        <Stat label="Paid this month" value={money(thisMonthPaid)} sub="from recurring" />
      </div>
      <Card>
        <CardHeader title="Recurring expenses" subtitle="Reminders appear before each due date" action={canEdit && <Button size="sm" variant="primary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setEditing({ id: uid('rec'), name: '', category: 'utilities', amount: 0, propertyId: null, vendor: '', method: 'upi', frequency: 'monthly', nextDue: today, active: true, notes: '' })}>Add</Button>} />
        {list.length === 0 ? <EmptyState icon={<Repeat className="h-5 w-5" />} title="No recurring expenses" body="Rent, salaries, utilities and subscriptions you pay on a schedule." /> : (
          <div className="divide-y divide-border border-t border-border">
            {list.map((r) => {
              const d = nightsBetween(today, r.nextDue);
              return (
                <div key={r.id} className={cn('flex flex-wrap sm:flex-nowrap items-center gap-3 px-4 sm:px-5 py-3.5', !r.active && 'opacity-55')}>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] font-medium">{r.name}</div>
                    <div className="text-[12px] text-muted">{expenseCategoryLabel[r.category]} · {frequencyLabel[r.frequency]} · {L.property(r.propertyId)?.name ?? 'Shared'}{r.vendor ? ` · ${r.vendor}` : ''}</div>
                  </div>
                  <div className="text-right">
                    <div className="num font-semibold text-[14px]">{money(r.amount)}</div>
                    {r.active ? <div className={cn('text-[12px]', d < 0 ? 'text-danger' : d <= 5 ? 'text-warning' : 'text-subtle')}>{d < 0 ? `Overdue ${-d}d` : `Due ${relDay(r.nextDue, today).toLowerCase()}`}</div> : <div className="text-[12px] text-subtle">Paused</div>}
                  </div>
                  {canEdit && (
                    <div className="flex gap-1.5">
                      {r.active && <Button size="sm" onClick={() => setRecording(r)}>Mark paid</Button>}
                      <Menu trigger={({ onClick }) => <Button size="icon-sm" variant="ghost" onClick={onClick}><Pencil className="h-3.5 w-3.5" /></Button>} items={[
                        { label: 'Edit', icon: <Pencil />, onClick: () => setEditing(r) },
                        { label: 'Skip this cycle', icon: <SkipForward />, onClick: () => { skip(r.id); toast.success('Skipped to next cycle'); }, hidden: !r.active },
                        { label: r.active ? 'Pause' : 'Resume', icon: r.active ? <Pause /> : <Play />, onClick: () => save({ ...r, active: !r.active }) },
                        { label: 'Delete', icon: <Trash2 />, danger: true, onClick: async () => { if (await confirm({ title: `Delete “${r.name}”?`, body: 'Past expenses stay in your books.', danger: true, confirmLabel: 'Delete' })) del(r.id); } },
                      ]} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
      {editing && <RecurringModal value={editing} onClose={() => setEditing(null)} onSave={(r) => { save(r); setEditing(null); toast.success('Recurring expense saved'); }} />}
      {recording && <RecordRecurringModal r={recording} onClose={() => setRecording(null)} onSave={(date, amount) => {
        const res = record(recording.id, date, amount);
        if (!res.ok) return toast.error(res.error);
        toast.success(`${recording.name} recorded`, { description: money(amount) });
        setRecording(null);
      }} />}
    </div>
  );
}

function RecurringModal({ value, onClose, onSave }: { value: RecurringExpense; onClose: () => void; onSave: (r: RecurringExpense) => void }) {
  const data = useData();
  const cur = data.business.currency;
  const [r, setR] = useState(value);
  const [amount, setAmount] = useState(value.amount ? String(toMajor(value.amount, cur)) : '');
  const [err, setErr] = useState<Record<string, string>>({});
  const submit = () => {
    const e: Record<string, string> = {};
    if (!r.name.trim()) e.name = 'Give it a name';
    const p = parseAmount(amount, cur);
    if ('error' in p) e.amount = p.error;
    if (Object.keys(e).length) return setErr(e);
    onSave({ ...r, name: r.name.trim(), amount: (p as { value: number }).value });
  };
  return (
    <Modal open onClose={onClose} title={value.name ? 'Edit recurring expense' : 'New recurring expense'} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submit}>Save</Button></>}>
      <div className="space-y-4">
        <Field label="Name" error={err.name}><Input value={r.name} onChange={(e) => setR({ ...r, name: e.target.value })} placeholder="e.g. Electricity — Cedar Ridge" autoFocus /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount" error={err.amount}><MoneyInput value={amount} onChange={setAmount} /></Field>
          <Field label="Frequency"><Select value={r.frequency} onChange={(v) => setR({ ...r, frequency: v })} options={options(frequencyLabel)} /></Field>
          <Field label="Category"><Select value={r.category} onChange={(v) => setR({ ...r, category: v })} options={options(expenseCategoryLabel)} /></Field>
          <Field label="Next due"><Input type="date" value={r.nextDue} onChange={(e) => setR({ ...r, nextDue: e.target.value })} /></Field>
          <Field label="Property"><Select value={r.propertyId ?? ''} onChange={(v) => setR({ ...r, propertyId: v || null })} options={data.properties.map((p) => ({ value: p.id, label: p.name }))} placeholder="Shared" /></Field>
          <Field label="Pay via"><Select value={r.method} onChange={(v) => setR({ ...r, method: v })} options={options(methodLabel)} /></Field>
        </div>
        <Field label="Vendor"><Input value={r.vendor} onChange={(e) => setR({ ...r, vendor: e.target.value })} /></Field>
        <Switch checked={r.active} onChange={(v) => setR({ ...r, active: v })} label="Active" description="Paused expenses don't send reminders" />
      </div>
    </Modal>
  );
}

function RecordRecurringModal({ r, onClose, onSave }: { r: RecurringExpense; onClose: () => void; onSave: (date: string, amount: number) => void }) {
  const today = useToday();
  const cur = useStore((s) => s.data.business.currency);
  const [date, setDate] = useState(r.nextDue < today ? r.nextDue : today);
  const [amount, setAmount] = useState(String(toMajor(r.amount, cur)));
  const [err, setErr] = useState('');
  return (
    <Modal open onClose={onClose} title={`Record ${r.name}`} size="sm" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => { const p = parseAmount(amount, cur); if ('error' in p) return setErr(p.error); onSave(date, p.value); }}>Record expense</Button></>}>
      <div className="space-y-4">
        <p className="text-[13px] text-muted">Adds an expense and moves the next reminder forward one {r.frequency.replace('ly', '').replace('dai', 'day')}.</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount" hint="Bills vary? Adjust it" error={err}><MoneyInput value={amount} onChange={(v) => { setAmount(v); setErr(''); }} /></Field>
          <Field label="Paid on"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        </div>
      </div>
    </Modal>
  );
}
