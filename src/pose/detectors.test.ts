import { describe, expect, it } from 'vitest';
import { createDetector, detectorInfo, detectorKind, HOLDS, ACTIVITIES } from './detectors';
import { COUNTERS } from './counters';
import { LM } from './geometry';
import { makeBody, FRAME_MS, type BodyParams } from './testing/simulate';
import type { DetectorId, RepCounterId } from '../domain/types';
import type { Point } from './geometry';

/**
 * Logic tests on SIMULATED landmarks: they show each detector reacts to the movement it was built
 * for, ignores stillness, and handles tracking loss. They do not measure accuracy on real people.
 */

type Mut = (f: Point[]) => void;
const frame = (params: BodyParams = {}, mut?: Mut) => {
  const f = makeBody(params);
  mut?.(f);
  return f;
};
const hold = (f: Point[], n: number) => Array.from({ length: n }, () => f);
function run(id: DetectorId, frames: (Point[] | null)[], mode: 'standard' | 'reduced' = 'standard') {
  const d = createDetector(id, mode);
  let snap = d.update(null, 0);
  frames.forEach((f, i) => (snap = d.update(f, i * FRAME_MS)));
  return snap;
}
// Smooth sweep so the One-Euro filter and dwell frames behave like real movement.
function sweep(rest: BodyParams, active: BodyParams, mutRest?: Mut, mutActive?: Mut, reps = 3, stepCount = 10) {
  const a = frame(rest, mutRest);
  const b = frame(active, mutActive);
  const lerp = (t: number) => a.map((p, i) => ({ ...p, x: p.x + (b[i]!.x - p.x) * t, y: p.y + (b[i]!.y - p.y) * t }));
  const steps = Array.from({ length: stepCount }, (_, i) => lerp((i + 1) / stepCount));
  const back = [...steps].reverse().slice(1).concat([a]);
  const out: Point[][] = [...hold(a, 12)];
  for (let i = 0; i < reps; i++) out.push(...steps, ...hold(b, 8), ...back, ...hold(a, 10));
  return out;
}

describe('new rep counters count full cycles of their own movement', () => {
  const lift = (idx: number, dy = 0, dx = 0): Mut => (f) => {
    f[idx] = { ...f[idx]!, x: f[idx]!.x + dx, y: f[idx]!.y + dy };
  };
  const cases: { id: RepCounterId; frames: Point[][]; expected: number; note?: string }[] = [
    { id: 'seated_march', frames: sweep({}, {}, undefined, (f) => (f[LM.leftKnee] = { ...f[LM.leftKnee]!, y: f[LM.leftHip]!.y - 0.05 })), expected: 3 },
    { id: 'shoulder_roll', frames: sweep({}, {}, undefined, (f) => ([LM.leftShoulder, LM.rightShoulder].forEach((i) => (f[i] = { ...f[i]!, y: f[i]!.y - 0.03 })))), expected: 3 },
    { id: 'calf_raise', frames: sweep({}, {}, undefined, (f) => ([29, 30].forEach((i) => (f[i] = { ...f[i]!, y: f[i]!.y - 0.03 })))), expected: 3 },
    { id: 'side_leg_lift', frames: sweep({}, {}, undefined, (f) => lift(LM.leftAnkle, -0.04, 0.12)(f)), expected: 3 },
    { id: 'step_up', frames: sweep({}, {}, undefined, lift(LM.leftAnkle, -0.07)), expected: 3 },
    { id: 'glute_bridge', frames: sweep({ view: 'side', hipAngle: 130 }, { view: 'side', hipAngle: 170 }, undefined, undefined, 3, 18), expected: 3 },
    { id: 'knee_extension', frames: sweep({ view: 'side', kneeAngle: 95 }, { view: 'side', kneeAngle: 168 }), expected: 6, note: 'both simulated legs move together, so each rep counts for each leg' },
    { id: 'biceps_curl', frames: sweep({ view: 'side', elbowAngle: 168 }, { view: 'side', elbowAngle: 55 }), expected: 3 },
    { id: 'band_row', frames: sweep({ view: 'side', elbowAngle: 168 }, { view: 'side', elbowAngle: 88 }), expected: 3 },
    { id: 'side_step', frames: sweep({}, {}, undefined, lift(LM.leftAnkle, 0, 0.12)), expected: 3 },
    { id: 'heel_toe', frames: sweep({ view: 'side' }, { view: 'side' }, undefined, lift(LM.leftAnkle, 0, 0.08)), expected: 3 },
    { id: 'hip_hinge', frames: sweep({ view: 'side', hipAngle: 175 }, { view: 'side', hipAngle: 112 }), expected: 3 },
    { id: 'shoulder_press', frames: sweep({ view: 'side', elbowAngle: 85 }, { view: 'side', elbowAngle: 168 }), expected: 3 },
    { id: 'lateral_raise', frames: sweep({ shoulderAngle: 12 }, { shoulderAngle: 92 }), expected: 3 },
  ];

  it.each(cases)('$id counts $expected reps over 3 cycles', ({ id, frames, expected }) => {
    expect(run(id, frames).count).toBe(expected);
  });

  it.each(cases)('$id ignores stillness (noise only)', ({ id }) => {
    const noisy = Array.from({ length: 200 }, (_, i) => frame({ view: id === 'glute_bridge' || id === 'hip_hinge' ? 'side' : 'front', noise: 0.004, seed: i + 1 }));
    expect(run(id, noisy).count).toBe(0);
  });

  it.each(cases.filter((c) => c.id !== 'knee_extension'))('$id does not count a half-hearted movement', ({ id, frames }) => {
    // Take only the first third of the way to the active pose and come back.
    const rest = frames[0]!;
    const peak = frames[Math.floor(frames.length / 3.2)]!;
    const half = rest.map((p, i) => ({ ...p, x: p.x + (peak[i]!.x - p.x) * 0.25, y: p.y + (peak[i]!.y - p.y) * 0.25 }));
    expect(run(id, [...hold(rest, 14), ...hold(half, 14), ...hold(rest, 14)]).count).toBe(0);
  });

  it('all rep counters have complete specs', () => {
    for (const [id, spec] of Object.entries(COUNTERS)) {
      expect(spec.id).toBe(id);
      expect(spec.thresholds.standard.enter).not.toBe(spec.thresholds.standard.exit);
      expect(spec.setupHint.length).toBeGreaterThan(20);
    }
  });

  it('reports progress toward counting while moving, and 0 at rest', () => {
    const d = createDetector('biceps_curl');
    const rest = frame({ view: 'side', elbowAngle: 168 });
    for (let i = 0; i < 12; i++) d.update(rest, i * FRAME_MS);
    expect(d.update(rest, 13 * FRAME_MS).progress).toBe(0);
    const mid = frame({ view: 'side', elbowAngle: 110 });
    let p = 0;
    for (let i = 0; i < 12; i++) p = d.update(mid, (14 + i) * FRAME_MS).progress;
    expect(p).toBeGreaterThan(0.2);
    expect(p).toBeLessThan(1);
  });
});

describe('hold detectors only credit time while the position is held', () => {
  const x = (idx: number, v: number): Mut => (f) => void (f[idx] = { ...f[idx]!, x: v });
  const dx = (idx: number, v: number): Mut => (f) => void (f[idx] = { ...f[idx]!, x: f[idx]!.x + v });
  const dy = (idx: number, v: number): Mut => (f) => void (f[idx] = { ...f[idx]!, y: f[idx]!.y + v });
  const both = (...m: Mut[]): Mut => (f) => m.forEach((fn) => fn(f));
  const cases: { id: DetectorId; rest: Point[]; held: Point[] }[] = [
    { id: 'hold_one_leg', rest: frame(), held: frame({}, dy(LM.leftAnkle, -0.09)) },
    { id: 'hold_chest_open', rest: frame({ shoulderAngle: 0 }), held: frame({ shoulderAngle: 0 }, both(x(LM.leftWrist, 0.2), x(LM.rightWrist, 0.8))) },
    { id: 'hold_twist', rest: frame(), held: frame({}, both(x(LM.leftShoulder, 0.52), x(LM.rightShoulder, 0.48))) },
    { id: 'hold_calf_stretch', rest: frame({ view: 'side' }), held: frame({ view: 'side' }, dx(LM.leftAnkle, 0.14)) },
    { id: 'hold_ankle_stretch', rest: frame({ view: 'side', kneeAngle: 95 }), held: frame({ view: 'side', kneeAngle: 172 }) },
    { id: 'hold_side_bend', rest: frame(), held: frame({}, both(dx(LM.leftShoulder, 0.06), dx(LM.rightShoulder, 0.06))) },
    { id: 'hold_neck_turn', rest: frame(), held: frame({}, dx(LM.nose, 0.08)) },
    { id: 'hold_hamstring', rest: frame({ view: 'side' }), held: frame({ view: 'side' }, both(dx(LM.leftShoulder, 0.09), dx(LM.rightShoulder, 0.09))) },
    { id: 'hold_wall_sit', rest: frame({ view: 'side', kneeAngle: 176 }), held: frame({ view: 'side', kneeAngle: 100 }) },
    { id: 'hold_tandem', rest: frame({ view: 'side' }), held: frame({ view: 'side' }, dx(LM.leftAnkle, 0.06)) },
  ];

  it.each(cases)('$id: ~3 s held → ~3 s credited; at rest → 0', ({ id, rest, held }) => {
    const restSnap = run(id, hold(rest, 90));
    expect(restSnap.heldMs).toBe(0);
    expect(restSnap.holding).toBe(false);
    const snap = run(id, [...hold(rest, 10), ...hold(held, 90)]);
    expect(snap.holding).toBe(true);
    expect(snap.heldMs).toBeGreaterThan(2500);
    expect(snap.heldMs).toBeLessThan(3200);
    expect(snap.kind).toBe('hold');
  });

  it.each(cases)('$id: stops crediting when the position is released', ({ id, rest, held }) => {
    const d = createDetector(id);
    let t = 0;
    const feed = (f: Point[], n: number) => {
      let s = d.update(f, t);
      for (let i = 0; i < n; i++) s = d.update(f, (t += FRAME_MS));
      return s;
    };
    feed(rest, 10);
    const during = feed(held, 60);
    const after = feed(rest, 60);
    expect(after.holding).toBe(false);
    expect(after.heldMs - during.heldMs).toBeLessThan(450); // only the short release dwell
  });

  it.each(cases)('$id: no credit while tracking is lost or the person is missing', ({ id, held }) => {
    const hiddenAll = [11, 12, 23, 24, 25, 26, 27, 28, 15, 16, 0];
    const lowConf = frame({ hidden: hiddenAll }, undefined);
    void held;
    const s1 = run(id, hold(lowConf, 60));
    expect(s1.heldMs).toBe(0);
    expect(s1.holding).toBe(false);
    expect(['low_confidence', 'lost']).toContain(s1.tracking);
    const s2 = run(id, Array(40).fill(null));
    expect(s2.tracking).toBe('no_person');
    expect(s2.heldMs).toBe(0);
  });

  it('a single-frame glitch does not start a hold', () => {
    const rest = frame();
    const held = frame({}, dy(LM.leftAnkle, -0.09));
    const s = run('hold_one_leg', [...hold(rest, 20), held, ...hold(rest, 20)]);
    expect(s.heldMs).toBe(0);
  });

  it('reduced range accepts a smaller position', () => {
    const rest = frame();
    const small = frame({}, dy(LM.leftAnkle, -0.02)); // 0.083 torsos: under standard 0.12, over relaxed 0.07
    expect(run('hold_one_leg', [...hold(rest, 10), ...hold(small, 60)]).heldMs).toBe(0);
    expect(run('hold_one_leg', [...hold(rest, 10), ...hold(small, 60)], 'reduced').heldMs).toBeGreaterThan(1500);
  });
});

describe('movement detectors', () => {
  const legsMoving = (n: number, amp = 0.05) =>
    Array.from({ length: n }, (_, i) => frame({}, (f) => void (f[LM.leftKnee] = { ...f[LM.leftKnee]!, y: f[LM.leftKnee]!.y - amp * (0.5 + 0.5 * Math.sin((i / 30) * Math.PI * 4)) })));

  it('credits time only while moving', () => {
    const still = hold(frame(), 90);
    expect(run('activity_legs', still).heldMs).toBe(0);
    const s = run('activity_legs', legsMoving(90));
    expect(s.holding).toBe(true);
    expect(s.heldMs).toBeGreaterThan(2000);
    expect(s.kind).toBe('activity');
  });

  it('stops crediting after you stop moving', () => {
    const d = createDetector('activity_legs');
    let t = 0;
    let s = d.update(null, 0);
    for (const f of legsMoving(60)) s = d.update(f, (t += FRAME_MS));
    expect(s.holding).toBe(true);
    for (const f of hold(frame(), 90)) s = d.update(f, (t += FRAME_MS));
    expect(s.holding).toBe(false);
    const credited = s.heldMs;
    for (const f of hold(frame(), 30)) s = d.update(f, (t += FRAME_MS));
    expect(s.heldMs).toBe(credited);
  });

  it('ignores camera jitter', () => {
    const noisy = Array.from({ length: 120 }, (_, i) => frame({ noise: 0.004, seed: i + 3 }));
    expect(run('activity_body', noisy).heldMs).toBe(0);
  });

  it('arm movement is detected by the arms detector', () => {
    const swing = Array.from({ length: 90 }, (_, i) => frame({}, (f) => void (f[LM.leftWrist] = { ...f[LM.leftWrist]!, y: f[LM.leftWrist]!.y - 0.12 * (0.5 + 0.5 * Math.sin((i / 30) * Math.PI * 3)) })));
    expect(run('activity_arms', swing).heldMs).toBeGreaterThan(1500);
    expect(run('activity_arms', hold(frame(), 90)).heldMs).toBe(0);
  });

  it('no credit without tracking', () => {
    expect(run('activity_legs', Array(60).fill(null)).heldMs).toBe(0);
  });
});

describe('registry', () => {
  it('knows every detector kind and gives setup guidance for each', () => {
    const all: DetectorId[] = [...(Object.keys(COUNTERS) as DetectorId[]), ...(Object.keys(HOLDS) as DetectorId[]), ...(Object.keys(ACTIVITIES) as DetectorId[])];
    expect(all.length).toBe(Object.keys(COUNTERS).length + 10 + 3);
    for (const id of all) {
      const info = detectorInfo(id);
      expect(info.setupHint.length, id).toBeGreaterThan(20);
      expect(createDetector(id).kind).toBe(detectorKind(id));
    }
  });
});
