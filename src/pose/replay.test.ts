import { describe, expect, it } from 'vitest';
import {
  TRACE_FORMAT,
  evaluateAll,
  formatSummaryTable,
  formatTraceTable,
  matchReps,
  packFrame,
  parseTrace,
  replayTrace,
  resolveThresholds,
  unpackFrame,
  type RepTrace,
} from './replay';
import { loadTraceFixtures } from './testing/traceFixtures';
import { cycle, makeBody, FRAME_MS } from './testing/simulate';

/**
 * Replay harness. Part 1 runs every recorded real-person trace in src/pose/fixtures/ through
 * RepCounter and fails if pooled precision or recall for any counter falls below the bars in
 * replay.ts (overridable with REP_EVAL_* env vars). It is skipped when there are no traces.
 * Part 2 checks the harness itself on synthetic data so it is exercised even without fixtures.
 */

const fixtures = loadTraceFixtures();

describe('replay: recorded validation traces', () => {
  it.skipIf(fixtures.length === 0)(`every counter meets the precision/recall bars (${fixtures.length} trace(s))`, () => {
    const { results, summaries } = evaluateAll(fixtures, process.env);
    const report = `\n${formatSummaryTable(summaries)}\n\n${formatTraceTable(results)}\n`;
    const failing = summaries.filter((s) => !s.pass).map((s) => s.counter);
    expect(failing, report).toEqual([]);
  });
});

/** A synthetic squat trace: `reps` full cycles, with a "Rep done" tap `tapLagMs` after each cycle ends. */
function syntheticSquat(reps: number, tapLagMs = 300): RepTrace {
  const angles = [...Array(10).fill(175), ...Array.from({ length: reps }, () => cycle(175, 95)).flat()];
  const ends: number[] = [];
  let i = 10;
  for (let r = 0; r < reps; r++) {
    i += 54; // down 20 + hold 6 + up 20 + rest 8
    ends.push((i - 8) * FRAME_MS + tapLagMs);
  }
  return {
    format: TRACE_FORMAT,
    version: 1,
    counter: 'squat',
    rangeMode: 'standard',
    setup: { view: 'side', lighting: 'normal', mobility: 'typical' },
    model: 'synthetic',
    video: { width: 640, height: 480 },
    consent: true,
    durationMs: angles.length * FRAME_MS,
    frames: angles.map((k, n) => ({ t: n * FRAME_MS, lm: packFrame(makeBody({ view: 'side', kneeAngle: k })) })),
    truthRepsMs: ends,
  };
}

describe('replay harness mechanics (synthetic data)', () => {
  it('packs and unpacks a frame losslessly enough for counting', () => {
    const body = makeBody({ view: 'side', kneeAngle: 120 });
    const back = unpackFrame(packFrame(body))!;
    expect(back).toHaveLength(33);
    back.forEach((p, i) => {
      expect(p.x).toBeCloseTo(body[i]!.x, 4);
      expect(p.y).toBeCloseTo(body[i]!.y, 4);
      expect(p.visibility).toBeCloseTo(body[i]!.visibility!, 3);
    });
    expect(packFrame(null)).toBeNull();
    expect(unpackFrame(null)).toBeNull();
  });

  it('replays a synthetic trace to the expected count, with perfect precision and recall', () => {
    const trace = parseTrace(JSON.parse(JSON.stringify(syntheticSquat(3))));
    expect(replayTrace(trace)).toHaveLength(3);
    const { summaries } = evaluateAll([{ name: 'synthetic.json', trace }]);
    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({ counter: 'squat', tp: 3, fp: 0, fn: 0, precision: 1, recall: 1, pass: true });
  });

  it('fails a counter whose recall is below the bar and prints a table', () => {
    const trace = syntheticSquat(3);
    trace.truthRepsMs.push(trace.durationMs + 5000, trace.durationMs + 9000); // two reps the counter never saw
    const { summaries, results } = evaluateAll([{ name: 'missed.json', trace }]);
    expect(summaries[0]).toMatchObject({ tp: 3, fn: 2, pass: false });
    expect(summaries[0]!.recall).toBeCloseTo(0.6, 5);
    const out = formatSummaryTable(summaries);
    expect(out).toMatch(/squat/);
    expect(out).toMatch(/60\.0%/);
    expect(out).toMatch(/FAIL/);
    expect(formatTraceTable(results)).toMatch(/missed\.json/);
  });

  it('matches one-to-one, closest first, within the tolerance', () => {
    expect(matchReps([1000, 2000, 9000], [1100, 2050, 2100], 500)).toEqual({ tp: 2, fp: 1, fn: 1, lagsMs: [-50, -100] });
    expect(matchReps([], [], 500)).toEqual({ tp: 0, fp: 0, fn: 0, lagsMs: [] });
    // Two predictions near one tap: only one can match.
    expect(matchReps([1000, 1200], [1100], 500)).toMatchObject({ tp: 1, fp: 1, fn: 0 });
  });

  it('thresholds are configurable through the environment', () => {
    expect(resolveThresholds('squat', {})).toEqual({ minPrecision: 0.9, minRecall: 0.9, toleranceMs: 1500 });
    expect(resolveThresholds('march', { REP_EVAL_MIN_RECALL: '0.75', REP_EVAL_TOLERANCE_MS: '800' })).toEqual({ minPrecision: 0.9, minRecall: 0.75, toleranceMs: 800 });
    expect(() => resolveThresholds('squat', { REP_EVAL_MIN_PRECISION: 'high' })).toThrow(/must be a number/);
  });

  it('rejects malformed traces with a useful message', () => {
    const good = syntheticSquat(1);
    expect(() => parseTrace({ ...good, format: 'other' })).toThrow(/format/);
    expect(() => parseTrace({ ...good, counter: 'plank' })).toThrow(/unknown counter/);
    expect(() => parseTrace({ ...good, consent: false })).toThrow(/consent/);
    expect(() => parseTrace({ ...good, frames: [{ t: 0, lm: [1, 2, 3] }] })).toThrow(/frames\[0\]\.lm/);
    expect(() => parseTrace({ ...good, frames: [{ t: 10, lm: null }, { t: 5, lm: null }] })).toThrow(/non-decreasing/);
    expect(() => parseTrace({ ...good, setup: { ...good.setup, mobility: 'elite' } })).toThrow(/mobility/);
  });
});
