import type { IssuedDocument } from '@/domain/types';
import { docKindLabel, methodLabel, purposeLabel } from '@/domain/labels';
import { fmtDate } from '@/lib/dates';
import { toMajor, minorDigits } from '@/lib/money';

/** Standard PDF fonts are Latin-1 only; fall back to the ISO code for symbols like ₹. */
function pdfMoney(minor: number, currency: string, locale: string) {
  const major = toMajor(minor, currency);
  const opts: Intl.NumberFormatOptions = { style: 'currency', currency, minimumFractionDigits: minorDigits(currency), maximumFractionDigits: minorDigits(currency) };
  let s = new Intl.NumberFormat(locale, opts).format(major);
  if (/[^\x00-\xFF€]/.test(s.replace(/ /g, ' '))) s = new Intl.NumberFormat(locale, { ...opts, currencyDisplay: 'code' }).format(major);
  return s.replace(/[  ]/g, ' ');
}
const latin = (s: string) => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/•/g, '-').replace(/[^\x00-\xFF€]/g, '');

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export const docTitle = (doc: IssuedDocument) => (doc.kind === 'invoice' ? 'Invoice' : doc.kind === 'receipt' ? 'Receipt' : doc.kind === 'refund_receipt' ? 'Refund receipt' : 'Expense voucher');

export async function renderPdf(doc: IssuedDocument) {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const s = doc.snapshot;
  const money = (v: number) => pdfMoney(v, s.currency, s.locale);
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = pdf.internal.pageSize.getWidth();
  const H = pdf.internal.pageSize.getHeight();
  const M = 44;
  const brand = hexToRgb(s.business.brandColor || '#0f766e');
  const ink: [number, number, number] = [20, 24, 22];
  const muted: [number, number, number] = [110, 116, 112];
  const line: [number, number, number] = [228, 228, 222];

  pdf.setFillColor(...brand);
  pdf.rect(0, 0, W, 6, 'F');

  // Header — brand
  let y = 52;
  if (s.business.logoDataUrl) {
    try {
      const fmt = s.business.logoDataUrl.includes('image/png') ? 'PNG' : 'JPEG';
      pdf.addImage(s.business.logoDataUrl, fmt, M, y - 12, 40, 40);
    } catch { /* unsupported logo format — skip */ }
  } else {
    pdf.setFillColor(...brand);
    pdf.roundedRect(M, y - 12, 40, 40, 8, 8, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(18);
    pdf.text(latin(s.business.name).slice(0, 1).toUpperCase(), M + 20, y + 14, { align: 'center' });
  }
  pdf.setTextColor(...ink);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(14);
  pdf.text(latin(s.business.name), M + 52, y + 2);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8.5);
  pdf.setTextColor(...muted);
  const bizLines = [s.business.legalName !== s.business.name ? s.business.legalName : '', s.business.address, [s.business.phone, s.business.email].filter(Boolean).join('  ·  '), s.business.website, s.business.taxRegistrationNo ? `${s.business.taxLabel} No: ${s.business.taxRegistrationNo}` : '']
    .filter(Boolean).map(latin);
  let by = y + 15;
  for (const l of bizLines) { pdf.text(pdf.splitTextToSize(l, 250), M + 52, by); by += 11; }

  // Header — document title
  pdf.setTextColor(...brand);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(22);
  pdf.text(docTitle(doc).toUpperCase(), W - M, y + 6, { align: 'right' });
  pdf.setFontSize(9);
  pdf.setTextColor(...ink);
  pdf.setFont('helvetica', 'normal');
  const meta: [string, string][] = [['No.', doc.number], ['Date', fmtDate(doc.issueDate)]];
  if (doc.dueDate && doc.kind === 'invoice' && s.balanceDue > 0) meta.push(['Due', fmtDate(doc.dueDate)]);
  if (s.stay?.bookingCode) meta.push(['Booking', s.stay.bookingCode]);
  let my = y + 24;
  for (const [k, v] of meta) {
    pdf.setTextColor(...muted); pdf.text(k, W - M - 110, my);
    pdf.setTextColor(...ink); pdf.text(v, W - M, my, { align: 'right' });
    my += 13;
  }

  y = Math.max(by, my) + 18;
  pdf.setDrawColor(...line);
  pdf.line(M, y, W - M, y);
  y += 22;

  // Parties & stay
  const col2 = W / 2 + 10;
  pdf.setFontSize(7.5); pdf.setTextColor(...muted); pdf.setFont('helvetica', 'bold');
  pdf.text(doc.kind === 'expense_voucher' ? 'PAID TO' : 'BILLED TO', M, y);
  if (s.stay) pdf.text('STAY', col2, y);
  else if (s.property) pdf.text('PROPERTY', col2, y);
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10.5); pdf.setTextColor(...ink);
  pdf.text(latin(s.billTo.name), M, y + 15);
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.setTextColor(...muted);
  let py = y + 28;
  for (const l of [s.billTo.phone, s.billTo.email, s.billTo.address].filter(Boolean) as string[]) { pdf.text(latin(l), M, py); py += 12; }
  let sy = y + 15;
  if (s.property) {
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10.5); pdf.setTextColor(...ink);
    pdf.text(latin(s.property.name + (s.stay?.unit ? ` - ${s.stay.unit}` : '')), col2, sy);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.setTextColor(...muted);
    sy += 13;
    if (s.stay) {
      pdf.text(`${fmtDate(s.stay.checkIn, 'EEE d MMM yyyy')}  ->  ${fmtDate(s.stay.checkOut, 'EEE d MMM yyyy')}`, col2, sy); sy += 12;
      pdf.text(`${s.stay.nights} night${s.stay.nights > 1 ? 's' : ''}  ·  ${s.stay.guests} guest${s.stay.guests > 1 ? 's' : ''}`, col2, sy); sy += 12;
    }
    if (s.property.address) { pdf.text(pdf.splitTextToSize(latin(s.property.address), W - M - col2), col2, sy); sy += 12; }
  }
  y = Math.max(py, sy) + 14;

  // Payment highlight for receipts
  if (s.payment) {
    pdf.setFillColor(brand[0], brand[1], brand[2]);
    pdf.setGState(new (pdf as any).GState({ opacity: 0.07 }));
    pdf.roundedRect(M, y, W - 2 * M, 62, 10, 10, 'F');
    pdf.setGState(new (pdf as any).GState({ opacity: 1 }));
    pdf.setFontSize(8); pdf.setTextColor(...muted); pdf.setFont('helvetica', 'bold');
    pdf.text(doc.kind === 'refund_receipt' ? 'AMOUNT REFUNDED' : doc.kind === 'expense_voucher' ? 'AMOUNT PAID' : 'AMOUNT RECEIVED', M + 16, y + 22);
    pdf.setFontSize(20); pdf.setTextColor(...ink);
    pdf.text(money(s.payment.amount), M + 16, y + 46);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.setTextColor(...muted);
    const details = [`${methodLabel[s.payment.method]}`, fmtDate(s.payment.date), s.payment.purpose ? purposeLabel[s.payment.purpose] : '', s.payment.reference ? `Ref ${s.payment.reference}` : ''].filter(Boolean).join('   ·   ');
    pdf.text(latin(details), W - M - 16, y + 38, { align: 'right' });
    y += 80;
  }

  // Line items
  autoTable(pdf, {
    startY: y,
    margin: { left: M, right: M },
    head: [['Description', 'Qty', 'Rate', 'Amount']],
    body: s.lines.map((l) => [latin(l.label + (l.detail ? `\n${l.detail}` : '')), String(l.qty), money(l.unit), money(l.amount)]),
    theme: 'plain',
    styles: { font: 'helvetica', fontSize: 9, cellPadding: { top: 8, bottom: 8, left: 6, right: 6 }, textColor: ink, lineColor: line },
    headStyles: { fontSize: 7.5, fontStyle: 'bold', textColor: muted, fillColor: [247, 247, 244] },
    columnStyles: { 0: { cellWidth: 'auto' }, 1: { halign: 'center', cellWidth: 40 }, 2: { halign: 'right', cellWidth: 90 }, 3: { halign: 'right', cellWidth: 100 } },
    didParseCell: (d) => { if (d.section === 'head' && d.column.index > 0) d.cell.styles.halign = d.column.index === 1 ? 'center' : 'right'; },
    didDrawCell: (d) => { if (d.section === 'body' && d.column.index === 0) { pdf.setDrawColor(...line); pdf.line(M, d.cell.y + d.cell.height, W - M, d.cell.y + d.cell.height); } },
  });
  y = (pdf as any).lastAutoTable.finalY + 16;

  // Totals
  const tx = W - M - 220;
  const row = (label: string, value: string, bold = false, color: [number, number, number] = ink) => {
    pdf.setFont('helvetica', bold ? 'bold' : 'normal'); pdf.setFontSize(bold ? 11 : 9.5);
    pdf.setTextColor(...muted); pdf.text(label, tx, y);
    pdf.setTextColor(...color); pdf.text(value, W - M, y, { align: 'right' });
    y += bold ? 20 : 16;
  };
  if (!s.payment || doc.kind === 'invoice') {
    row('Subtotal', money(s.subtotal));
    if (s.discount) row('Discount', `- ${money(s.discount)}`);
    if (s.taxAmount) row(`${s.taxLabel} @ ${s.taxRate}%`, money(s.taxAmount));
    pdf.setDrawColor(...line); pdf.line(tx, y - 6, W - M, y - 6); y += 6;
    row('Total', money(s.total), true);
    if (s.paidToDate) row('Paid to date', money(s.paidToDate), false, [22, 128, 61]);
    row('Balance due', money(s.balanceDue), true, s.balanceDue > 0 ? [200, 45, 45] : ink);
  } else if (s.stay) {
    row('Booking total', money(s.total));
    row('Paid to date', money(s.paidToDate), false, [22, 128, 61]);
    row('Balance remaining', money(s.balanceDue), true, s.balanceDue > 0 ? [200, 45, 45] : ink);
  }

  // Notes & payment instructions
  y = Math.max(y + 10, (pdf as any).lastAutoTable.finalY + 16);
  const blocks: [string, string][] = [];
  if (s.notes) blocks.push(['NOTES', s.notes]);
  if (s.business.paymentInstructions && s.balanceDue > 0) blocks.push(['HOW TO PAY', s.business.paymentInstructions]);
  for (const [h, body] of blocks) {
    if (y > H - 120) { pdf.addPage(); y = M; }
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(7.5); pdf.setTextColor(...muted); pdf.text(h, M, y);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.setTextColor(...ink);
    const lines = pdf.splitTextToSize(latin(body), W - 2 * M - 230);
    pdf.text(lines, M, y + 13);
    y += 18 + lines.length * 11;
  }

  // Footer
  pdf.setDrawColor(...line); pdf.line(M, H - 58, W - M, H - 58);
  pdf.setFontSize(8.5); pdf.setTextColor(...muted); pdf.setFont('helvetica', 'normal');
  if (s.business.documentFooter) pdf.text(pdf.splitTextToSize(latin(s.business.documentFooter), W - 2 * M - 120), M, H - 40);
  pdf.text(`${doc.number}`, W - M, H - 40, { align: 'right' });
  pdf.setFontSize(7); pdf.text('This is a computer-generated document.', W - M, H - 28, { align: 'right' });

  if (doc.void) {
    pdf.setTextColor(200, 45, 45);
    pdf.setGState(new (pdf as any).GState({ opacity: 0.18 }));
    pdf.setFontSize(110); pdf.setFont('helvetica', 'bold');
    pdf.text('VOID', W / 2, H / 2, { align: 'center', angle: 30 });
    pdf.setGState(new (pdf as any).GState({ opacity: 1 }));
  }
  pdf.setProperties({ title: `${docKindLabel[doc.kind]} ${doc.number}`, author: s.business.name, creator: 'StaySuite' });
  return pdf;
}

export async function pdfBlob(doc: IssuedDocument) {
  return (await renderPdf(doc)).output('blob');
}
export const pdfFilename = (doc: IssuedDocument) => `${doc.number}${doc.snapshot.billTo.name ? `-${doc.snapshot.billTo.name.replace(/[^\w]+/g, '-')}` : ''}.pdf`;
