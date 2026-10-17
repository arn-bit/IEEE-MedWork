import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useStore } from '../../../state/store';
import { Callout, PageHead } from '../../../components/ui';

const PADS = [
  { name: 'Green', color: '#17a35a' },
  { name: 'Red', color: '#e0432b' },
  { name: 'Yellow', color: '#f0b429' },
  { name: 'Blue', color: '#2f6fe0' },
] as const;

const randomPad = () => Math.floor(Math.random() * 4);

/** Colour Echo: watch the colours light up, then repeat the pattern. Gentle memory fun. */
export function SimonGame({ onEnd }: { onEnd: () => void }) {
  const { data, updateGames } = useStore();
  const [seq, setSeq] = useState<number[]>([]);
  const [phase, setPhase] = useState<'ready' | 'show' | 'input' | 'over'>('ready');
  const [lit, setLit] = useState<number | null>(null);
  const [step, setStep] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const best = data.games.simonBest;
  const round = phase === 'ready' ? 0 : phase === 'over' ? seq.length - 1 : seq.length;

  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
    },
    [],
  );

  const later = (fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms));
  };
  const play = (s: number[]) => {
    setPhase('show');
    setStep(0);
    s.forEach((p, i) => {
      later(() => setLit(p), 700 + i * 750);
      later(() => setLit(null), 700 + i * 750 + 450);
    });
    later(() => setPhase('input'), 700 + s.length * 750);
  };
  const start = () => {
    const s = [randomPad()];
    setSeq(s);
    play(s);
  };
  const press = (p: number) => {
    if (phase !== 'input') return;
    setLit(p);
    later(() => setLit(null), 180);
    if (p !== seq[step]) {
      setPhase('over');
      if (seq.length - 1 > best) updateGames({ simonBest: seq.length - 1 });
      return;
    }
    if (step + 1 === seq.length) {
      const next = [...seq, randomPad()];
      setSeq(next);
      setPhase('show');
      later(() => play(next), 600);
    } else setStep(step + 1);
  };

  return (
    <div className="stack" style={{ maxWidth: 520 }}>
      <Link to="/challenges" className="small">
        ← Challenges
      </Link>
      <PageHead eyebrow="Reward game" title="Colour Echo">
        Watch the colours light up, then repeat the pattern. Each round adds one more.
      </PageHead>
      <div className="simon" role="group" aria-label="Colour pads">
        {PADS.map((p, i) => (
          <button key={p.name} className="simon-pad" data-lit={lit === i} style={{ ['--pad' as string]: p.color }} onClick={() => press(i)} disabled={phase !== 'input'} aria-label={p.name} />
        ))}
      </div>
      <p className="small" aria-live="polite" style={{ textAlign: 'center' }}>
        {phase === 'ready' ? 'Press Start when you’re ready.' : phase === 'show' ? 'Watch closely…' : phase === 'input' ? `Your turn: ${step + 1} of ${seq.length}` : ''}
      </p>
      <div className="row-between small">
        <span>
          Round: <strong className="num">{round}</strong>
        </span>
        {best ? <span className="muted">Best: {best}</span> : null}
      </div>
      {phase === 'ready' ? (
        <div>
          <button className="btn btn-primary btn-lg" onClick={start}>
            Start
          </button>
        </div>
      ) : null}
      {phase === 'over' ? (
        <div className="card stack">
          <Callout tone="ok" title={`You reached round ${round}`}>
            {round > 0 && round >= best ? 'A new best! ' : ''}There are no penalties, just fun.
          </Callout>
          <div className="row">
            <button className="btn btn-primary" onClick={onEnd}>
              Play again
            </button>
            <Link to="/challenges" className="btn btn-secondary">
              Done
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
