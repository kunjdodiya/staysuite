import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Download, Printer, Share2, Mail, MessageCircle, Ban, RotateCcw, RefreshCw } from 'lucide-react';
import { Drawer, useConfirm } from '@/components/ui/overlay';
import { Button, Badge, Field, Select, Textarea, Segmented, EmptyState } from '@/components/ui';
import { useStore } from '@/data/store';
import { useCan, useData, useLedgers, useMoney } from '@/data/hooks';
import { openOverlay } from '@/data/ui';
import { downloadBlob } from '@/lib/download';
import { fmtDate } from '@/lib/dates';
import { invoiceSnapshot, kindForTxn, receiptSnapshot } from '@/domain/documents';
import { docKindLabel, txnKindLabel } from '@/domain/labels';
import { mailtoLink, whatsappLink } from '@/domain/templates';
import type { ID, IssuedDocument } from '@/domain/types';
import { DocumentPreview } from './DocumentPreview';
import { pdfBlob, pdfFilename, docTitle } from './pdf';

export async function downloadDoc(doc: IssuedDocument) {
  try {
    downloadBlob(await pdfBlob(doc), pdfFilename(doc));
  } catch (e) {
    console.error(e);
    toast.error('Could not create the PDF');
  }
}

async function printDoc(doc: IssuedDocument) {
  const blob = await pdfBlob(doc);
  const url = URL.createObjectURL(blob);
  const w = window.open(url, '_blank');
  if (!w) { downloadBlob(blob, pdfFilename(doc)); toast.info('Pop-ups are blocked — the PDF was downloaded instead'); }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Native share sheet with the PDF attached (mobile & Safari), falling back to download. */
async function shareDoc(doc: IssuedDocument) {
  const blob = await pdfBlob(doc);
  const file = new File([blob], pdfFilename(doc), { type: 'application/pdf' });
  const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try { await nav.share({ files: [file], title: `${docTitle(doc)} ${doc.number}` }); } catch { /* user cancelled */ }
  } else {
    downloadBlob(blob, pdfFilename(doc));
    toast.info('PDF downloaded — attach it to your message');
  }
}

function shareText(doc: IssuedDocument, money: (v: number) => string) {
  const s = doc.snapshot;
  const first = s.billTo.name.split(' ')[0];
  if (doc.kind === 'invoice') return `Hi ${first}, please find invoice ${doc.number} from ${s.business.name} for ${money(s.total)}${s.stay ? ` (${fmtDate(s.stay.checkIn, 'd MMM')} – ${fmtDate(s.stay.checkOut, 'd MMM')})` : ''}.${s.balanceDue > 0 ? ` Balance due: ${money(s.balanceDue)}.` : ''}\n\n${s.business.paymentInstructions || ''}`;
  return `Hi ${first}, thank you! We've ${doc.kind === 'refund_receipt' ? 'refunded' : 'received'} ${money(s.payment?.amount ?? s.total)}. Receipt no. ${doc.number}.${s.balanceDue > 0 ? ` Remaining balance: ${money(s.balanceDue)}.` : ''} — ${s.business.name}`;
}

export function DocumentViewer({ documentId, onClose }: { documentId: ID; onClose: () => void }) {
  const doc = useStore((s) => s.data.documents.find((d) => d.id === documentId));
  const voidDocument = useStore((s) => s.voidDocument);
  const issueDocument = useStore((s) => s.issueDocument);
  const canIssue = useCan('documents.issue');
  const money = useMoney();
  const confirm = useConfirm();
  const [busy, setBusy] = useState<string | null>(null);
  if (!doc) return null;
  const s = doc.snapshot;
  const run = async (k: string, fn: () => Promise<void>) => { setBusy(k); try { await fn(); } finally { setBusy(null); } };

  return (
    <Drawer
      open
      onClose={onClose}
      width="sm:max-w-[820px]"
      title={<span className="flex items-center gap-2">{docKindLabel[doc.kind]} {doc.number}{doc.void && <Badge tone="danger">Void</Badge>}</span>}
      subtitle={`${s.billTo.name} · issued ${fmtDate(doc.issueDate)}`}
      footer={
        <div className="flex flex-wrap gap-2 w-full justify-end">
          {canIssue && (
            doc.void
              ? <Button variant="ghost" icon={<RotateCcw className="h-4 w-4" />} onClick={() => voidDocument(doc.id, false)}>Restore</Button>
              : <Button variant="ghost" icon={<Ban className="h-4 w-4" />} onClick={async () => { if (await confirm({ title: `Void ${doc.number}?`, body: 'The number stays reserved and the document is kept for your records, marked VOID.', confirmLabel: 'Void document', danger: true })) { voidDocument(doc.id, true); toast.success('Document voided'); } }}>Void</Button>
          )}
          {canIssue && doc.bookingId && doc.kind === 'invoice' && !doc.void && (
            <Button variant="ghost" icon={<RefreshCw className="h-4 w-4" />} onClick={async () => {
              if (!(await confirm({ title: 'Reissue with latest figures?', body: 'This voids the current invoice and issues a new one reflecting current charges and payments.', confirmLabel: 'Reissue' }))) return;
              voidDocument(doc.id, true);
              const r = issueDocument('invoice', { bookingId: doc.bookingId! });
              if (r.ok) { onClose(); openOverlay({ kind: 'viewDocument', documentId: r.value.id }); toast.success(`Issued ${r.value.number}`); }
            }}>Reissue</Button>
          )}
          <div className="flex-1" />
          <Button icon={<Printer className="h-4 w-4" />} loading={busy === 'print'} onClick={() => run('print', () => printDoc(doc))} className="hidden sm:inline-flex">Print</Button>
          <Button variant="primary" icon={<Download className="h-4 w-4" />} loading={busy === 'dl'} onClick={() => run('dl', () => downloadDoc(doc))}>Download PDF</Button>
        </div>
      }
    >
      <div className="flex flex-wrap gap-2 mb-5">
        <Button size="sm" icon={<Share2 className="h-3.5 w-3.5" />} loading={busy === 'share'} onClick={() => run('share', () => shareDoc(doc))}>Share PDF</Button>
        {s.billTo.phone && <a href={whatsappLink(s.billTo.phone, shareText(doc, money))} target="_blank" rel="noreferrer"><Button size="sm" icon={<MessageCircle className="h-3.5 w-3.5" />}>WhatsApp</Button></a>}
        {s.billTo.email && <a href={mailtoLink(s.billTo.email, `${docTitle(doc)} ${doc.number} — ${s.business.name}`, shareText(doc, money))}><Button size="sm" icon={<Mail className="h-3.5 w-3.5" />}>Email</Button></a>}
      </div>
      <div className="-mx-1 sm:mx-0"><DocumentPreview doc={doc} /></div>
    </Drawer>
  );
}

/** Choose what to document, preview it live, then issue it with the next number. */
export function IssueDocument({ bookingId, transactionId, onClose }: { bookingId?: ID; transactionId?: ID; onClose: () => void }) {
  const data = useData();
  const ledgers = useLedgers();
  const money = useMoney();
  const issueDocument = useStore((s) => s.issueDocument);
  const [mode, setMode] = useState<'receipt' | 'invoice'>(transactionId ? 'receipt' : bookingId ? 'invoice' : 'receipt');
  const [txnId, setTxnId] = useState<ID>(transactionId ?? '');
  const [bkId, setBkId] = useState<ID>(bookingId ?? '');
  const [notes, setNotes] = useState('');

  const txnOptions = useMemo(() => data.transactions
    .filter((t) => !bookingId || t.bookingId === bookingId)
    .slice().sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)).slice(0, 300)
    .map((t) => {
      const g = data.guests.find((x) => x.id === t.guestId);
      const who = g ? `${g.firstName} ${g.lastName}` : t.vendor || 'Unlinked';
      const issued = data.documents.some((d) => d.transactionId === t.id && !d.void);
      return { value: t.id, label: `${fmtDate(t.date, 'd MMM')} · ${txnKindLabel[t.kind]} · ${who} · ${money(t.amount)}${issued ? ' · issued' : ''}` };
    }), [data.transactions, data.guests, data.documents, bookingId, money]);

  const bookingOptions = useMemo(() => data.bookings.filter((b) => b.status !== 'inquiry').slice().sort((a, b) => b.checkIn.localeCompare(a.checkIn)).slice(0, 300).map((b) => {
    const g = data.guests.find((x) => x.id === b.guestId);
    return { value: b.id, label: `${g?.firstName} ${g?.lastName} · ${b.code} · ${fmtDate(b.checkIn, 'd MMM')} · ${money(ledgers.get(b.id)!.totals.total)}` };
  }), [data.bookings, data.guests, ledgers, money]);

  const preview: IssuedDocument | null = useMemo(() => {
    const base = { id: 'preview', number: 'PREVIEW', issueDate: new Date().toISOString().slice(0, 10), dueDate: null, void: false, createdAt: '', guestId: null, propertyId: null };
    if (mode === 'receipt' && txnId) {
      const t = data.transactions.find((x) => x.id === txnId);
      if (!t) return null;
      return { ...base, kind: kindForTxn(t), bookingId: t.bookingId, transactionId: t.id, snapshot: receiptSnapshot(data, t, notes) };
    }
    if (mode === 'invoice' && bkId) {
      const b = data.bookings.find((x) => x.id === bkId);
      if (!b) return null;
      return { ...base, kind: 'invoice', bookingId: b.id, transactionId: null, dueDate: b.checkIn, snapshot: invoiceSnapshot(data, b, notes) };
    }
    return null;
  }, [mode, txnId, bkId, notes, data]);

  function issue() {
    if (!preview) return;
    const r = issueDocument(preview.kind, mode === 'receipt' ? { transactionId: txnId } : { bookingId: bkId }, notes);
    if (!r.ok) { toast.error(r.error); return; }
    toast.success(`${docKindLabel[r.value.kind]} ${r.value.number} issued`);
    onClose();
    openOverlay({ kind: 'viewDocument', documentId: r.value.id });
  }

  return (
    <Drawer open onClose={onClose} width="sm:max-w-[820px]" title="Generate document" subtitle="Numbers are assigned automatically when you issue"
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!preview} onClick={issue}>Issue {preview ? docKindLabel[preview.kind].toLowerCase() : 'document'}</Button></>}>
      <div className="space-y-4">
        <Segmented value={mode} onChange={setMode} options={[{ value: 'receipt', label: 'Receipt for a payment' }, { value: 'invoice', label: 'Invoice for a stay' }]} />
        {mode === 'receipt'
          ? <Field label="Transaction" hint="Payments, refunds, deposits and expenses"><Select value={txnId} onChange={setTxnId} options={txnOptions} placeholder="Choose a transaction…" /></Field>
          : <Field label="Booking"><Select value={bkId} onChange={setBkId} options={bookingOptions} placeholder="Choose a booking…" /></Field>}
        <Field label="Note on document" hint="Optional — e.g. thank-you message or terms"><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        <div className="pt-2">
          {preview ? <DocumentPreview doc={preview} /> : <div className="rounded-2xl border border-dashed border-border"><EmptyState title="Live preview" body="Pick a transaction or booking to see the document." /></div>}
        </div>
      </div>
    </Drawer>
  );
}
