import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useStore } from '../../../state/store';
import { Callout, PageHead } from '../../../components/ui';
import { Icon } from '../../../components/Icon';

type Lane = 0 | 1 | 2;
const LANE_X = ['18%', '50%', '82%'];
const LANE_KEY: Record<string, Lane> = { ArrowLeft: 0, a: 0, ArrowDown: 1, ' ': 1, s: 1, ArrowRight: 2, d: 2 };
const LANE_NAME = ['left', 'middle', 'right'];
const ROUND_MS = 30000;

export function ReactionGame() {
  const { data, updateGames } = useStore();
  const [pace, setPace] = useState<'relaxed' | 'normal'>('relaxed');
  const [running, setRunning] = useState(false);
  const [target, setTarget] = useState<{ lane: Lane; shownAt: number; y: number } | null>(null);
  const [hits, setHits] = useState(0);
  const [times, setTimes] = useState<number[]>([]);
  const [left, setLeft] = useState(ROUND_MS);
  const [finished, setFinished] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const endAt = useRef(0);
  const hitsRef = useRef(0);
  const ttl = pace === 'relaxed' ? 2600 : 1600;

  const spawnRef = useRef<() => void>(() => undefined);
  const spawn = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    const gap = 400 + Math.random() * 600;
    timer.current = setTimeout(() => {
      if (performance.now() > endAt.current) return;
      setTarget({ lane: Math.floor(Math.random() * 3) as Lane, shownAt: performance.now(), y: 30 + Math.random() * 40 });
      timer.current = setTimeout(() => {
        setTarget(null);
        spawnRef.current();
      }, ttl);
    }, gap);
  }, [ttl]);
  useEffect(() => {
    spawnRef.current = spawn;
  }, [spawn]);

  const stop = useCallback(
    (complete: boolean) => {
      if (timer.current) clearTimeout(timer.current);
      setRunning(false);
      setTarget(null);
      if (complete) {
        setFinished(true);
        const h = hitsRef.current;
        if (data.games.reactionBest === null || h > data.games.reactionBest) updateGames({ reactionBest: h });
      }
    },
    [data.games.reactionBest, updateGames],
  );

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      const l = Math.max(0, endAt.current - performance.now());
      setLeft(l);
      if (l <= 0) stop(true);
    }, 200);
    return () => clearInterval(id);
  }, [running, stop]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const hit = useCallback(
    (lane: Lane) => {
      if (!target || target.lane !== lane) return;
      hitsRef.current += 1;
      setHits(hitsRef.current);
      setTimes((t) => [...t, performance.now() - target.shownAt]);
      setTarget(null);
      spawn();
    },
    [spawn, target],
  );

  useEffect(() => {
    if (!running) return;
    const onKey = (e: KeyboardEvent) => {
      const lane = LANE_KEY[e.key];
      if (lane !== undefined) {
        e.preventDefault();
        hit(lane);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [running, hit]);

  const start = () => {
    hitsRef.current = 0;
    setHits(0);
    setTimes([]);
    setFinished(false);
    endAt.current = performance.now() + ROUND_MS;
    setLeft(ROUND_MS);
    setRunning(true);
    spawn();
  };
  const avg = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null;

  return (
    <div className="stack" style={{ maxWidth: 820 }}>
      <Link to="/challenges" className="small">
        ← Challenges
      </Link>
      <PageHead eyebrow="Minigame" title="Reaction Reach">
        Targets appear on the left, middle or right. Tap them, or use the keyboard: <span className="kbd">←</span> <span className="kbd">↓</span>/<span className="kbd">Space</span> <span className="kbd">→</span>. Rounds last 30 seconds.
      </PageHead>
      <Callout tone="info">
        Play seated or standing. Move only within a comfortable reach — this is about coordination, not speed at any cost. Misses don’t cost points.
      </Callout>

      {!running && (
        <div className="card stack-sm">
          <fieldset className="field">
            <legend>Pace</legend>
            <div className="chip-group">
              {(['relaxed', 'normal'] as const).map((p) => (
                <label key={p} className="chip">
                  <input type="radio" name="pace" checked={pace === p} onChange={() => setPace(p)} />
                  <span>{p === 'relaxed' ? 'Relaxed (targets stay 2.6 s)' : 'Normal (1.6 s)'}</span>
                </label>
              ))}
            </div>
          </fieldset>
          {finished ? (
            <Callout tone="ok" title={`${hits} target${hits === 1 ? '' : 's'} reached`}>
              {avg ? `Average reaction: ${avg} ms. ` : ''}Best so far: {Math.max(hits, data.games.reactionBest ?? 0)}.
            </Callout>
          ) : null}
          <div>
            <button className="btn btn-primary btn-lg" onClick={start}>
              <Icon name="play" size={18} /> {finished ? 'Play again' : 'Start round'}
            </button>
          </div>
        </div>
      )}

      {running && (
        <div className="stack-sm">
          <div className="row-between small">
            <span>
              Hits: <strong className="num">{hits}</strong>
            </span>
            <span className="num">{Math.ceil(left / 1000)}s left</span>
            <button className="btn btn-ghost btn-sm" onClick={() => stop(false)}>
              Stop
            </button>
          </div>
          <div className="game-stage" aria-label="Game area">
            <div className="visually-hidden" aria-live="assertive">
              {target ? `Target ${LANE_NAME[target.lane]}` : ''}
            </div>
            {target ? (
              <button className="target" style={{ left: LANE_X[target.lane], top: `${target.y}%` }} onClick={() => hit(target.lane)} aria-label={`Target on the ${LANE_NAME[target.lane]}`}>
                <Icon name="hand" size={30} />
              </button>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
