// Renders a sample invoice and receipt from the demo data to PDF files for visual QA.
// Run: OUT_DIR=/tmp/docs npx vitest run scripts/render-sample-docs.test.ts
import { it } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { buildSeed } from '@/data/seed';
import { invoiceSnapshot, receiptSnapshot, formatDocNumber } from '@/domain/documents';
import { renderPdf } from '@/features/documents/pdf';
import type { IssuedDocument } from '@/domain/types';

it.runIf(!!process.env.OUT_DIR)('renders sample documents', async () => {
  const out = process.env.OUT_DIR!;
  mkdirSync(out, { recursive: true });
  const data = buildSeed();
  const b = data.bookings.find((x) => x.status === 'checked_out' && x.extras.length && x.source === 'direct') ?? data.bookings[0];
  const t = data.transactions.find((x) => x.bookingId === b.id && x.kind === 'payment')!;
  const base = { dueDate: b.checkIn, bookingId: b.id, guestId: b.guestId, propertyId: b.propertyId, void: false, createdAt: '', issueDate: '2026-10-13' };
  const docs: IssuedDocument[] = [
    { ...base, id: 'i', kind: 'invoice', number: formatDocNumber('invoice', 42, data.business, '2026-10-13'), transactionId: null, snapshot: invoiceSnapshot(data, b, 'Thank you for choosing us!') },
    { ...base, id: 'r', kind: 'receipt', number: formatDocNumber('receipt', 7, data.business, '2026-10-13'), transactionId: t.id, snapshot: receiptSnapshot(data, t) },
  ];
  for (const d of docs) {
    const pdf = await renderPdf(d);
    writeFileSync(`${out}/${d.number}.pdf`, Buffer.from(pdf.output('arraybuffer')));
  }
});
