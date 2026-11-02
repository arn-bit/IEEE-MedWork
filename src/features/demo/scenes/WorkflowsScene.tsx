import type { SceneProps } from '../DemoPage';
import { WordsScene } from './WordsScene';
import { PlanScene } from './PlanScene';

/** The scene is two real workflows back to back: understanding the words, then building the plan. */
export const WORDS_PHASE_MS = 9000;
const STEPS = ['Your words', 'Safety rules', 'Your plan', 'Sources'] as const;
const stepAt = (elapsed: number) => (elapsed < 6200 ? 0 : elapsed < WORDS_PHASE_MS ? 1 : elapsed < 14000 ? 2 : 3);

export function WorkflowsScene(props: SceneProps) {
  const { elapsed } = props;
  const now = stepAt(elapsed);
  const inWords = elapsed < WORDS_PHASE_MS;
  return (
    <div className="demo-workflows">
      <ol className="demo-flow" aria-label="Workflow steps">
        {STEPS.map((s, i) => (
          <li key={s} className="demo-flow-step" data-state={i < now ? 'done' : i === now ? 'now' : 'next'} aria-current={i === now ? 'step' : undefined}>
            {s}
          </li>
        ))}
      </ol>
      {inWords ? <WordsScene {...props} /> : <PlanScene {...props} elapsed={elapsed - WORDS_PHASE_MS} />}
    </div>
  );
}
