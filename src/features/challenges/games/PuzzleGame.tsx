import { useState } from 'react';
import { Link } from 'react-router';
import { useStore } from '../../../state/store';
import { PHOTOS, type PhotoName } from '../../../components/Photo';
import { Callout, PageHead } from '../../../components/ui';

const N = 3;
const PICS: PhotoName[] = ['hero', 'seniors', 'home', 'family', 'walk', 'run'];

/** Slide tiles by swapping with the blank. Built by random legal moves from solved, so it is always solvable. */
function shuffled(): number[] {
  const t = Array.from({ length: N * N }, (_, i) => i); // t[pos] = tile id; N*N-1 is the blank
  let blank = N * N - 1;
  let prev = -1;
  for (let i = 0; i < 90; i++) {
    const r = Math.floor(blank / N);
    const c = blank % N;
    const opts = [r > 0 && blank - N, r < N - 1 && blank + N, c > 0 && blank - 1, c < N - 1 && blank + 1].filter((x): x is number => x !== false && x !== prev);
    const pick = opts[Math.floor(Math.random() * opts.length)]!;
    [t[blank], t[pick]] = [t[pick]!, t[blank]!];
    prev = blank;
    blank = pick;
  }
  return t;
}
const pickPic = (): PhotoName => PICS[Math.floor(Math.random() * PICS.length)]!;
const solved = (t: number[]) => t.every((v, i) => v === i);

/** Photo Puzzle: slide the pieces back into the picture. A relaxing reward, not a workout. */
export function PuzzleGame({ onEnd }: { onEnd: () => void }) {
  const { data, updateGames } = useStore();
  const [pic] = useState<PhotoName>(pickPic);
  const [tiles, setTiles] = useState<number[]>(() => {
    let t = shuffled();
    while (solved(t)) t = shuffled();
    return t;
  });
  const [moves, setMoves] = useState(0);
  const done = solved(tiles);
  const best = data.games.puzzleBest;
  const blankPos = tiles.indexOf(N * N - 1);
  const near = (pos: number) => Math.abs(Math.floor(pos / N) - Math.floor(blankPos / N)) + Math.abs((pos % N) - (blankPos % N)) === 1;

  const slide = (pos: number) => {
    if (done || !near(pos)) return;
    const next = [...tiles];
    [next[pos], next[blankPos]] = [next[blankPos]!, next[pos]!];
    setTiles(next);
    setMoves((m) => m + 1);
    if (solved(next) && (best === null || moves + 1 < best)) updateGames({ puzzleBest: moves + 1 });
  };

  return (
    <div className="stack" style={{ maxWidth: 560 }}>
      <Link to="/challenges" className="small">
        ← Challenges
      </Link>
      <PageHead eyebrow="Reward game" title="Photo Puzzle">
        Slide the pieces back into the picture. Tap a piece next to the gap to move it. No timer, no rush.
      </PageHead>
      <div className="puzzle" style={{ ['--pic' as string]: `url(${PHOTOS[pic].src})` }} role="group" aria-label="Sliding puzzle" data-done={done}>
        {tiles.map((id, pos) => {
          const blank = id === N * N - 1 && !done;
          const movable = !done && near(pos);
          return (
            <button
              key={pos}
              className="puzzle-tile"
              data-blank={blank}
              data-movable={movable}
              style={{ backgroundPosition: `${(id % N) * (100 / (N - 1))}% ${Math.floor(id / N) * (100 / (N - 1))}%` }}
              onClick={() => slide(pos)}
              disabled={blank}
              aria-label={blank ? 'Empty space' : `Piece ${id + 1}${movable ? ', can move' : ''}`}
            />
          );
        })}
      </div>
      <div className="row-between small" aria-live="polite">
        <span>
          Moves: <strong className="num">{moves}</strong>
        </span>
        {best !== null ? <span className="muted">Best: {best} moves</span> : null}
      </div>
      {done ? (
        <div className="card stack">
          <Callout tone="ok" title={`Puzzle complete in ${moves} moves`}>
            Lovely. Enjoy the break.
          </Callout>
          <div className="row">
            <button className="btn btn-primary" onClick={onEnd}>
              New puzzle
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
