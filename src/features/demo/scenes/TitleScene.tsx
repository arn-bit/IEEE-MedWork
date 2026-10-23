import { LogoMark } from '../../../components/Icon';
import { BRAND } from '../../../brand';
import type { SceneProps, ModelState } from '../DemoPage';

const PILLARS = [
  { n: '1', t: 'Explains itself', d: 'Every recommendation links to its guidance' },
  { n: '2', t: 'Safe by rule', d: 'Fixed, testable safety checks. No guessing' },
  { n: '3', t: 'Stays on your device', d: 'No account, no uploads, works offline' },
];

export function TitleScene({ elapsed, models }: SceneProps & { models: ModelState }) {
  return (
    <div className="demo-title">
      <div className="demo-logo" style={{ opacity: Math.min(1, elapsed / 500), transform: `scale(${0.85 + 0.15 * Math.min(1, elapsed / 600)})` }}>
        <LogoMark size={120} />
        <span className="demo-logo-name">{BRAND.name}</span>
      </div>
      <ul className="demo-pillars">
        {PILLARS.map((p, i) => (
          <li key={p.n} className="demo-pillar" style={{ opacity: elapsed > 900 + i * 700 ? 1 : 0, transform: elapsed > 900 + i * 700 ? 'none' : 'translateY(14px)' }}>
            <span className="demo-pillar-n" aria-hidden="true">
              {p.n}
            </span>
            <strong>{p.t}</strong>
            <span>{p.d}</span>
          </li>
        ))}
      </ul>
      <span className="demo-chip" data-ok={models === 'ready'}>
        {models === 'ready' ? '✓ On-device AI ready' : models === 'failed' ? 'Using prepared results for the AI scene' : 'Warming up on-device AI…'}
      </span>
    </div>
  );
}
