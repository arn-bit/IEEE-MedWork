import { useCallback, useEffect, useRef, useState } from 'react';
import type { CounterId } from '../../domain/types';
import { COUNTERS, assessPosition, type RangeMode } from '../../pose/counters';
import { loadPoseModel, MODEL_ERROR_HELP, MODEL_INFO, PoseModelError, type LoadedModel } from '../../pose/poseModel';
import { CameraError, startCamera, stopStream } from '../../pose/camera';
import type { Frame } from '../../pose/geometry';
import { TRACE_FORMAT, packFrame, type RepTrace, type TraceFrame, type TraceLighting, type TraceMobility, type TraceView } from '../../pose/replay';
import { drawSkeleton } from '../workout/CameraTracker';
import { Callout, CheckCard, PageHead, RadioCards } from '../../components/ui';
import { Icon } from '../../components/Icon';

/**
 * DEV ONLY (/dev/record, registered only when import.meta.env.DEV). Records a rep-counter validation
 * trace: per-frame pose landmarks + timestamps + the times the person says they finished a rep.
 * No video or images are kept; the trace is downloaded as a local JSON file and never uploaded.
 */

const MAX_RECORDING_MS = 5 * 60 * 1000;
/** Keys that count as "Rep done" (presentation clickers usually send PageDown / ArrowRight). */
const TAP_KEYS = new Set([' ', 'Enter', 'ArrowRight', 'PageDown']);
const UNDO_KEYS = new Set(['Backspace', 'ArrowLeft', 'PageUp']);

type Status = 'setup' | 'starting_camera' | 'loading_model' | 'preview' | 'recording' | 'review' | 'error';

function downloadJson(name: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

const secs = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

export function RecordTracePage() {
  const [consent, setConsent] = useState(false);
  const [counter, setCounter] = useState<CounterId>('squat');
  const [rangeMode, setRangeMode] = useState<RangeMode>('standard');
  const [view, setView] = useState<TraceView>('side');
  const [lighting, setLighting] = useState<TraceLighting>('normal');
  const [mobility, setMobility] = useState<TraceMobility>('typical');
  const [cameraOn, setCameraOn] = useState(false);
  const [status, setStatus] = useState<Status>('setup');
  const [error, setError] = useState<string | null>(null);
  const [positionMsg, setPositionMsg] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [taps, setTaps] = useState<number[]>([]);
  const [trace, setTrace] = useState<RepTrace | null>(null);
  const [downloaded, setDownloaded] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const modelRef = useRef<LoadedModel | null>(null);
  const counterRef = useRef(counter);
  const recordingRef = useRef(false);
  const startAtRef = useRef(0);
  const framesRef = useRef<TraceFrame[]>([]);
  const tapsRef = useRef<number[]>([]);
  const stopRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    counterRef.current = counter;
  });

  // Camera + model + landmark loop. Frames are read, reduced to landmarks, and discarded.
  useEffect(() => {
    if (!cameraOn) return;
    const videoEl = videoRef.current;
    let cancelled = false;
    let raf = 0;
    let stream: MediaStream | null = null;
    let lastVideoTime = -1;
    let lastUi = 0;
    (async () => {
      try {
        setStatus('starting_camera');
        stream = await startCamera();
        if (cancelled) return stopStream(stream);
        videoEl!.srcObject = stream;
        await videoEl!.play().catch(() => undefined);
        setStatus('loading_model');
        modelRef.current = await loadPoseModel();
        if (cancelled) return;
        setStatus('preview');
        const loop = () => {
          raf = requestAnimationFrame(loop);
          const video = videoRef.current;
          const canvas = canvasRef.current;
          if (!video || !canvas || video.readyState < 2 || !modelRef.current) return;
          if (video.currentTime === lastVideoTime) return;
          lastVideoTime = video.currentTime;
          const now = performance.now();
          let frame: Frame | null;
          try {
            frame = (modelRef.current.landmarker.detectForVideo(video, now).landmarks[0] as Frame | undefined) ?? null;
          } catch {
            frame = null;
          }
          if (canvas.width !== video.videoWidth) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
          }
          const ctx = canvas.getContext('2d');
          if (ctx) drawSkeleton(ctx, frame, canvas.width, canvas.height);
          if (recordingRef.current) {
            const t = now - startAtRef.current;
            framesRef.current.push({ t: Math.round(t * 10) / 10, lm: packFrame(frame) });
            if (t >= MAX_RECORDING_MS) stopRef.current();
          }
          if (now - lastUi > 250) {
            lastUi = now;
            setPositionMsg(assessPosition(frame, COUNTERS[counterRef.current]).messages[0] ?? null);
            if (recordingRef.current) setElapsed(now - startAtRef.current);
          }
        };
        raf = requestAnimationFrame(loop);
      } catch (e) {
        if (cancelled) return;
        setStatus('error');
        setError(e instanceof CameraError ? e.message : e instanceof PoseModelError ? MODEL_ERROR_HELP[e.code] : MODEL_ERROR_HELP.init_failed);
      }
    })();
    return () => {
      cancelled = true;
      recordingRef.current = false;
      cancelAnimationFrame(raf);
      stopStream(stream);
      if (videoEl) videoEl.srcObject = null;
    };
  }, [cameraOn]);

  const tap = useCallback(() => {
    if (!recordingRef.current) return;
    tapsRef.current = [...tapsRef.current, Math.round((performance.now() - startAtRef.current) * 10) / 10];
    setTaps(tapsRef.current);
  }, []);
  const undoTap = useCallback(() => {
    tapsRef.current = tapsRef.current.slice(0, -1);
    setTaps(tapsRef.current);
  }, []);

  const startRecording = () => {
    framesRef.current = [];
    tapsRef.current = [];
    setTaps([]);
    setElapsed(0);
    setTrace(null);
    setDownloaded(false);
    startAtRef.current = performance.now();
    recordingRef.current = true;
    setStatus('recording');
  };

  const stopRecording = () => {
    if (!recordingRef.current) return;
    recordingRef.current = false;
    const frames = framesRef.current;
    const video = videoRef.current;
    setTrace({
      format: TRACE_FORMAT,
      version: 1,
      counter,
      rangeMode,
      setup: { view, lighting, mobility },
      model: `${MODEL_INFO.name} · ${MODEL_INFO.runtime}`,
      video: { width: video?.videoWidth ?? 0, height: video?.videoHeight ?? 0 },
      consent: true,
      durationMs: frames.length ? frames[frames.length - 1]!.t : 0,
      frames,
      truthRepsMs: tapsRef.current,
    });
    framesRef.current = [];
    setStatus('review');
  };

  useEffect(() => {
    stopRef.current = stopRecording;
  });

  // Keyboard / clicker taps while recording. Captured before buttons so Space can never trigger "Stop".
  useEffect(() => {
    if (status !== 'recording') return;
    const onKey = (e: KeyboardEvent) => {
      const isTap = TAP_KEYS.has(e.key);
      const isUndo = UNDO_KEYS.has(e.key);
      if (!isTap && !isUndo) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.type !== 'keydown' || e.repeat) return;
      if (isTap) tap();
      else undoTap();
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('keyup', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('keyup', onKey, true);
    };
  }, [status, tap, undoTap]);

  const stopCamera = () => {
    recordingRef.current = false;
    setCameraOn(false);
    setStatus(trace ? 'review' : 'setup');
    setPositionMsg(null);
  };

  const discard = () => {
    setTrace(null);
    setDownloaded(false);
    setTaps([]);
    setStatus(cameraOn ? 'preview' : 'setup');
  };

  /** Withdrawing consent stops the camera and throws away anything not yet downloaded. */
  const changeConsent = (v: boolean) => {
    setConsent(v);
    if (v) return;
    recordingRef.current = false;
    framesRef.current = [];
    tapsRef.current = [];
    setTaps([]);
    setTrace(null);
    setCameraOn(false);
    setPositionMsg(null);
    setStatus('setup');
  };

  const download = () => {
    if (!trace) return;
    downloadJson(`trace-${trace.counter}-${trace.setup.view}-${crypto.randomUUID().slice(0, 8)}.json`, trace);
    setDownloaded(true);
  };

  const spec = COUNTERS[counter];
  const locked = cameraOn;
  const withPerson = trace ? trace.frames.filter((f) => f.lm).length : 0;

  return (
    <div className="stack-lg" style={{ maxWidth: 860 }}>
      <PageHead eyebrow="Developer tool" title="Record a rep-counter validation trace">
        Records only body landmark positions and the moments you tap “Rep done”, so the rep counters can be checked against real movement. Available in development builds only.
      </PageHead>

      <Callout tone="info" title="What is recorded — and what is not" icon="lock">
        Per video frame: 33 tracked body points (x, y, z, confidence) and a timestamp relative to the start. Plus your “Rep done” taps and the setup labels below.{' '}
        <strong>No video, no images, no names, no dates.</strong> The trace stays in this browser until you download it as a JSON file. Nothing is uploaded.
      </Callout>

      <section className="card stack">
        <h2>1. Consent</h2>
        <CheckCard
          checked={consent}
          onChange={changeConsent}
          name="consent"
          title="I agree to record my body landmark positions for testing the rep counters"
          hint="Only record yourself, or someone who has agreed after reading the box above. Stop at any time; nothing is kept unless you download it. Exercise only within your comfortable range."
        />
      </section>

      <section className="card stack">
        <h2>2. Setup</h2>
        <fieldset disabled={locked} className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
          <RadioCards
            legend="Exercise / counter"
            options={(Object.keys(COUNTERS) as CounterId[]).map((id) => ({ value: id, title: COUNTERS[id].label, hint: id }))}
            value={counter}
            onChange={setCounter}
          />
          <RadioCards
            legend="Counting range"
            cols={2}
            options={[
              { value: 'standard', title: 'Standard range' },
              { value: 'reduced', title: 'Reduced range' },
            ]}
            value={rangeMode}
            onChange={setRangeMode}
          />
          <RadioCards
            legend="Camera view"
            hint={`Recommended for this counter: ${spec.view.replaceAll('_', ' ')}.`}
            cols={2}
            options={[
              { value: 'front', title: 'Facing the camera' },
              { value: 'side', title: 'Side-on' },
            ]}
            value={view}
            onChange={setView}
          />
          <RadioCards
            legend="Lighting"
            cols={2}
            options={[
              { value: 'bright', title: 'Bright, even' },
              { value: 'normal', title: 'Normal indoor' },
              { value: 'dim', title: 'Dim' },
              { value: 'backlit', title: 'Backlit (window behind)' },
            ]}
            value={lighting}
            onChange={setLighting}
          />
          <RadioCards
            legend="Movement"
            hint="A coarse label for coverage reporting only. Do not record diagnoses or other health details."
            options={[
              { value: 'typical', title: 'Typical range' },
              { value: 'limited', title: 'Limited range' },
              { value: 'uses_support', title: 'Uses support', hint: 'Chair arms, wall, rail' },
            ]}
            value={mobility}
            onChange={setMobility}
          />
        </fieldset>
        <p className="tiny muted">{spec.setupHint}</p>
      </section>

      <section className="card stack">
        <h2>3. Record</h2>
        {!cameraOn ? (
          <div>
            <button className="btn btn-primary" disabled={!consent} onClick={() => setCameraOn(true)}>
              <Icon name="camera" size={18} /> Start camera
            </button>
            {!consent ? <p className="tiny muted" style={{ marginTop: 6 }}>Tick the consent box to start the camera.</p> : null}
          </div>
        ) : null}

        {status === 'error' ? (
          <div className="stack-sm">
            <Callout tone="warn" title="Camera or model unavailable">
              {error}
            </Callout>
            <div>
              <button className="btn btn-secondary" onClick={stopCamera}>
                Close camera
              </button>
            </div>
          </div>
        ) : null}

        {cameraOn && status !== 'error' ? (
          <>
            <div className="cam-wrap">
              <video ref={videoRef} playsInline muted aria-label="Your camera preview (mirrored). Video stays on this device and is not recorded." />
              <canvas ref={canvasRef} aria-hidden="true" />
              <div className="cam-status">
                <span className="badge" style={{ background: 'rgb(0 0 0 / 0.6)', color: '#fff' }}>
                  <Icon name="lock" size={12} /> Landmarks only · on-device
                </span>
                {status === 'recording' ? <span className="badge badge-danger">● Recording {secs(elapsed)}</span> : null}
              </div>
              {status === 'starting_camera' || status === 'loading_model' ? (
                <div className="cam-overlay-msg" aria-live="polite">
                  {status === 'starting_camera' ? 'Waiting for camera permission…' : 'Loading the on-device pose model…'}
                </div>
              ) : positionMsg ? (
                <div className="cam-overlay-msg" aria-live="polite">
                  {positionMsg}
                </div>
              ) : null}
            </div>

            {status === 'preview' ? (
              <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                <button className="btn btn-primary" onClick={startRecording}>
                  <Icon name="play" size={18} /> Start recording
                </button>
                <button className="btn btn-ghost" onClick={stopCamera}>
                  Stop camera
                </button>
              </div>
            ) : null}

            {status === 'recording' ? (
              <div className="stack-sm">
                <button className="btn btn-primary btn-lg" style={{ width: '100%', minHeight: 96, fontSize: '1.4rem' }} onClick={tap}>
                  <Icon name="check" size={26} /> Rep done ({taps.length})
                </button>
                <p className="tiny muted">
                  Tap once each time a rep is actually finished (back at the start position). Keyboard or clicker: Space, Enter, → or Page Down = rep done; Backspace, ← or Page Up = undo.
                  The app’s own count is hidden on purpose so it cannot influence the taps. Recording stops automatically after {MAX_RECORDING_MS / 60000} minutes.
                </p>
                <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                  <button className="btn btn-secondary" onClick={undoTap} disabled={taps.length === 0}>
                    Undo last tap
                  </button>
                  <button className="btn btn-danger" onClick={stopRecording}>
                    <Icon name="stop" size={18} /> Stop recording
                  </button>
                </div>
              </div>
            ) : null}
          </>
        ) : null}

        {trace && status !== 'recording' ? (
          <div className="stack-sm" aria-live="polite">
            <h3>Trace ready</h3>
            <ul className="list small">
              <li>
                {COUNTERS[trace.counter].label} · {trace.rangeMode} range · {trace.setup.view} view · {trace.setup.lighting} light · {trace.setup.mobility.replace('_', ' ')}
              </li>
              <li>
                {secs(trace.durationMs)}, {trace.frames.length} frames ({trace.frames.length ? Math.round((withPerson / trace.frames.length) * 100) : 0}% with a person detected)
              </li>
              <li>{trace.truthRepsMs.length} “Rep done” taps</li>
            </ul>
            {trace.truthRepsMs.length === 0 ? <Callout tone="warn">No reps were tapped, so this trace can only measure false counts.</Callout> : null}
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <button className="btn btn-primary" onClick={download}>
                <Icon name="download" size={18} /> Download JSON
              </button>
              <button className="btn btn-ghost" onClick={discard}>
                {downloaded ? (
                  'Record another'
                ) : (
                  <>
                    <Icon name="trash" size={18} /> Discard
                  </>
                )}
              </button>
            </div>
            <p className="tiny muted">To use it, save the file into src/pose/fixtures/ and run npm run eval:counters. See TEST_PLAN.md §8 for the protocol.</p>
          </div>
        ) : null}
      </section>
    </div>
  );
}
