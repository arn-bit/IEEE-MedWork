import { useMemo } from 'react';
import type { Profile } from '../../domain/types';
import { applyFinding, type Finding } from '../../domain/safety/analyze';
import { analyzeAnswers, QUESTION_LABEL } from '../../domain/safety/summary';
import { EvidenceKindBadge } from '../../components/ui';
import { Icon, type IconName } from '../../components/Icon';
import { FindingList } from './FindingList';

const TONE_ICON: Record<string, IconName> = { ok: 'check', adjust: 'shield', refer: 'alert', urgent: 'alert' };

/**
 * The "analyse my responses" readout: what it means for safety, what we understood from the
 * user's own words, what will change in the plan, and what is still open.
 * With `onChange`, the user can dismiss or add findings; otherwise it is read-only.
 */
export function AnswerAnalysis({ profile, onChange, showPreview = true }: { profile: Profile; onChange?: (p: Profile) => void; showPreview?: boolean }) {
  const a = useMemo(() => analyzeAnswers(profile), [profile]);
  const setDismissed = (ids: string[]) => onChange?.({ ...profile, health: { ...profile.health, dismissedFindings: ids } });
  const dismiss = (id: string) => setDismissed([...new Set([...profile.health.dismissedFindings, id])]);
  const restore = (id: string) => setDismissed(profile.health.dismissedFindings.filter((x) => x !== id));
  const apply = (f: Finding) => onChange?.(applyFinding(profile, f));
  const interactive = !!onChange;
  const understood = [...a.included, ...a.suggested, ...a.dismissed];

  return (
    <section className="analysis stack" aria-labelledby="analysis-h" data-tone={a.tone}>
      <div className="analysis-head" data-tone={a.tone}>
        <span className="analysis-icon" aria-hidden="true">
          <Icon name={TONE_ICON[a.tone]!} size={26} />
        </span>
        <div className="stack-sm" style={{ gap: 4 }}>
          <span className="eyebrow">Analysis of your answers</span>
          <h2 id="analysis-h">{a.headline}</h2>
          <p className="small">{a.lead}</p>
        </div>
      </div>

      <div className="analysis-meters" aria-label="Summary numbers">
        <div className="meter">
          <span className="value num">
            {a.answeredCount}/{a.questionCount}
          </span>
          <span className="tiny muted">screening questions answered</span>
        </div>
        <div className="meter">
          <span className="value num">{a.included.length}</span>
          <span className="tiny muted">things we used from your words</span>
        </div>
        <div className="meter">
          <span className="value num">{a.preview ? a.preview.exercisesLeftOut : '–'}</span>
          <span className="tiny muted">exercises left out for safety or fit</span>
        </div>
        <div className="meter">
          <span className="value num">{a.preview ? a.preview.sessionsPerWeek : '–'}</span>
          <span className="tiny muted">workouts a week</span>
        </div>
      </div>

      {a.rules.length > 0 ? (
        <div className="stack-sm">
          <h3>What this means</h3>
          <ul className="list">
            {a.rules.map((r) => (
              <li key={r.ruleId + r.title} className="stack-sm" style={{ gap: 4 }}>
                <div className="row" style={{ gap: 8 }}>
                  <span className="badge">{r.ruleId}</span>
                  <strong className="small">{r.title}</strong>
                  <EvidenceKindBadge kind={r.evidenceKind} />
                </div>
                <span className="small">{r.message}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {understood.length > 0 ? (
        <div className="stack-sm">
          <h3>What we understood from your words</h3>
          <p className="tiny muted">
            This is keyword matching, not a medical reading, so it can get things wrong. Anything that restricts your plan is included for safety. Mark it “not accurate” if it doesn’t describe
            you.
          </p>
          <FindingList findings={understood} onDismiss={interactive ? dismiss : undefined} onRestore={interactive ? restore : undefined} onApply={interactive ? apply : undefined} />
        </div>
      ) : null}

      {a.info.length > 0 ? (
        <div className="stack-sm">
          <h3>Good to know</h3>
          <FindingList findings={a.info} />
        </div>
      ) : null}

      {showPreview && a.preview && a.preview.leftOutBy.length > 0 ? (
        <div className="stack-sm">
          <h3>What changes in your plan</h3>
          <ul className="bullets small">
            {a.preview.leftOutBy.map((g) => (
              <li key={g.label}>
                <strong>{g.count}</strong> left out: {g.label.toLowerCase()}
              </li>
            ))}
          </ul>
          <p className="tiny muted">
            Every left-out exercise and its reason is listed under “Why this plan?” after your plan is made. You will still have about {a.preview.exercisesAvailable} exercises to draw on.
          </p>
        </div>
      ) : null}

      {a.unsure.length > 0 || a.skipped.length > 0 || a.notUnderstood.length > 0 ? (
        <div className="stack-sm">
          <h3>Still open</h3>
          <ul className="bullets small">
            {a.unsure.map((k) => (
              <li key={k}>
                You answered <strong>Not sure</strong> to “{QUESTION_LABEL[k]}”. We treat that like “Yes” to stay on the safe side.
              </li>
            ))}
            {a.skipped.length > 0 ? <li>Not answered, so treated as “No”: {a.skipped.map((k) => QUESTION_LABEL[k].toLowerCase()).join('; ')}.</li> : null}
            {a.notUnderstood.map((n) => (
              <li key={n.field + n.text}>
                We couldn’t interpret “{n.text}”. It doesn’t change your plan. If it matters for exercise, tell a professional.
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
