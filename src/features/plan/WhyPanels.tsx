import type { Exercise, Plan, PlannedItem } from '../../domain/types';
import { EvidenceKindBadge, EvidenceRefs } from '../../components/ui';
import { getExercise } from '../../domain/exercises/library';

/** "Why this recommendation?" for a single planned exercise. */
export function WhyExercise({ item, exercise }: { item: PlannedItem; exercise: Exercise }) {
  const p = item.prescription;
  return (
    <div className="stack">
      <div className="stack-sm">
        <h3>Why it’s in your plan</h3>
        <ul className="bullets small">
          {item.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
          <li>{exercise.purpose}</li>
        </ul>
      </div>
      <div className="stack-sm">
        <div className="row" style={{ gap: 8 }}>
          <h3>Why these numbers</h3>
          <EvidenceKindBadge kind={p.evidenceKind} />
        </div>
        <p className="small">{p.rationale}</p>
        <p className="small muted">Effort target: {p.intensity}</p>
      </div>
      <div className="stack-sm">
        <h3>Sources</h3>
        <EvidenceRefs ids={[...p.evidenceIds, ...exercise.sourceIds]} />
      </div>
      <p className="tiny muted">
        Instructions checked against public NHS guidance on {exercise.evidenceReviewed}. Not reviewed by a licensed clinician. Camera tracking:{' '}
        {exercise.camera.supported ? exercise.camera.notes : 'not available for this exercise (use manual tracking).'}
      </p>
    </div>
  );
}

/** Plan-level decision trace, applied safety rules, assumptions and exclusions. */
export function WhyPlan({ plan }: { plan: Plan }) {
  return (
    <div className="stack">
      <section className="stack-sm">
        <h3>How this plan was built</h3>
        <ol className="steps small">
          {plan.trace.map((t, i) => (
            <li key={i}>
              <strong>{t.step}.</strong> {t.detail}
            </li>
          ))}
        </ol>
      </section>

      <section className="stack-sm">
        <h3>Safety rules applied</h3>
        {plan.screening.hits.length === 0 ? (
          <p className="small muted">None. No answers triggered a safety rule.</p>
        ) : (
          <ul className="list">
            {plan.screening.hits.map((h) => (
              <li key={h.ruleId + h.title} className="stack-sm" style={{ gap: 4 }}>
                <div className="row" style={{ gap: 8 }}>
                  <span className="badge">{h.ruleId}</span>
                  <strong className="small">{h.title}</strong>
                  <EvidenceKindBadge kind={h.evidenceKind} />
                </div>
                <span className="small">{h.message}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="stack-sm">
        <h3>Assumptions and uncertainty</h3>
        <ul className="bullets small">
          {plan.assumptions.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      </section>

      <section className="stack-sm">
        <h3>When to talk to a professional</h3>
        <ul className="bullets small">
          <li>Before starting, if you have a medical condition or concern, or haven’t exercised in a long time (NHS advice).</li>
          <li>If you get chest discomfort, unusual breathlessness, dizziness or palpitations with activity.</li>
          <li>If pain is sharp, new, or gets worse with exercise.</li>
          <li>If you are pregnant or recently had a baby: discuss activity with your obstetric care provider.</li>
        </ul>
      </section>

      <section className="stack-sm">
        <h3>Sources used in this plan</h3>
        <EvidenceRefs ids={[...new Set(plan.trace.flatMap((t) => t.evidenceIds).concat(plan.screening.hits.flatMap((h) => h.evidenceIds)))]} compact />
      </section>

      <details className="disclosure">
        <summary>Left out of your plan ({plan.excluded.length})</summary>
        <div>
          <ul className="list small">
            {plan.excluded.map((x) => (
              <li key={x.exerciseId}>
                <strong>{getExercise(x.exerciseId)?.name ?? x.exerciseId}</strong>: {x.reason}
              </li>
            ))}
          </ul>
        </div>
      </details>
    </div>
  );
}
