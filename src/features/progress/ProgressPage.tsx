import { Link } from 'react-router';
import { useStore } from '../../state/store';
import { consistencyStreak, countsAsSession, weekSummaries } from '../../domain/gamification/rules';
import { getExercise } from '../../domain/exercises/library';
import { EmptyState, PageHead, formatDuration } from '../../components/ui';
import { ActivityLog } from './ActivityLog';

export function ProgressPage() {
  const { data } = useStore();
  const profile = data.profile!;
  const now = new Date();
  const sessions = [...data.sessions].sort((a, b) => b.startedAt.localeCompare(a.startedAt));

  if (sessions.length === 0) {
    return (
      <div className="stack">
        <PageHead eyebrow="Progress" title="Your progress" />
        <EmptyState icon="chart" title="No workouts logged yet" action={<Link className="btn btn-primary" to="/workout">Start your first workout</Link>}>
          After each workout you’ll see consistency by week, time spent moving, and exercise history here.
        </EmptyState>
        <ActivityLog />
      </div>
    );
  }

  const weeks = weekSummaries(data.sessions, profile.daysPerWeek, data.pauses, now, 12);
  const maxBar = Math.max(profile.daysPerWeek, ...weeks.map((w) => w.sessions), 1);
  const target = weeks[0]!.target;
  const streak = consistencyStreak(data.sessions, profile.daysPerWeek, data.pauses, now);
  const real = data.sessions.filter(countsAsSession);
  const totalActive = real.reduce((a, s) => a + s.activeSeconds, 0);
  const thisWeek = weeks[weeks.length - 1]!;
  const rpes = real.filter((s) => s.rpe !== null).slice(-5);

  const byExercise = new Map<string, { sets: number; reps: number; last: string }>();
  for (const s of data.sessions) {
    for (const l of s.sets) {
      const e = byExercise.get(l.exerciseId) ?? { sets: 0, reps: 0, last: s.startedAt };
      e.sets++;
      if (l.kind === 'reps') e.reps += l.achieved;
      if (s.startedAt > e.last) e.last = s.startedAt;
      byExercise.set(l.exerciseId, e);
    }
  }

  return (
    <div className="stack-lg fade-in">
      <PageHead photo="walk" eyebrow="Progress" title="Your progress">
        This shows workouts you logged — consistency, not health outcomes. It can’t tell you whether a condition has improved.
      </PageHead>

      <div className="card">
        <div className="stats">
          <div className="stat">
            <span className="eyebrow">Workouts</span>
            <span className="value">{real.length}</span>
          </div>
          <div className="stat">
            <span className="eyebrow">Active time</span>
            <span className="value">{formatDuration(totalActive)}</span>
          </div>
          <div className="stat">
            <span className="eyebrow">This week</span>
            <span className="value">
              {thisWeek.sessions}/{thisWeek.target}
            </span>
          </div>
          <div className="stat">
            <span className="eyebrow">Consistent weeks</span>
            <span className="value">{streak}</span>
          </div>
        </div>
      </div>

      <section className="card stack" aria-labelledby="cons-h">
        <div className="row-between">
          <h2 id="cons-h">Weekly consistency</h2>
          <span className="small muted">Dashed line = your target ({target}/week)</span>
        </div>
        <div className="week-bars" role="img" aria-label={`Workouts per week for the last 12 weeks: ${weeks.map((w) => w.sessions).join(', ')}. Target ${target}.`}>
          <div className="target-line" style={{ bottom: `${(target / maxBar) * 100 * 0.82 + 12}%` }} />
          {weeks.map((w) => (
            <div className="col" key={w.key}>
              <div className="barv" data-met={w.met} data-paused={w.paused && !w.met} style={{ height: `${Math.max(3, (w.sessions / maxBar) * 82)}%` }} title={`${w.key}: ${w.sessions} workouts${w.paused ? ' (paused)' : ''}`} />
              <span className="tiny muted">{w.start.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' })}</span>
            </div>
          ))}
        </div>
        <div className="row small muted" style={{ gap: 16 }}>
          <span className="row" style={{ gap: 6 }}>
            <span className="dot" /> Target met
          </span>
          <span className="row" style={{ gap: 6 }}>
            <span className="dot" style={{ background: 'var(--brand-soft)' }} /> Below target
          </span>
          <span className="row" style={{ gap: 6 }}>
            <span className="dot dot-rest" /> Paused (doesn’t count against you)
          </span>
        </div>
      </section>

      <ActivityLog />

      <div className="grid-2">
        <section className="card stack-sm" aria-labelledby="eff-h">
          <h2 id="eff-h">Recent effort ratings</h2>
          {rpes.length === 0 ? (
            <p className="small muted">Rate how hard a workout felt on the summary screen to see it here.</p>
          ) : (
            <ul className="list">
              {rpes.map((s) => (
                <li key={s.id} className="row-between small">
                  <span>{new Date(s.startedAt).toLocaleDateString()}</span>
                  <span className="num">{s.rpe} / 10</span>
                </li>
              ))}
            </ul>
          )}
          <p className="tiny muted">Self-rated effort (0–10, CDC relative-intensity scale). Feeling easier over time can reflect fitness, rest or mood — it isn’t a medical measure.</p>
        </section>
        <section className="card stack-sm" aria-labelledby="exh-h">
          <h2 id="exh-h">Exercise history</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Exercise</th>
                <th>Sets</th>
                <th>Reps</th>
              </tr>
            </thead>
            <tbody>
              {[...byExercise.entries()]
                .sort((a, b) => b[1].last.localeCompare(a[1].last))
                .slice(0, 10)
                .map(([id, e]) => (
                  <tr key={id}>
                    <td>{getExercise(id)?.name ?? id}</td>
                    <td className="num">{e.sets}</td>
                    <td className="num">{e.reps || '–'}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </section>
      </div>

      <section className="card stack-sm" aria-labelledby="hist-h">
        <h2 id="hist-h">Workout history</h2>
        <ul className="list">
          {sessions.slice(0, 30).map((s) => (
            <li key={s.id} className="row-between">
              <div className="stack-sm" style={{ gap: 2 }}>
                <strong className="small">{new Date(s.startedAt).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</strong>
                <span className="tiny muted">
                  {s.completedExerciseIds.length} exercises · {s.sets.length} sets · {formatDuration(s.activeSeconds)}
                  {s.note ? ` · “${s.note.slice(0, 60)}”` : ''}
                </span>
              </div>
              <span className={`badge ${s.endedReason === 'completed' ? 'badge-ok' : s.endedReason === 'stopped_symptoms' ? 'badge-warn' : ''}`}>
                {s.endedReason === 'completed' ? 'Completed' : s.endedReason === 'stopped_symptoms' ? 'Stopped early (felt unwell)' : 'Ended early'}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
