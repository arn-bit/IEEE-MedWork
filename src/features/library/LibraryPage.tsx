import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useStore } from '../../state/store';
import { EXERCISES } from '../../domain/exercises/library';
import { tryability } from '../../domain/plan/engine';
import type { Exercise, ExerciseCategory } from '../../domain/types';
import { Callout, EmptyState, PageHead } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { FigureDemo } from '../../components/demo/FigureDemo';

const CATS: { id: ExerciseCategory | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'warmup', label: 'Warm-up' },
  { id: 'strength', label: 'Strength' },
  { id: 'balance', label: 'Balance' },
  { id: 'aerobic', label: 'Cardio' },
  { id: 'flexibility', label: 'Stretch' },
];
const LEVEL = ['', 'Easy', 'Medium', 'Harder'];

/** Every exercise in the library, to try on its own or mix into a free-play session. */
export function LibraryPage() {
  const { data, planResult } = useStore();
  const navigate = useNavigate();
  const [cat, setCat] = useState<ExerciseCategory | 'all'>('all');
  const [q, setQ] = useState('');
  const [onlyMine, setOnlyMine] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const profile = data.profile!;
  const constraints = planResult?.ok ? planResult.plan.screening.constraints : null;

  const rows = useMemo(() => {
    if (!constraints) return [];
    const needle = q.trim().toLowerCase();
    return EXERCISES.map((ex) => ({ ex, t: tryability(ex, profile, constraints) }))
      .filter(({ ex }) => cat === 'all' || ex.category === cat)
      .filter(({ ex }) => !needle || ex.name.toLowerCase().includes(needle) || ex.purpose.toLowerCase().includes(needle))
      .filter(({ t }) => !onlyMine || t.level === 'ok');
  }, [cat, q, onlyMine, profile, constraints]);

  if (!constraints) {
    return (
      <EmptyState icon="play" title="Workouts need a plan first" action={<Link className="btn btn-primary" to="/">Go home</Link>}>
        The library is filtered by your safety answers, so it appears once your plan is ready.
      </EmptyState>
    );
  }

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= 12 ? p : [...p, id]));
  const go = (ids: string[]) => navigate(`/workout?try=${ids.join(',')}`);
  const counts = { total: EXERCISES.length, ok: EXERCISES.filter((e) => tryability(e, profile, constraints).level === 'ok').length };

  return (
    <div className="stack-lg fade-in">
      <PageHead photo="yoga" eyebrow="Workouts" title="Try any workout">
        Browse every exercise in the library. Try one on its own, or pick a few to make your own session. Camera counting works for all of them.
      </PageHead>

      <Callout tone="info" title="Free play is outside your plan">
        Your safety answers still apply: moves that conflict with them are shown but can’t be started. Free-play sessions don’t earn tokens. If you feel any discomfort, stop.
      </Callout>

      <div className="card stack-sm lib-filters">
        <div className="field" style={{ margin: 0 }}>
          <label htmlFor="lib-q">Search</label>
          <input id="lib-q" className="input" type="search" placeholder="Try “squat”, “balance”, “shoulder”…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="chip-group" role="group" aria-label="Category">
          {CATS.map((c) => (
            <label key={c.id} className="chip">
              <input type="radio" name="lib-cat" checked={cat === c.id} onChange={() => setCat(c.id)} />
              <span>{c.label}</span>
            </label>
          ))}
        </div>
        <label className="check">
          <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />
          <span>
            <strong className="small">Only show what suits me and my equipment</strong>
            <span className="hint">
              {counts.ok} of {counts.total} match your setup right now.
            </span>
          </span>
        </label>
      </div>

      {rows.length === 0 ? (
        <p className="muted">No exercises match. Try clearing the search or filters.</p>
      ) : (
        <ul className="lib-grid" aria-label="Exercises">
          {rows.map(({ ex, t }) => (
            <ExerciseCard key={ex.id} ex={ex} t={t} selected={picked.includes(ex.id)} onToggle={() => toggle(ex.id)} onTry={() => go([ex.id])} />
          ))}
        </ul>
      )}

      {picked.length > 0 ? (
        <div className="lib-bar" role="region" aria-label="Your free-play session">
          <span>
            <strong>{picked.length}</strong> exercise{picked.length === 1 ? '' : 's'} picked
          </span>
          <button className="btn btn-ghost btn-sm lib-bar-clear" onClick={() => setPicked([])}>
            Clear
          </button>
          <button className="btn btn-primary" onClick={() => go(picked)}>
            <Icon name="play" size={16} /> Start session
          </button>
        </div>
      ) : null}
    </div>
  );
}

function ExerciseCard({ ex, t, selected, onToggle, onTry }: { ex: Exercise; t: ReturnType<typeof tryability>; selected: boolean; onToggle: () => void; onTry: () => void }) {
  const blocked = t.level === 'blocked';
  return (
    <li className="lib-card" data-blocked={blocked} data-selected={selected}>
      <div className="lib-fig" aria-hidden="true">
        <FigureDemo exerciseId={ex.id} size="sm" />
      </div>
      <div className="lib-body">
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          <span className="badge">{CATS.find((c) => c.id === ex.category)?.label}</span>
          <span className="badge">{LEVEL[ex.difficulty]}</span>
          {ex.equipment.length > 0 ? <span className="badge">{ex.equipment.join(', ').replace(/_/g, ' ')}</span> : <span className="badge">No equipment</span>}
        </div>
        <h3 className="lib-name">{ex.name}</h3>
        <p className="small muted">{ex.purpose}</p>
        {t.level === 'blocked' ? (
          <p className="small lib-note lib-note-block">
            <Icon name="lock" size={14} /> Not available for you: {t.reason}
          </p>
        ) : t.level === 'warn' ? (
          <p className="small lib-note lib-note-warn">
            <Icon name="info" size={14} /> {t.reason}. You can still try it if that suits you.
          </p>
        ) : null}
        <details className="lib-how">
          <summary>How to do it</summary>
          <p className="small">{ex.startPosition}</p>
          <ol className="small">
            {ex.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          {ex.cautions.length ? <p className="tiny muted">Take care: {ex.cautions.join(' ')}</p> : null}
        </details>
        <div className="row lib-actions">
          <button className="btn btn-primary btn-sm" onClick={onTry} disabled={blocked}>
            <Icon name="play" size={14} /> Try now
          </button>
          <label className="lib-pick">
            <input type="checkbox" checked={selected} onChange={onToggle} disabled={blocked} />
            <span>Add to session</span>
          </label>
        </div>
      </div>
    </li>
  );
}
