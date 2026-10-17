import { useEffect, useRef, useState } from 'react';
import type { DetectorId } from '../../domain/types';
import { MIN_VISIBILITY, type CounterSnapshot, type RangeMode } from '../../pose/counters';
import { assessFor, createDetector, detectorInfo, type Detector } from '../../pose/detectors';
import { loadPoseModel, PoseModelError, MODEL_ERROR_HELP, type LoadedModel } from '../../pose/poseModel';
import { CameraError, startCamera, stopStream } from '../../pose/camera';
import { LM, type Frame } from '../../pose/geometry';
import { Icon } from '../../components/Icon';

const CONNECTIONS: [number, number][] = [
  [LM.leftShoulder, LM.rightShoulder],
  [LM.leftShoulder, LM.leftElbow],
  [LM.leftElbow, LM.leftWrist],
  [LM.rightShoulder, LM.rightElbow],
  [LM.rightElbow, LM.rightWrist],
  [LM.leftShoulder, LM.leftHip],
  [LM.rightShoulder, LM.rightHip],
  [LM.leftHip, LM.rightHip],
  [LM.leftHip, LM.leftKnee],
  [LM.leftKnee, LM.leftAnkle],
  [LM.rightHip, LM.rightKnee],
  [LM.rightKnee, LM.rightAnkle],
];

export type TrackerStatus = 'idle' | 'starting_camera' | 'loading_model' | 'running' | 'camera_error' | 'model_error';

export interface TrackerUpdate {
  count: number;
  snapshot: CounterSnapshot;
  /** true while a counting set is in progress (as opposed to the "get in position" preview). */
  counting: boolean;
}

export function drawSkeleton(ctx: CanvasRenderingContext2D, frame: Frame | null, w: number, h: number, accent = 'rgba(82, 194, 162, 0.95)') {
  ctx.clearRect(0, 0, w, h);
  if (!frame) return;
  ctx.lineWidth = Math.max(4, w / 140);
  ctx.lineCap = 'round';
  for (const [a, b] of CONNECTIONS) {
    const p = frame[a];
    const q = frame[b];
    if (!p || !q) continue;
    const ok = (p.visibility ?? 0) >= MIN_VISIBILITY && (q.visibility ?? 0) >= MIN_VISIBILITY;
    ctx.strokeStyle = ok ? accent : 'rgba(255, 255, 255, 0.35)';
    ctx.setLineDash(ok ? [] : [6, 6]);
    ctx.beginPath();
    ctx.moveTo(p.x * w, p.y * h);
    ctx.lineTo(q.x * w, q.y * h);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  for (const i of [LM.nose, LM.leftShoulder, LM.rightShoulder, LM.leftElbow, LM.rightElbow, LM.leftWrist, LM.rightWrist, LM.leftHip, LM.rightHip, LM.leftKnee, LM.rightKnee, LM.leftAnkle, LM.rightAnkle]) {
    const p = frame[i];
    if (!p) continue;
    const ok = (p.visibility ?? 0) >= MIN_VISIBILITY;
    ctx.fillStyle = ok ? '#ffffff' : 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.arc(p.x * w, p.y * h, ok ? 6 : 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** A snapshot for the "get in position" preview, before counting starts. */
function previewSnapshot(id: DetectorId, frame: Frame | null): CounterSnapshot {
  const a = assessFor(id, frame);
  return {
    kind: detectorInfo(id).kind,
    progress: 0,
    holding: false,
    heldMs: 0,
    count: 0,
    partials: 0,
    phase: 'idle',
    tracking: frame ? (a.ok ? 'ok' : 'low_confidence') : 'no_person',
    side: 'left',
    metric: null,
    messages: a.messages,
    cue: null,
    events: [],
  };
}

/**
 * Live camera + on-device pose tracking. Requests camera permission only when mounted with `enabled`.
 * Frames are processed in memory and immediately discarded; nothing is recorded or uploaded.
 *
 * variant "card": video with its own status badges. variant "full": just the video + skeleton filling
 * its container; the parent draws the timer, counter and controls over it.
 */
export function CameraTracker({
  enabled,
  detectorId,
  counting,
  resetKey,
  rangeMode,
  onUpdate,
  onFallback,
  onStatus,
  variant = 'card',
  accent,
}: {
  enabled: boolean;
  detectorId: DetectorId | null;
  counting: boolean;
  resetKey: string;
  rangeMode: RangeMode;
  onUpdate: (u: TrackerUpdate) => void;
  onFallback: (reason: string) => void;
  onStatus?: (s: TrackerStatus) => void;
  variant?: 'card' | 'full';
  accent?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const modelRef = useRef<LoadedModel | null>(null);
  const detectorRef = useRef<Detector | null>(null);
  const countingRef = useRef(counting);
  const idRef = useRef(detectorId);
  const accentRef = useRef(accent);
  const onUpdateRef = useRef(onUpdate);
  const [status, setStatus] = useState<TrackerStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [delegate, setDelegate] = useState<string | null>(null);
  const [viewState, setViewState] = useState<{ key: string; snap: CounterSnapshot } | null>(null);
  const detectorKey = `${detectorId}|${resetKey}|${rangeMode}`;
  const keyRef = useRef(detectorKey);
  // Only show a snapshot produced by the current detector (avoids stale state after a reset).
  const view = viewState && viewState.key === detectorKey ? viewState.snap : null;

  useEffect(() => {
    countingRef.current = counting;
    idRef.current = detectorId;
    accentRef.current = accent;
    onUpdateRef.current = onUpdate;
    keyRef.current = detectorKey;
  });
  useEffect(() => {
    onStatus?.(status);
  }, [status, onStatus]);

  // (Re)create the detector when the exercise or set changes.
  useEffect(() => {
    detectorRef.current = detectorId ? createDetector(detectorId, rangeMode) : null;
  }, [detectorId, resetKey, rangeMode]);

  // Start camera + model.
  useEffect(() => {
    if (!enabled) return;
    const videoEl = videoRef.current;
    let cancelled = false;
    let raf = 0;
    let lastVideoTime = -1;
    let lastUi = 0;
    (async () => {
      try {
        setStatus('starting_camera');
        const stream = await startCamera();
        if (cancelled) {
          stopStream(stream);
          return;
        }
        streamRef.current = stream;
        const v = videoEl!;
        v.srcObject = stream;
        await v.play().catch(() => undefined);
        setStatus('loading_model');
        const model = await loadPoseModel();
        if (cancelled) return;
        modelRef.current = model;
        setDelegate(model.delegate);
        setStatus('running');
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
            const res = modelRef.current.landmarker.detectForVideo(video, now);
            frame = (res.landmarks[0] as Frame | undefined) ?? null;
          } catch {
            frame = null;
          }
          if (canvas.width !== video.videoWidth) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
          }
          const ctx = canvas.getContext('2d');
          if (ctx) drawSkeleton(ctx, frame, canvas.width, canvas.height, accentRef.current);
          const detector = detectorRef.current;
          const id = idRef.current;
          if (!detector || !id) return;
          const isCounting = countingRef.current;
          const snap = isCounting ? detector.update(frame, now) : previewSnapshot(id, frame);
          const rep = snap.events.includes('rep');
          if (rep || now - lastUi > 100) {
            lastUi = now;
            setViewState({ key: keyRef.current, snap });
            onUpdateRef.current({ count: snap.count, snapshot: snap, counting: isCounting });
          }
        };
        raf = requestAnimationFrame(loop);
      } catch (e) {
        if (cancelled) return;
        if (e instanceof CameraError) {
          setStatus('camera_error');
          setError(e.message);
        } else if (e instanceof PoseModelError) {
          setStatus('model_error');
          setError(MODEL_ERROR_HELP[e.code]);
        } else {
          setStatus('model_error');
          setError(MODEL_ERROR_HELP.init_failed);
        }
      }
    })();
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      stopStream(streamRef.current);
      streamRef.current = null;
      if (videoEl) videoEl.srcObject = null;
    };
  }, [enabled]);

  const info = detectorId ? detectorInfo(detectorId) : null;

  if (status === 'camera_error' || status === 'model_error') {
    return (
      <div className={`card stack-sm ${variant === 'full' ? 'cam-error-full' : ''}`} role="alert">
        <div className="row" style={{ gap: 8 }}>
          <Icon name={status === 'camera_error' ? 'camera' : 'alert'} />
          <strong>{status === 'camera_error' ? 'Camera unavailable' : 'Tracking model unavailable'}</strong>
        </div>
        <p className="small">{error}</p>
        <div>
          <button className="btn btn-primary btn-sm" onClick={() => onFallback(error ?? '')}>
            Continue with manual tracking
          </button>
        </div>
      </div>
    );
  }

  const loadingMsg = status === 'starting_camera' ? 'Waiting for camera permission…' : status === 'loading_model' ? 'Loading the on-device pose model (about 6 MB, from this app)…' : 'Starting…';

  if (variant === 'full') {
    return (
      <div className="cam-wrap cam-full">
        <video ref={videoRef} playsInline muted aria-label="Your camera preview (mirrored). Video stays on this device." />
        <canvas ref={canvasRef} aria-hidden="true" />
        <div className="cam-status cam-status-full">
          <span className="badge" style={{ background: 'rgb(0 0 0 / 0.6)', color: '#fff' }}>
            <Icon name="lock" size={12} /> On-device only
          </span>
          {status === 'running' && delegate ? <span className="cam-model">Model: MediaPipe Pose Landmarker Lite · running on {delegate}</span> : null}
        </div>
        {status !== 'running' ? (
          <div className="cam-overlay-msg cam-loading" aria-live="polite">
            {loadingMsg}
          </div>
        ) : null}
      </div>
    );
  }

  const tracking = view?.tracking;
  return (
    <div className="stack-sm">
      <div className="cam-wrap">
        <video ref={videoRef} playsInline muted aria-label="Your camera preview (mirrored). Video stays on this device." />
        <canvas ref={canvasRef} aria-hidden="true" />
        <div className="cam-status">
          <span className="badge" style={{ background: 'rgb(0 0 0 / 0.6)', color: '#fff' }}>
            <Icon name="lock" size={12} /> On-device only
          </span>
          {status === 'running' && tracking === 'ok' ? <span className="badge badge-ok">Tracking</span> : null}
          {status === 'running' && tracking === 'low_confidence' ? <span className="badge badge-warn">Low confidence</span> : null}
          {status === 'running' && (tracking === 'lost' || tracking === 'no_person') ? <span className="badge badge-danger">Not tracking</span> : null}
          {status === 'running' && !counting && info ? <span className="badge">Counting paused</span> : null}
        </div>
        {status !== 'running' ? (
          <div className="cam-overlay-msg" aria-live="polite">
            {loadingMsg}
          </div>
        ) : view?.messages.length ? (
          <div className="cam-overlay-msg" aria-live="polite">
            {view.messages[0]}
          </div>
        ) : null}
      </div>
      {status === 'running' && info ? <p className="tiny muted">{info.setupHint}</p> : null}
      {status === 'running' && view?.cue ? (
        <div className={`callout ${view.cue.kind === 'technique' ? 'callout-info' : 'callout-ok'}`} aria-live="polite">
          <Icon name="info" size={18} />
          <div className="small">
            {view.cue.text}
            <div className="tiny muted" style={{ marginTop: 4 }}>
              Estimate from a 2D camera; camera angle, clothing, lighting and body differences can affect it. Not a medical assessment.
            </div>
          </div>
        </div>
      ) : null}
      {status === 'running' && delegate ? <span className="tiny muted">Model: MediaPipe Pose Landmarker Lite · running on {delegate} in this browser.</span> : null}
    </div>
  );
}
