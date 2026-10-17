import { useState } from 'react';
import { useStore } from '../../state/store';
import { moderateEquivalentMinutes, weeklyAerobicTarget, type ActivityEntry } from '../../domain/plan/progression';
import { startOfWeek } from '../../domain/gamification/rules';
import { getEvidence } from '../../domain/evidence/registry';
import { Bar } from '../../components/ui';
import { Icon } from '../../components/Icon';

const KINDS = ['Walk', 'Cycle', 'Swim', 'Dance', 'Sport', 'Gardening', 'Other'];

/** Weekly moderate-equivalent minutes against the WHO/CDC target, plus a quick log for other activity. */
export function ActivityLog() {
  const { data, addActivity, removeActivity } = useStore();
  const p = data.profile!;
  const [kind, setKind] = useState('Walk');
  const [minutes, setMinutes] = useState(20);
  const [intensity, setIntensity] = useState<ActivityEntry['intensity']>('moderate');
  const [error, setError] = useState<string | null>(null);
  const from = startOfWeek(new Date());
  const to = new Date(from.getTime() + 7 * 86400000);
  const { counted, light } = moderateEquivalentMinutes(data.activities, data.sessions, from, to);
  const target = weeklyAerobicTarget(p.ageYears);
  const src = getEvidence(target.evidenceIds[0]!)!;
  const thisWeek = data.activities.filter((a) => new Date(a.date) >= from).sort((a, b) => b.date.localeCompare(a.date));

  const add = () => {
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 300) {
      setError('Enter between 1 and 300 minutes.');
      return;
    }
    setError(null);
    addActivity({ id: `a-${Date.now()}`, date: new Date().toISOString(), minutes, intensity, kind });
  };

  return (
    <section className="card stack" aria-labelledby="act-h">
      <div className="row-between">
        <h2 id="act-h">Activity minutes this week</h2>
        <span className="small muted num">
          {counted} / {target.minutes} min
        </span>
      </div>
      <Bar value={counted} max={target.minutes} label="Moderate-equivalent minutes this week" />
      <p className="small muted">
        Guidelines suggest {target.label} (
        <a href={src.url} target="_blank" rel="noopener noreferrer">
          {src.organization}
        </a>
        ). Every minute counts — some activity is better than none. Vigorous minutes count double; light activity ({light} min this week) is great too but isn’t counted toward this target.
      </p>
      <div className="grid-3" style={{ alignItems: 'end' }}>
        <div className="field">
          <label htmlFor="act-kind">Activity</label>
          <select id="act-kind" className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
            {KINDS.map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="act-min">Minutes</label>
          <input id="act-min" className="input" type="number" min={1} max={300} value={Number.isFinite(minutes) ? minutes : ''} onChange={(e) => setMinutes(Number(e.target.value))} aria-invalid={!!error} />
        </div>
        <div className="field">
          <label htmlFor="act-int">Effort</label>
          <select id="act-int" className="input" value={intensity} onChange={(e) => setIntensity(e.target.value as ActivityEntry['intensity'])}>
            <option value="light">Light — easy, could sing</option>
            <option value="moderate">Moderate — can talk, not sing</option>
            <option value="vigorous">Vigorous — only a few words</option>
          </select>
        </div>
      </div>
      {error ? (
        <span className="small" style={{ color: 'var(--danger)' }} role="alert">
          {error}
        </span>
      ) : null}
      <div>
        <button className="btn btn-secondary" onClick={add}>
          <Icon name="plus" size={16} /> Log activity
        </button>
      </div>
      {thisWeek.length ? (
        <ul className="list small">
          {thisWeek.map((a) => (
            <li key={a.id} className="row-between">
              <span>
                {new Date(a.date).toLocaleDateString(undefined, { weekday: 'short' })} · {a.kind} · {a.minutes} min · {a.intensity}
              </span>
              <button className="btn btn-ghost btn-sm" onClick={() => removeActivity(a.id)} aria-label={`Remove ${a.kind} ${a.minutes} minutes`}>
                <Icon name="x" size={14} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
