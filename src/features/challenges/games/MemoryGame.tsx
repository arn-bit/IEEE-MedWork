import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useStore } from '../../../state/store';
import { getExercise } from '../../../domain/exercises/library';
import { FigureDemo } from '../../../components/demo/FigureDemo';
import { Callout, PageHead } from '../../../components/ui';

const POOL = ['sit_to_stand', 'wall_pushup', 'arm_raise', 'mini_squat', 'side_leg_lift', 'biceps_curl', 'calf_raise_supported', 'chest_stretch_seated', 'hip_hinge', 'step_touch'];

interface CardState {
  uid: number;
  id: string;
}

function deal(): CardState[] {
  const picks = [...POOL].sort(() => Math.random() - 0.5).slice(0, 6);
  const cards = [...picks, ...picks].map((id, i) => ({ uid: i, id }));
  return cards.sort(() => Math.random() - 0.5).map((c, i) => ({ ...c, uid: i }));
}

/** Memory Match: pair up exercise pictures. Calm, no timer, seated-friendly. */
export function MemoryGame({ onEnd }: { onEnd: () => void }) {
  const { data, updateGames } = useStore();
  const [cards] = useState<CardState[]>(deal);
  const [open, setOpen] = useState<number[]>([]);
  const [matched, setMatched] = useState<string[]>([]);
  const [moves, setMoves] = useState(0);
  const [locked, setLocked] = useState(false);
  const done = matched.length === 6;
  const best = data.games.memoryBest;
  const names = useMemo(() => Object.fromEntries(POOL.map((id) => [id, getExercise(id)?.name ?? id])), []);

  const flip = (uid: number) => {
    if (locked || open.includes(uid) || matched.includes(cards[uid]!.id)) return;
    const next = [...open, uid];
    setOpen(next);
    if (next.length === 2) {
      setMoves((m) => m + 1);
      const [a, b] = next.map((u) => cards[u]!);
      if (a!.id === b!.id) {
        const nm = [...matched, a!.id];
        setMatched(nm);
        setOpen([]);
        if (nm.length === 6 && (best === null || moves + 1 < best)) updateGames({ memoryBest: moves + 1 });
      } else {
        setLocked(true);
        setTimeout(() => {
          setOpen([]);
          setLocked(false);
        }, 900);
      }
    }
  };

  return (
    <div className="stack" style={{ maxWidth: 720 }}>
      <Link to="/challenges" className="small">
        ← Challenges
      </Link>
      <PageHead eyebrow="Minigame" title="Memory Match">
        Find the pairs of matching exercises. There’s no timer and nothing to rush: just a gentle workout for your memory.
      </PageHead>
      <div className="memory-grid" role="group" aria-label="Memory cards">
        {cards.map((c) => {
          const shown = open.includes(c.uid) || matched.includes(c.id);
          return (
            <button
              key={c.uid}
              className="memory-card"
              data-shown={shown}
              data-matched={matched.includes(c.id)}
              onClick={() => flip(c.uid)}
              aria-label={shown ? `Card ${c.uid + 1}: ${names[c.id]}` : `Card ${c.uid + 1}: face down`}
              aria-pressed={shown}
            >
              {shown ? <FigureDemo exerciseId={c.id} size="sm" /> : <span className="memory-back" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
      <div className="row-between small" aria-live="polite">
        <span>
          Moves: <strong className="num">{moves}</strong>
        </span>
        <span className="muted">Pairs found: {matched.length} of 6{best !== null ? ` · Best: ${best} moves` : ''}</span>
      </div>
      {done ? (
        <div className="card stack">
          <Callout tone="ok" title={`All pairs found in ${moves} moves`}>
            Nicely done. Exercises you matched: {matched.map((id) => names[id]).join(', ')}.
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
