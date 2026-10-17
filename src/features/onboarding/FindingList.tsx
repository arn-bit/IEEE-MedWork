import type { Finding } from '../../domain/safety/analyze';
import type { FindingView } from '../../domain/safety/summary';
import { Icon, type IconName } from '../../components/Icon';

const KIND_ICON: Record<Finding['kind'], IconName> = { urgent: 'alert', refer: 'alert', adjust: 'check', info: 'info', goal: 'flag', warning: 'alert' };
const KIND_LABEL: Record<Finding['kind'], string> = {
  urgent: 'Urgent',
  refer: 'Check with a professional',
  adjust: 'Adjusts your plan',
  info: 'For your information',
  goal: 'Goal suggestion',
  warning: 'Heads-up',
};

/**
 * "What we understood" from the user's own words. Every row shows the phrase it came from, what
 * it will do, and lets the user say "not accurate" (or add a suggestion). Nothing is hidden.
 */
export function FindingList({
  findings,
  onDismiss,
  onRestore,
  onApply,
  empty,
}: {
  findings: FindingView[];
  onDismiss?: (id: string) => void;
  onRestore?: (id: string) => void;
  onApply?: (f: Finding) => void;
  empty?: string;
}) {
  if (findings.length === 0) return empty ? <p className="small muted">{empty}</p> : null;
  return (
    <ul className="findings" aria-label="What we understood from your words">
      {findings.map((f) => (
        <li key={f.id} className="finding" data-kind={f.kind} data-status={f.status}>
          <span className="finding-icon" aria-hidden="true">
            <Icon name={KIND_ICON[f.kind]} size={18} />
          </span>
          <div className="finding-body">
            <div className="row" style={{ gap: 8 }}>
              <strong>{f.title}</strong>
              <span className="badge finding-kind">{KIND_LABEL[f.kind]}</span>
              {f.status === 'dismissed' ? <span className="badge">Dismissed</span> : null}
              {f.status === 'included' || f.status === 'applied' ? <span className="badge badge-brand">Included</span> : null}
            </div>
            {f.quote && f.quote !== '[hidden]' ? <span className="tiny muted finding-quote">You wrote: “{f.quote}”</span> : null}
            <span className="small">{f.detail}</span>
            <div className="row finding-actions">
              {(f.status === 'included' || f.status === 'applied') && f.effects.length > 0 && f.status === 'included' && onDismiss ? (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => onDismiss(f.id)} title="Only use this if it doesn’t describe you">
                  Not accurate
                </button>
              ) : null}
              {f.status === 'dismissed' && onRestore ? (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => onRestore(f.id)}>
                  Include again
                </button>
              ) : null}
              {f.status === 'suggested' && onApply ? (
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => onApply(f)}>
                  <Icon name="plus" size={14} /> {f.actionLabel ?? 'Add'}
                </button>
              ) : null}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
