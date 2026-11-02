import { POSTER } from '../../poster/content';
import type { SceneProps } from '../DemoPage';

/** Which input each model reads, in the order they are used. Names and makers come from the poster text. */
const LANES = [
  { input: 'Camera feed', models: [0], output: '33 body points → reps and holds' },
  { input: 'Meal photo', models: [2, 1], output: 'Foods, amounts and plate totals' },
] as const;

export function ModelsScene({ elapsed }: SceneProps) {
  const runtime = POSTER.models[3];
  const shown = (i: number) => elapsed > 400 + i * 700;
  return (
    <div className="demo-models">
      {LANES.map((lane, li) => (
        <div key={lane.input} className="demo-lane" style={{ opacity: shown(li * 2) ? 1 : 0, transform: shown(li * 2) ? 'none' : 'translateY(14px)' }}>
          <span className="demo-lane-end">{lane.input}</span>
          {lane.models.map((mi) => {
            const m = POSTER.models[mi]!;
            return (
              <span key={m.name} className="demo-lane-part">
                <span className="demo-arrow" aria-hidden="true">
                  →
                </span>
                <span className="demo-model">
                  <strong>{m.name}</strong>
                  <span>{m.maker}</span>
                  <span className="demo-model-job">{m.job}</span>
                  <span className="demo-model-facts">{m.facts.join(' · ')}</span>
                </span>
              </span>
            );
          })}
          <span className="demo-arrow" aria-hidden="true">
            →
          </span>
          <span className="demo-lane-end demo-lane-out">{lane.output}</span>
        </div>
      ))}
      <div className="demo-runtime" style={{ opacity: elapsed > 3800 ? 1 : 0 }}>
        <strong>{runtime.name}</strong>{' '}
        <span>
          ({runtime.maker}) {runtime.job.toLowerCase()}. {runtime.facts.join(' · ')}.
        </span>
      </div>
      <p className="demo-facts" style={{ opacity: elapsed > 5200 ? 1 : 0 }}>
        {POSTER.modelsNote} The two food models vote together: CLIP covers 300+ foods, the Food-101 model is strongest on 101 common dishes.
      </p>
    </div>
  );
}
