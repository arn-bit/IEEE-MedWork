import { Link } from 'react-router';
import { EMERGENCY_GUIDANCE } from '../../domain/safety/screening';
import type { RuleHit, ScreeningResult } from '../../domain/types';
import { EvidenceRefs } from '../../components/ui';
import { Icon } from '../../components/Icon';

export function EmergencyPanel({ onDismiss, dismissLabel = 'I am safe — go back' }: { onDismiss?: () => void; dismissLabel?: string }) {
  return (
    <section className="card stack" style={{ borderColor: 'var(--danger)', borderWidth: 2 }} role="alert" aria-labelledby="emerg-title">
      <div className="row" style={{ color: 'var(--danger)' }}>
        <Icon name="phone" size={28} />
        <h2 id="emerg-title" style={{ color: 'var(--danger)', fontSize: '1.5rem' }}>
          {EMERGENCY_GUIDANCE.title}
        </h2>
      </div>
      <ul className="bullets" style={{ fontSize: '1.05rem' }}>
        {EMERGENCY_GUIDANCE.lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
      <p className="small muted">Verimove cannot assess symptoms. When in doubt, call for help — it is always OK to be checked.</p>
      <details className="disclosure">
        <summary>Sources</summary>
        <div>
          <EvidenceRefs ids={[...EMERGENCY_GUIDANCE.evidenceIds]} compact />
        </div>
      </details>
      {onDismiss ? (
        <div>
          <button className="btn btn-secondary" onClick={onDismiss}>
            {dismissLabel}
          </button>
        </div>
      ) : null}
    </section>
  );
}

function professionalFor(hit: RuleHit): string {
  switch (hit.ruleId) {
    case 'SCREEN-01':
    case 'SCREEN-02':
      return 'your doctor (GP / primary care)';
    case 'SCREEN-04':
      return 'your surgical or hospital care team';
    case 'SCREEN-08':
      return 'your care team (the clinicians treating what you mentioned)';
    case 'SCREEN-05':
      return 'a doctor or physiotherapist';
    case 'SCREEN-06':
      return 'the clinician running your rehab program';
    case 'SCREEN-07':
      return 'your obstetric care provider (midwife or obstetrician)';
    case 'AGE-01':
      return 'a pediatrician or health visitor';
    default:
      return 'an appropriate health professional';
  }
}

export function ReferralPanel({ screening, onCleared, onEdit }: { screening: ScreeningResult; onCleared?: () => void; onEdit?: () => void }) {
  const blocking = screening.hits.filter((h) => h.outcome === 'needs_assessment');
  const ageOnly = blocking.every((h) => h.ruleId.startsWith('AGE-'));
  const canClear = blocking.some((h) => ['SCREEN-01', 'SCREEN-02', 'SCREEN-04', 'SCREEN-05', 'SCREEN-07', 'SCREEN-08'].includes(h.ruleId)) && !blocking.some((h) => h.ruleId === 'SCREEN-06' || h.ruleId === 'AGE-01');
  return (
    <section className="stack" aria-labelledby="ref-title">
      <div className="card stack">
        <span className="eyebrow">Before you start</span>
        <h2 id="ref-title">{ageOnly ? 'A grown-up needs to be involved' : 'Please check with a health professional first'}</h2>
        <p className="muted">
          {ageOnly
            ? 'Verimove keeps extra safeguards for young people.'
            : 'Based on your answers, a personalized exercise plan should come from a professional who can assess you. We have not generated one — this is a safety decision, not a judgment about you.'}
        </p>
        <ul className="list">
          {blocking.map((h) => (
            <li key={h.ruleId} className="stack-sm" style={{ gap: 4 }}>
              <strong>{h.title}</strong>
              <span className="small">{h.message}</span>
              <span className="tiny muted">
                Who to ask: {professionalFor(h)} · Rule {h.ruleId}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div className="card card-soft stack-sm">
        <h3>What you can still do here</h3>
        <ul className="bullets small">
          <li>
            Read the <Link to="/evidence">evidence library</Link> and the <Link to="/about">scope and limitations</Link>.
          </li>
          <li>
            Try the <Link to="/challenges/quiz">Move Smart quiz</Link>.
          </li>
          <li>
            Print a <Link to="/summary">summary of your answers</Link> to bring to your appointment.
          </li>
          <li>
            Bring the PAR-Q+ questionnaire to your appointment:{' '}
            <a href="https://eparmedx.com/" target="_blank" rel="noopener noreferrer">
              eparmedx.com
            </a>
          </li>
        </ul>
      </div>
      <div className="row">
        {canClear && onCleared ? (
          <button className="btn btn-primary" onClick={onCleared}>
            A professional has cleared me to exercise
          </button>
        ) : null}
        {onEdit ? (
          <button className="btn btn-secondary" onClick={onEdit}>
            Review my answers
          </button>
        ) : null}
      </div>
      <details className="disclosure">
        <summary>Why this decision? (rules and sources)</summary>
        <div>
          <EvidenceRefs ids={blocking.flatMap((h) => h.evidenceIds)} />
        </div>
      </details>
    </section>
  );
}
