import { forwardRef, useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { ChevronDown, Loader2, Search, ArrowUpRight, ArrowDownRight, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useBusiness } from '@/data/hooks';
import { minorDigits } from '@/lib/money';

// ── Button ─────────────────────────────────────────────────────

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'soft';
type Size = 'sm' | 'md' | 'lg' | 'icon' | 'icon-sm';

const variants: Record<Variant, string> = {
  primary: 'bg-fg text-bg hover:bg-fg/90 shadow-sm dark:bg-accent dark:text-accent-fg dark:hover:bg-accent/90',
  secondary: 'bg-surface text-fg border border-border hover:bg-surface-2 hover:border-border-strong shadow-card',
  ghost: 'text-muted hover:text-fg hover:bg-surface-2',
  danger: 'bg-danger text-white hover:bg-danger/90',
  soft: 'bg-accent-soft text-accent hover:bg-accent/15',
};
const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-12 px-5 text-[15px] gap-2 rounded-xl',
  icon: 'h-10 w-10 rounded-xl',
  'icon-sm': 'h-8 w-8 rounded-lg',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading, icon, className, children, disabled, type = 'button', ...rest }, ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center font-medium whitespace-nowrap select-none transition-all duration-150 active:scale-[.98] disabled:opacity-50 disabled:pointer-events-none',
        variants[variant], sizes[size], className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  );
});

// ── Card ───────────────────────────────────────────────────────

export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('card', className)} {...rest}>{children}</div>;
}

export function CardHeader({ title, subtitle, action, className }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-start justify-between gap-3 px-5 pt-5 pb-3', className)}>
      <div className="min-w-0">
        <h3 className="text-[15px] font-semibold tracking-tight text-fg">{title}</h3>
        {subtitle && <p className="text-[13px] text-muted mt-0.5">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

// ── Badge ──────────────────────────────────────────────────────

export type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info';
const tones: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-muted border-border',
  accent: 'bg-accent-soft text-accent border-accent/20',
  success: 'bg-success/10 text-success border-success/20',
  warning: 'bg-warning/10 text-warning border-warning/25',
  danger: 'bg-danger/10 text-danger border-danger/20',
  info: 'bg-info/10 text-info border-info/20',
};
export function Badge({ tone = 'neutral', dot, children, className }: { tone?: Tone; dot?: boolean; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 h-[22px] px-2 rounded-md border text-[11.5px] font-medium whitespace-nowrap', tones[tone], className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

// ── Form fields ────────────────────────────────────────────────

export function Field({ label, hint, error, children, className, required, htmlFor }: { label?: ReactNode; hint?: ReactNode; error?: string | null; children: ReactNode; className?: string; required?: boolean; htmlFor?: string }) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && (
        <label htmlFor={htmlFor} className="label">
          {label}
          {required && <span className="text-danger ml-0.5">*</span>}
        </label>
      )}
      {children}
      {error ? <p className="text-xs text-danger animate-fade-in">{error}</p> : hint ? <p className="hint">{hint}</p> : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(function Input({ className, invalid, ...rest }, ref) {
  return <input ref={ref} className={cn('input', invalid && 'input-error', className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(function Textarea({ className, invalid, rows = 3, ...rest }, ref) {
  return <textarea ref={ref} rows={rows} className={cn('input resize-y', invalid && 'input-error', className)} {...rest} />;
});

export function Select<T extends string>({ value, onChange, options, className, placeholder, invalid, ...rest }: Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'value'> & {
  value: T | '';
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  placeholder?: string;
  invalid?: boolean;
}) {
  return (
    <div className={cn('relative', className)}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className={cn('input appearance-none pr-9 cursor-pointer', invalid && 'input-error', !value && 'text-subtle')}
        {...rest}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-subtle" />
    </div>
  );
}

/** Money entry in major units with currency symbol; parent holds the string to allow partial input. */
export function MoneyInput({ value, onChange, invalid, className, placeholder = '0', ...rest }: { value: string; onChange: (v: string) => void; invalid?: boolean; className?: string; placeholder?: string } & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const { currency, locale } = useBusiness();
  const symbol = new Intl.NumberFormat(locale, { style: 'currency', currency }).formatToParts(0).find((p) => p.type === 'currency')?.value ?? currency;
  const digits = minorDigits(currency);
  return (
    <div className={cn('relative', className)}>
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-subtle">{symbol}</span>
      <input
        inputMode="decimal"
        className={cn('input num', symbol.length > 1 ? 'pl-10' : 'pl-7', invalid && 'input-error')}
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          const v = e.target.value.replace(/[^\d.]/g, '');
          const re = digits ? /^\d*(\.\d{0,2})?$/ : /^\d*$/;
          if (re.test(v)) onChange(v);
        }}
        {...rest}
      />
    </div>
  );
}

export function Switch({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; description?: ReactNode; disabled?: boolean }) {
  const id = useId();
  return (
    <label htmlFor={id} className={cn('flex items-start justify-between gap-4 cursor-pointer', disabled && 'opacity-50 pointer-events-none')}>
      {(label || description) && (
        <span className="min-w-0">
          {label && <span className="block text-sm font-medium text-fg">{label}</span>}
          {description && <span className="block text-[13px] text-muted mt-0.5">{description}</span>}
        </span>
      )}
      <button
        id={id}
        role="switch"
        type="button"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn('relative shrink-0 h-6 w-10 rounded-full transition-colors duration-200', checked ? 'bg-accent' : 'bg-surface-3')}
      >
        <span className={cn('absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200', checked && 'translate-x-4')} />
      </button>
    </label>
  );
}

export function Checkbox({ checked, onChange, label, className }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; className?: string }) {
  return (
    <label className={cn('flex items-center gap-2.5 cursor-pointer select-none', className)}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 rounded border-border-strong accent-[rgb(var(--accent))]" />
      {label && <span className="text-sm text-fg">{label}</span>}
    </label>
  );
}

export function SearchInput({ value, onChange, placeholder = 'Search…', className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-subtle" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="input pl-9 pr-8" />
      {value && (
        <button onClick={() => onChange('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-subtle hover:text-fg" aria-label="Clear search">
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

// ── Segmented control / tabs ───────────────────────────────────

export function Segmented<T extends string>({ value, onChange, options, size = 'md', className }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; count?: number }[]; size?: 'sm' | 'md'; className?: string }) {
  return (
    <div className={cn('inline-flex items-center p-1 bg-surface-2 border border-border rounded-xl gap-0.5 max-w-full overflow-x-auto', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'flex items-center gap-1.5 rounded-lg font-medium transition-all whitespace-nowrap',
            size === 'sm' ? 'h-7 px-2.5 text-[12.5px]' : 'h-8 px-3 text-[13px]',
            value === o.value ? 'bg-surface text-fg shadow-card' : 'text-muted hover:text-fg',
          )}
        >
          {o.label}
          {o.count != null && <span className={cn('num text-[11px] px-1.5 rounded-md', value === o.value ? 'bg-surface-2 text-muted' : 'text-subtle')}>{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; count?: number }[] }) {
  return (
    <div className="flex items-center gap-1 border-b border-border overflow-x-auto -mx-1 px-1">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'relative h-10 px-3 text-[13.5px] font-medium whitespace-nowrap transition-colors',
            value === o.value ? 'text-fg' : 'text-muted hover:text-fg',
          )}
        >
          {o.label}
          {o.count != null && <span className="ml-1.5 num text-[11.5px] text-subtle">{o.count}</span>}
          {value === o.value && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-fg dark:bg-accent" />}
        </button>
      ))}
    </div>
  );
}

// ── Display ────────────────────────────────────────────────────

export function EmptyState({ icon, title, body, action, className }: { icon?: ReactNode; title: string; body?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center py-12 px-6', className)}>
      {icon && <div className="mb-4 grid place-items-center h-12 w-12 rounded-2xl bg-surface-2 border border-border text-muted">{icon}</div>}
      <p className="text-[15px] font-semibold text-fg">{title}</p>
      {body && <p className="mt-1 text-sm text-muted max-w-sm">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Delta({ value, inverse, className }: { value: number | null; inverse?: boolean; className?: string }) {
  if (value == null) return <span className={cn('text-xs text-subtle', className)}>new</span>;
  const up = value >= 0;
  const good = inverse ? !up : up;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-xs font-medium num', Math.abs(value) < 0.005 ? 'text-subtle' : good ? 'text-success' : 'text-danger', className)}>
      <Icon className="h-3.5 w-3.5" />
      {Math.abs(value * 100).toFixed(Math.abs(value) < 0.1 ? 1 : 0)}%
    </span>
  );
}

export function Stat({ label, value, sub, delta, inverse, icon, className, onClick }: { label: string; value: ReactNode; sub?: ReactNode; delta?: number | null; inverse?: boolean; icon?: ReactNode; className?: string; onClick?: () => void }) {
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp onClick={onClick} className={cn('card p-4 sm:p-5 text-left flex flex-col gap-2 min-w-0', onClick && 'hover:border-border-strong transition-colors', className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12.5px] font-medium text-muted truncate">{label}</span>
        {icon && <span className="text-subtle">{icon}</span>}
      </div>
      <div className="text-[22px] sm:text-[26px] font-semibold tracking-tight num leading-none text-fg truncate">{value}</div>
      <div className="flex items-center gap-2 min-h-[18px]">
        {delta !== undefined && <Delta value={delta} inverse={inverse} />}
        {sub && <span className="text-xs text-subtle truncate">{sub}</span>}
      </div>
    </Comp>
  );
}

const avatarTones = ['bg-s1/15 text-s1', 'bg-s2/15 text-s2', 'bg-s3/15 text-s3', 'bg-s4/15 text-s4', 'bg-s5/15 text-s5', 'bg-s7/15 text-s7'];
export function Avatar({ name, size = 32, className }: { name: string; size?: number; className?: string }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || '?';
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span className={cn('inline-grid place-items-center rounded-full font-semibold shrink-0', avatarTones[h % avatarTones.length], className)} style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {initials}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} />;
}

export function PageHeader({ title, subtitle, actions, children }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-5 sm:mb-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[22px] sm:text-[26px] font-semibold tracking-tight text-fg">{title}</h1>
          {subtitle && <p className="text-sm text-muted mt-1">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
      </div>
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}

export function KV({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-baseline justify-between gap-4 py-1.5', className)}>
      <span className="text-[13px] text-muted">{label}</span>
      <span className="text-[13.5px] text-fg text-right num">{children}</span>
    </div>
  );
}

export function ProgressBar({ value, tone = 'accent', className }: { value: number; tone?: 'accent' | 'success' | 'warning' | 'danger'; className?: string }) {
  const color = { accent: 'bg-accent', success: 'bg-success', warning: 'bg-warning', danger: 'bg-danger' }[tone];
  return (
    <div className={cn('h-1.5 rounded-full bg-surface-3 overflow-hidden', className)}>
      <div className={cn('h-full rounded-full transition-[width] duration-500', color)} style={{ width: `${Math.max(0, Math.min(100, value * 100))}%` }} />
    </div>
  );
}

/** Simple client-side pagination for long lists. */
export function LoadMore({ shown, total, onMore }: { shown: number; total: number; onMore: () => void }) {
  if (shown >= total) return null;
  return (
    <div className="flex items-center justify-center gap-3 py-4">
      <span className="text-xs text-subtle num">Showing {shown} of {total}</span>
      <Button size="sm" onClick={onMore}>Load more</Button>
    </div>
  );
}
