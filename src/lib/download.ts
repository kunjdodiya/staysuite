export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function toCSV(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(','), ...rows.map((r) => headers.map((h) => esc(r[h])).join(','))].join('\n');
}

export function downloadCSV(rows: Record<string, unknown>[], filename: string) {
  downloadBlob(new Blob(['﻿' + toCSV(rows)], { type: 'text/csv;charset=utf-8' }), filename);
}

export async function downloadXLSX(sheets: { name: string; rows: Record<string, unknown>[] }[], filename: string) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws = XLSX.utils.json_to_sheet(s.rows.length ? s.rows : [{ '': 'No data' }]);
    const headers = Object.keys(s.rows[0] ?? {});
    ws['!cols'] = headers.map((h) => ({ wch: Math.max(10, h.length + 2, ...s.rows.slice(0, 200).map((r) => String(r[h] ?? '').length + 1)) }));
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
  }
  XLSX.writeFile(wb, filename);
}

export function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

/** Downscale images before storing so local storage stays lean. */
export async function compressImage(file: File, maxDim = 1600, quality = 0.82): Promise<string> {
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') return readFileAsDataURL(file);
  const src = await readFileAsDataURL(file);
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = src; });
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', quality);
}
