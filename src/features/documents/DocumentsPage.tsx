import { useMemo, useState } from 'react';
import { Download, FileText, Plus, Receipt } from 'lucide-react';
import { PageHeader, Button, Card, SearchInput, Select, EmptyState, LoadMore, Badge, Stat, Segmented } from '@/components/ui';
import { useCan, useData, useMoney, useToday } from '@/data/hooks';
import { openOverlay } from '@/data/ui';
import { fmtDate, startOfMonthISO } from '@/lib/dates';
import { downloadCSV } from '@/lib/download';
import { toMajor } from '@/lib/money';
import { docKindLabel, options } from '@/domain/labels';
import type { DocumentKind } from '@/domain/types';
import { downloadDoc } from './DocumentViewer';
import { cn } from '@/lib/cn';

const kindTone: Record<DocumentKind, 'info' | 'success' | 'warning' | 'neutral'> = { invoice: 'info', receipt: 'success', refund_receipt: 'warning', expense_voucher: 'neutral' };

export default function DocumentsPage() {
  const data = useData();
  const today = useToday();
  const money = useMoney({ cents: false });
  const canIssue = useCan('documents.issue');
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<DocumentKind | ''>('');
  const [status, setStatus] = useState<'all' | 'active' | 'void'>('active');
  const [limit, setLimit] = useState(40);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return data.documents
      .filter((d) => !kind || d.kind === kind)
      .filter((d) => status === 'all' || (status === 'void' ? d.void : !d.void))
      .filter((d) => !s || `${d.number} ${d.snapshot.billTo.name} ${d.snapshot.stay?.bookingCode ?? ''} ${d.snapshot.payment?.reference ?? ''}`.toLowerCase().includes(s))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [data.documents, q, kind, status]);

  const monthStart = startOfMonthISO(today);
  const thisMonth = data.documents.filter((d) => !d.void && d.issueDate >= monthStart);
  const amount = (d: (typeof rows)[number]) => d.snapshot.payment?.amount ?? d.snapshot.total;
  const unbilled = data.bookings.filter((b) => ['checked_out', 'checked_in'].includes(b.status) && !data.documents.some((d) => d.bookingId === b.id && !d.void)).length;

  return (
    <div>
      <PageHeader title="Receipts & Invoices" subtitle="Every document you've issued, ready to re-download or share"
        actions={canIssue && <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => openOverlay({ kind: 'document' })}>Generate</Button>} />
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4 mb-5">
        <Stat label="Issued this month" value={String(thisMonth.length)} sub={`${thisMonth.filter((d) => d.kind === 'invoice').length} invoices · ${thisMonth.filter((d) => d.kind === 'receipt').length} receipts`} />
        <Stat label="Receipted this month" value={money(thisMonth.filter((d) => d.kind === 'receipt').reduce((s, d) => s + amount(d), 0))} />
        <Stat label="Next invoice no." value={<span className="text-[20px]">{`${data.business.invoicePrefix}-${today.slice(0, 4)}-${String(data.business.counters.invoice + 1).padStart(4, '0')}`}</span>} />
        <Stat label="Stays without invoice" value={String(unbilled)} sub="in-house or checked out" />
      </div>
      <Card>
        <div className="flex flex-wrap gap-2 p-4 sm:p-5">
          <SearchInput className="flex-1 min-w-[200px]" value={q} onChange={setQ} placeholder="Number, guest, booking, reference…" />
          <Select className="w-44" value={kind} onChange={setKind} options={options(docKindLabel)} placeholder="All types" />
          <Segmented size="sm" value={status} onChange={setStatus} options={[{ value: 'active', label: 'Active' }, { value: 'void', label: 'Void' }, { value: 'all', label: 'All' }]} />
          <Button icon={<Download className="h-4 w-4" />} disabled={!rows.length} onClick={() => downloadCSV(rows.map((d) => ({
            Number: d.number, Type: docKindLabel[d.kind], Date: d.issueDate, 'Billed to': d.snapshot.billTo.name, Booking: d.snapshot.stay?.bookingCode ?? '',
            Amount: toMajor(amount(d), d.snapshot.currency), Tax: toMajor(d.snapshot.taxAmount, d.snapshot.currency), Void: d.void ? 'Yes' : 'No',
          })), `documents-${today}.csv`)}>CSV</Button>
        </div>
        {rows.length === 0 ? (
          <EmptyState icon={<Receipt className="h-5 w-5" />} title={data.documents.length ? 'No documents match' : 'No documents yet'}
            body={data.documents.length ? 'Try another search.' : 'Generate a receipt when a guest pays, or an invoice for a stay. Numbers are assigned automatically.'}
            action={canIssue && !data.documents.length ? <Button variant="primary" onClick={() => openOverlay({ kind: 'document' })}>Generate your first receipt</Button> : undefined} />
        ) : (
          <div className="divide-y divide-border border-t border-border">
            {rows.slice(0, limit).map((d) => (
              <div key={d.id} className="flex items-center gap-3 px-4 sm:px-5 py-3 hover:bg-surface-2/40 cursor-pointer" onClick={() => openOverlay({ kind: 'viewDocument', documentId: d.id })}>
                <span className="h-9 w-9 rounded-xl bg-surface-2 border border-border grid place-items-center shrink-0"><FileText className="h-4 w-4 text-muted" /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2"><span className={cn('text-[13.5px] font-medium', d.void && 'line-through text-subtle')}>{d.number}</span><Badge tone={kindTone[d.kind]}>{docKindLabel[d.kind]}</Badge>{d.void && <Badge tone="danger">Void</Badge>}</div>
                  <div className="text-[12px] text-muted truncate">{d.snapshot.billTo.name} · {fmtDate(d.issueDate, 'd MMM yyyy')}{d.snapshot.stay ? ` · ${d.snapshot.stay.bookingCode}` : ''}</div>
                </div>
                <span className="num text-[14px] font-medium">{money(amount(d))}</span>
                <Button size="icon-sm" variant="ghost" title="Download PDF" onClick={(e) => { e.stopPropagation(); downloadDoc(d); }}><Download className="h-4 w-4" /></Button>
              </div>
            ))}
          </div>
        )}
        <LoadMore shown={Math.min(limit, rows.length)} total={rows.length} onMore={() => setLimit((n) => n + 40)} />
      </Card>
    </div>
  );
}
