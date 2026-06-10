import { useEffect } from 'react';
import { X } from 'lucide-react';
import clsx from 'clsx';
import { fmt } from '../../lib/format';

export function Card({ className, children, ...props }) {
  return (
    <div className={clsx('card p-4 sm:p-5', className)} {...props}>
      {children}
    </div>
  );
}

export function CardTitle({ children, className }) {
  return <div className={clsx('card-title mb-3', className)}>{children}</div>;
}

export function SectionTitle({ children, action }) {
  return (
    <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
      <div className="card-title">{children}</div>
      {action}
    </div>
  );
}

const METRIC_COLOR = {
  positive: 'text-positive',
  negative: 'text-negative',
  brand: 'text-brand',
  warn: 'text-warn',
  violet: 'text-violet',
  ink: 'text-ink',
};

export function Metric({ label, value, tone = 'ink', money }) {
  return (
    <div className="bg-surface2 rounded-lg p-3.5">
      <div className="text-[11px] text-ink2 uppercase tracking-wide mb-1.5">{label}</div>
      <div className={clsx('text-lg sm:text-xl font-semibold tabular-nums', METRIC_COLOR[tone])}>
        {money !== undefined ? fmt(money) : value}
      </div>
    </div>
  );
}

export function MetricGrid({ children, className }) {
  return (
    <div className={clsx('grid gap-2.5 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4', className)}>
      {children}
    </div>
  );
}

export function Button({ variant = 'default', className, children, ...props }) {
  return (
    <button
      className={clsx(
        'btn',
        variant === 'primary' && 'btn-primary',
        variant === 'danger' && 'btn-danger',
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

const BADGE_TONE = {
  income: 'bg-positive-bg text-positive-text',
  expense: 'bg-negative-bg text-negative-text',
  investment: 'bg-brand-bg text-brand-text',
  transfer: 'bg-surface2 text-ink2',
  tfn: 'bg-[#EAF3DE] text-[#27500A]',
  abn: 'bg-violet-bg text-violet-text',
  cash: 'bg-warn-bg text-warn-text',
  neutral: 'bg-surface2 text-ink2',
};

export function Badge({ tone = 'neutral', children }) {
  return <span className={clsx('badge', BADGE_TONE[tone] || BADGE_TONE.neutral)}>{children}</span>;
}

export function ProgressBar({ value, color = '#378ADD', height = 6 }) {
  return (
    <div className="w-full bg-surface2 rounded-full overflow-hidden" style={{ height }}>
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${Math.min(Math.max(value, 0), 100)}%`, background: color }}
      />
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[150] bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className={clsx(
          'bg-surface w-full rounded-t-card sm:rounded-card border border-line max-h-[92vh] sm:max-h-[88vh] overflow-y-auto animate-fade-in',
          wide ? 'sm:max-w-4xl' : 'sm:max-w-lg'
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-line sticky top-0 bg-surface z-10">
          <h3 className="text-base font-semibold">{title}</h3>
          <button onClick={onClose} className="p-1 text-ink3 hover:text-ink" aria-label="Close">
            <X size={20} />
          </button>
        </div>
        <div className="p-4 sm:p-5">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, children, full }) {
  return (
    <div className={full ? 'sm:col-span-2' : ''}>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, hint }) {
  return (
    <div className="text-center py-10 text-ink3">
      {Icon && <Icon size={28} className="mx-auto mb-2 opacity-60" />}
      <p className="text-sm font-medium text-ink2">{title}</p>
      {hint && <p className="text-xs mt-1">{hint}</p>}
    </div>
  );
}

export function Spinner({ label = 'Loading…' }) {
  return (
    <div className="flex items-center gap-2 text-sm text-ink2 py-6 justify-center">
      <div className="w-4 h-4 border-2 border-line2 border-t-brand rounded-full animate-spin" />
      {label}
    </div>
  );
}
