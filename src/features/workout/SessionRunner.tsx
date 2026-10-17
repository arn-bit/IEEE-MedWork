import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PlannedItem, PlannedSession, SessionLog, SetLog } from '../../domain/types';
import { getExercise } from '../../domain/exercises/library';
import type { SymptomReport } from '../../domain/safety/screening';
import { FigureDemo } from '../../components/demo/FigureDemo';
import { Bar, Modal, formatClock } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { useInterval } from '../../hooks/useInterval';
import { speak } from '../../hooks/speech';
import { CameraTracker, type TrackerUpdate } from './CameraTracker';
import { describePrescription } from '../plan/PlanPage';
import type { RangeMode } from '../../pose/counters';

type Phase = 'intro' | 'work' | 'rest';

export interface RunnerResult {
  log: Omit<SessionLog, 'rpe' | 'note'>;
  symptom: SymptomReport | null;
}

const SYMPTOMS: { id: SymptomReport; label: string; urgent?: boolean }[] = [
  { id: 'chest_pain', label: 'Chest pain, pressure or tightness', urgent: true },
  { id: 'severe_breathless', label: 'Severe shortness of breath', urgent: true },
  { id: 'stroke_signs', label: 'Face drooping, arm weakness, or trouble speaking', urgent: true },
  { id: 'faint_or_dizzy', label: 'Dizzy, light-headed, or faint' },
  { id: 'sharp_pain', label: 'Sharp or worsening pain' },
  { id: 'unusual_fatigue', label: 'Unusually tired or unwell' },
  { id: 'discomfort', label: 'Something just doesn’t feel right' },
  { id: 'just_stop', label: 'I just want to stop for today' },
];

export function SessionRunner({
  session,
  mode,
  voice,
  onFinish,
  onSwitchToManual,
}: {
  session: PlannedSession;
  mode: 'camera' | 'manual';
  voice: boolean;
  onFinish: (r: RunnerResult) => void;
  onSwitchToManual: (reason: string) => void;
}) {
  const items = session.items;
  const startedAt = useRef(new Date().toISOString());
  const [idx, setIdx] = useState(0);
  const [setNo, setSetNo] = useState(0);
  const [phase, setPhase] = useState<Phase>('intro');
  const [paused, setPaused] = useState(false);
  const [remaining, setRemaining] = useState(0); // seconds left for timed work or rest
  const [camCount, setCamCount] = useState(0);
  const [offset, setOffset] = useState(0);
  const [corrections, setCorrections] = useState(0);
  const [activeSeconds, setActiveSeconds] = useState(0);
  const [sets, setSets] = useState<SetLog[]>([]);
  const [completed, setCompleted] = useState<string[]>([]);
  const [stopOpen, setStopOpen] = useState(false);
  const [rangeMode, setRangeMode] = useState<RangeMode>('standard');
  const [cameraOn, setCameraOn] = useState(true);
  const [announce, setAnnounce] = useState('');
  const lastTick = useRef<number | null>(null);

  const item: PlannedItem | undefined = items[idx];
  const ex = item ? getExercise(item.exerciseId)! : null;
  const rx = item?.prescription;
  const isReps = rx?.kind === 'reps';
  const target = rx ? (rx.kind === 'reps' ? rx.amount * (rx.perSide ? 2 : 1) : rx.amount * (rx.perSide ? 2 : 1)) : 0;
  const count = Math.max(0, camCount + offset);
  const cameraCounter = mode === 'camera' && cameraOn && ex?.camera.supported ? ex.camera.counterId : null;
  const resetKey = `${idx}-${setNo}`;
  const totalItems = items.length;

  const say = useCallback(
    (t: string) => {
      setAnnounce(t);
      speak(t, voice);
    },
    [voice],
  );

  const finish = useCallback(
    (symptom: SymptomReport | null, completedIds: string[] = completed, setLogs: SetLog[] = sets) => {
      onFinish({
        symptom,
        log: {
          id: `log-${Date.now()}`,
          plannedSessionId: session.id,
          startedAt: startedAt.current,
          endedAt: new Date().toISOString(),
          activeSeconds: Math.round(activeSeconds),
          sets: setLogs,
          completedExerciseIds: [...new Set(completedIds)],
          endedReason: symptom === null ? 'completed' : symptom === 'just_stop' ? 'stopped_user' : 'stopped_symptoms',
        },
      });
    },
    [activeSeconds, completed, onFinish, session.id, sets],
  );


  const beginWork = () => {
    if (!rx) return;
    setPhase('work');
    setCamCount(0);
    setOffset(0);
    setCorrections(0);
    if (rx.kind !== 'reps') setRemaining(rx.amount * (rx.perSide ? 2 : 1));
    say(`${ex?.name}. Set ${setNo + 1} of ${rx.sets}.`);
  };

  const completeSet = useCallback((remainingAtEnd: number = remaining) => {
    if (!item || !rx || !ex) return;
    const achieved = rx.kind === 'reps' ? count : Math.round(rx.amount * (rx.perSide ? 2 : 1) - remainingAtEnd);
    const log: SetLog = {
      exerciseId: ex.id,
      setIndex: setNo,
      target,
      achieved,
      kind: rx.kind,
      trackedBy: cameraCounter ? 'camera' : 'manual',
      manualCorrections: corrections,
    };
    const nextSets = [...sets, log];
    setSets(nextSets);
    const lastSet = setNo + 1 >= rx.sets;
    const nextCompleted = lastSet ? [...completed, ex.id] : completed;
    if (lastSet) setCompleted(nextCompleted);
    if (!lastSet) {
      setSetNo((n) => n + 1);
      setPhase('rest');
      setRemaining(rx.restSeconds);
      say(`Set done. Rest ${rx.restSeconds} seconds.`);
      return;
    }
    if (idx + 1 >= totalItems) {
      say('Workout complete. Well done.');
      finish(null, nextCompleted, nextSets);
      return;
    }
    setIdx((i) => i + 1);
    setSetNo(0);
    setPhase('intro');
    say('Exercise done.');
  }, [cameraCounter, completed, corrections, count, ex, finish, idx, item, remaining, rx, say, setNo, sets, target, totalItems]);

  // Active-time + countdown ticker (timestamp based, pause-aware). Transitions happen here, not in effects.
  useInterval(
    () => {
      const now = performance.now();
      const dt = lastTick.current === null ? 0 : (now - lastTick.current) / 1000;
      lastTick.current = now;
      if (phase === 'work') setActiveSeconds((s) => s + dt);
      if (phase === 'rest' || (phase === 'work' && !isReps)) {
        const r = Math.max(0, remaining - dt);
        setRemaining(r);
        if (r <= 0) {
          if (phase === 'rest') beginWork();
          else completeSet(0);
        }
      }
    },
    paused || phase === 'intro' ? null : 250,
  );
  useEffect(() => {
    if (paused || phase === 'intro') lastTick.current = null;
  }, [paused, phase]);

  // Camera reached the target → finish the set after a short pause.
  const targetReached = !!cameraCounter && phase === 'work' && isReps && !paused && count >= target;
  const completeRef = useRef(completeSet);
  useEffect(() => {
    completeRef.current = completeSet;
  });
  useEffect(() => {
    if (!targetReached) return;
    const t = setTimeout(() => completeRef.current(), 1800);
    return () => clearTimeout(t);
  }, [targetReached]);

  const onTracker = useCallback(
    (u: TrackerUpdate) => {
      if (u.count > camCount) {
        const shown = u.count + offset;
        if (shown === target) say('Target reached.');
        else speak(String(shown), voice);
      }
      setCamCount(u.count);
    },
    [camCount, offset, say, target, voice],
  );

  const restartExercise = () => {
    setSets((s) => s.filter((l) => l.exerciseId !== ex?.id));
    setSetNo(0);
    setPhase('intro');
    setCamCount(0);
    setOffset(0);
  };
  const skipExercise = () => {
    if (idx + 1 >= totalItems) finish(null);
    else {
      setIdx((i) => i + 1);
      setSetNo(0);
      setPhase('intro');
    }
  };
  const adjust = (d: number) => {
    setOffset((o) => (camCount + o + d < 0 ? o : o + d));
    if (cameraCounter) setCorrections((c) => c + 1);
  };

  const overall = useMemo(() => (totalItems ? (idx + (phase === 'intro' ? 0 : 0.5)) / totalItems : 0), [idx, phase, totalItems]);

  if (!item || !ex || !rx) return null;
  const blockName = item.block === 'warmup' ? 'Warm-up' : item.block === 'cooldown' ? 'Cool-down' : 'Main';

  return (
    <div className="stack">
      <div className="stack-sm">
        <div className="row-between small">
          <span>
            <span className="badge badge-brand">{blockName}</span> Exercise {idx + 1} of {totalItems}
          </span>
          <span className="num muted">Active {formatClock(activeSeconds)}</span>
        </div>
        <Bar value={overall} max={1} label="Workout progress" />
      </div>
      <div className="visually-hidden" aria-live="assertive">
        {announce}
      </div>

      <div className={`runner ${mode === 'camera' ? 'with-camera' : ''}`}>
        {mode === 'camera' ? (
          <div className="stack-sm">
            {cameraOn ? (
              <CameraTracker
                enabled
                counterId={cameraCounter}
                counting={phase === 'work' && !paused && isReps}
                resetKey={resetKey}
                rangeMode={rangeMode}
                onUpdate={onTracker}
                onFallback={onSwitchToManual}
              />
            ) : (
              <div className="card card-soft stack-sm" style={{ alignItems: 'flex-start' }}>
                <strong className="row" style={{ gap: 8 }}>
                  <Icon name="camera" size={18} /> Camera is off
                </strong>
                <span className="small muted">The camera is fully stopped. Use the buttons to count. You can turn it back on at any time.</span>
              </div>
            )}
            <div>
              <button className="btn btn-secondary btn-sm" onClick={() => setCameraOn((c) => !c)} aria-pressed={!cameraOn}>
                <Icon name="camera" size={14} /> {cameraOn ? 'Turn camera off' : 'Turn camera on'}
              </button>
            </div>
            {cameraCounter ? (
              <label className="check" style={{ padding: '8px 12px' }}>
                <input type="checkbox" checked={rangeMode === 'reduced'} onChange={(e) => setRangeMode(e.target.checked ? 'reduced' : 'standard')} />
                <span>
                  <strong className="small">Reduced range of motion</strong>
                  <span className="hint">Counts smaller movements, if your comfortable range is smaller.</span>
                </span>
              </label>
            ) : null}
          </div>
        ) : null}

        <section className="card stack" aria-labelledby="ex-h">
          <div className="row-between">
            <div className="stack-sm" style={{ gap: 2 }}>
              <h2 id="ex-h">{ex.name}</h2>
              <span className="small muted">{describePrescription(rx)}</span>
            </div>
            <span className="badge">
              Set {Math.min(setNo + 1, rx.sets)} / {rx.sets}
            </span>
          </div>

          {phase === 'intro' && (
            <div className="stack fade-in">
              <div className="grid-2">
                <FigureDemo exerciseId={ex.id} />
                <div className="stack-sm">
                  <p className="small">{ex.startPosition}</p>
                  <ol className="steps small">
                    {ex.steps.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ol>
                  <ul className="bullets tiny muted">
                    {ex.cautions.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                  <p className="tiny muted">Effort: {rx.intensity}</p>
                </div>
              </div>
              <div className="row">
                <button className="btn btn-primary btn-lg" onClick={beginWork}>
                  <Icon name="play" size={18} /> Start {rx.kind === 'reps' ? 'set' : 'timer'}
                </button>
                <button className="btn btn-ghost" onClick={skipExercise}>
                  <Icon name="skip" size={16} /> Skip exercise
                </button>
              </div>
            </div>
          )}

          {phase === 'work' && isReps && (
            <div className="stack" style={{ alignItems: 'center', textAlign: 'center' }}>
              <div className="big-count" aria-live="polite" aria-label={`${count} of ${target} reps`}>
                {count}
                <span style={{ fontSize: '0.35em', color: 'var(--ink-3)' }}> / {target}</span>
              </div>
              <span className="small muted">{cameraCounter ? 'Counting with the camera. Use − / + to correct.' : 'Tap + after each rep, or just tap Done when the set is finished.'}</span>
              <div className="row" style={{ justifyContent: 'center' }}>
                <button className="btn btn-secondary btn-icon btn-lg" onClick={() => adjust(-1)} aria-label="Remove one rep">
                  <Icon name="minus" />
                </button>
                <button className="btn btn-secondary btn-icon btn-lg" onClick={() => adjust(1)} aria-label="Add one rep" style={{ width: 72 }}>
                  <Icon name="plus" />
                </button>
              </div>
              <button className="btn btn-primary btn-lg" onClick={() => completeSet()}>
                <Icon name="check" size={18} /> Done with this set
              </button>
            </div>
          )}

          {phase === 'work' && !isReps && (
            <div className="stack" style={{ alignItems: 'center', textAlign: 'center' }}>
              <div className="big-count" aria-live="off">
                {formatClock(remaining)}
              </div>
              <span className="small muted">{rx.kind === 'hold' ? (rx.perSide ? 'Hold — switch sides halfway' : 'Hold gently') : 'Keep a steady, comfortable pace'}</span>
              <button className="btn btn-secondary" onClick={() => completeSet()}>
                Finish early
              </button>
            </div>
          )}

          {phase === 'rest' && (
            <div className="stack" style={{ alignItems: 'center', textAlign: 'center' }}>
              <span className="eyebrow">Rest</span>
              <div className="big-count">{formatClock(remaining)}</div>
              <span className="small muted">Next: set {setNo + 1} of {rx.sets}. Breathe easy.</span>
              <div className="row" style={{ justifyContent: 'center' }}>
                <button className="btn btn-secondary" onClick={() => setRemaining((r) => r + 15)}>
                  +15 s
                </button>
                <button className="btn btn-primary" onClick={beginWork}>
                  Skip rest
                </button>
              </div>
            </div>
          )}

          {phase !== 'intro' && (
            <div className="row" style={{ justifyContent: 'center', borderTop: '1px solid var(--line)', paddingTop: 12 }}>
              <button className="btn btn-secondary" onClick={() => setPaused((p) => !p)} aria-pressed={paused}>
                <Icon name={paused ? 'play' : 'pause'} size={16} /> {paused ? 'Resume' : 'Pause'}
              </button>
              <button className="btn btn-ghost" onClick={restartExercise}>
                <Icon name="restart" size={16} /> Restart exercise
              </button>
              <button className="btn btn-ghost" onClick={skipExercise}>
                <Icon name="skip" size={16} /> Skip
              </button>
            </div>
          )}
          {paused ? <p className="small muted" style={{ textAlign: 'center' }}>Paused. Timers and camera counting are stopped.</p> : null}
        </section>
      </div>

      <div className="row-between">
        <button className="btn btn-ghost" onClick={() => finish('just_stop')}>
          End workout and save
        </button>
      </div>

      <div className="sticky-stop">
        <button className="btn btn-stop btn-lg" onClick={() => { setPaused(true); setStopOpen(true); }}>
          <Icon name="stop" size={18} /> Stop: I don’t feel right
        </button>
      </div>

      <Modal open={stopOpen} onClose={() => { setStopOpen(false); }} title="What’s happening?">
        <p className="small muted">Your workout is paused. Choose what fits best. Your progress so far is kept, and your streak is protected.</p>
        <div className="stack-sm">
          {SYMPTOMS.map((s) => (
            <button
              key={s.id}
              className={`btn ${s.urgent ? 'btn-stop' : 'btn-secondary'}`}
              style={{ justifyContent: 'flex-start', whiteSpace: 'normal', textAlign: 'left' }}
              onClick={() => {
                setStopOpen(false);
                finish(s.id);
              }}
            >
              {s.urgent ? <Icon name="alert" size={16} /> : null}
              {s.label}
            </button>
          ))}
          <button className="btn btn-ghost" onClick={() => { setStopOpen(false); setPaused(false); }}>
            I’m OK — resume
          </button>
        </div>
      </Modal>
    </div>
  );
}
