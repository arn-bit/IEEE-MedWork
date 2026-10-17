import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Icon, type IconName } from './Icon';
import { getEvidence, EVIDENCE_KIND_LABEL } from '../domain/evidence/registry';
import type { EvidenceKind } from '../domain/types';

export function Callout({ tone = 'info', title, children, icon }: { tone?: 'info' | 'warn' | 'danger' | 'ok'; title?: ReactNode; children?: ReactNode; icon?: IconName }) {
  const defaultIcon: Record<string, IconName> = { info: 'info', warn: 'alert', danger: 'alert', ok: 'check' };
  return (
    <div className={`callout callout-${tone}`} role={tone === 'danger' ? 'alert' : undefined}>
      <Icon name={icon ?? defaultIcon[tone]!} size={20} />
      <div className="stack-sm" style={{ gap: 4 }}>
        {title ? <strong>{title}</strong> : null}
        {children ? <div className="small">{children}</div> : null}
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon: IconName; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="card empty">
      <div className="icon-wrap">
        <Icon name={icon} size={26} />
      </div>
      <h2>{title}</h2>
      {children ? <p className="muted" style={{ maxWidth: '46ch' }}>{children}</p> : null}
      {action}
    </div>
  );
}

export function PageHead({ eyebrow, title, children, actions }: { eyebrow?: string; title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="page-head">
      <div className="row-between">
        <div className="stack-sm" style={{ gap: 4 }}>
          {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
          <h1>{title}</h1>
        </div>
        {actions}
      </div>
      {children ? <p>{children}</p> : null}
    </header>
  );
}

export function ProgressRing({ value, max, size = 92, stroke = 9, label, sub }: { value: number; max: number; size?: number; stroke?: number; label: ReactNode; sub?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = max > 0 ? Math.min(1, value / max) : 0;
  return (
    <div style={{ position: 'relative', width: size, height: size, flex: 'none' }}>
      <svg width={size} height={size} className="ring" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--brand)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
        />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center', lineHeight: 1.1 }}>
        <div>
          <div style={{ fontWeight: 740, fontSize: size > 80 ? '1.35rem' : '1rem' }} className="num">
            {label}
          </div>
          {sub ? <div className="tiny muted">{sub}</div> : null}
        </div>
      </div>
    </div>
  );
}

export function Bar({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className={`bar ${value > max ? 'bar-over' : ''}`} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Accessible modal built on <dialog> (native focus trapping + Escape). */
export function Modal({ open, onClose, title, children, labelledBy }: { open: boolean; onClose: () => void; title: string; children: ReactNode; labelledBy?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      if (typeof d.showModal === 'function') d.showModal();
      else d.setAttribute('open', '');
    }
    if (!open && d.open) {
      if (typeof d.close === 'function') d.close();
      else d.removeAttribute('open');
    }
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby={labelledBy ?? id}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      {open ? (
        <div className="modal-body">
          <div className="row-between">
            <h2 id={id}>{title}</h2>
            <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close">
              <Icon name="x" />
            </button>
          </div>
          {children}
        </div>
      ) : null}
    </dialog>
  );
}

export function ChipGroup<T extends string>({
  legend,
  hint,
  options,
  value,
  onChange,
  multiple = true,
  max,
  error,
}: {
  legend: string;
  hint?: ReactNode;
  options: { value: T; label: string; disabled?: boolean }[];
  value: T[];
  onChange: (v: T[]) => void;
  multiple?: boolean;
  max?: number;
  error?: string;
}) {
  const name = useId();
  return (
    <fieldset className="field">
      <legend>{legend}</legend>
      {hint ? <span className="hint">{hint}</span> : null}
      <div className="chip-group" style={{ marginTop: 6 }}>
        {options.map((o) => {
          const checked = value.includes(o.value);
          const atMax = multiple && max !== undefined && value.length >= max && !checked;
          return (
            <label key={o.value} className="chip">
              <input
                type={multiple ? 'checkbox' : 'radio'}
                name={name}
                checked={checked}
                disabled={o.disabled || atMax}
                onChange={() => {
                  if (!multiple) onChange([o.value]);
                  else onChange(checked ? value.filter((x) => x !== o.value) : [...value, o.value]);
                }}
              />
              <span>
                {checked ? <Icon name="check" size={16} /> : null}
                {o.label}
              </span>
            </label>
          );
        })}
      </div>
      {error ? <span className="error" role="alert">{error}</span> : null}
    </fieldset>
  );
}

export function CheckCard({ checked, onChange, title, hint, name }: { checked: boolean; onChange: (v: boolean) => void; title: ReactNode; hint?: ReactNode; name?: string }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} name={name} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <strong>{title}</strong>
        {hint ? <span className="hint">{hint}</span> : null}
      </span>
    </label>
  );
}

export function RadioCards<T extends string>({ legend, hint, options, value, onChange, cols = 3 }: { legend: string; hint?: ReactNode; options: { value: T; title: string; hint?: string }[]; value: T | null; onChange: (v: T) => void; cols?: 2 | 3 }) {
  const name = useId();
  return (
    <fieldset className="field">
      <legend>{legend}</legend>
      {hint ? <span className="hint">{hint}</span> : null}
      <div className={`radio-cards cols-${cols}`} style={{ marginTop: 6 }}>
        {options.map((o) => (
          <label key={o.value} className="check">
            <input type="radio" name={name} checked={value === o.value} onChange={() => onChange(o.value)} />
            <span>
              <strong>{o.title}</strong>
              {o.hint ? <span className="hint">{o.hint}</span> : null}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function Stepper({ label, value, onChange, min, max, step = 1, unit, id }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; step?: number; unit?: string; id?: string }) {
  const auto = useId();
  const inputId = id ?? auto;
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  return (
    <div className="field">
      <label htmlFor={inputId}>{label}</label>
      <div className="row">
        <div className="stepper">
          <button type="button" aria-label={`Decrease ${label}`} onClick={() => onChange(clamp(value - step))} disabled={value <= min}>
            −
          </button>
          <input
            id={inputId}
            type="number"
            inputMode="numeric"
            min={min}
            max={max}
            step={step}
            value={Number.isFinite(value) ? value : ''}
            onChange={(e) => onChange(e.target.value === '' ? NaN : Number(e.target.value))}
            className="num"
          />
          <button type="button" aria-label={`Increase ${label}`} onClick={() => onChange(clamp((Number.isFinite(value) ? value : min) + step))} disabled={value >= max}>
            +
          </button>
        </div>
        {unit ? <span className="muted">{unit}</span> : null}
      </div>
    </div>
  );
}

const KIND_BADGE: Record<EvidenceKind, string> = {
  guideline: 'badge-brand',
  position_stand: 'badge-info',
  systematic_review: 'badge-ok',
  model_card: 'badge',
  product_heuristic: 'badge-warn',
};

export function EvidenceKindBadge({ kind }: { kind: EvidenceKind }) {
  return <span className={`badge ${KIND_BADGE[kind]}`}>{EVIDENCE_KIND_LABEL[kind]}</span>;
}

export function EvidenceRefs({ ids, compact = false }: { ids: string[]; compact?: boolean }) {
  const uniq = [...new Set(ids)];
  return (
    <ul className="list">
      {uniq.map((id) => {
        const e = getEvidence(id);
        if (!e) return <li key={id}>Unknown source ({id})</li>;
        return (
          <li key={id} className="stack-sm" style={{ gap: 4 }}>
            <div className="row" style={{ gap: 8 }}>
              <EvidenceKindBadge kind={e.kind} />
              <span className="tiny muted">{e.organization}</span>
            </div>
            <a href={e.url} target="_blank" rel="noopener noreferrer" className="small" style={{ fontWeight: 600 }}>
              {e.title} <Icon name="external" size={13} className="inline-icon" />
            </a>
            {!compact ? (
              <>
                <span className="small">
                  <strong>Supports:</strong> {e.supports}
                </span>
                <span className="tiny muted">
                  Population: {e.population} · Limitations: {e.limitations} · Published: {e.published}
                  {e.doi ? ` · DOI ${e.doi}` : ''} · Checked {e.lastChecked}
                </span>
              </>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export function ButtonLink({ to, children, variant = 'primary', size, icon }: { to: string; children: ReactNode; variant?: 'primary' | 'secondary' | 'ghost'; size?: 'lg' | 'sm'; icon?: IconName }) {
  return (
    <Link to={to} className={`btn btn-${variant} ${size ? `btn-${size}` : ''}`}>
      {children}
      {icon ? <Icon name={icon} size={18} /> : null}
    </Link>
  );
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m === 0) return `${r}s`;
  return r === 0 ? `${m} min` : `${m} min ${r}s`;
}

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.ceil(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Compact single-choice control (radio group styled as a segmented switch). */
export function Segmented<T extends string>({
  legend,
  hint,
  value,
  onChange,
  options,
  name,
  hideLegend = false,
  size = 'md',
}: {
  legend: string;
  hint?: ReactNode;
  value: T | null;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  name?: string;
  hideLegend?: boolean;
  size?: 'sm' | 'md';
}) {
  const auto = useId();
  const group = name ?? auto;
  return (
    <fieldset className="seg-field">
      <legend className={hideLegend ? 'visually-hidden' : 'label'}>{legend}</legend>
      {hint}
      <div className={`seg seg-${size}`}>
        {options.map((o) => (
          <label key={o.value} className="seg-opt">
            <input type="radio" name={group} checked={value === o.value} onChange={() => onChange(o.value)} />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Multi-line typed input with a character counter and optional example chips. */
export function TextAreaField({
  label,
  hint,
  value,
  onChange,
  max = 600,
  placeholder,
  examples,
  rows = 3,
}: {
  label: string;
  hint?: ReactNode;
  value: string;
  onChange: (v: string) => void;
  max?: number;
  placeholder?: string;
  examples?: string[];
  rows?: number;
}) {
  const id = useId();
  const left = max - value.length;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {hint ? <span className="hint">{hint}</span> : null}
      <textarea
        id={id}
        className="input textarea"
        rows={rows}
        maxLength={max}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        spellCheck
        autoComplete="off"
        aria-describedby={`${id}-count`}
      />
      <div className="row-between">
        <div className="chip-group" aria-label="Examples you can add">
          {(examples ?? []).map((ex) => (
            <button key={ex} type="button" className="btn btn-ghost btn-sm example-chip" onClick={() => onChange(value ? `${value.trimEnd()}${/[.!?]$/.test(value.trim()) ? '' : '.'} ${ex}` : ex)}>
              + {ex}
            </button>
          ))}
        </div>
        <span id={`${id}-count`} className={`tiny num ${left < 40 ? 'count-low' : 'muted'}`}>
          {value.length}/{max}
        </span>
      </div>
    </div>
  );
}
