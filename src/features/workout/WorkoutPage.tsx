import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useStore } from '../../state/store';
import { DAY_NAMES } from '../../domain/plan/engine';
import { getExercise } from '../../domain/exercises/library';
import { triageSymptom, type SymptomReport } from '../../domain/safety/screening';
import { ACHIEVEMENTS, earnedAchievements } from '../../domain/gamification/rules';
import { tokensForNewSession } from '../../domain/gamification/tokens';
import type { PlannedSession, SessionLog } from '../../domain/types';
import { Callout, EmptyState, PageHead, formatDuration } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { Scene } from '../../components/Illustrations';
import { EmergencyPanel } from '../safety/SafetyPanels';
import { SessionRunner, type RunnerResult } from './SessionRunner';
import { todayIndex } from '../../domain/dates';

type Stage = 'choose' | 'checkin' | 'mode' | 'run' | 'summary' | 'emergency' | 'rest';

const RPE_LABELS: Record<number, string> = {
  0: 'Rest',
  2: 'Very light',
  3: 'Light',
  5: 'Moderate — can talk, not sing',
  7: 'Vigorous — a few words at a time',
  9: 'Very hard',
  10: 'Maximal',
};

export function WorkoutPage() {
  const { data, planResult, logSession, pause, recordRestChoice, updateSettings } = useStore();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const plan = planResult?.ok ? planResult.plan : null;
  const sessions = useMemo(() => (plan ? plan.schedule.filter((s): s is PlannedSession => !!s) : []), [plan]);
  const initial = sessions.find((s) => s.id === params.get('session')) ?? (plan?.schedule[todayIndex()] || null);
  const [selected, setSelected] = useState<PlannedSession | null>(initial);
  const [stage, setStage] = useState<Stage>(initial ? 'checkin' : 'choose');
  const [mode, setMode] = useState<'camera' | 'manual'>('manual');
  const [fallbackReason, setFallbackReason] = useState<string | null>(null);
  const [result, setResult] = useState<RunnerResult | null>(null);
  const [rpe, setRpe] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [saved, setSaved] = useState<string[] | null>(null);
  const [earnedTokens, setEarnedTokens] = useState(0);
  const [restReason, setRestReason] = useState<'unwell' | 'pain'>('unwell');

  if (!plan) {
    return (
      <EmptyState icon="play" title="No workouts yet" action={<Link className="btn btn-primary" to="/">Go home</Link>}>
        A workout plan is needed first. If the app referred you to a professional, the minigames and quiz are still available.
      </EmptyState>
    );
  }

  if (stage === 'emergency') {
    return <EmergencyPanel onDismiss={() => navigate('/')} dismissLabel="Back to home" />;
  }

  if (stage === 'rest') {
    return (
      <div className="card stack" style={{ maxWidth: 640 }}>
        <Scene name="rest" className="scene-small" />
        <span className="eyebrow">Check-in</span>
        <h1>Rest today</h1>
        <p>
          {restReason === 'unwell'
            ? 'When you feel unwell, rest helps you recover. Exercise can wait — your progress will still be here.'
            : 'New or worsening pain is a signal to rest that area. If it does not settle, or keeps coming back, check with a doctor or physiotherapist.'}
        </p>
        <Callout tone="ok" title="Your streak is protected">
          Pausing your plan skips these days instead of counting them as missed.
        </Callout>
        <div className="row">
          <button
            className="btn btn-primary"
            onClick={() => {
              pause(restReason === 'unwell' ? 'unwell' : 'injury');
              recordRestChoice();
              navigate('/');
            }}
          >
            Pause my plan and rest
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => {
              recordRestChoice();
              navigate('/');
            }}
          >
            Just rest today
          </button>
        </div>
      </div>
    );
  }

  if (stage === 'choose' || !selected) {
    return (
      <div className="stack">
        <PageHead eyebrow="Workout" title="Choose a workout">
          Today is a {plan.schedule[todayIndex()] ? 'workout' : 'rest'} day in your plan. You can do any session from your week.
        </PageHead>
        <div className="grid-2">
          {sessions.map((s) => (
            <button
              key={s.id}
              className="card card-tight stack-sm"
              style={{ textAlign: 'left', cursor: 'pointer' }}
              onClick={() => {
                setSelected(s);
                setStage('checkin');
              }}
            >
              <span className="eyebrow">{DAY_NAMES[s.dayIndex]}</span>
              <strong>{s.focus}</strong>
              <span className="small muted">
                {s.items.filter((i) => i.block === 'main').length} exercises · about {formatDuration(s.estSeconds)}
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (stage === 'checkin') {
    const options: { id: string; title: string; hint: string; go: () => void }[] = [
      { id: 'good', title: 'I feel fine', hint: 'Ready to start', go: () => setStage('mode') },
      { id: 'tired', title: 'A bit tired', hint: 'Go gently; skip anything that feels like too much', go: () => setStage('mode') },
      { id: 'unwell', title: 'Unwell (cold, fever, sick)', hint: 'We’ll suggest resting', go: () => { setRestReason('unwell'); setStage('rest'); } },
      { id: 'pain', title: 'New or worse pain', hint: 'We’ll suggest resting', go: () => { setRestReason('pain'); setStage('rest'); } },
      { id: 'urgent', title: 'Chest pain, severe breathlessness, fainting or stroke signs', hint: 'Get urgent help', go: () => setStage('emergency') },
    ];
    return (
      <div className="stack" style={{ maxWidth: 680 }}>
        <PageHead eyebrow={`${DAY_NAMES[selected.dayIndex]} · about ${formatDuration(selected.estSeconds)}`} title="Quick check-in">
          How are you feeling right now?
        </PageHead>
        <div className="stack-sm">
          {options.map((o) => (
            <button key={o.id} className={`check ${o.id === 'urgent' ? 'callout-danger' : ''}`} style={{ textAlign: 'left' }} onClick={o.go}>
              <span>
                <strong>{o.title}</strong>
                <span className="hint">{o.hint}</span>
              </span>
            </button>
          ))}
        </div>
        <button className="btn btn-ghost" onClick={() => setStage('choose')}>
          Choose a different workout
        </button>
      </div>
    );
  }

  if (stage === 'mode') {
    const cameraCount = selected.items.filter((i) => getExercise(i.exerciseId)?.camera.supported).length;
    return (
      <div className="stack" style={{ maxWidth: 820 }}>
        <PageHead eyebrow="Tracking" title="How would you like to track reps?" />
        <div className="grid-2">
          <div className="card stack">
            <div className="row" style={{ gap: 8 }}>
              <Icon name="camera" />
              <h2>Camera counting</h2>
            </div>
            <p className="small">
              Counts reps, times your holds and tracks movement for {cameraCount} of {selected.items.length} exercises in this workout, in a full-screen view with a timer and a rep counter. Anything it can’t follow falls back to the buttons.
            </p>
            <ul className="bullets small">
              <li>We ask for camera permission only when you choose this.</li>
              <li>Video is processed in this browser and immediately discarded. Nothing is recorded or uploaded.</li>
              <li>The pose model (about 6 MB) loads from this app, not the internet.</li>
              <li>Counts are estimates. Angle, lighting, clothing and body differences affect accuracy; you can correct any count.</li>
            </ul>
            <button
              className="btn btn-primary"
              disabled={cameraCount === 0}
              onClick={() => {
                updateSettings({ cameraPrivacyAck: true });
                setMode('camera');
                setFallbackReason(null);
                setStage('run');
              }}
            >
              Use camera
            </button>
            {cameraCount === 0 ? <span className="tiny muted">None of today’s exercises support camera counting.</span> : null}
          </div>
          <div className="card stack">
            <div className="row" style={{ gap: 8 }}>
              <Icon name="hand" />
              <h2>Manual tracking</h2>
            </div>
            <p className="small">Use big buttons and timers. Works on every device, and no camera is involved.</p>
            <button
              className="btn btn-secondary"
              onClick={() => {
                setMode('manual');
                setStage('run');
              }}
            >
              Track manually
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (stage === 'run') {
    return (
      <div className="stack">
        {fallbackReason ? <Callout tone="warn" title="Switched to manual tracking">{fallbackReason}</Callout> : null}
        <SessionRunner
          key={mode}
          session={selected}
          mode={mode}
          voice={data.settings.voiceCues}
          onSwitchToManual={(reason) => {
            setFallbackReason(reason);
            setMode('manual');
          }}
          onFinish={(r) => {
            setResult(r);
            const urgent = r.symptom && triageSymptom(r.symptom).action === 'emergency';
            if (urgent) {
              // Save what was done, then show emergency guidance.
              logSession({ ...r.log, rpe: null, note: '' });
              setStage('emergency');
            } else setStage('summary');
          }}
        />
      </div>
    );
  }

  // ───── Summary ─────
  if (!result) return null;
  const log = result.log;
  const triage = result.symptom ? triageSymptom(result.symptom) : null;
  const totalReps = log.sets.filter((s) => s.kind === 'reps').reduce((a, s) => a + s.achieved, 0);
  const save = () => {
    const full: SessionLog = { ...log, rpe, note: note.trim().slice(0, 500) };
    const before = earnedAchievements({
      sessions: data.sessions,
      plannedDays: data.profile!.daysPerWeek,
      pauses: data.pauses,
      restChoices: data.restChoices,
      quizCompleted: data.games.quizCompleted,
      balanceCompletions: data.games.balanceCompletions,
      personalGoal: data.personalGoal,
      now: new Date(),
    });
    const after = earnedAchievements({
      sessions: [...data.sessions, full],
      plannedDays: data.profile!.daysPerWeek,
      pauses: data.pauses,
      restChoices: data.restChoices,
      quizCompleted: data.games.quizCompleted,
      balanceCompletions: data.games.balanceCompletions,
      personalGoal: data.personalGoal,
      now: new Date(),
    });
    setEarnedTokens(tokensForNewSession(data.sessions, full, data.profile!.daysPerWeek));
    logSession(full);
    setSaved([...after].filter((id) => !before.has(id)));
  };

  return (
    <div className="stack" style={{ maxWidth: 760 }}>
      <PageHead eyebrow="Summary" title={log.endedReason === 'completed' ? 'Workout complete' : 'Workout ended'} />
      {triage && triage.action !== 'stop' ? (
        <Callout tone="warn" title="Listen to your body">
          {triage.message}
          {log.endedReason === 'stopped_symptoms' ? (
            <div style={{ marginTop: 8 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => { pause('symptoms'); recordRestChoice(); }}>
                Pause my plan
              </button>
            </div>
          ) : null}
        </Callout>
      ) : null}
      <div className="card">
        <div className="stats">
          <div className="stat">
            <span className="eyebrow">Active time</span>
            <span className="value">{formatDuration(log.activeSeconds)}</span>
          </div>
          <div className="stat">
            <span className="eyebrow">Exercises</span>
            <span className="value">{log.completedExerciseIds.length}</span>
          </div>
          <div className="stat">
            <span className="eyebrow">Sets</span>
            <span className="value">{log.sets.length}</span>
          </div>
          <div className="stat">
            <span className="eyebrow">Reps</span>
            <span className="value">{totalReps}</span>
          </div>
        </div>
      </div>
      {saved === null ? (
        <div className="card stack">
          <div className="field">
            <label htmlFor="rpe">How hard did that feel overall? (optional)</label>
            <span className="hint">0 = resting, 10 = maximal effort. Most of your plan aims for about 3–6.</span>
            <input id="rpe" type="range" min={0} max={10} step={1} value={rpe ?? 5} onChange={(e) => setRpe(Number(e.target.value))} aria-valuetext={rpe === null ? 'not rated' : `${rpe} out of 10`} />
            <div className="row-between small">
              <span className="num">{rpe === null ? 'Not rated' : `${rpe} / 10${RPE_LABELS[rpe] ? ` · ${RPE_LABELS[rpe]}` : ''}`}</span>
              {rpe !== null ? (
                <button className="btn btn-ghost btn-sm" onClick={() => setRpe(null)}>
                  Clear
                </button>
              ) : null}
            </div>
          </div>
          <div className="field">
            <label htmlFor="note">Notes (optional, stays on this device)</label>
            <textarea id="note" className="input" rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div className="row">
            <button className="btn btn-primary" onClick={save}>
              Save workout
            </button>
            <button className="btn btn-ghost" onClick={() => navigate('/')}>
              Discard
            </button>
          </div>
        </div>
      ) : (
        <div className="card stack">
          <Callout tone="ok" title="Saved">
            Logged on this device. {log.endedReason !== 'completed' ? 'Ending early still counts as showing up.' : ''}
          </Callout>
          <div className="token-earned" role="status">
            <span className="coin" aria-hidden="true">
              <Icon name="coin" size={22} />
            </span>
            <span>
              {earnedTokens > 0 ? (
                <>
                  <strong>+{earnedTokens} tokens</strong> for the minigames.
                </>
              ) : (
                <>No extra tokens this time: you’ve already done every workout in your plan this week. Rest is part of the plan.</>
              )}
            </span>
            <Link to="/challenges" className="btn btn-secondary btn-sm">
              Play
            </Link>
          </div>
          {saved.length ? (
            <div className="stack-sm">
              <h3>New achievement{saved.length > 1 ? 's' : ''}</h3>
              {saved.map((id) => {
                const a = ACHIEVEMENTS.find((x) => x.id === id)!;
                return (
                  <div key={id} className="achv" data-earned="true">
                    <span className="medal">
                      <Icon name={a.icon} />
                    </span>
                    <span>
                      <strong>{a.title}</strong>
                      <span className="small muted" style={{ display: 'block' }}>
                        {a.description}
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
          ) : null}
          <div className="row">
            <Link className="btn btn-primary" to="/">
              Home
            </Link>
            <Link className="btn btn-secondary" to="/progress">
              See progress
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export type { SymptomReport };
