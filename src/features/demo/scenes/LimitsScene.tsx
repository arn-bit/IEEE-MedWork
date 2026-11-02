import { POSTER } from '../../poster/content';
import type { SceneProps } from '../DemoPage';

export function LimitsScene({ elapsed }: SceneProps) {
  return (
    <div className="demo-limits">
      <ul className="demo-limit-list" aria-label="Limits">
        {POSTER.limits.map((l, i) => (
          <li key={l} className="demo-limit" style={{ opacity: elapsed > 300 + i * 550 ? 1 : 0, transform: elapsed > 300 + i * 550 ? 'none' : 'translateY(14px)' }}>
            {l}
          </li>
        ))}
      </ul>
      <section className="demo-refs" aria-label="References" style={{ opacity: elapsed > 2800 ? 1 : 0 }}>
        <h2>References</h2>
        <ol>
          {POSTER.references.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ol>
      </section>
    </div>
  );
}
