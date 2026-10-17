import type { ActivityDetectorId, DetectorId, HoldDetectorId, RepCounterId } from '../domain/types';
import { COUNTERS, MIN_VISIBILITY, RepCounter, assessPosition, requiredIndices, type CounterSnapshot, type PositionSpec, type RangeMode, type TrackingState } from './counters';
import { LM, SIDES, angle, bestSide, estimateView, mid, minVisibility, torsoLength, type Frame, type Side } from './geometry';

/**
 * Hold and movement detectors, plus the registry that turns any exercise's detector id into a
 * working detector with a common interface (`update(frame, t) → CounterSnapshot`).
 *
 *  - Hold detectors answer "is the position being held right now?" The workout timer only runs
 *    while they say yes, so sloppy or missing positions don't get credit.
 *  - Activity detectors answer "are you moving?" (warm-ups, marching, cardio).
 *
 * Like the rep counters, these are tuned on simulated landmarks and are NOT validated on real
 * people. They are conservative about tracking: with low confidence they report "not holding".
 */

export interface Detector {
  readonly kind: 'rep' | 'hold' | 'activity';
  update(frame: Frame | null, tMs: number): CounterSnapshot;
  reset(): void;
  adjust(delta: number): void;
  setMode(mode: RangeMode): void;
}

const LOST_AFTER_FRAMES = 4;
const ENTER_FRAMES = 3;
const EXIT_FRAMES = 4;

interface HoldSpec extends PositionSpec {
  id: HoldDetectorId;
  label: string;
  setupHint: string;
  /** Pure geometric check on a reliable frame. */
  holding(frame: Frame, side: Side): boolean;
  /** Per-mode relaxation: "reduced" accepts a smaller movement range. */
  relaxedHolding?(frame: Frame, side: Side): boolean;
  joints: PositionSpec['joints'];
}

const torso = (f: Frame) => torsoLength(f);
const shoulderMid = (f: Frame) => mid(f[LM.leftShoulder]!, f[LM.rightShoulder]!);
const hipMid = (f: Frame) => mid(f[LM.leftHip]!, f[LM.rightHip]!);
const kneeAngle = (f: Frame, s: Side) => {
  const j = SIDES[s];
  return angle(f[j.hip]!, f[j.knee]!, f[j.ankle]!);
};

export const HOLDS: Record<HoldDetectorId, HoldSpec & { needs?: number[] }> = {
  hold_one_leg: {
    id: 'hold_one_leg',
    label: 'One-leg balance',
    joints: ['hip', 'ankle'],
    bilateral: false,
    fullBody: true,
    view: 'front_or_side',
    needs: [LM.leftAnkle, LM.rightAnkle],
    setupHint: 'Stand where your whole body and both feet are in view. The timer runs while one foot is off the floor.',
    holding: (f) => {
      const t = torso(f);
      return t > 1e-3 && Math.abs(f[LM.leftAnkle]!.y - f[LM.rightAnkle]!.y) / t > 0.12;
    },
    relaxedHolding: (f) => {
      const t = torso(f);
      return t > 1e-3 && Math.abs(f[LM.leftAnkle]!.y - f[LM.rightAnkle]!.y) / t > 0.07;
    },
  },
  hold_chest_open: {
    id: 'hold_chest_open',
    label: 'Chest stretch',
    joints: ['shoulder', 'wrist'],
    bilateral: false,
    fullBody: false,
    view: 'front',
    needs: [LM.leftWrist, LM.rightWrist],
    setupHint: 'Face the camera with your arms and shoulders in view. The timer runs while your arms are held out wide.',
    holding: (f) => {
      const w = Math.abs(f[LM.leftShoulder]!.x - f[LM.rightShoulder]!.x);
      return w > 0.02 && Math.abs(f[LM.leftWrist]!.x - f[LM.rightWrist]!.x) / w > 1.7;
    },
    relaxedHolding: (f) => {
      const w = Math.abs(f[LM.leftShoulder]!.x - f[LM.rightShoulder]!.x);
      return w > 0.02 && Math.abs(f[LM.leftWrist]!.x - f[LM.rightWrist]!.x) / w > 1.4;
    },
  },
  hold_twist: {
    id: 'hold_twist',
    label: 'Upper-body twist',
    joints: ['shoulder', 'hip'],
    bilateral: false,
    fullBody: false,
    view: 'front',
    setupHint: 'Face the camera with your shoulders and hips in view. The timer runs while your upper body is turned.',
    holding: (f) => {
      const t = torso(f);
      return t > 1e-3 && Math.abs(f[LM.leftShoulder]!.x - f[LM.rightShoulder]!.x) / t < 0.3;
    },
    relaxedHolding: (f) => {
      const t = torso(f);
      return t > 1e-3 && Math.abs(f[LM.leftShoulder]!.x - f[LM.rightShoulder]!.x) / t < 0.42;
    },
  },
  hold_calf_stretch: {
    id: 'hold_calf_stretch',
    label: 'Calf stretch',
    joints: ['hip', 'ankle'],
    bilateral: false,
    fullBody: true,
    view: 'side',
    needs: [LM.leftAnkle, LM.rightAnkle],
    setupHint: 'Stand side-on to the camera with both feet in view. The timer runs while one foot is stepped well back.',
    holding: (f) => {
      const t = torso(f);
      return t > 1e-3 && Math.abs(f[LM.leftAnkle]!.x - f[LM.rightAnkle]!.x) / t > 0.45;
    },
    relaxedHolding: (f) => {
      const t = torso(f);
      return t > 1e-3 && Math.abs(f[LM.leftAnkle]!.x - f[LM.rightAnkle]!.x) / t > 0.32;
    },
  },
  hold_ankle_stretch: {
    id: 'hold_ankle_stretch',
    label: 'Ankle stretch',
    joints: ['hip', 'knee', 'ankle'],
    bilateral: false,
    fullBody: false,
    view: 'side',
    setupHint: 'Sit side-on to the camera with your hips, knees and ankles in view. The timer runs while a leg is held out straight.',
    holding: (f, s) => kneeAngle(f, s) > 150 || kneeAngle(f, s === 'left' ? 'right' : 'left') > 150,
    relaxedHolding: (f, s) => kneeAngle(f, s) > 135 || kneeAngle(f, s === 'left' ? 'right' : 'left') > 135,
  },
  hold_side_bend: {
    id: 'hold_side_bend',
    label: 'Side bend',
    joints: ['shoulder', 'hip'],
    bilateral: false,
    fullBody: false,
    view: 'front',
    setupHint: 'Face the camera with your shoulders and hips in view. The timer runs while you lean to the side.',
    holding: (f) => {
      const sh = shoulderMid(f);
      const hp = hipMid(f);
      return (Math.atan2(Math.abs(sh.x - hp.x), Math.abs(hp.y - sh.y)) * 180) / Math.PI > 10;
    },
    relaxedHolding: (f) => {
      const sh = shoulderMid(f);
      const hp = hipMid(f);
      return (Math.atan2(Math.abs(sh.x - hp.x), Math.abs(hp.y - sh.y)) * 180) / Math.PI > 6;
    },
  },
  hold_neck_turn: {
    id: 'hold_neck_turn',
    label: 'Neck rotation',
    joints: ['shoulder'],
    bilateral: false,
    fullBody: false,
    view: 'front',
    setupHint: 'Face the camera with your head and shoulders in view. The timer runs while your head is turned.',
    holding: (f) => {
      const w = Math.abs(f[LM.leftShoulder]!.x - f[LM.rightShoulder]!.x);
      return w > 0.02 && Math.abs(f[LM.nose]!.x - shoulderMid(f).x) / w > 0.35;
    },
    relaxedHolding: (f) => {
      const w = Math.abs(f[LM.leftShoulder]!.x - f[LM.rightShoulder]!.x);
      return w > 0.02 && Math.abs(f[LM.nose]!.x - shoulderMid(f).x) / w > 0.22;
    },
  },
  hold_hamstring: {
    id: 'hold_hamstring',
    label: 'Seated hamstring stretch',
    joints: ['shoulder', 'hip'],
    bilateral: false,
    fullBody: false,
    view: 'side',
    setupHint: 'Sit side-on to the camera with your shoulders and hips in view. The timer runs while you lean forward from the hips.',
    holding: (f) => {
      const t = torso(f);
      return t > 1e-3 && Math.abs(shoulderMid(f).x - hipMid(f).x) / t > 0.22;
    },
    relaxedHolding: (f) => {
      const t = torso(f);
      return t > 1e-3 && Math.abs(shoulderMid(f).x - hipMid(f).x) / t > 0.14;
    },
  },
  hold_wall_sit: {
    id: 'hold_wall_sit',
    label: 'Wall sit',
    joints: ['hip', 'knee', 'ankle'],
    bilateral: false,
    fullBody: false,
    view: 'side',
    setupHint: 'Stand side-on to the camera with your hips, knees and ankles in view. The timer runs while your knees stay bent.',
    holding: (f, s) => {
      const a = kneeAngle(f, s);
      return a > 70 && a < 125;
    },
    relaxedHolding: (f, s) => {
      const a = kneeAngle(f, s);
      return a > 70 && a < 140;
    },
  },
  hold_tandem: {
    id: 'hold_tandem',
    label: 'Heel-to-toe stand',
    joints: ['hip', 'ankle'],
    bilateral: false,
    fullBody: true,
    view: 'side',
    needs: [LM.leftAnkle, LM.rightAnkle],
    setupHint: 'Stand side-on to the camera with both feet in view, one directly in front of the other, hand on support.',
    holding: (f) => {
      const t = torso(f);
      if (t < 1e-3) return false;
      const dx = Math.abs(f[LM.leftAnkle]!.x - f[LM.rightAnkle]!.x) / t;
      const dy = Math.abs(f[LM.leftAnkle]!.y - f[LM.rightAnkle]!.y) / t;
      return dx > 0.08 && dx < 0.4 && dy < 0.06;
    },
  },
};

export class HoldDetector implements Detector {
  readonly kind = 'hold' as const;
  readonly spec: (typeof HOLDS)[HoldDetectorId];
  private mode: RangeMode;
  private holding = false;
  private streak = 0;
  private heldMs = 0;
  private lastT: number | null = null;
  private badFrames = 0;
  private tracking: TrackingState = 'no_person';
  private side: Side = 'left';

  constructor(id: HoldDetectorId, mode: RangeMode = 'standard') {
    this.spec = HOLDS[id];
    this.mode = mode;
  }
  setMode(mode: RangeMode) {
    this.mode = mode;
  }
  adjust() {
    /* holds have no count to correct */
  }
  reset() {
    this.holding = false;
    this.streak = 0;
    this.heldMs = 0;
    this.lastT = null;
    this.badFrames = 0;
  }

  update(frame: Frame | null, tMs: number): CounterSnapshot {
    const dt = this.lastT === null ? 0 : Math.min(250, tMs - this.lastT);
    this.lastT = tMs;
    const position = assessPosition(frame, this.spec);
    let reliable = false;
    if (frame && frame.length >= 33) {
      this.side = bestSide(frame, this.spec.joints);
      reliable = minVisibility(frame, requiredIndices(this.spec, this.side)) >= MIN_VISIBILITY;
    }
    if (!reliable) {
      this.badFrames++;
      this.tracking = this.badFrames >= LOST_AFTER_FRAMES ? (frame ? 'lost' : 'no_person') : 'low_confidence';
      if (this.badFrames >= LOST_AFTER_FRAMES) {
        this.holding = false;
        this.streak = 0;
      }
    } else {
      this.badFrames = 0;
      this.tracking = 'ok';
      const check = this.mode === 'reduced' && this.spec.relaxedHolding ? this.spec.relaxedHolding : this.spec.holding;
      const now = check(frame!, this.side);
      if (now) this.streak = Math.max(0, this.streak) + 1;
      else this.streak = Math.min(0, this.streak) - 1;
      if (!this.holding && this.streak >= ENTER_FRAMES) this.holding = true;
      if (this.holding && this.streak <= -EXIT_FRAMES) this.holding = false;
    }
    if (this.holding && this.tracking === 'ok') this.heldMs += dt;
    return {
      kind: 'hold',
      progress: this.holding ? 1 : Math.max(0, Math.min(0.9, this.streak / (ENTER_FRAMES + 1))),
      holding: this.holding && this.tracking === 'ok',
      heldMs: this.heldMs,
      count: 0,
      partials: 0,
      phase: this.holding ? 'bottom' : 'idle',
      tracking: this.tracking,
      side: this.side,
      metric: null,
      messages: position.messages,
      cue: null,
      events: [],
    };
  }
}

// ───────────────────────────── movement ─────────────────────────────

interface ActivitySpec extends PositionSpec {
  id: ActivityDetectorId;
  label: string;
  setupHint: string;
  /** Landmark indices whose motion counts. */
  points: number[];
  joints: PositionSpec['joints'];
}

export const ACTIVITIES: Record<ActivityDetectorId, ActivitySpec> = {
  activity_legs: {
    id: 'activity_legs',
    label: 'Leg movement',
    joints: ['hip', 'knee'],
    bilateral: false,
    fullBody: false,
    view: 'front_or_side',
    points: [LM.leftKnee, LM.rightKnee, LM.leftAnkle, LM.rightAnkle],
    setupHint: 'Stand or sit with your hips and legs in view. The timer runs while you are moving.',
  },
  activity_arms: {
    id: 'activity_arms',
    label: 'Arm movement',
    joints: ['shoulder', 'elbow', 'wrist'],
    bilateral: false,
    fullBody: false,
    view: 'front_or_side',
    points: [LM.leftWrist, LM.rightWrist, LM.leftElbow, LM.rightElbow],
    setupHint: 'Face the camera with your arms and shoulders in view. The timer runs while you are moving.',
  },
  activity_body: {
    id: 'activity_body',
    label: 'Body movement',
    joints: ['shoulder', 'hip'],
    bilateral: false,
    fullBody: false,
    view: 'front_or_side',
    points: [LM.leftKnee, LM.rightKnee, LM.leftAnkle, LM.rightAnkle, LM.leftWrist, LM.rightWrist, LM.leftElbow, LM.rightElbow, LM.leftHip, LM.rightHip],
    setupHint: 'Keep your upper body and legs in view. The timer runs while you are moving.',
  },
};

const WINDOW_MS = 1500;
const MOVE_THRESHOLD = 0.12; // torso-lengths of travel inside the window
const STILL_AFTER_MS = 1200;

export class ActivityDetector implements Detector {
  readonly kind = 'activity' as const;
  readonly spec: ActivitySpec;
  private history: { t: number; torso: number; pts: { x: number; y: number }[] }[] = [];
  private active = false;
  private lastMoveAt = -Infinity;
  private activeMs = 0;
  private lastT: number | null = null;
  private badFrames = 0;
  private tracking: TrackingState = 'no_person';
  private side: Side = 'left';
  private energy = 0;
  private mode: RangeMode = 'standard';

  constructor(id: ActivityDetectorId, mode: RangeMode = 'standard') {
    this.spec = ACTIVITIES[id];
    this.mode = mode;
  }
  setMode(mode: RangeMode) {
    this.mode = mode;
  }
  adjust() {
    /* nothing to correct */
  }
  reset() {
    this.history = [];
    this.active = false;
    this.lastMoveAt = -Infinity;
    this.activeMs = 0;
    this.lastT = null;
    this.badFrames = 0;
    this.energy = 0;
  }

  update(frame: Frame | null, tMs: number): CounterSnapshot {
    const dt = this.lastT === null ? 0 : Math.min(250, tMs - this.lastT);
    this.lastT = tMs;
    const position = assessPosition(frame, this.spec);
    let reliable = false;
    if (frame && frame.length >= 33) {
      this.side = bestSide(frame, this.spec.joints);
      reliable = minVisibility(frame, requiredIndices(this.spec, this.side)) >= MIN_VISIBILITY;
    }
    if (!reliable) {
      this.badFrames++;
      this.tracking = this.badFrames >= LOST_AFTER_FRAMES ? (frame ? 'lost' : 'no_person') : 'low_confidence';
      if (this.badFrames >= LOST_AFTER_FRAMES) {
        this.history = [];
        this.active = false;
      }
    } else {
      this.badFrames = 0;
      this.tracking = 'ok';
      const f = frame!;
      const t = torso(f);
      if (t > 1e-3) {
        this.history.push({ t: tMs, torso: t, pts: this.spec.points.map((i) => ({ x: f[i]!.x, y: f[i]!.y })) });
        while (this.history.length > 1 && tMs - this.history[0]!.t > WINDOW_MS) this.history.shift();
        // Scale by the AVERAGE torso length in the window, so frame-to-frame wobble in the torso
        // measurement itself can't masquerade as movement.
        const scale = this.history.reduce((a, h) => a + h.torso, 0) / this.history.length;
        // Largest travel of any tracked point inside the window.
        let best = 0;
        for (let k = 0; k < this.spec.points.length; k++) {
          let minX = Infinity;
          let maxX = -Infinity;
          let minY = Infinity;
          let maxY = -Infinity;
          for (const h of this.history) {
            const p = h.pts[k]!;
            minX = Math.min(minX, p.x);
            maxX = Math.max(maxX, p.x);
            minY = Math.min(minY, p.y);
            maxY = Math.max(maxY, p.y);
          }
          best = Math.max(best, Math.hypot(maxX - minX, maxY - minY) / scale);
        }
        this.energy = best;
        const needed = this.mode === 'reduced' ? MOVE_THRESHOLD * 0.6 : MOVE_THRESHOLD;
        if (best > needed) this.lastMoveAt = tMs;
        this.active = tMs - this.lastMoveAt < STILL_AFTER_MS;
      }
    }
    const moving = this.active && this.tracking === 'ok';
    if (moving) this.activeMs += dt;
    return {
      kind: 'activity',
      progress: Math.min(1, this.energy / (MOVE_THRESHOLD * 2)),
      holding: moving,
      heldMs: this.activeMs,
      count: 0,
      partials: 0,
      phase: moving ? 'bottom' : 'idle',
      tracking: this.tracking,
      side: this.side,
      metric: this.energy,
      messages: position.messages,
      cue: null,
      events: [],
    };
  }
}

// ───────────────────────────── registry ─────────────────────────────

export function detectorKind(id: DetectorId): 'rep' | 'hold' | 'activity' {
  if (id in HOLDS) return 'hold';
  if (id in ACTIVITIES) return 'activity';
  return 'rep';
}

export function createDetector(id: DetectorId, mode: RangeMode = 'standard'): Detector {
  const kind = detectorKind(id);
  if (kind === 'hold') return new HoldDetector(id as HoldDetectorId, mode);
  if (kind === 'activity') return new ActivityDetector(id as ActivityDetectorId, mode);
  return new RepCounter(id as RepCounterId, mode);
}

export interface DetectorInfo {
  kind: 'rep' | 'hold' | 'activity';
  label: string;
  setupHint: string;
  view: 'front' | 'side' | 'front_or_side';
}

export function detectorInfo(id: DetectorId): DetectorInfo {
  const kind = detectorKind(id);
  if (kind === 'hold') {
    const s = HOLDS[id as HoldDetectorId];
    return { kind, label: s.label, setupHint: s.setupHint, view: s.view };
  }
  if (kind === 'activity') {
    const s = ACTIVITIES[id as ActivityDetectorId];
    return { kind, label: s.label, setupHint: s.setupHint, view: s.view };
  }
  const s = COUNTERS[id as RepCounterId];
  return { kind, label: s.label, setupHint: s.setupHint, view: s.view };
}

export { estimateView };

/** Position/visibility guidance for any detector, without running it (used for the "get in position" preview). */
export function assessFor(id: DetectorId, frame: Frame | null) {
  const kind = detectorKind(id);
  const spec: PositionSpec = kind === 'hold' ? HOLDS[id as HoldDetectorId] : kind === 'activity' ? ACTIVITIES[id as ActivityDetectorId] : COUNTERS[id as RepCounterId];
  return assessPosition(frame, spec);
}
