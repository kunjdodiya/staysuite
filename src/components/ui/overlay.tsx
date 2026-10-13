import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from './index';

function useLockScroll(open: boolean) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);
}

function useEscape(open: boolean, onClose: () => void) {
  const ref = useRef(onClose);
  ref.current = onClose;
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') ref.current(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open]);
}

/** Right-side panel on desktop, full-height sheet on phones. Used for create/edit flows. */
export function Drawer({ open, onClose, title, subtitle, children, footer, width = 'max-w-xl' }: {
  open: boolean; onClose: () => void; title: ReactNode; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode; width?: string;
}) {
  useLockScroll(open);
  useEscape(open, onClose);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px] animate-fade-in" onClick={onClose} />
      <div className={cn(
        'absolute bg-surface shadow-pop flex flex-col',
        'inset-x-0 bottom-0 top-[max(env(safe-area-inset-top),12px)] rounded-t-3xl animate-slide-in-up',
        'sm:inset-y-0 sm:right-0 sm:left-auto sm:top-0 sm:w-full sm:rounded-none sm:rounded-l-3xl sm:animate-slide-in-right', width,
      )} role="dialog" aria-modal="true">
        <div className="flex items-start justify-between gap-4 px-5 sm:px-6 pt-5 pb-4 border-b border-border">
          <div className="min-w-0">
            <h2 className="text-[17px] font-semibold tracking-tight">{title}</h2>
            {subtitle && <p className="text-[13px] text-muted mt-0.5">{subtitle}</p>}
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></Button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5">{children}</div>
        {footer && <div className="px-5 sm:px-6 py-4 border-t border-border flex items-center justify-end gap-2 pb-[max(env(safe-area-inset-bottom),16px)] bg-surface sm:rounded-bl-3xl">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Modal({ open, onClose, title, children, footer, size = 'md' }: {
  open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  useLockScroll(open);
  useEscape(open, onClose);
  if (!open) return null;
  const w = { sm: 'sm:max-w-sm', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl', xl: 'sm:max-w-4xl' }[size];
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-6">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px] animate-fade-in" onClick={onClose} />
      <div className={cn('relative w-full bg-surface shadow-pop rounded-t-3xl sm:rounded-3xl max-h-[92vh] flex flex-col animate-rise-in', w)} role="dialog" aria-modal="true">
        {title && (
          <div className="flex items-center justify-between gap-4 px-5 sm:px-6 pt-5 pb-3">
            <h2 className="text-[17px] font-semibold tracking-tight">{title}</h2>
            <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></Button>
          </div>
        )}
        <div className="overflow-y-auto px-5 sm:px-6 pb-5">{children}</div>
        {footer && <div className="px-5 sm:px-6 py-4 border-t border-border flex flex-wrap items-center justify-end gap-2 pb-[max(env(safe-area-inset-bottom),16px)]">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

// ── Confirm dialog (promise based) ─────────────────────────────

interface ConfirmOpts { title: string; body?: ReactNode; confirmLabel?: string; danger?: boolean }
const ConfirmCtx = createContext<(o: ConfirmOpts) => Promise<boolean>>(async () => false);
export const useConfirm = () => useContext(ConfirmCtx);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);
  const confirm = useCallback((o: ConfirmOpts) => new Promise<boolean>((resolve) => setState({ ...o, resolve })), []);
  const close = (v: boolean) => { state?.resolve(v); setState(null); };
  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <Modal open={!!state} onClose={() => close(false)} size="sm">
        {state && (
          <div className="pt-6 text-center">
            <div className={cn('mx-auto mb-4 grid place-items-center h-11 w-11 rounded-2xl', state.danger ? 'bg-danger/10 text-danger' : 'bg-accent-soft text-accent')}>
              <AlertTriangle className="h-5 w-5" />
            </div>
            <h3 className="text-[16px] font-semibold">{state.title}</h3>
            {state.body && <div className="mt-1.5 text-sm text-muted">{state.body}</div>}
            <div className="mt-6 grid grid-cols-2 gap-2">
              <Button onClick={() => close(false)}>Cancel</Button>
              <Button variant={state.danger ? 'danger' : 'primary'} onClick={() => close(true)} autoFocus>{state.confirmLabel ?? 'Confirm'}</Button>
            </div>
          </div>
        )}
      </Modal>
    </ConfirmCtx.Provider>
  );
}

// ── Dropdown menu ──────────────────────────────────────────────

export interface MenuItem { label: ReactNode; icon?: ReactNode; onClick: () => void; danger?: boolean; disabled?: boolean; hidden?: boolean }

export function Menu({ trigger, items, align = 'right', placement = 'bottom' }: { trigger: (p: { onClick: () => void; open: boolean }) => ReactNode; items: (MenuItem | 'divider')[]; align?: 'left' | 'right' | 'center'; placement?: 'bottom' | 'top' }) {
  const [open, setOpen] = useState(false);
  const [side, setSide] = useState(align);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // Flip horizontally if the menu would overflow the viewport (e.g. a right-aligned menu on a left-side button on phones)
  useLayoutEffect(() => {
    if (!open) { setSide(align); return; }
    const r = menuRef.current?.getBoundingClientRect();
    if (!r) return;
    if (r.left < 8 && side !== 'left') setSide('left');
    else if (r.right > window.innerWidth - 8 && side !== 'right') setSide('right');
  }, [open, side, align]);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', h);
    document.addEventListener('keydown', k);
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k); };
  }, [open]);
  const visible = items.filter((i) => i === 'divider' || !i.hidden);
  return (
    <div className="relative inline-block" ref={ref}>
      {trigger({ onClick: () => setOpen((o) => !o), open })}
      {open && (
        <div ref={menuRef} className={cn('absolute z-40 min-w-[200px] max-w-[calc(100vw-16px)] p-1.5 bg-surface border border-border rounded-xl shadow-pop animate-rise-in', placement === 'top' ? 'bottom-full mb-2' : 'mt-1.5', side === 'right' ? 'right-0' : side === 'center' ? 'left-1/2 -ml-[110px] w-[220px]' : 'left-0')} role="menu">
          {visible.map((it, i) =>
            it === 'divider' ? <div key={i} className="my-1 divide" /> : (
              <button
                key={i}
                role="menuitem"
                disabled={it.disabled}
                onClick={() => { setOpen(false); it.onClick(); }}
                className={cn('w-full flex items-center gap-2.5 min-h-9 py-2 px-2.5 rounded-lg text-[13.5px] leading-snug text-left transition-colors disabled:opacity-40',
                  it.danger ? 'text-danger hover:bg-danger/10' : 'text-fg hover:bg-surface-2')}
              >
                {it.icon && <span className="text-muted [&>svg]:h-4 [&>svg]:w-4">{it.icon}</span>}
                {it.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
