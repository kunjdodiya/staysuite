import { get, set, keys, del } from 'idb-keyval';
import type { AppData } from '@/domain/types';

const KEY = 'staysuite:data:v1';
const BACKUP_PREFIX = 'staysuite:backup:';
const KEEP_BACKUPS = 7;

export async function loadData(): Promise<AppData | null> {
  try {
    return ((await get(KEY)) as AppData | undefined) ?? null;
  } catch (e) {
    console.error('Failed to load data', e);
    return null;
  }
}

export async function saveData(data: AppData) {
  try {
    await set(KEY, data);
    window.dispatchEvent(new CustomEvent('ss:saved'));
  } catch (e) {
    console.error('Failed to save data', e);
    window.dispatchEvent(new CustomEvent('ss:save-error'));
  }
}

/** One local snapshot per day, keeping the last week. Cloud backups take over once sync is enabled. */
export async function autoBackup(data: AppData) {
  try {
    const day = new Date().toISOString().slice(0, 10);
    const key = BACKUP_PREFIX + day;
    if (await get(key)) return;
    await set(key, data);
    const all = (await keys()).map(String).filter((k) => k.startsWith(BACKUP_PREFIX)).sort();
    for (const k of all.slice(0, Math.max(0, all.length - KEEP_BACKUPS))) await del(k);
  } catch {
    /* storage may be unavailable in private mode */
  }
}

export async function listBackups(): Promise<string[]> {
  try {
    return (await keys()).map(String).filter((k) => k.startsWith(BACKUP_PREFIX)).map((k) => k.slice(BACKUP_PREFIX.length)).sort().reverse();
  } catch {
    return [];
  }
}

export async function loadBackup(day: string): Promise<AppData | null> {
  return ((await get(BACKUP_PREFIX + day)) as AppData | undefined) ?? null;
}
