import { Link } from 'react-router';
import { useStore } from '../../state/store';
import { getExercise } from '../../domain/exercises/library';
import { DAY_NAMES } from '../../domain/plan/engine';
import { countsAsSession, weekSummaries } from '../../domain/gamification/rules';
import { Callout } from '../../components/ui';
import { Icon } from '../../components/Icon';

/**
 * A printable summary the user can bring to a clinician (print or "Save as PDF" in the browser).
 * Generated entirely on this device; nothing is sent anywhere.
 */
export function SummaryPage() {
  const { data, planResult } = useStore();
  const p = data.profile!;
  const h = p.health;
  const now = new Date();
  const plan = planResult?.ok ? planResult.plan : null;
  const screening = planResult && !planResult.ok && planResult.reason !== 'invalid_input' ? planResult.screening : plan?.screening;
  const recent = [...data.sessions].filter((s) => now.getTime() - new Date(s.startedAt).getTime() < 56 * 86400000).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const stops = recent.filter((s) => s.endedReason === 'stopped_symptoms');
  const rpes = recent.filter((s) => s.rpe !== null).map((s) => s.rpe!);
  const weeks = weekSummaries(data.sessions, p.daysPerWeek, data.pauses, now, 8);

  const yes = (b: boolean) => (b ? 'Yes' : 'No');
  const rows: [string, string][] = p.healthMinimized
    ? [['Health answers', 'Not stored (user chose to keep fewer health details). Plan restrictions are listed below.']]
    : [
        ['Symptoms with activity (chest discomfort, breathlessness, dizziness, palpitations)', yes(h.exertionalSymptoms)],
        ['Known heart, metabolic or kidney condition', yes(h.knownCardioMetabolicRenal)],
        ['Surgery / hospital stay in last 3 months', yes(h.recentSurgery)],
        ['Severe, new or worsening pain', yes(h.severeOrWorseningPain)],
        ['In a rehab program', yes(h.inRehabProgram)],
        ['Fall in last year or balance concern', yes(h.balanceConcernOrFall)],
        ['Pregnancy', h.pregnancy === 'no' ? 'No / not applicable' : h.pregnancy === 'prefer_not' ? 'Prefer not to say' : `${h.pregnancy}${h.pregnancyComplications ? ' (complications reported)' : ''}`],
        ['Areas with known mild pain or past injury', h.painAreas.length ? h.painAreas.join(', ').replace(/_/g, ' ') : 'None'],
        ['Clinician restrictions entered', [...h.clinicianRestrictions, ...h.clinicianRestrictedAreas.map((a) => `avoid loading ${a}`)].join(', ').replace(/_/g, ' ') || 'None'],
        ['Clearance confirmed by user', yes(h.clinicianClearedAfterReferral)],
      ];

  return (
    <div className="stack print-page" style={{ maxWidth: 860 }}>
      <div className="row-between no-print">
        <Link to="/profile" className="small">
          ← Profile
        </Link>
        <button className="btn btn-primary" onClick={() => window.print()}>
          <Icon name="download" size={16} /> Print or save as PDF
        </button>
      </div>
      <Callout tone="info" title="Made on this device" icon="lock">
        This summary is generated locally and is not sent anywhere. Printing or saving it is your choice. It contains health information, so share it only with people you trust.
      </Callout>

      <header className="stack-sm">
        <span className="eyebrow">Verimove · exercise summary</span>
        <h1>Summary for a health professional</h1>
        <p className="small muted">
          Generated {now.toLocaleString()}. Self-reported information from a general fitness app; not a clinical record. Verimove does not diagnose or treat.
        </p>
      </header>

      <section className="card stack-sm">
        <h2>Profile</h2>
        <table className="table">
          <tbody>
            <tr>
              <th scope="row">Age</th>
              <td>{p.ageYears}</td>
            </tr>
            <tr>
              <th scope="row">Goals</th>
              <td>{p.goals.join(', ').replace(/_/g, ' ')}</td>
            </tr>
            <tr>
              <th scope="row">Current activity / experience</th>
              <td>
                {p.activityLevel} / {p.experience}
              </td>
            </tr>
            <tr>
              <th scope="row">Planned schedule</th>
              <td>
                {p.daysPerWeek} days × {p.minutesPerSession} min
              </td>
            </tr>
            <tr>
              <th scope="row">Accessibility</th>
              <td>
                {[p.accessibility.seatedOnly && 'seated only', p.accessibility.needsSupport && 'prefers support', p.accessibility.limitedGrip && 'limited grip'].filter(Boolean).join(', ') || 'None noted'}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="card stack-sm">
        <h2>Health screening answers</h2>
        <table className="table">
          <tbody>
            {rows.map(([k, v]) => (
              <tr key={k}>
                <th scope="row" style={{ textTransform: 'none', letterSpacing: 0, fontSize: '0.88rem', color: 'var(--ink-2)' }}>
                  {k}
                </th>
                <td>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {screening ? (
        <section className="card stack-sm">
          <h2>App safety rules applied</h2>
          <p className="small">
            Outcome: <strong>{screening.outcome.replace(/_/g, ' ')}</strong>
          </p>
          <ul className="bullets small">
            {screening.hits.map((x) => (
              <li key={x.ruleId + x.title}>
                {x.ruleId}: {x.title}. {x.message}
              </li>
            ))}
            {screening.hits.length === 0 ? <li>None triggered.</li> : null}
          </ul>
        </section>
      ) : null}

      {plan ? (
        <section className="card stack-sm">
          <h2>Current weekly plan</h2>
          <ul className="list small">
            {plan.schedule.map((s, i) =>
              s ? (
                <li key={i}>
                  <strong>{DAY_NAMES[i]}</strong> ({Math.round(s.estSeconds / 60)} min):{' '}
                  {s.items
                    .filter((it) => it.block === 'main')
                    .map((it) => `${getExercise(it.exerciseId)?.name} ${it.prescription.sets}×${it.prescription.amount}${it.prescription.kind === 'reps' ? '' : 's'}`)
                    .join('; ')}
                </li>
              ) : null,
            )}
          </ul>
        </section>
      ) : null}

      <section className="card stack-sm">
        <h2>Last 8 weeks</h2>
        <p className="small">
          Workouts logged: {recent.filter(countsAsSession).length} · Weeks meeting target: {weeks.filter((w) => w.met).length} of 8 · Average self-rated effort:{' '}
          {rpes.length ? `${(rpes.reduce((a, b) => a + b, 0) / rpes.length).toFixed(1)} / 10 (${rpes.length} ratings)` : 'not rated'}
        </p>
        <p className="small">
          Sessions stopped because the user felt unwell: <strong>{stops.length}</strong>
          {stops.length ? ` (${stops.map((s) => new Date(s.startedAt).toLocaleDateString()).join(', ')})` : ''}
        </p>
        <p className="tiny muted">Rep counts may come from camera estimates or manual entry and are not clinical measurements.</p>
      </section>
    </div>
  );
}
