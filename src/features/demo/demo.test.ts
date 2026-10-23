import { describe, expect, it } from 'vitest';
import { SCENES, TOTAL_MS, formatClock, sceneAt, sceneStart } from './script';
import { buildDemo } from './data';

describe('demo timeline', () => {
  it('runs for exactly one minute', () => {
    expect(TOTAL_MS).toBe(60_000);
    expect(SCENES.reduce((a, s) => a + s.ms, 0)).toBe(60_000);
  });

  it('every scene has notes, a headline and a sensible length', () => {
    for (const s of SCENES) {
      expect(s.notes.length).toBeGreaterThan(40);
      expect(s.headline.length).toBeGreaterThan(3);
      expect(s.ms).toBeGreaterThanOrEqual(5000);
    }
    expect(new Set(SCENES.map((s) => s.id)).size).toBe(SCENES.length);
  });

  it('maps time to scenes and back', () => {
    expect(sceneAt(0).index).toBe(0);
    expect(sceneAt(4999).index).toBe(0);
    expect(sceneAt(5000).index).toBe(1);
    expect(sceneAt(59_999).index).toBe(SCENES.length - 1);
    expect(sceneAt(60_000).done).toBe(true);
    expect(sceneAt(-5).elapsed).toBe(0);
    SCENES.forEach((_, i) => expect(sceneAt(sceneStart(i)).index).toBe(i));
    expect(sceneAt(sceneStart(3) + SCENES[3]!.ms / 2).progress).toBeCloseTo(0.5, 5);
  });

  it('formats the clock', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(61_000)).toBe('1:00'); // clamped to the total
    expect(formatClock(42_400)).toBe('0:42');
  });
});

describe('demo data (real engine, sample person)', () => {
  const d = buildDemo();

  it('the typed sentence is understood: the sore knee and the goal are found', () => {
    const titles = d.findings.map((f) => f.title.toLowerCase()).join(' | ');
    expect(d.findings.length).toBeGreaterThanOrEqual(1);
    expect(titles).toMatch(/knee/);
  });

  it('an alarming sentence stops the plan instead of producing one', () => {
    expect(d.alert.length).toBeGreaterThanOrEqual(1);
    expect(d.alert.some((f) => f.kind === 'urgent' || f.kind === 'refer')).toBe(true);
    expect(d.alertBlocksPlan).toBe(true);
  });

  it('produces a real plan with a workout, and leaves out exercises for safety or fit', () => {
    expect(d.plan).not.toBeNull();
    expect(d.session).not.toBeNull();
    expect(d.session!.items.length).toBeGreaterThanOrEqual(4);
    expect(d.leftOut).toBeGreaterThan(0);
  });

  it('every exercise in the demo session links to evidence', () => {
    for (const it of d.session!.items.filter((i) => i.block === 'main')) expect(it.prescription.evidenceIds.length).toBeGreaterThan(0);
  });
});

describe('demo camera scene (real counter, simulated person)', () => {
  it('counts nothing during the get-ready countdown, then counts several reps by the end', async () => {
    const { buildCameraTimeline, GET_READY_MS, TARGET_REPS } = await import('./scenes/CameraScene');
    const { FRAME_MS } = await import('../../pose/testing/simulate');
    const tl = buildCameraTimeline();
    const at = (ms: number) => tl.snaps[Math.floor(ms / FRAME_MS)]!;
    expect(at(GET_READY_MS - 100).count).toBe(0);
    const final = tl.snaps[tl.snaps.length - 1]!.count;
    expect(final).toBeGreaterThanOrEqual(3);
    expect(final).toBeLessThanOrEqual(TARGET_REPS);
    // The count only ever goes up.
    for (let i = 1; i < tl.snaps.length; i++) expect(tl.snaps[i]!.count).toBeGreaterThanOrEqual(tl.snaps[i - 1]!.count);
  });

  it('the rewards sample uses the real token rules', async () => {
    const { SAMPLE_TOKENS, PER_WORKOUT } = await import('./scenes/RewardsScene');
    expect(PER_WORKOUT).toBeGreaterThan(5);
    expect(SAMPLE_TOKENS.earned).toBe(PER_WORKOUT * 3);
    expect(SAMPLE_TOKENS.balance).toBe(SAMPLE_TOKENS.earned);
  });
});
