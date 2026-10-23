import { getExercise } from '../../../domain/exercises/library';
import { getEvidence } from '../../../domain/evidence/registry';
import { DAY_NAMES } from '../../../domain/plan/engine';
import { EvidenceKindBadge } from '../../../components/ui';
import { FigureDemo } from '../../../components/demo/FigureDemo';
import { describePrescription } from '../../plan/PlanPage';
import type { SceneProps } from '../DemoPage';

/** A real plan from the app's engine for the sample person, with the reasons and sources behind it. */
export function PlanScene({ elapsed, demo }: SceneProps) {
  const session = demo.session;
  if (!session || !demo.plan) return <p className="demo-error">The sample plan could not be built.</p>;
  const main = session.items.filter((i) => i.block === 'main').slice(0, 4);
  const excluded = demo.plan.excluded.find((x) => /area you flagged/i.test(x.reason)) ?? demo.plan.excluded[0];
  const excludedName = excluded ? getExercise(excluded.exerciseId)?.name : null;
  return (
    <div className="demo-plan">
      <div className="demo-week" aria-label="Week plan">
        {DAY_NAMES.map((d, i) => (
          <span key={d} className="demo-day" data-on={!!demo.plan!.schedule[i]}>
            {d.slice(0, 3)}
          </span>
        ))}
      </div>
      <ul className="demo-ex-list">
        {main.map((it, i) => {
          const ex = getExercise(it.exerciseId)!;
          const src = getEvidence(it.prescription.evidenceIds[0] ?? '');
          const on = elapsed > 500 + i * 900;
          return (
            <li key={it.exerciseId} className="demo-ex" style={{ opacity: on ? 1 : 0, transform: on ? 'none' : 'translateX(-24px)' }}>
              <span className="demo-ex-fig" aria-hidden="true">
                <FigureDemo exerciseId={ex.id} size="sm" animate={false} />
              </span>
              <span className="demo-ex-body">
                <strong>{ex.name}</strong>
                <span>{describePrescription(it.prescription)}</span>
                <span className="demo-ex-why">{it.reasons[0]}</span>
              </span>
              <span className="demo-ex-src">
                <EvidenceKindBadge kind={it.prescription.evidenceKind} />
                {src ? <span className="demo-src-title">{src.title}</span> : null}
              </span>
            </li>
          );
        })
        }
      </ul>
      {elapsed > 4600 && excluded ? (
        <div className="demo-leftout" role="status">
          <strong>{demo.leftOut} exercises left out for safety or fit</strong>
          <span>
            {excludedName ? `${excludedName}: ` : ''}
            {excluded.reason}
          </span>
        </div>
      ) : null}
    </div>
  );
}
