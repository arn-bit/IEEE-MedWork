/** Landmark indices for MediaPipe Pose Landmarker (33-point BlazePose topology). */
export const LM = {
  nose: 0,
  leftEar: 7,
  rightEar: 8,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
} as const;

export interface Point {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
}

export type Frame = readonly Point[];

export const SIDES = {
  left: { shoulder: LM.leftShoulder, elbow: LM.leftElbow, wrist: LM.leftWrist, hip: LM.leftHip, knee: LM.leftKnee, ankle: LM.leftAnkle },
  right: { shoulder: LM.rightShoulder, elbow: LM.rightElbow, wrist: LM.rightWrist, hip: LM.rightHip, knee: LM.rightKnee, ankle: LM.rightAnkle },
} as const;
export type Side = keyof typeof SIDES;
export type Joint = keyof (typeof SIDES)['left'];

/** Interior angle ABC in degrees (0–180), using 2D image coordinates. */
export function angle(a: Point, b: Point, c: Point): number {
  const abx = a.x - b.x;
  const aby = a.y - b.y;
  const cbx = c.x - b.x;
  const cby = c.y - b.y;
  const dot = abx * cbx + aby * cby;
  const mag = Math.hypot(abx, aby) * Math.hypot(cbx, cby);
  if (mag === 0) return NaN;
  const cos = Math.min(1, Math.max(-1, dot / mag));
  return (Math.acos(cos) * 180) / Math.PI;
}

export function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function mid(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, visibility: Math.min(a.visibility ?? 0, b.visibility ?? 0) };
}

export function vis(p: Point | undefined): number {
  return p?.visibility ?? 0;
}

/** Minimum visibility across a set of landmark indices. */
export function minVisibility(frame: Frame, idx: readonly number[]): number {
  let m = 1;
  for (const i of idx) m = Math.min(m, vis(frame[i]));
  return m;
}

/** The side whose given joints are more visible. */
export function bestSide(frame: Frame, joints: readonly Joint[]): Side {
  const score = (s: Side) => joints.reduce((acc, j) => acc + vis(frame[SIDES[s][j]]), 0);
  return score('left') >= score('right') ? 'left' : 'right';
}

export function sideIdx(side: Side, joints: readonly Joint[]): number[] {
  return joints.map((j) => SIDES[side][j]);
}

/** Rough camera-view estimate from shoulder width relative to torso length. */
export function estimateView(frame: Frame): 'front' | 'side' | 'unknown' {
  const ls = frame[LM.leftShoulder];
  const rs = frame[LM.rightShoulder];
  const lh = frame[LM.leftHip];
  const rh = frame[LM.rightHip];
  if (!ls || !rs || !lh || !rh) return 'unknown';
  const torso = dist(mid(ls, rs), mid(lh, rh));
  if (torso < 1e-3) return 'unknown';
  const ratio = Math.abs(ls.x - rs.x) / torso;
  if (ratio > 0.45) return 'front';
  if (ratio < 0.3) return 'side';
  return 'unknown';
}

/** One Euro filter for a scalar signal (Casiez et al., 2012). Reduces jitter while staying responsive. */
export class OneEuro {
  private xPrev: number | null = null;
  private dxPrev = 0;
  private tPrev: number | null = null;
  constructor(
    private minCutoff = 1.2,
    private beta = 0.02,
    private dCutoff = 1.0,
  ) {}
  private alpha(cutoff: number, dt: number) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }
  reset() {
    this.xPrev = null;
    this.tPrev = null;
    this.dxPrev = 0;
  }
  filter(x: number, tMs: number): number {
    if (this.xPrev === null || this.tPrev === null) {
      this.xPrev = x;
      this.tPrev = tMs;
      return x;
    }
    const dt = Math.max(1e-3, (tMs - this.tPrev) / 1000);
    const dx = (x - this.xPrev) / dt;
    const aD = this.alpha(this.dCutoff, dt);
    const dxHat = aD * dx + (1 - aD) * this.dxPrev;
    const cutoff = this.minCutoff + this.beta * Math.abs(dxHat);
    const a = this.alpha(cutoff, dt);
    const xHat = a * x + (1 - a) * this.xPrev;
    this.xPrev = xHat;
    this.dxPrev = dxHat;
    this.tPrev = tMs;
    return xHat;
  }
}
