import { useEffect, useRef, useState } from 'react';
import type { CounterId } from '../../domain/types';
import { RepCounter, MIN_VISIBILITY, COUNTERS, type CounterSnapshot, type RangeMode } from '../../pose/counters';
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
  snapshot: CounterSnapshot | null;
}

export function drawSkeleton(ctx: CanvasRenderingContext2D, frame: Frame | null, w: number, h: number) {
  ctx.clearRect(0, 0, w, h);
  if (!frame) return;
  ctx.lineWidth = Math.max(3, w / 160);
  ctx.lineCap = 'round';
  for (const [a, b] of CONNECTIONS) {
    const p = frame[a];
    const q = frame[b];
    if (!p || !q) continue;
    const ok = (p.visibility ?? 0) >= MIN_VISIBILITY && (q.visibility ?? 0) >= MIN_VISIBILITY;
    ctx.strokeStyle = ok ? 'rgba(82, 194, 162, 0.95)' : 'rgba(255, 255, 255, 0.35)';
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
    ctx.arc(p.x * w, p.y * h, ok ? 5 : 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Live camera + on-device pose tracking. Requests camera permission only when mounted with `enabled`.
 * Frames are processed in memory and immediately discarded; nothing is recorded or uploaded.
 */
export function CameraTracker({
  enabled,
  counterId,
  counting,
  resetKey,
  rangeMode,
  onUpdate,
  onFallback,
}: {
  enabled: boolean;
  counterId: CounterId | null;
  counting: boolean;
  resetKey: string;
  rangeMode: RangeMode;
  onUpdate: (u: TrackerUpdate) => void;
  onFallback: (reason: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const modelRef = useRef<LoadedModel | null>(null);
  const counterRef = useRef<RepCounter | null>(null);
  const snapRef = useRef<CounterSnapshot | null>(null);
  const countingRef = useRef(counting);
  const onUpdateRef = useRef(onUpdate);
  const [status, setStatus] = useState<TrackerStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [delegate, setDelegate] = useState<string | null>(null);
  const [viewState, setViewState] = useState<{ key: string; snap: CounterSnapshot } | null>(null);
  const counterKey = `${counterId}|${resetKey}|${rangeMode}`;
  const keyRef = useRef(counterKey);
  // Only show a snapshot produced by the current counter (avoids stale state after a reset).
  const view = viewState && viewState.key === counterKey ? viewState.snap : null;

  useEffect(() => {
    countingRef.current = counting;
    onUpdateRef.current = onUpdate;
    keyRef.current = counterKey;
  });

  // (Re)create the counter when the exercise/set changes.
  useEffect(() => {
    counterRef.current = counterId ? new RepCounter(counterId, rangeMode) : null;
    snapRef.current = null;
  }, [counterId, resetKey, rangeMode]);

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
          if (ctx) drawSkeleton(ctx, frame, canvas.width, canvas.height);
          const counter = counterRef.current;
          if (counter && countingRef.current) {
            const snap = counter.update(frame, now);
            snapRef.current = snap;
            if (snap.events.includes('rep') || now - lastUi > 120) {
              lastUi = now;
              setViewState({ key: keyRef.current, snap });
              onUpdateRef.current({ count: snap.count, snapshot: snap });
            }
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

  const spec = counterId ? COUNTERS[counterId] : null;
  const tracking = view?.tracking;
  const trackingBadge =
    tracking === 'ok' ? (
      <span className="badge badge-ok">Tracking</span>
    ) : tracking === 'low_confidence' ? (
      <span className="badge badge-warn">Low confidence — paused</span>
    ) : tracking === 'lost' || tracking === 'no_person' ? (
      <span className="badge badge-danger">Not tracking</span>
    ) : null;

  if (status === 'camera_error' || status === 'model_error') {
    return (
      <div className="card stack-sm" role="alert">
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

  return (
    <div className="stack-sm">
      <div className="cam-wrap">
        <video ref={videoRef} playsInline muted aria-label="Your camera preview (mirrored). Video stays on this device." />
        <canvas ref={canvasRef} aria-hidden="true" />
        <div className="cam-status">
          <span className="badge" style={{ background: 'rgb(0 0 0 / 0.6)', color: '#fff' }}>
            <Icon name="lock" size={12} /> On-device only
          </span>
          {status === 'running' && trackingBadge}
          {status === 'running' && view && view.tracking === 'ok' && view.messages.length === 0 ? (
            <span className="badge badge-ok">
              <Icon name="check" size={12} /> In position
            </span>
          ) : null}
          {status === 'running' && !spec ? <span className="badge badge-warn">No camera counting for this exercise</span> : null}
          {!counting && status === 'running' && spec ? <span className="badge">Counting paused</span> : null}
        </div>
        {status !== 'running' ? (
          <div className="cam-overlay-msg" aria-live="polite">
            {status === 'starting_camera' ? 'Waiting for camera permission…' : status === 'loading_model' ? 'Loading the on-device pose model (about 6 MB, from this app)…' : 'Starting…'}
          </div>
        ) : view?.messages.length ? (
          <div className="cam-overlay-msg" aria-live="polite">
            {view.messages[0]}
          </div>
        ) : null}
      </div>
      {status === 'running' && spec ? <p className="tiny muted">{spec.setupHint}</p> : null}
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
