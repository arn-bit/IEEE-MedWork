import { LM, type Point } from '../geometry';

/**
 * Deterministic synthetic landmark generator for unit tests.
 * Produces a 33-point frame in normalized image coordinates (y grows downward) whose joint angles
 * match the requested parameters. Used ONLY to test counting logic; it says nothing about how
 * well the real model tracks real people.
 */

export interface BodyParams {
  view?: 'front' | 'side';
  kneeAngle?: number; // hip-knee-ankle, both legs
  shoulderAngle?: number; // hip-shoulder-wrist (arm raise), both arms
  elbowAngle?: number; // shoulder-elbow-wrist (push-up), both arms, arm pointing forward
  kneeLift?: { left?: number; right?: number }; // 0 = standing, 1 = knee at hip height
  kneesInward?: boolean;
  trunkLean?: number; // degrees from vertical
  visibility?: number;
  hidden?: number[]; // landmark indices with visibility 0.1
  noise?: number; // max uniform jitter added to x/y
  seed?: number;
}

const THIGH = 0.19;
const SHIN = 0.19;
const TORSO = 0.24;
const UPPER_ARM = 0.13;
const FOREARM = 0.12;

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

/** Knee position for an isosceles hip–knee–ankle triangle with the given interior angle. */
function kneeFor(hip: Point, ankle: Point, angleDeg: number, nx: number, ny: number): Point {
  const mx = (hip.x + ankle.x) / 2;
  const my = (hip.y + ankle.y) / 2;
  const half = (angleDeg * Math.PI) / 360;
  const h = THIGH * Math.cos(half);
  return { x: mx + nx * h, y: my + ny * h };
}

export function makeBody(p: BodyParams = {}): Point[] {
  const view = p.view ?? 'front';
  const kneeAngle = p.kneeAngle ?? 178;
  const visibility = p.visibility ?? 0.95;
  const pts: Point[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.2, z: 0, visibility }));
  const set = (i: number, x: number, y: number) => {
    pts[i] = { x, y, z: 0, visibility };
  };

  const floorY = 0.9;
  const legSpan = 2 * THIGH * Math.sin((kneeAngle * Math.PI) / 360); // hip–ankle distance
  const hipY = floorY - legSpan;
  const halfHip = view === 'front' ? 0.06 : 0.008;
  const halfAnkle = view === 'front' ? 0.07 : 0.008;
  const halfShoulder = view === 'front' ? 0.09 : 0.01;
  const lean = ((p.trunkLean ?? 0) * Math.PI) / 180;

  for (const [side, sx] of [
    ['left', 1],
    ['right', -1],
  ] as const) {
    const hip = { x: 0.5 + sx * halfHip, y: hipY };
    const ankle = { x: 0.5 + sx * halfAnkle, y: floorY };
    let knee: Point;
    if (view === 'side') {
      knee = kneeFor(hip, ankle, kneeAngle, 1, 0); // knees forward (+x)
    } else {
      const dir = p.kneesInward ? -sx : sx; // outward normally, inward if requested
      knee = kneeFor(hip, ankle, kneeAngle, dir, 0);
    }
    const lift = p.kneeLift?.[side] ?? 0;
    if (lift > 0) {
      // Raise the knee toward hip height; the shin hangs below it.
      const standingKneeY = hip.y + THIGH;
      const ky = standingKneeY - lift * THIGH;
      knee = { x: hip.x, y: ky };
      ankle.y = ky + SHIN * 0.95;
    }
    const hipIdx = side === 'left' ? LM.leftHip : LM.rightHip;
    const kneeIdx = side === 'left' ? LM.leftKnee : LM.rightKnee;
    const ankleIdx = side === 'left' ? LM.leftAnkle : LM.rightAnkle;
    set(hipIdx, hip.x, hip.y);
    set(kneeIdx, knee.x, knee.y);
    set(ankleIdx, ankle.x, ankle.y);
    // heels / feet
    set(side === 'left' ? 29 : 30, ankle.x, ankle.y + 0.01);
    set(side === 'left' ? 31 : 32, ankle.x + (view === 'side' ? 0.04 : 0), ankle.y + 0.015);

    const shoulder = { x: 0.5 + sx * halfShoulder + Math.sin(lean) * TORSO, y: hipY - Math.cos(lean) * TORSO };
    set(side === 'left' ? LM.leftShoulder : LM.rightShoulder, shoulder.x, shoulder.y);

    // Arms
    let elbow: Point;
    let wrist: Point;
    if (p.elbowAngle !== undefined) {
      // Upper arm points forward-down slightly; forearm folds by elbow angle (side view push-up).
      const a0 = (10 * Math.PI) / 180;
      elbow = { x: shoulder.x + Math.cos(a0) * UPPER_ARM, y: shoulder.y + Math.sin(a0) * UPPER_ARM };
      const fold = Math.PI - (p.elbowAngle * Math.PI) / 180;
      const dirA = a0 - fold; // rotate upward
      wrist = { x: elbow.x + Math.cos(dirA) * FOREARM, y: elbow.y + Math.sin(dirA) * FOREARM };
    } else {
      const sa = ((p.shoulderAngle ?? 15) * Math.PI) / 180;
      // Angle measured from the actual shoulder→hip direction, rotating outward (front) or forward (side).
      const ox = view === 'front' ? sx : 1;
      const bx = hip.x - shoulder.x;
      const by = hip.y - shoulder.y;
      const bl = Math.hypot(bx, by);
      const phi = -sa * ox;
      const dx = (bx * Math.cos(phi) - by * Math.sin(phi)) / bl;
      const dy = (bx * Math.sin(phi) + by * Math.cos(phi)) / bl;
      elbow = { x: shoulder.x + dx * UPPER_ARM, y: shoulder.y + dy * UPPER_ARM };
      wrist = { x: shoulder.x + dx * (UPPER_ARM + FOREARM), y: shoulder.y + dy * (UPPER_ARM + FOREARM) };
    }
    set(side === 'left' ? LM.leftElbow : LM.rightElbow, elbow.x, elbow.y);
    set(side === 'left' ? LM.leftWrist : LM.rightWrist, wrist.x, wrist.y);
    for (const i of side === 'left' ? [17, 19, 21] : [18, 20, 22]) set(i, wrist.x, wrist.y + 0.01);
  }

  const sh = { x: (pts[LM.leftShoulder]!.x + pts[LM.rightShoulder]!.x) / 2, y: pts[LM.leftShoulder]!.y };
  set(LM.nose, sh.x, sh.y - 0.1);
  for (let i = 1; i <= 10; i++) set(i, sh.x + (i % 2 ? 0.01 : -0.01), sh.y - 0.11);

  if (p.noise) {
    const r = rng(p.seed ?? 7);
    for (const pt of pts) {
      pt.x += (r() - 0.5) * 2 * p.noise;
      pt.y += (r() - 0.5) * 2 * p.noise;
    }
  }
  for (const i of p.hidden ?? []) pts[i] = { ...pts[i]!, visibility: 0.1 };
  return pts;
}

/** Linear interpolation helper for building sequences. */
export function ramp(from: number, to: number, frames: number): number[] {
  return Array.from({ length: frames }, (_, i) => from + ((to - from) * i) / Math.max(1, frames - 1));
}

/** A full movement cycle start → end → start, with holds. */
export function cycle(start: number, end: number, opts: { down?: number; hold?: number; up?: number; rest?: number } = {}): number[] {
  const { down = 20, hold = 6, up = 20, rest = 8 } = opts;
  return [...ramp(start, end, down), ...Array(hold).fill(end), ...ramp(end, start, up), ...Array(rest).fill(start)];
}

export const FPS = 30;
export const FRAME_MS = 1000 / FPS;
