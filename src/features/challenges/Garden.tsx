import type { Plot } from '../../domain/gamification/tokens';

const STAGE_LABEL = ['bare soil', 'a seed', 'a sprout', 'growing well', 'in bloom'];

function Plant({ stage, paused }: { stage: Plot['stage']; paused: boolean }) {
  return (
    <svg viewBox="0 0 80 90" width="100%" height="100%" aria-hidden="true">
      <ellipse cx="40" cy="80" rx="30" ry="8" fill="var(--soil, #8a6a4a)" opacity={paused ? 0.5 : 1} />
      {paused ? <path d="M18 80 q22 -8 44 0" stroke="var(--ink-3)" strokeWidth="1.5" strokeDasharray="3 3" fill="none" /> : null}
      {stage === 1 ? <ellipse cx="40" cy="74" rx="5" ry="3.4" fill="#5a3f26" /> : null}
      {stage >= 2 ? <path d="M40 76 C40 66 40 58 40 52" stroke="#3b9b5e" strokeWidth="3" strokeLinecap="round" fill="none" /> : null}
      {stage === 2 ? <path d="M40 54 C34 52 32 46 34 43 C39 44 41 49 40 54z" fill="#52b878" /> : null}
      {stage >= 3 ? (
        <>
          <path d="M40 66 C30 66 24 60 25 54 C33 54 39 59 40 66z" fill="#52b878" />
          <path d="M40 58 C50 58 56 52 55 46 C47 46 41 51 40 58z" fill="#3fa564" />
          <path d="M40 52 C40 44 40 38 40 34" stroke="#3b9b5e" strokeWidth="3" strokeLinecap="round" fill="none" />
        </>
      ) : null}
      {stage === 3 ? <circle cx="40" cy="31" r="5" fill="#9bdcb0" /> : null}
      {stage === 4 ? (
        <>
          {[0, 72, 144, 216, 288].map((a) => (
            <ellipse key={a} cx="40" cy="22" rx="5" ry="9" fill="#f08c5f" transform={`rotate(${a} 40 31)`} />
          ))}
          <circle cx="40" cy="31" r="5.5" fill="#f0b44c" />
        </>
      ) : null}
    </svg>
  );
}

/** One plot per week, grown by your own weekly progress. Rest weeks and pauses never wilt anything. */
export function Garden({ plots }: { plots: Plot[] }) {
  return (
    <ul className="garden" aria-label="Your garden, one plot per week">
      {plots.map((p) => (
        <li key={p.key} className="plot" data-current={p.current} data-stage={p.stage}>
          <div className="plot-art">
            <Plant stage={p.stage} paused={p.paused} />
          </div>
          <span className="tiny muted">{p.start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
          <span className="visually-hidden">
            Week of {p.start.toLocaleDateString()}: {p.sessions} of {p.target} workouts, {p.paused ? 'plan paused, plant is resting' : STAGE_LABEL[p.stage]}
          </span>
        </li>
      ))}
    </ul>
  );
}
