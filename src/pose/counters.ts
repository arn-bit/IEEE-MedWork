import type { RepCounterId } from '../domain/types';
import { EXTRA_COUNTERS } from './counters.extra';
import { LM, OneEuro, SIDES, angle, bestSide, dist, estimateView, mid, minVisibility, sideIdx, vis, type Frame, type Joint, type Side } from './geometry';

/**
 * Exercise-specific repetition counters.
 *
 * Each counter is a hysteresis state machine over a smoothed joint metric:
 *   idle → ready (held start position) → bottom (passed the "enter" threshold) → ready (+1 rep)
 * A rep only counts after a full cycle; each state change must persist for several consecutive frames,
 * reps faster than `minRepMs` are rejected as jitter, and losing tracking resets to `idle`
 * (so a rep is never counted across a gap in tracking).
 *
 * Thresholds were chosen from typical joint angles and tuned on simulated landmark sequences.
 * They are NOT validated against clinical motion capture — see SAFETY_AND_EVIDENCE.md §4.
 */

export type RangeMode = 'standard' | 'reduced';
export type Phase = 'idle' | 'ready' | 'bottom';
export type TrackingState = 'ok' | 'low_confidence' | 'lost' | 'no_person';

export const MIN_VISIBILITY = 0.65;
const LOST_AFTER_FRAMES = 4;
const DWELL_FRAMES = 3;
const CUE_COOLDOWN_MS = 8000;
const QUICK_REP_MS = 1100;

export interface Cue {
  id: string;
  text: string;
  kind: 'technique' | 'tempo' | 'range';
}

interface Ctx {
  baseline: Map<Side, number>;
  startTrunkTilt: number | null;
}

export interface CounterSpec {
  id: RepCounterId;
  label: string;
  joints: Joint[];
  bilateral: boolean;
  fullBody: boolean;
  view: 'front' | 'side' | 'front_or_side';
  start: 'high' | 'low';
  /** Thresholds are relative to a resting baseline measured while still. */
  relative: boolean;
  /** 'ratio' (default): thresholds multiply the baseline. 'delta': thresholds are offsets from it. */
  baselineMode?: 'ratio' | 'delta';
  /** Extra landmark indices that must be visible (e.g. both ankles). */
  needs?: number[];
  thresholds: Record<RangeMode, { enter: number; exit: number }>;
  minRepMs: number;
  metric(frame: Frame, side: Side): number | null;
  /** Technique check evaluated on reliable frames while in the given phase. Returns a cue id when the condition is met. */
  form?: { phase: Phase; check(frame: Frame, side: Side, ctx: Ctx): Cue | null };
  setupHint: string;
  metricLabel: string;
}

const kneeAngle = (f: Frame, s: Side) => {
  const j = SIDES[s];
  const v = angle(f[j.hip]!, f[j.knee]!, f[j.ankle]!);
  return Number.isNaN(v) ? null : v;
};

function trunkTilt(f: Frame): number {
  // Angle of the shoulder-mid → hip-mid line from vertical, in degrees.
  const sh = mid(f[LM.leftShoulder]!, f[LM.rightShoulder]!);
  const hp = mid(f[LM.leftHip]!, f[LM.rightHip]!);
  return (Math.atan2(Math.abs(sh.x - hp.x), Math.abs(hp.y - sh.y)) * 180) / Math.PI;
}

const BASE_COUNTERS: Record<'squat' | 'sit_to_stand' | 'wall_pushup' | 'arm_raise' | 'march', CounterSpec> = {
  squat: {
    id: 'squat',
    label: 'Squat',
    joints: ['hip', 'knee', 'ankle'],
    bilateral: false,
    fullBody: true,
    view: 'front_or_side',
    start: 'high',
    relative: false,
    thresholds: { standard: { enter: 125, exit: 160 }, reduced: { enter: 148, exit: 163 } },
    minRepMs: 600,
    metric: kneeAngle,
    metricLabel: 'Tracked knee angle',
    form: {
      phase: 'bottom',
      check(f) {
        if (estimateView(f) !== 'front') return null; // only meaningful facing the camera
        const lk = f[LM.leftKnee]!;
        const rk = f[LM.rightKnee]!;
        const la = f[LM.leftAnkle]!;
        const ra = f[LM.rightAnkle]!;
        const kneeGap = Math.abs(lk.x - rk.x);
        const ankleGap = Math.abs(la.x - ra.x);
        if (ankleGap > 0.04 && kneeGap < ankleGap * 0.75) {
          return { id: 'knees_in', kind: 'technique', text: 'Your tracked knees appear to move inward. Try a slower rep, keeping your knees in line with your toes, if comfortable.' };
        }
        return null;
      },
    },
    setupHint: 'Stand facing the camera or side-on, 2–3 m away, so your head, hips, knees and ankles are all in view.',
  },
  sit_to_stand: {
    id: 'sit_to_stand',
    label: 'Sit-to-stand',
    joints: ['hip', 'knee', 'ankle'],
    bilateral: false,
    fullBody: true,
    view: 'side',
    start: 'low',
    relative: false,
    thresholds: { standard: { enter: 155, exit: 115 }, reduced: { enter: 145, exit: 120 } },
    minRepMs: 900,
    metric: kneeAngle,
    metricLabel: 'Tracked knee angle',
    setupHint: 'Place the camera side-on to your chair, 2–3 m away, so your head, hips, knees and ankles are visible while seated and standing.',
  },
  wall_pushup: {
    id: 'wall_pushup',
    label: 'Wall press-up',
    joints: ['shoulder', 'elbow', 'wrist', 'hip'],
    bilateral: false,
    fullBody: false,
    view: 'side',
    start: 'high',
    relative: false,
    thresholds: { standard: { enter: 115, exit: 150 }, reduced: { enter: 130, exit: 152 } },
    minRepMs: 600,
    metric(f, s) {
      const j = SIDES[s];
      const v = angle(f[j.shoulder]!, f[j.elbow]!, f[j.wrist]!);
      return Number.isNaN(v) ? null : v;
    },
    metricLabel: 'Tracked elbow angle',
    form: {
      phase: 'bottom',
      check(f, s) {
        const j = SIDES[s];
        if (vis(f[j.ankle]) < MIN_VISIBILITY) return null;
        const body = angle(f[j.shoulder]!, f[j.hip]!, f[j.ankle]!);
        if (body < 155) {
          return { id: 'hips_line', kind: 'technique', text: 'Your tracked hips appear out of line with your shoulders and ankles. Try keeping a straight line from head to heels, if comfortable.' };
        }
        return null;
      },
    },
    setupHint: 'Stand side-on to the camera so your shoulder, elbow, wrist and hip on the camera side are clearly visible.',
  },
  arm_raise: {
    id: 'arm_raise',
    label: 'Arm raise',
    joints: ['shoulder', 'elbow', 'wrist', 'hip'],
    bilateral: false,
    fullBody: false,
    view: 'front_or_side',
    start: 'low',
    relative: false,
    thresholds: { standard: { enter: 140, exit: 45 }, reduced: { enter: 95, exit: 40 } },
    minRepMs: 700,
    metric(f, s) {
      const j = SIDES[s];
      const v = angle(f[j.hip]!, f[j.shoulder]!, f[j.wrist]!);
      return Number.isNaN(v) ? null : v;
    },
    metricLabel: 'Tracked shoulder angle',
    form: {
      phase: 'bottom',
      check(f, _s, ctx) {
        if (ctx.startTrunkTilt === null) return null;
        if (trunkTilt(f) - ctx.startTrunkTilt > 14) {
          return { id: 'trunk_lean', kind: 'technique', text: 'Your tracked upper body appears to lean as you lift. Try raising only as high as is comfortable without leaning.' };
        }
        return null;
      },
    },
    setupHint: 'Sit or stand facing the camera with your shoulders, elbows, wrists and hips in view.',
  },
  march: {
    id: 'march',
    label: 'Knee lifts',
    joints: ['hip', 'knee'],
    bilateral: true,
    fullBody: true,
    view: 'front',
    start: 'high',
    relative: true,
    // Metric is vertical knee-below-hip distance relative to torso length, as a fraction of the standing baseline.
    thresholds: { standard: { enter: 0.62, exit: 0.85 }, reduced: { enter: 0.75, exit: 0.9 } },
    minRepMs: 350,
    metric(f, s) {
      const j = SIDES[s];
      const torso = dist(mid(f[LM.leftShoulder]!, f[LM.rightShoulder]!), mid(f[LM.leftHip]!, f[LM.rightHip]!));
      if (torso < 1e-3) return null;
      return (f[j.knee]!.y - f[j.hip]!.y) / torso;
    },
    metricLabel: 'Tracked knee height',
    setupHint: 'Face the camera, 2–3 m away, with your whole body in view.',
  },
};

export const COUNTERS: Record<RepCounterId, CounterSpec> = { ...BASE_COUNTERS, ...EXTRA_COUNTERS };

// ───────────────────────────── Positioning ─────────────────────────────

const JOINT_NAME: Record<Joint, string> = { shoulder: 'shoulder', elbow: 'elbow', wrist: 'wrist', hip: 'hip', knee: 'knee', ankle: 'ankle', heel: 'heel', toe: 'foot' };

export function requiredIndices(spec: PositionSpec, side: Side): number[] {
  const idx = spec.bilateral ? [...sideIdx('left', spec.joints), ...sideIdx('right', spec.joints)] : sideIdx(side, spec.joints);
  // Torso landmarks are needed for scale/tilt; the head must be visible per the model card.
  return [...new Set([...idx, ...(spec.needs ?? []), LM.leftShoulder, LM.rightShoulder, LM.leftHip, LM.rightHip, LM.nose])];
}

export interface PositionAssessment {
  ok: boolean;
  messages: string[];
  view: 'front' | 'side' | 'unknown';
}

export type PositionSpec = Pick<CounterSpec, 'joints' | 'bilateral' | 'fullBody' | 'view'> & { needs?: number[] };

export function assessPosition(frame: Frame | null, spec: PositionSpec): PositionAssessment {
  if (!frame || frame.length < 33) return { ok: false, messages: ['No body detected. Make sure you are in view, in good light, and the only person in the frame.'], view: 'unknown' };
  const messages: string[] = [];
  const side = bestSide(frame, spec.joints);
  if (vis(frame[LM.nose]) < 0.5) messages.push('Keep your head in view — tracking needs it.');
  const hidden = spec.joints.filter((j) => {
    const sides: Side[] = spec.bilateral ? ['left', 'right'] : [side];
    return sides.some((s) => vis(frame[SIDES[s][j]]) < MIN_VISIBILITY);
  });
  if (hidden.length) messages.push(`I can't clearly see your ${[...new Set(hidden.map((j) => JOINT_NAME[j] + 's'))].join(', ')}. Adjust the camera or step back so they are in view.`);
  const req = requiredIndices(spec, side);
  const atEdge = req.some((i) => {
    const p = frame[i]!;
    return vis(p) >= MIN_VISIBILITY && (p.x < 0.02 || p.x > 0.98 || p.y < 0.02 || p.y > 0.98);
  });
  if (atEdge) messages.push('Part of your body is at the edge of the frame. Move toward the centre.');
  if (spec.fullBody) {
    const top = frame[LM.nose]!.y;
    const bottom = Math.max(frame[LM.leftAnkle]!.y, frame[LM.rightAnkle]!.y);
    if (bottom - top < 0.3 && vis(frame[LM.leftAnkle]) > 0.5) messages.push('You look far away. Move a little closer (within about 4 m / 13 ft).');
  }
  const view = estimateView(frame);
  if (spec.view === 'side' && view === 'front') messages.push('Turn side-on to the camera for this exercise.');
  if (spec.view === 'front' && view === 'side') messages.push('Face the camera for this exercise.');
  return { ok: messages.length === 0, messages, view };
}

// ───────────────────────────── State machine ─────────────────────────────

interface SideState {
  phase: Phase;
  dwell: number;
  leaveStartAt: number | null;
  extreme: number | null;
  baselineSamples: number[];
  filter: OneEuro;
  cueFrames: Map<string, number>;
  cueThisRep: boolean;
  value: number | null;
}

export type DetectorKind = 'rep' | 'hold' | 'activity';

export interface CounterSnapshot {
  /** What this detector measures: reps, a held position, or movement. */
  kind: DetectorKind;
  /** 0..1: how far the current movement is toward counting (rep), or 1 while held/active. */
  progress: number;
  /** hold/activity: whether the position is being held / you are moving right now. */
  holding: boolean;
  /** hold/activity: total milliseconds of valid hold/movement so far. */
  heldMs: number;
  count: number;
  partials: number;
  phase: Phase;
  tracking: TrackingState;
  side: Side;
  metric: number | null;
  messages: string[];
  cue: Cue | null;
  events: ('rep' | 'partial' | 'lost' | 'cue')[];
}

export class RepCounter {
  readonly kind = 'rep' as const;
  readonly spec: CounterSpec;
  private mode: RangeMode;
  private count = 0;
  private partials = 0;
  private badFrames = 0;
  private tracking: TrackingState = 'no_person';
  private side: Side = 'left';
  private sides = new Map<Side, SideState>();
  private ctx: Ctx = { baseline: new Map(), startTrunkTilt: null };
  private lastCueAt = new Map<string, number>();
  private cue: Cue | null = null;

  constructor(id: RepCounterId, mode: RangeMode = 'standard') {
    this.spec = COUNTERS[id];
    this.mode = mode;
    this.resetSides();
  }

  private resetSides() {
    for (const s of ['left', 'right'] as Side[]) {
      this.sides.set(s, {
        phase: 'idle',
        dwell: 0,
        leaveStartAt: null,
        extreme: null,
        baselineSamples: [],
        filter: new OneEuro(),
        cueFrames: new Map(),
        cueThisRep: false,
        value: null,
      });
    }
    this.ctx.baseline.clear();
    this.ctx.startTrunkTilt = null;
  }

  setMode(mode: RangeMode) {
    this.mode = mode;
  }

  /** Manual correction (e.g. a missed or extra count). Never goes below zero. */
  adjust(delta: number) {
    this.count = Math.max(0, this.count + delta);
  }

  reset() {
    this.count = 0;
    this.partials = 0;
    this.badFrames = 0;
    this.cue = null;
    this.lastCueAt.clear();
    this.resetSides();
  }

  get value() {
    return this.count;
  }

  private thresholds(side: Side) {
    const t = this.spec.thresholds[this.mode];
    if (!this.spec.relative) return t;
    const b = this.ctx.baseline.get(side);
    if (b === undefined) return null;
    if (this.spec.baselineMode === 'delta') return { enter: b + t.enter, exit: b + t.exit };
    return { enter: t.enter * b, exit: t.exit * b };
  }

  /** Process one frame of landmarks (or null when no person was detected). */
  update(frame: Frame | null, tMs: number): CounterSnapshot {
    const events: CounterSnapshot['events'] = [];
    const position = assessPosition(frame, this.spec);
    if (!frame || frame.length < 33) {
      this.markBad(events, 'no_person');
      return this.snapshot(position.messages, events);
    }

    if (!this.spec.bilateral) {
      // Keep the chosen side stable unless it becomes clearly worse.
      const best = bestSide(frame, this.spec.joints);
      const cur = minVisibility(frame, sideIdx(this.side, this.spec.joints));
      const alt = minVisibility(frame, sideIdx(best, this.spec.joints));
      if (best !== this.side && (cur < MIN_VISIBILITY || alt - cur > 0.2)) {
        this.side = best;
        this.resetSides();
      }
    }

    const reliable = minVisibility(frame, requiredIndices(this.spec, this.side)) >= MIN_VISIBILITY;
    if (!reliable) {
      this.markBad(events, 'low_confidence');
      return this.snapshot(position.messages, events);
    }
    this.badFrames = 0;
    this.tracking = 'ok';

    const sides: Side[] = this.spec.bilateral ? ['left', 'right'] : [this.side];
    for (const s of sides) this.step(frame, s, tMs, events);
    return this.snapshot(position.messages, events);
  }

  private markBad(events: CounterSnapshot['events'], state: TrackingState) {
    this.badFrames++;
    if (this.badFrames >= LOST_AFTER_FRAMES) {
      if (this.tracking === 'ok' || this.tracking === 'low_confidence') events.push('lost');
      this.tracking = state === 'no_person' ? 'no_person' : 'lost';
      // Conservative: never complete a rep across a tracking gap.
      for (const st of this.sides.values()) {
        st.phase = 'idle';
        st.dwell = 0;
        st.leaveStartAt = null;
        st.extreme = null;
        st.filter.reset();
      }
    } else {
      this.tracking = 'low_confidence';
    }
  }

  private step(frame: Frame, side: Side, tMs: number, events: CounterSnapshot['events']) {
    const st = this.sides.get(side)!;
    const raw = this.spec.metric(frame, side);
    if (raw === null) return;
    const v = st.filter.filter(raw, tMs);
    st.value = v;
    const high = this.spec.start === 'high';

    if (st.phase === 'idle') {
      if (this.spec.relative) {
        st.baselineSamples.push(v);
        if (st.baselineSamples.length > 10) st.baselineSamples.shift();
        if (st.baselineSamples.length >= 8) {
          const sorted = [...st.baselineSamples].sort((a, b) => a - b);
          const median = sorted[Math.floor(sorted.length / 2)]!;
          const spread = sorted[sorted.length - 1]! - sorted[0]!;
          const stable = this.spec.baselineMode === 'delta' ? spread < 0.04 : median > 0.2 && spread < median * 0.15;
          if (stable) this.ctx.baseline.set(side, median);
        }
      }
      const t = this.thresholds(side);
      if (!t) return;
      const inStart = high ? v >= t.exit : v <= t.exit;
      st.dwell = inStart ? st.dwell + 1 : 0;
      if (st.dwell >= DWELL_FRAMES) {
        st.phase = 'ready';
        st.dwell = 0;
        st.extreme = null;
        if (this.ctx.startTrunkTilt === null) this.ctx.startTrunkTilt = trunkTilt(frame);
      }
      return;
    }

    const t = this.thresholds(side)!;
    if (st.phase === 'ready') {
      const outOfStart = high ? v < t.exit : v > t.exit;
      if (outOfStart) {
        if (st.leaveStartAt === null) st.leaveStartAt = tMs;
        st.extreme = st.extreme === null ? v : high ? Math.min(st.extreme, v) : Math.max(st.extreme, v);
      }
      const passedEnter = high ? v <= t.enter : v >= t.enter;
      st.dwell = passedEnter ? st.dwell + 1 : 0;
      if (st.dwell >= DWELL_FRAMES) {
        st.phase = 'bottom';
        st.dwell = 0;
        st.cueThisRep = false;
        st.cueFrames.clear();
        return;
      }
      // Returned to start without reaching the counting range → partial rep (not counted).
      if (!outOfStart && st.leaveStartAt !== null) {
        const travelled = st.extreme === null ? 0 : Math.abs(st.extreme - t.exit) / Math.abs(t.enter - t.exit);
        if (travelled > 0.45) {
          this.partials++;
          events.push('partial');
          this.emitCue(
            { id: 'partial', kind: 'range', text: 'That movement did not reach the counting range, so it was not counted. If your comfortable range is smaller, switch to “reduced range” or count manually.' },
            tMs,
            events,
          );
        }
        st.leaveStartAt = null;
        st.extreme = null;
      }
      return;
    }

    // bottom
    if (this.spec.form && this.spec.form.phase === 'bottom' && !st.cueThisRep) {
      const c = this.spec.form.check(frame, side, this.ctx);
      if (c) {
        const n = (st.cueFrames.get(c.id) ?? 0) + 1;
        st.cueFrames.set(c.id, n);
        if (n >= 3) {
          st.cueThisRep = true;
          this.emitCue(c, tMs, events);
        }
      }
    }
    const back = high ? v >= t.exit : v <= t.exit;
    st.dwell = back ? st.dwell + 1 : 0;
    if (st.dwell >= DWELL_FRAMES) {
      const started = st.leaveStartAt ?? tMs;
      const duration = tMs - started;
      st.phase = 'ready';
      st.dwell = 0;
      st.leaveStartAt = null;
      st.extreme = null;
      if (duration >= this.spec.minRepMs) {
        this.count++;
        events.push('rep');
        if (duration < QUICK_REP_MS && !this.spec.bilateral) {
          this.emitCue({ id: 'tempo', kind: 'tempo', text: 'That rep looked quick. Slowing down a little can help you stay in control.' }, tMs, events);
        }
      }
    }
  }

  private emitCue(c: Cue, tMs: number, events: CounterSnapshot['events']) {
    const last = this.lastCueAt.get(c.id);
    if (last !== undefined && tMs - last < CUE_COOLDOWN_MS) return;
    this.lastCueAt.set(c.id, tMs);
    this.cue = c;
    events.push('cue');
  }

  private snapshot(messages: string[], events: CounterSnapshot['events']): CounterSnapshot {
    const primary = this.sides.get(this.spec.bilateral ? 'left' : this.side)!;
    const phase: Phase = this.spec.bilateral
      ? ([...this.sides.values()].find((s) => s.phase === 'bottom')?.phase ?? primary.phase)
      : primary.phase;
    // Form cues are suppressed whenever tracking is not reliable.
    const cue = this.tracking === 'ok' ? this.cue : null;
    let progress = 0;
    for (const side of this.spec.bilateral ? (['left', 'right'] as Side[]) : [this.side]) {
      const t = this.thresholds(side);
      const v = this.sides.get(side)!.value;
      if (!t || v === null) continue;
      const high = this.spec.start === 'high';
      const p = high ? (t.exit - v) / (t.exit - t.enter) : (v - t.exit) / (t.enter - t.exit);
      progress = Math.max(progress, Math.min(1, Math.max(0, p)));
    }
    if (this.tracking !== 'ok') progress = 0;
    return {
      kind: 'rep',
      progress,
      holding: false,
      heldMs: 0,
      count: this.count,
      partials: this.partials,
      phase,
      tracking: this.tracking,
      side: this.side,
      metric: primary.value,
      messages,
      cue,
      events,
    };
  }
}
