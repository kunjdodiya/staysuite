import { downloadCSV, downloadXLSX } from '@/lib/download';

export interface ReportTable {
  title: string;
  subtitle?: string;
  columns: { key: string; label: string; align?: 'left' | 'right'; money?: boolean; pct?: boolean }[];
  rows: Record<string, string | number>[];
  totals?: Record<string, string | number>;
}

/** Values in tables are raw numbers (major units for money) so spreadsheets can sum them. */
export function exportCSV(t: ReportTable, filename: string) {
  const rows = [...t.rows, ...(t.totals ? [t.totals] : [])].map((r) => Object.fromEntries(t.columns.map((c) => [c.label, r[c.key] ?? ''])));
  downloadCSV(rows, `${filename}.csv`);
}

export async function exportExcel(tables: ReportTable[], filename: string) {
  await downloadXLSX(tables.map((t) => ({
    name: t.title,
    rows: [...t.rows, ...(t.totals ? [t.totals] : [])].map((r) => Object.fromEntries(t.columns.map((c) => [c.label, r[c.key] ?? '']))),
  })), `${filename}.xlsx`);
}

export async function exportPDF(tables: ReportTable[], filename: string, meta: { business: string; period: string; currency: string; locale: string }) {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const pdf = new jsPDF({ unit: 'pt', format: 'a4', orientation: tables.some((t) => t.columns.length > 6) ? 'landscape' : 'portrait' });
  const W = pdf.internal.pageSize.getWidth();
  const nf = new Intl.NumberFormat(meta.locale, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const fmt = (v: string | number | undefined, c: ReportTable['columns'][number]) => {
    if (typeof v !== 'number') return String(v ?? '').replace(/[^\x00-\xFF]/g, '');
    if (c.pct) return `${v.toFixed(1)}%`;
    return nf.format(v);
  };
  tables.forEach((t, i) => {
    if (i > 0) pdf.addPage();
    pdf.setFillColor(15, 118, 110); pdf.rect(0, 0, W, 5, 'F');
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(16); pdf.setTextColor(20, 24, 22);
    pdf.text(t.title, 40, 48);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.setTextColor(110, 116, 112);
    pdf.text(`${meta.business.replace(/[^\x00-\xFF]/g, '')}  ·  ${meta.period}  ·  amounts in ${meta.currency}`, 40, 64);
    if (t.subtitle) pdf.text(t.subtitle, 40, 77);
    autoTable(pdf, {
      startY: t.subtitle ? 90 : 80,
      margin: { left: 40, right: 40 },
      head: [t.columns.map((c) => c.label)],
      body: t.rows.map((r) => t.columns.map((c) => fmt(r[c.key], c))),
      foot: t.totals ? [t.columns.map((c) => fmt(t.totals![c.key], c))] : undefined,
      theme: 'striped',
      styles: { fontSize: 8.5, cellPadding: 5, textColor: [20, 24, 22] },
      headStyles: { fillColor: [244, 244, 241], textColor: [92, 96, 94], fontStyle: 'bold' },
      footStyles: { fillColor: [234, 234, 230], textColor: [20, 24, 22], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [250, 250, 248] },
      didParseCell: (d) => { const c = t.columns[d.column.index]; if (d.section !== 'body' && c && (c.align === 'right' || c.money || c.pct)) d.cell.styles.halign = 'right'; },
      columnStyles: Object.fromEntries(t.columns.map((c, j) => [j, { halign: c.align === 'right' || c.money || c.pct ? 'right' : 'left' }])),
    });
  });
  const pages = pdf.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    pdf.setPage(p); pdf.setFontSize(8); pdf.setTextColor(140, 143, 140);
    pdf.text(`Generated ${new Date().toLocaleString(meta.locale)} · page ${p} of ${pages}`, W - 40, pdf.internal.pageSize.getHeight() - 20, { align: 'right' });
  }
  pdf.save(`${filename}.pdf`);
}
