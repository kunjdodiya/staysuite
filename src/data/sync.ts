/**
 * Sync boundary. The app is local-first: every change is applied to the local store immediately
 * and appended to this outbox. A SyncAdapter (e.g. Supabase — see /supabase/schema.sql) drains the
 * outbox when online and pulls remote changes. Until a backend is configured, LocalAdapter just
 * acknowledges changes so the app works fully offline.
 */
export interface Change {
  id: number;
  at: string;
  action: string;
  entity: string;
  entityId: string | null;
}

export interface SyncAdapter {
  name: string;
  push(changes: Change[]): Promise<void>;
  pull?(): Promise<void>;
}

export const LocalAdapter: SyncAdapter = { name: 'This device', push: async () => {} };

type Listener = () => void;
class Outbox {
  private queue: Change[] = [];
  private seq = 0;
  private listeners = new Set<Listener>();
  adapter: SyncAdapter = LocalAdapter;
  lastSyncedAt: string | null = null;
  syncing = false;

  push(c: Omit<Change, 'id' | 'at'>) {
    this.queue.push({ ...c, id: ++this.seq, at: new Date().toISOString() });
    this.emit();
    this.flushSoon();
  }
  get pending() { return this.queue.length; }
  subscribe(l: Listener) { this.listeners.add(l); return () => { this.listeners.delete(l); }; }
  private emit() { this.listeners.forEach((l) => l()); }
  private t: ReturnType<typeof setTimeout> | undefined;
  private flushSoon() { clearTimeout(this.t); this.t = setTimeout(() => this.flush(), 800); }
  async flush() {
    if (this.syncing || !this.queue.length || (typeof navigator !== 'undefined' && !navigator.onLine)) return;
    this.syncing = true; this.emit();
    const batch = this.queue.slice();
    try {
      await this.adapter.push(batch);
      this.queue = this.queue.filter((c) => !batch.includes(c));
      this.lastSyncedAt = new Date().toISOString();
    } catch (e) {
      console.warn('Sync failed, will retry', e);
    } finally {
      this.syncing = false; this.emit();
    }
  }
}

export const outbox = new Outbox();
if (typeof window !== 'undefined') window.addEventListener('online', () => outbox.flush());
