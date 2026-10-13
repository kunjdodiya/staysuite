import { Capacitor } from '@capacitor/core';

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/**
 * On iOS/Android, WebViews can't download files, so we write to the app cache and open the
 * native share sheet (Save to Files, WhatsApp, Mail…). Returns false if the user cancelled.
 */
export async function shareFileNative(blob: Blob, filename: string, title?: string): Promise<boolean> {
  const { Filesystem, Directory } = await import('@capacitor/filesystem');
  const { Share } = await import('@capacitor/share');
  const safe = filename.replace(/[^\w.\-]+/g, '_');
  const { uri } = await Filesystem.writeFile({ path: safe, data: await blobToBase64(blob), directory: Directory.Cache });
  try {
    await Share.share({ title: title ?? safe, files: [uri], dialogTitle: title ?? 'Save or share' });
    return true;
  } catch {
    return false; // share sheet dismissed
  }
}

export function downloadBlob(blob: Blob, filename: string) {
  if (Capacitor.isNativePlatform()) { void shareFileNative(blob, filename); return; }
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
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  downloadBlob(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename);
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

export function dataUrlToBlob(dataUrl: string): Blob {
  const [head, body] = dataUrl.split(',');
  const mime = /data:([^;,]+)/.exec(head)?.[1] ?? 'application/octet-stream';
  if (head.includes(';base64')) {
    const bin = atob(body);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }
  return new Blob([decodeURIComponent(body)], { type: mime });
}
