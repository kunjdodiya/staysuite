import { create } from 'zustand';
import type { ID, TxnKind, ISODate } from '@/domain/types';

export type Overlay =
  | { kind: 'booking'; bookingId?: ID; unitId?: ID; checkIn?: ISODate; checkOut?: ISODate; guestId?: ID }
  | { kind: 'transaction'; txnKind: TxnKind; bookingId?: ID; transactionId?: ID; propertyId?: ID }
  | { kind: 'document'; bookingId?: ID; transactionId?: ID }
  | { kind: 'viewDocument'; documentId: ID }
  | { kind: 'guest'; guestId?: ID; onCreated?: (id: ID) => void }
  | { kind: 'task'; taskId?: ID; propertyId?: ID; unitId?: ID; type?: 'cleaning' | 'maintenance' }
  | { kind: 'message'; bookingId?: ID; guestId?: ID; templateId?: ID }
  | { kind: 'notifications' }
  | { kind: 'command' };

interface UIState {
  stack: Overlay[];
  open: (o: Overlay) => void;
  close: () => void;
  closeAll: () => void;
  propertyFilter: ID | 'all';
  setPropertyFilter: (id: ID | 'all') => void;
}

/** A stack, so a drawer can open another (e.g. "new guest" from inside "new booking"). */
export const useUI = create<UIState>((set) => ({
  stack: [],
  open: (o) => set((s) => ({ stack: [...s.stack, o] })),
  close: () => set((s) => ({ stack: s.stack.slice(0, -1) })),
  closeAll: () => set({ stack: [] }),
  propertyFilter: 'all',
  setPropertyFilter: (propertyFilter) => set({ propertyFilter }),
}));

export const openOverlay = (o: Overlay) => useUI.getState().open(o);
