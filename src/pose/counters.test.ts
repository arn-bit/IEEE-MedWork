import { describe, expect, it } from 'vitest';
import { RepCounter, assessPosition, COUNTERS, type CounterSnapshot } from './counters';
import { angle, LM, SIDES } from './geometry';
import { cycle, makeBody, FRAME_MS, type BodyParams } from './testing/simulate';
import type { CounterId } from '../domain/types';

/**
 * These tests use simulated landmarks. Passing them shows the counting LOGIC behaves as designed;
 * it is not evidence of real-world tracking accuracy.
 */

function run(id: CounterId, frames: (BodyParams | null)[], mode: 'standard' | 'reduced' = 'standard') {
  const c = new RepCounter(id, mode);
  let snap: CounterSnapshot | null = null;
  const events: string[] = [];
  const cues: string[] = [];
  frames.forEach((f, i) => {
    snap = c.update(f ? makeBody(f) : null, i * FRAME_MS);
    events.push(...snap.events);
    if (snap.events.includes('cue') && snap.cue) cues.push(snap.cue.id);
  });
  return { counter: c, snap: snap!, events, cues };
}

const hold = (p: BodyParams, n: number) => Array.from({ length: n }, () => p);

describe('simulator sanity', () => {
  it('produces the requested joint angles', () => {
    const f = makeBody({ view: 'side', kneeAngle: 100 });
    expect(angle(f[LM.leftHip]!, f[LM.leftKnee]!, f[LM.leftAnkle]!)).toBeCloseTo(100, 0);
    const a = makeBody({ shoulderAngle: 150 });
    expect(angle(a[LM.leftHip]!, a[LM.leftShoulder]!, a[LM.leftWrist]!)).toBeCloseTo(150, 0);
    const e = makeBody({ view: 'side', elbowAngle: 100 });
    const s = SIDES.left;
    expect(angle(e[s.shoulder]!, e[s.elbow]!, e[s.wrist]!)).toBeCloseTo(100, 0);
  });
});

describe('squat counter', () => {
  const standing: BodyParams = { view: 'side', kneeAngle: 175 };
  const squatCycle = (bottom: number, view: 'front' | 'side' = 'side') => cycle(175, bottom).map((k) => ({ view, kneeAngle: k }));

  it('counts only complete cycles', () => {
    const frames = [...hold(standing, 10), ...squatCycle(95), ...squatCycle(95), ...squatCycle(95)];
    expect(run('squat', frames).snap.count).toBe(3);
  });

  it('does not count until the person returns to standing', () => {
    const down = cycle(175, 95).slice(0, 26).map((k) => ({ view: 'side' as const, kneeAngle: k }));
    expect(run('squat', [...hold(standing, 10), ...down]).snap.count).toBe(0);
  });

  it('a partial rep is not counted but is reported', () => {
    const r = run('squat', [...hold(standing, 10), ...squatCycle(140)]);
    expect(r.snap.count).toBe(0);
    expect(r.snap.partials).toBe(1);
    expect(r.cues).toContain('partial');
  });

  it('reduced-range mode counts a shallower movement', () => {
    const r = run('squat', [...hold(standing, 10), ...squatCycle(140), ...squatCycle(140)], 'reduced');
    expect(r.snap.count).toBe(2);
  });

  it('noisy landmarks while standing do not create counts', () => {
    const frames = Array.from({ length: 300 }, (_, i) => ({ view: 'side' as const, kneeAngle: 172, noise: 0.012, seed: i + 1 }));
    expect(run('squat', frames).snap.count).toBe(0);
  });

  it('noisy landmarks around a threshold do not double count', () => {
    // Hover near the bottom threshold with jitter, then stand up: exactly one rep.
    const hover = Array.from({ length: 60 }, (_, i) => ({ view: 'side' as const, kneeAngle: 120 + ((i * 7) % 11) - 5, noise: 0.004, seed: i + 3 }));
    const frames = [...hold(standing, 10), ...cycle(175, 120, { hold: 0, up: 0, rest: 0 }).slice(0, 20).map((k) => ({ view: 'side' as const, kneeAngle: k })), ...hover, ...cycle(120, 175, { hold: 0, up: 0, rest: 0 }).slice(0, 20).map((k) => ({ view: 'side' as const, kneeAngle: k })), ...hold(standing, 15)];
    expect(run('squat', frames).snap.count).toBe(1);
  });

  it('a single-frame spike does not count as a rep', () => {
    const frames = [...hold(standing, 20), { view: 'side' as const, kneeAngle: 90 }, ...hold(standing, 20)];
    expect(run('squat', frames).snap.count).toBe(0);
  });

  it('a very fast bounce (shorter than minRepMs) is rejected', () => {
    const fast = cycle(175, 95, { down: 4, hold: 3, up: 4, rest: 6 }).map((k) => ({ view: 'side' as const, kneeAngle: k }));
    expect(run('squat', [...hold(standing, 10), ...fast]).snap.count).toBe(0);
  });

  it('low confidence pauses counting and suppresses cues; a rep is never completed across a gap', () => {
    const hiddenKnees = { hidden: [LM.leftKnee, LM.rightKnee] };
    const half = cycle(175, 95).slice(0, 26).map((k) => ({ view: 'side' as const, kneeAngle: k }));
    const gap = hold({ view: 'side', kneeAngle: 95, ...hiddenKnees }, 10);
    const rise = cycle(95, 175, { hold: 0, up: 0, rest: 0 }).slice(0, 20).map((k) => ({ view: 'side' as const, kneeAngle: k }));
    const r = run('squat', [...hold(standing, 10), ...half, ...gap, ...rise, ...hold(standing, 10)]);
    expect(r.events).toContain('lost');
    expect(r.snap.count).toBe(0);
  });

  it('reports low confidence state and no cue while joints are hidden', () => {
    const c = new RepCounter('squat');
    let s!: CounterSnapshot;
    for (let i = 0; i < 6; i++) s = c.update(makeBody({ view: 'side', hidden: [LM.leftKnee, LM.rightKnee] }), i * FRAME_MS);
    expect(['low_confidence', 'lost']).toContain(s.tracking);
    expect(s.cue).toBeNull();
    expect(s.messages.join(' ')).toMatch(/knees/);
  });

  it('no person → no_person tracking state and an actionable message', () => {
    const r = run('squat', Array(8).fill(null));
    expect(r.snap.tracking).toBe('no_person');
    expect(r.snap.messages[0]).toMatch(/No body detected/);
  });

  it('front view: inward knee drift produces a hedged technique cue', () => {
    const inward = cycle(175, 110).map((k) => ({ view: 'front' as const, kneeAngle: k, kneesInward: k < 150 }));
    const r = run('squat', [...hold({ view: 'front', kneeAngle: 175 }, 10), ...inward]);
    expect(r.snap.count).toBe(1);
    expect(r.cues).toContain('knees_in');
    const text = COUNTERS.squat.form!.check(makeBody({ view: 'front', kneeAngle: 110, kneesInward: true }), 'left', { baseline: new Map(), startTrunkTilt: 0 })!.text;
    expect(text).toMatch(/appear/);
    expect(text).not.toMatch(/injur|damage|wrong|bad/i);
  });

  it('manual correction never goes below zero', () => {
    const c = new RepCounter('squat');
    c.adjust(-3);
    expect(c.value).toBe(0);
    c.adjust(2);
    expect(c.value).toBe(2);
  });
});

describe('sit-to-stand counter', () => {
  const seated: BodyParams = { view: 'side', kneeAngle: 92 };
  const rep = () => cycle(92, 172, { down: 24, up: 24 }).map((k) => ({ view: 'side' as const, kneeAngle: k }));
  it('counts sit → stand → sit', () => {
    expect(run('sit_to_stand', [...hold(seated, 10), ...rep(), ...rep()]).snap.count).toBe(2);
  });
  it('a half rise is not counted', () => {
    const half = cycle(92, 140).map((k) => ({ view: 'side' as const, kneeAngle: k }));
    const r = run('sit_to_stand', [...hold(seated, 10), ...half]);
    expect(r.snap.count).toBe(0);
    expect(r.snap.partials).toBe(1);
  });
  it('asks the user to turn side-on when facing the camera', () => {
    expect(assessPosition(makeBody({ view: 'front', kneeAngle: 92 }), COUNTERS.sit_to_stand).messages.join(' ')).toMatch(/side-on/);
  });
});

describe('wall press-up counter', () => {
  const ext: BodyParams = { view: 'side', elbowAngle: 170 };
  const rep = () => cycle(170, 95).map((e) => ({ view: 'side' as const, elbowAngle: e }));
  it('counts full cycles', () => {
    expect(run('wall_pushup', [...hold(ext, 10), ...rep(), ...rep(), ...rep()]).snap.count).toBe(3);
  });
  it('partial bend not counted', () => {
    expect(run('wall_pushup', [...hold(ext, 10), ...cycle(170, 135).map((e) => ({ view: 'side' as const, elbowAngle: e }))]).snap.count).toBe(0);
  });
});

describe('arm raise counter', () => {
  const down: BodyParams = { shoulderAngle: 15 };
  const rep = (top = 160) => cycle(15, top).map((a) => ({ shoulderAngle: a }));
  it('counts down → up → down', () => {
    expect(run('arm_raise', [...hold(down, 10), ...rep(), ...rep()]).snap.count).toBe(2);
  });
  it('raising only to shoulder height counts in reduced mode but not standard', () => {
    const frames = [...hold(down, 10), ...rep(100)];
    expect(run('arm_raise', frames).snap.count).toBe(0);
    expect(run('arm_raise', frames, 'reduced').snap.count).toBe(1);
  });
  it('leaning the trunk during the lift produces a hedged cue', () => {
    const frames = [...hold(down, 10), ...cycle(15, 160).map((a) => ({ shoulderAngle: a, trunkLean: a > 120 ? 22 : 0 }))];
    const r = run('arm_raise', frames);
    expect(r.cues).toContain('trunk_lean');
  });
});

describe('march (knee lift) counter', () => {
  const standing: BodyParams = { view: 'front' };
  const lift = (side: 'left' | 'right') => cycle(0, 0.75, { down: 10, hold: 4, up: 10, rest: 4 }).map((v) => ({ view: 'front' as const, kneeLift: { [side]: v } }));
  it('counts each knee lift on either side after establishing a baseline', () => {
    const frames = [...hold(standing, 15), ...lift('left'), ...lift('right'), ...lift('left'), ...lift('right'), ...hold(standing, 10)];
    expect(run('march', frames).snap.count).toBe(4);
  });
  it('small knee lifts are not counted in standard mode', () => {
    const small = cycle(0, 0.2, { down: 10, hold: 4, up: 10 }).map((v) => ({ view: 'front' as const, kneeLift: { left: v } }));
    expect(run('march', [...hold(standing, 15), ...small, ...small]).snap.count).toBe(0);
  });
});

describe('positioning', () => {
  it('asks the user to keep their head in view', () => {
    expect(assessPosition(makeBody({ hidden: [LM.nose] }), COUNTERS.arm_raise).messages.join(' ')).toMatch(/head/);
  });
  it('a good front-view frame passes for arm raise', () => {
    expect(assessPosition(makeBody(), COUNTERS.arm_raise).ok).toBe(true);
  });
});
