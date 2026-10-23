import { useEffect, useMemo, useRef } from 'react';
import { createDetector } from '../../../pose/detectors';
import type { CounterSnapshot } from '../../../pose/counters';
import type { Frame } from '../../../pose/geometry';
import { FRAME_MS, makeBody } from '../../../pose/testing/simulate';
import { drawSkeleton } from '../../workout/CameraTracker';
import type { SceneProps } from '../DemoPage';

export const GET_READY_MS = 2600;
export const REP_PERIOD_MS = 2300;
export const CAMERA_SCENE_MS = 12000;
export const TARGET_REPS = 8;

const kneeAt = (tMs: number) => {
  if (tMs < GET_READY_MS) return 178;
  const x = ((tMs - GET_READY_MS) % REP_PERIOD_MS) / REP_PERIOD_MS;
  const depth = 0.5 - 0.5 * Math.cos(2 * Math.PI * x);
  return 178 - 82 * depth;
};

export interface CameraTimeline {
  frames: Frame[];
  snaps: CounterSnapshot[];
}

/**
 * Real squat counter, fed a simulated person (synthetic landmarks, not a video) for the whole scene up front.
 * Computing it once keeps the scene deterministic and lets the presenter jump around without it drifting.
 */
export function buildCameraTimeline(durationMs: number = CAMERA_SCENE_MS): CameraTimeline {
  const detector = createDetector('squat', 'standard');
  const frames: Frame[] = [];
  const snaps: CounterSnapshot[] = [];
  const n = Math.ceil(durationMs / FRAME_MS) + 1;
  let went = false;
  for (let i = 0; i < n; i++) {
    const t = i * FRAME_MS;
    if (!went && t >= GET_READY_MS) {
      detector.reset(); // the app starts counting when the countdown ends
      went = true;
    }
    const frame = makeBody({ view: 'front', kneeAngle: kneeAt(t), noise: 0.002, seed: i + 1 });
    frames.push(frame);
    snaps.push(detector.update(frame, t));
  }
  return { frames, snaps };
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function CameraScene({ elapsed }: SceneProps) {
  const timeline = useMemo(() => buildCameraTimeline(), []);
  const canvas = useRef<HTMLCanvasElement>(null);
  const i = Math.max(0, Math.min(timeline.frames.length - 1, Math.floor(elapsed / FRAME_MS)));
  const snap = timeline.snaps[i]!;
  const going = elapsed >= GET_READY_MS;
  const count = going ? snap.count : 0;
  const countdown = Math.max(1, Math.ceil((GET_READY_MS - elapsed) / 1000 + 0.0));
  const moving = going && snap.progress > 0.08;

  useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext('2d');
    if (c && ctx) {
      // Shrink the simulated person a little so the whole body (and the overlays) fit in the frame.
      const fit = timeline.frames[i]!.map((p) => ({ ...p, x: 0.5 + (p.x - 0.5) * 0.82, y: 0.05 + p.y * 0.82 }));
      drawSkeleton(ctx, fit, c.width, c.height, going ? 'rgba(90, 235, 180, 0.98)' : 'rgba(255, 214, 120, 0.95)');
    }
  }, [i, timeline, going]);

  const state = !going ? 'ready' : moving ? 'counting' : 'counting';
  const pill = !going ? `Get into position. Starting in ${countdown}…` : snap.phase === 'bottom' ? 'Good. Now stand back up.' : 'Counting. Move when you’re ready.';

  return (
    <div className="demo-cam" data-state={state}>
      <div className="demo-cam-view">
        <canvas ref={canvas} width={720} height={720} aria-label="Simulated body tracking with skeleton overlay" />
        <span className="demo-cam-tag">Simulated movement · the live camera works the same way</span>
      </div>
      <div className="demo-cam-top">
        <div className="demo-chip-big" aria-label={`Set time ${clock(going ? (elapsed - GET_READY_MS) / 1000 : 0)}`}>
          <span className="demo-chip-sub">Set time</span>
          <span className="num demo-chip-main">{clock(going ? (elapsed - GET_READY_MS) / 1000 : 0)}</span>
        </div>
        <div className="demo-cam-title">
          <strong>Squat</strong>
          <span>Set 1/3 · Exercise 1/6</span>
        </div>
        <div className="demo-chip-big demo-chip-count" aria-label={`${count} of ${TARGET_REPS} reps`}>
          <span className="demo-chip-sub">Reps</span>
          <span className="num demo-chip-main" key={count}>
            {count}
            <span className="demo-of"> / {TARGET_REPS}</span>
          </span>
        </div>
      </div>
      <div className="demo-cam-mid">
        <div className="demo-pill" data-state={state} role="status">
          <span className="demo-dot" aria-hidden="true" />
          {pill}
        </div>
        {going ? (
          <div className="demo-gauge" aria-hidden="true">
            <span style={{ width: `${Math.round(snap.progress * 100)}%` }} />
          </div>
        ) : (
          <div className="demo-countdown" aria-hidden="true">
            {countdown}
          </div>
        )}
      </div>
    </div>
  );
}
