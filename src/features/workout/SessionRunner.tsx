import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PlannedItem, PlannedSession, SessionLog, SetLog } from '../../domain/types';
import { getExercise } from '../../domain/exercises/library';
import type { SymptomReport } from '../../domain/safety/screening';
import { FigureDemo } from '../../components/demo/FigureDemo';
import { Bar, Modal, formatClock } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { useInterval } from '../../hooks/useInterval';
import { speak } from '../../hooks/speech';
import { playTone, primeAudio, vibrate } from '../../hooks/feedback';
import { useStore } from '../../state/store';
import { CameraTracker, type TrackerStatus, type TrackerUpdate } from './CameraTracker';
import { describePrescription } from '../plan/PlanPage';
import { detectorInfo } from '../../pose/detectors';
import type { CounterSnapshot, RangeMode } from '../../pose/counters';

type Phase = 'intro' | 'work' | 'rest';

/** Wall-clock source for the workout ticker (kept outside the component so render stays pure). */
const nowMs = () => performance.now();

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

type CountState = 'ready' | 'counting' | 'searching' | 'adjust' | 'paused' | 'resting' | 'holding' | 'not_holding' | 'moving' | 'not_moving';

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
  const { data } = useStore();
  const sound = data.settings.repSound;
  const haptics = data.settings.repHaptics;
  const items = session.items;
  const startedAt = useRef(new Date().toISOString());
  const [idx, setIdx] = useState(0);
  const [setNo, setSetNo] = useState(0);
  const [phase, setPhase] = useState<Phase>('intro');
  const [paused, setPaused] = useState(false);
  const [remaining, setRemaining] = useState(0); // seconds left for timed work or rest
  const [setSeconds, setSetSeconds] = useState(0); // seconds elapsed in the current set
  const [camCount, setCamCount] = useState(0);
  const [offset, setOffset] = useState(0);
  const [corrections, setCorrections] = useState(0);
  const [activeSeconds, setActiveSeconds] = useState(0);
  const [sets, setSets] = useState<SetLog[]>([]);
  const [completed, setCompleted] = useState<string[]>([]);
  const [stopOpen, setStopOpen] = useState(false);
  const [rangeMode, setRangeMode] = useState<RangeMode>('standard');
  const [cameraOn, setCameraOn] = useState(true);
  const [fullscreen, setFullscreen] = useState(true);
  const [gateOn, setGateOn] = useState(true);
  const [announce, setAnnounce] = useState('');
  const [snap, setSnap] = useState<CounterSnapshot | null>(null);
  const [trackerStatus, setTrackerStatus] = useState<TrackerStatus>('idle');
  const [popKey, setPopKey] = useState(0);
  const lastTick = useRef<number | null>(null);
  const holdingRef = useRef(false);

  const item: PlannedItem | undefined = items[idx];
  const ex = item ? getExercise(item.exerciseId)! : null;
  const rx = item?.prescription;
  const isReps = rx?.kind === 'reps';
  const target = rx ? rx.amount * (rx.perSide ? 2 : 1) : 0;
  const count = Math.max(0, camCount + offset);
  const detectorId = mode === 'camera' && cameraOn && ex?.camera.supported ? ex.camera.counterId : null;
  const dKind = detectorId ? detectorInfo(detectorId).kind : null;
  const repCamera = !!detectorId && isReps && dKind === 'rep';
  const timeCamera = !!detectorId && !isReps && (dKind === 'hold' || dKind === 'activity');
  const tracked = repCamera || timeCamera;
  const resetKey = `${idx}-${setNo}`;
  const totalItems = items.length;
  const cameraVisible = mode === 'camera' && cameraOn;
  const fullView = cameraVisible && fullscreen;

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
    primeAudio(); // lets the browser play the rep tone later (needs a user gesture)
    setPhase('work');
    setCamCount(0);
    setOffset(0);
    setCorrections(0);
    setSetSeconds(0);
    holdingRef.current = false;
    if (rx.kind !== 'reps') setRemaining(rx.amount * (rx.perSide ? 2 : 1));
    say(`${ex?.name}. Set ${setNo + 1} of ${rx.sets}.`);
  };

  const completeSet = (remainingAtEnd: number = remaining) => {
      if (!item || !rx || !ex) return;
      const achieved = rx.kind === 'reps' ? count : Math.round(rx.amount * (rx.perSide ? 2 : 1) - remainingAtEnd);
      const log: SetLog = {
        exerciseId: ex.id,
        setIndex: setNo,
        target,
        achieved,
        kind: rx.kind,
        trackedBy: tracked ? 'camera' : 'manual',
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
  };

  // Active-time + countdown ticker (timestamp based, pause-aware). Transitions happen here, not in effects.
  // For hold/movement exercises with the camera on, the countdown only runs while you're in position / moving.
  const tick = () => {
      const now = nowMs();
      const dt = lastTick.current === null ? 0 : (now - lastTick.current) / 1000;
      lastTick.current = now;
      if (phase === 'work') {
        setActiveSeconds((s) => s + dt);
        setSetSeconds((s) => s + dt);
      }
      if (phase === 'rest' || (phase === 'work' && !isReps)) {
        const credit = phase === 'rest' || !timeCamera || !gateOn || holdingRef.current ? dt : 0;
        const r = Math.max(0, remaining - credit);
        setRemaining(r);
        if (r <= 0) {
          if (phase === 'rest') beginWork();
          else completeSet(0);
        }
      }
  };
  const tickRef = useRef(tick);
  useEffect(() => {
    tickRef.current = tick;
  });
  useInterval(() => tickRef.current(), paused || phase === 'intro' ? null : 250);
  useEffect(() => {
    if (paused || phase === 'intro') lastTick.current = null;
  }, [paused, phase]);

  // Camera reached the target → finish the set after a short pause.
  const targetReached = repCamera && phase === 'work' && !paused && count >= target;
  const completeRef = useRef(completeSet);
  useEffect(() => {
    completeRef.current = completeSet;
  });
  useEffect(() => {
    if (!targetReached) return;
    playTone('target', sound);
    vibrate([40, 50, 90], haptics);
    const t = setTimeout(() => completeRef.current(), 1800);
    return () => clearTimeout(t);
  }, [targetReached, sound, haptics]);

  const onTracker = useCallback(
    (u: TrackerUpdate) => {
      setSnap(u.snapshot);
      holdingRef.current = u.counting && u.snapshot.holding;
      if (u.counting && repCamera && u.snapshot.count > camCount) {
        const shown = u.snapshot.count + offset;
        setPopKey((k) => k + 1);
        if (shown < target) {
          playTone('rep', sound);
          vibrate(25, haptics);
          speak(String(shown), voice);
        } else say('Target reached.');
        setCamCount(u.snapshot.count);
      }
    },
    [camCount, haptics, offset, repCamera, say, sound, target, voice],
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
    if (tracked) setCorrections((c) => c + 1);
  };
  const openStop = () => {
    setPaused(true);
    setStopOpen(true);
  };
  const toggleBrowserFullscreen = () => {
    try {
      if (document.fullscreenElement) void document.exitFullscreen();
      else void document.documentElement.requestFullscreen?.();
    } catch {
      /* not available */
    }
  };
  useEffect(
    () => () => {
      try {
        if (document.fullscreenElement) void document.exitFullscreen();
      } catch {
        /* ignore */
      }
    },
    [],
  );

  const overall = useMemo(() => (totalItems ? (idx + (phase === 'intro' ? 0 : 0.5)) / totalItems : 0), [idx, phase, totalItems]);

  // ───── What is the app doing right now? (the "am I being counted?" answer) ─────
  const info = detectorId ? detectorInfo(detectorId) : null;
  const holdingNow = !!snap && snap.holding && phase === 'work' && !paused;
  let state: CountState;
  let stateText: string;
  if (phase === 'intro') {
    state = 'ready';
    stateText = tracked ? 'Press Start. Counting begins when you do.' : 'Press Start when you’re ready.';
  } else if (paused) {
    state = 'paused';
    stateText = 'Paused. Not counting.';
  } else if (phase === 'rest') {
    state = 'resting';
    stateText = 'Resting. Counting is off.';
  } else if (!tracked) {
    state = 'ready';
    stateText = cameraVisible ? 'Camera can’t count this one. Use the buttons.' : isReps ? 'Tap + after each rep.' : 'Timer running.';
  } else if (!snap || snap.tracking === 'no_person' || snap.tracking === 'lost') {
    state = 'searching';
    stateText = 'I can’t see you. Not counting yet. Step back so your whole body is in view.';
  } else if (snap.tracking === 'low_confidence' || snap.messages.length > 0) {
    state = 'adjust';
    stateText = snap.messages[0] ?? 'Adjust your position so I can track you.';
  } else if (repCamera) {
    state = 'counting';
    stateText = snap.phase === 'bottom' ? 'Good. Now return to the start.' : 'Counting. Move when you’re ready.';
  } else if (dKind === 'hold') {
    state = holdingNow ? 'holding' : 'not_holding';
    stateText = holdingNow ? 'In position. Timer running.' : gateOn ? 'Get into position. Timer paused until you are.' : 'Timer running.';
  } else {
    state = holdingNow ? 'moving' : 'not_moving';
    stateText = holdingNow ? 'Moving. Timer running.' : gateOn ? 'Keep moving. Timer paused while you’re still.' : 'Timer running.';
  }
  const progress = repCamera && snap && phase === 'work' && !paused ? snap.progress : 0;
  const halfway = !!rx && rx.perSide && !isReps && phase === 'work' && remaining > 0 && remaining <= target / 2;

  if (!item || !ex || !rx) return null;
  const blockName = item.block === 'warmup' ? 'Warm-up' : item.block === 'cooldown' ? 'Cool-down' : 'Main';

  const statusPill = (
    <div className="count-pill" data-state={state} role="status" aria-live="polite">
      <span className="count-dot" aria-hidden="true" />
      <span>{stateText}</span>
    </div>
  );

  const gauge = repCamera && phase === 'work' ? (
    <div className="move-gauge" aria-hidden="true">
      <div className="move-gauge-track">
        <span className="move-gauge-fill" style={{ width: `${Math.round(progress * 100)}%` }} data-full={progress >= 0.98} />
      </div>
      <div className="move-gauge-labels">
        <span>Start</span>
        <span>Count!</span>
      </div>
    </div>
  ) : null;

  const timerText = phase === 'rest' ? formatClock(remaining) : !isReps && phase === 'work' ? formatClock(remaining) : formatClock(setSeconds);
  const timerLabel = phase === 'rest' ? 'Rest' : !isReps && phase === 'work' ? (rx.kind === 'hold' ? 'Hold' : 'Time left') : 'Set time';

  const counterContent = isReps ? (
    <>
      <span className="fs-count-num" key={popKey} data-pop={popKey > 0}>
        {count}
      </span>
      <span className="fs-count-of">/ {target}</span>
    </>
  ) : tracked ? (
    <span className="fs-count-status" data-on={holdingNow}>
      {holdingNow ? (dKind === 'hold' ? '✓ Holding' : '✓ Moving') : dKind === 'hold' ? 'Not in position' : 'Keep moving'}
    </span>
  ) : (
    <span className="fs-count-status">{formatClock(remaining)}</span>
  );

  // ───────────────────────────── full-screen camera ─────────────────────────────
  if (fullView) {
    return (
      <div className="fs-root" data-state={state} role="region" aria-label={`${ex.name} with camera`}>
        <CameraTracker
          enabled
          detectorId={detectorId}
          counting={phase === 'work' && !paused && tracked}
          resetKey={resetKey}
          rangeMode={rangeMode}
          onUpdate={onTracker}
          onFallback={onSwitchToManual}
          onStatus={setTrackerStatus}
          variant="full"
          accent={state === 'counting' || state === 'holding' || state === 'moving' ? 'rgba(90, 235, 180, 0.98)' : 'rgba(255, 214, 120, 0.95)'}
        />
        <div className="visually-hidden" aria-live="assertive">
          {announce}
        </div>

        <div className="fs-top">
          <div className="fs-chip fs-timer" aria-label={`${timerLabel}: ${timerText}`}>
            <Icon name="timer" size={18} />
            <span className="fs-chip-main num">{timerText}</span>
            <span className="fs-chip-sub">{timerLabel}</span>
          </div>
          <div className="fs-title">
            <strong>{ex.name}</strong>
            <span>
              {blockName} · Set {Math.min(setNo + 1, rx.sets)}/{rx.sets} · Exercise {idx + 1}/{totalItems}
            </span>
          </div>
          <div className="fs-chip fs-counter" aria-live="polite" aria-label={isReps ? `${count} of ${target} reps` : undefined}>
            {counterContent}
          </div>
        </div>

        {phase !== 'intro' ? (
          <div className="fs-mid">
            {statusPill}
            {gauge}
            {halfway ? <div className="fs-banner">Halfway: switch sides now</div> : null}
            {snap?.cue && state === 'counting' ? <div className="fs-cue">{snap.cue.text}</div> : null}
          </div>
        ) : null}

        {phase === 'intro' ? (
          <div className="fs-sheet" role="group" aria-label="Get ready">
            <div className="fs-sheet-fig" aria-hidden="true">
              <FigureDemo exerciseId={ex.id} size="md" />
            </div>
            <div className="stack-sm fs-sheet-body">
              <h2 className="fs-sheet-title">{ex.name}</h2>
              <span className="small muted">{describePrescription(rx)}</span>
              <p className="small">{ex.startPosition}</p>
              {info ? <p className="tiny muted">Camera: {info.setupHint}</p> : null}
              <p className="tiny fs-warn" role="note">
                <strong>If you feel any discomfort, stop.</strong> General fitness guidance, not medical advice.
              </p>
              {statusPill}
              <div className="row">
                <button className="btn btn-primary btn-lg" onClick={beginWork} disabled={trackerStatus !== 'running'}>
                  <Icon name="play" size={18} /> {trackerStatus === 'running' ? `Start ${rx.kind === 'reps' ? 'set' : 'timer'}` : 'Getting the camera ready…'}
                </button>
                <button className="btn btn-ghost fs-ghost" onClick={skipExercise}>
                  <Icon name="skip" size={16} /> Skip
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {phase === 'rest' ? (
          <div className="fs-rest">
            <span className="eyebrow">Rest</span>
            <div className="fs-rest-time">{formatClock(remaining)}</div>
            <span className="small">
              Next: set {setNo + 1} of {rx.sets}. Breathe easy.
            </span>
            <div className="row" style={{ justifyContent: 'center' }}>
              <button className="btn btn-secondary" onClick={() => setRemaining((r) => r + 15)}>
                +15 s
              </button>
              <button className="btn btn-primary" onClick={beginWork}>
                Skip rest
              </button>
            </div>
          </div>
        ) : null}

        <div className="fs-bottom">
          <div className="fs-controls">
            {phase === 'work' && isReps ? (
              <>
                <button className="fs-btn" onClick={() => adjust(-1)} aria-label="Remove one rep">
                  <Icon name="minus" />
                </button>
                <button className="fs-btn" onClick={() => adjust(1)} aria-label="Add one rep">
                  <Icon name="plus" />
                </button>
              </>
            ) : null}
            {phase !== 'intro' ? (
              <>
                <button className="fs-btn fs-btn-wide" onClick={() => setPaused((p) => !p)} aria-pressed={paused}>
                  <Icon name={paused ? 'play' : 'pause'} size={18} /> {paused ? 'Resume' : 'Pause'}
                </button>
                <button className="fs-btn fs-btn-wide fs-btn-primary" onClick={() => completeSet()}>
                  <Icon name="check" size={18} /> {phase === 'rest' ? 'Skip rest' : 'Done set'}
                </button>
              </>
            ) : null}
            <details className="fs-more">
              <summary aria-label="More controls">
                <Icon name="plus" size={18} /> More
              </summary>
              <div className="fs-more-panel">
                {phase !== 'intro' ? (
                  <button className="btn btn-secondary btn-sm" onClick={restartExercise}>
                    <Icon name="restart" size={14} /> Restart exercise
                  </button>
                ) : null}
                {phase !== 'intro' ? (
                  <button className="btn btn-secondary btn-sm" onClick={skipExercise}>
                    <Icon name="skip" size={14} /> Skip exercise
                  </button>
                ) : null}
                <label className="check fs-check">
                  <input type="checkbox" checked={rangeMode === 'reduced'} onChange={(e) => setRangeMode(e.target.checked ? 'reduced' : 'standard')} />
                  <span>
                    <strong className="small">Reduced range of motion</strong>
                  </span>
                </label>
                {timeCamera ? (
                  <label className="check fs-check">
                    <input type="checkbox" checked={gateOn} onChange={(e) => setGateOn(e.target.checked)} />
                    <span>
                      <strong className="small">Timer waits until I’m in position</strong>
                    </span>
                  </label>
                ) : null}
                <button className="btn btn-secondary btn-sm" onClick={() => setFullscreen(false)}>
                  Exit full screen layout
                </button>
                <button className="btn btn-secondary btn-sm" onClick={toggleBrowserFullscreen}>
                  Browser full screen
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => setCameraOn(false)}>
                  <Icon name="camera" size={14} /> Turn camera off
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => finish('just_stop')}>
                  End workout and save
                </button>
              </div>
            </details>
            <button className="fs-btn fs-btn-stop" onClick={openStop}>
              <Icon name="stop" size={18} /> I don’t feel right
            </button>
          </div>
        </div>

        <StopModal open={stopOpen} onClose={() => setStopOpen(false)} onResume={() => { setStopOpen(false); setPaused(false); }} onChoose={(s) => { setStopOpen(false); finish(s); }} />
      </div>
    );
  }

  // ───────────────────────────── standard layout (manual, or camera in a card) ─────────────────────────────
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

      <div className={`runner ${cameraVisible ? 'with-camera' : ''}`}>
        {mode === 'camera' ? (
          <div className="stack-sm">
            {cameraOn ? (
              <CameraTracker
                enabled
                detectorId={detectorId}
                counting={phase === 'work' && !paused && tracked}
                resetKey={resetKey}
                rangeMode={rangeMode}
                onUpdate={onTracker}
                onFallback={onSwitchToManual}
                onStatus={setTrackerStatus}
              />
            ) : (
              <div className="card card-soft stack-sm" style={{ alignItems: 'flex-start' }}>
                <strong className="row" style={{ gap: 8 }}>
                  <Icon name="camera" size={18} /> Camera is off
                </strong>
                <span className="small muted">The camera is fully stopped. Use the buttons to count. You can turn it back on at any time.</span>
              </div>
            )}
            <div className="row">
              <button className="btn btn-secondary btn-sm" onClick={() => setCameraOn((c) => !c)} aria-pressed={!cameraOn}>
                <Icon name="camera" size={14} /> {cameraOn ? 'Turn camera off' : 'Turn camera on'}
              </button>
              {cameraOn ? (
                <button className="btn btn-secondary btn-sm" onClick={() => setFullscreen(true)}>
                  Full-screen camera
                </button>
              ) : null}
            </div>
            {detectorId ? (
              <label className="check" style={{ padding: '8px 12px' }}>
                <input type="checkbox" checked={rangeMode === 'reduced'} onChange={(e) => setRangeMode(e.target.checked ? 'reduced' : 'standard')} />
                <span>
                  <strong className="small">Reduced range of motion</strong>
                  <span className="hint">Accepts smaller movements, if your comfortable range is smaller.</span>
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
              <p className="small" role="note">
                <strong>If you feel any discomfort, stop.</strong> General fitness guidance, not medical advice.
              </p>
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
              {tracked ? statusPill : null}
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
              <div className="big-count" aria-live="polite" aria-label={`${count} of ${target} reps`} key={popKey} data-pop={popKey > 0}>
                {count}
                <span style={{ fontSize: '0.35em', color: 'var(--ink-3)' }}> / {target}</span>
              </div>
              {statusPill}
              {gauge}
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
              {statusPill}
              {halfway ? <div className="fs-banner fs-banner-inline">Halfway: switch sides now</div> : null}
              {timeCamera ? (
                <label className="check" style={{ padding: '8px 12px' }}>
                  <input type="checkbox" checked={gateOn} onChange={(e) => setGateOn(e.target.checked)} />
                  <span>
                    <strong className="small">Timer waits until I’m in position</strong>
                  </span>
                </label>
              ) : null}
              <button className="btn btn-secondary" onClick={() => completeSet()}>
                Finish early
              </button>
            </div>
          )}

          {phase === 'rest' && (
            <div className="stack" style={{ alignItems: 'center', textAlign: 'center' }}>
              <span className="eyebrow">Rest</span>
              <div className="big-count">{formatClock(remaining)}</div>
              <span className="small muted">
                Next: set {setNo + 1} of {rx.sets}. Breathe easy.
              </span>
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
          {paused ? (
            <p className="small muted" style={{ textAlign: 'center' }}>
              Paused. Timers and camera counting are stopped.
            </p>
          ) : null}
        </section>
      </div>

      <div className="row-between">
        <button className="btn btn-ghost" onClick={() => finish('just_stop')}>
          End workout and save
        </button>
      </div>

      <div className="sticky-stop">
        <button className="btn btn-stop btn-lg" onClick={openStop}>
          <Icon name="stop" size={18} /> Stop: I don’t feel right
        </button>
      </div>

      <StopModal open={stopOpen} onClose={() => setStopOpen(false)} onResume={() => { setStopOpen(false); setPaused(false); }} onChoose={(s) => { setStopOpen(false); finish(s); }} />
    </div>
  );
}

function StopModal({ open, onClose, onResume, onChoose }: { open: boolean; onClose: () => void; onResume: () => void; onChoose: (s: SymptomReport) => void }) {
  return (
    <Modal open={open} onClose={onClose} title="What’s happening?">
      <p className="small muted">Your workout is paused. Choose what fits best. Your progress so far is kept, and your streak is protected.</p>
      <div className="stack-sm">
        {SYMPTOMS.map((s) => (
          <button key={s.id} className={`btn ${s.urgent ? 'btn-stop' : 'btn-secondary'}`} style={{ justifyContent: 'flex-start', whiteSpace: 'normal', textAlign: 'left' }} onClick={() => onChoose(s.id)}>
            {s.urgent ? <Icon name="alert" size={16} /> : null}
            {s.label}
          </button>
        ))}
        <button className="btn btn-ghost" onClick={onResume}>
          I’m OK, resume
        </button>
      </div>
    </Modal>
  );
}
