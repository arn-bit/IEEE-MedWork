import type { CounterId } from '../domain/types';
import { COUNTERS, RepCounter, type RangeMode } from './counters';
import type { Frame, Point } from './geometry';

/**
 * Validation traces: per-frame pose landmarks recorded on-device by the dev-only recorder
 * (/dev/record), plus the times the person said they actually finished a rep (ground truth).
 * No video or images are ever stored. Replaying a trace through RepCounter measures how well the
 * counters agree with real people — see TEST_PLAN.md §8. A handful of traces is NOT clinical validation.
 */

export const TRACE_FORMAT = 'medical-workout.rep-trace';
export const LANDMARK_COUNT = 33;
/** Numbers per frame: x, y, z, visibility for each of the 33 landmarks. */
export const VALUES_PER_FRAME = LANDMARK_COUNT * 4;

export type TraceView = 'front' | 'side';
export type TraceLighting = 'bright' | 'normal' | 'dim' | 'backlit';
export type TraceMobility = 'typical' | 'limited' | 'uses_support';

export interface TraceFrame {
  /** Milliseconds since the recording started. */
  t: number;
  /** 132 numbers (x, y, z, visibility × 33), or null when no person was detected. */
  lm: number[] | null;
}

export interface RepTrace {
  format: typeof TRACE_FORMAT;
  version: 1;
  counter: CounterId;
  rangeMode: RangeMode;
  /** Coarse, non-identifying setup descriptors used to report coverage. */
  setup: { view: TraceView; lighting: TraceLighting; mobility: TraceMobility };
  model: string;
  video: { width: number; height: number };
  consent: true;
  durationMs: number;
  frames: TraceFrame[];
  /** Times (ms since start) the person tapped "Rep done". */
  truthRepsMs: number[];
}

const VIEWS: readonly TraceView[] = ['front', 'side'];
const LIGHTING: readonly TraceLighting[] = ['bright', 'normal', 'dim', 'backlit'];
const MOBILITY: readonly TraceMobility[] = ['typical', 'limited', 'uses_support'];
const MODES: readonly RangeMode[] = ['standard', 'reduced'];

const round = (v: number, dp: number) => {
  const f = 10 ** dp;
  return Math.round(v * f) / f;
};

/** Packs a model frame into the compact trace form (rounded; ~0.1 px at 640 px wide). */
export function packFrame(frame: Frame | null): number[] | null {
  if (!frame || frame.length < LANDMARK_COUNT) return null;
  const out: number[] = [];
  for (let i = 0; i < LANDMARK_COUNT; i++) {
    const p = frame[i]!;
    out.push(round(p.x, 5), round(p.y, 5), round(p.z ?? 0, 5), round(p.visibility ?? 0, 4));
  }
  return out;
}

export function unpackFrame(lm: number[] | null): Frame | null {
  if (!lm) return null;
  const pts: Point[] = [];
  for (let i = 0; i < LANDMARK_COUNT; i++) {
    const o = i * 4;
    pts.push({ x: lm[o]!, y: lm[o + 1]!, z: lm[o + 2]!, visibility: lm[o + 3]! });
  }
  return pts;
}

export class TraceError extends Error {
  override name = 'TraceError';
}

/** Validates untrusted JSON into a RepTrace, throwing a TraceError that says what is wrong. */
export function parseTrace(raw: unknown): RepTrace {
  const fail = (msg: string): never => {
    throw new TraceError(msg);
  };
  const o = (raw ?? {}) as Record<string, unknown>;
  if (o.format !== TRACE_FORMAT) fail(`format must be "${TRACE_FORMAT}"`);
  if (o.version !== 1) fail(`unsupported version ${String(o.version)}`);
  if (typeof o.counter !== 'string' || !(o.counter in COUNTERS)) fail(`unknown counter ${String(o.counter)}`);
  if (!MODES.includes(o.rangeMode as RangeMode)) fail(`rangeMode must be one of ${MODES.join(', ')}`);
  if (o.consent !== true) fail('consent must be true');
  const setup = (o.setup ?? {}) as Record<string, unknown>;
  if (!VIEWS.includes(setup.view as TraceView)) fail('setup.view is invalid');
  if (!LIGHTING.includes(setup.lighting as TraceLighting)) fail('setup.lighting is invalid');
  if (!MOBILITY.includes(setup.mobility as TraceMobility)) fail('setup.mobility is invalid');
  if (!Array.isArray(o.frames) || o.frames.length === 0) fail('frames must be a non-empty array');
  let prev = -Infinity;
  (o.frames as unknown[]).forEach((f, i) => {
    const fr = (f ?? {}) as Record<string, unknown>;
    if (typeof fr.t !== 'number' || !Number.isFinite(fr.t) || fr.t < prev) fail(`frames[${i}].t must be a non-decreasing number`);
    prev = fr.t as number;
    if (fr.lm !== null && (!Array.isArray(fr.lm) || fr.lm.length !== VALUES_PER_FRAME || !fr.lm.every((v) => typeof v === 'number' && Number.isFinite(v)))) {
      fail(`frames[${i}].lm must be null or ${VALUES_PER_FRAME} finite numbers`);
    }
  });
  if (!Array.isArray(o.truthRepsMs) || !o.truthRepsMs.every((v) => typeof v === 'number' && Number.isFinite(v))) fail('truthRepsMs must be an array of numbers');
  return o as unknown as RepTrace;
}

// ───────────────────────────── Evaluation ─────────────────────────────

export interface EvalThresholds {
  minPrecision: number;
  minRecall: number;
  /** A counted rep matches a ground-truth tap when they are at most this far apart. */
  toleranceMs: number;
}

/**
 * Pass/fail bars for the replay harness. These are acceptance bars for the harness, not the
 * counters' angle thresholds. Override per counter here, or globally with the environment
 * variables REP_EVAL_MIN_PRECISION, REP_EVAL_MIN_RECALL and REP_EVAL_TOLERANCE_MS.
 */
export const DEFAULT_EVAL_THRESHOLDS: EvalThresholds = { minPrecision: 0.9, minRecall: 0.9, toleranceMs: 1500 };
export const COUNTER_EVAL_THRESHOLDS: Partial<Record<CounterId, Partial<EvalThresholds>>> = {};

export function resolveThresholds(counter: CounterId, env: Record<string, string | undefined> = {}): EvalThresholds {
  const num = (k: string) => {
    const v = env[k];
    if (v === undefined || v === '') return undefined;
    const n = Number(v);
    if (!Number.isFinite(n)) throw new Error(`${k} must be a number, got "${v}"`);
    return n;
  };
  const base = { ...DEFAULT_EVAL_THRESHOLDS, ...COUNTER_EVAL_THRESHOLDS[counter] };
  return {
    minPrecision: num('REP_EVAL_MIN_PRECISION') ?? base.minPrecision,
    minRecall: num('REP_EVAL_MIN_RECALL') ?? base.minRecall,
    toleranceMs: num('REP_EVAL_TOLERANCE_MS') ?? base.toleranceMs,
  };
}

/** Runs the trace through a fresh RepCounter (same range mode as recorded) and returns the rep times. */
export function replayTrace(trace: RepTrace): number[] {
  const counter = new RepCounter(trace.counter, trace.rangeMode);
  const reps: number[] = [];
  for (const f of trace.frames) {
    const snap = counter.update(unpackFrame(f.lm), f.t);
    for (const e of snap.events) if (e === 'rep') reps.push(f.t);
  }
  return reps;
}

export interface MatchResult {
  tp: number;
  fp: number;
  fn: number;
  /** predicted − truth for each matched pair, in ms (positive = counter fired after the tap). */
  lagsMs: number[];
}

/** One-to-one matching of predicted to ground-truth times, closest pairs first, within the tolerance. */
export function matchReps(predicted: readonly number[], truth: readonly number[], toleranceMs: number): MatchResult {
  const pairs: { p: number; g: number; d: number }[] = [];
  predicted.forEach((pt, p) => truth.forEach((gt, g) => Math.abs(pt - gt) <= toleranceMs && pairs.push({ p, g, d: Math.abs(pt - gt) })));
  pairs.sort((a, b) => a.d - b.d || a.p - b.p || a.g - b.g);
  const usedP = new Set<number>();
  const usedG = new Set<number>();
  const lagsMs: number[] = [];
  for (const { p, g } of pairs) {
    if (usedP.has(p) || usedG.has(g)) continue;
    usedP.add(p);
    usedG.add(g);
    lagsMs.push(predicted[p]! - truth[g]!);
  }
  return { tp: usedP.size, fp: predicted.length - usedP.size, fn: truth.length - usedG.size, lagsMs };
}

/** Precision with no predictions, and recall with no ground truth, are vacuously 1. */
export const precisionOf = (m: { tp: number; fp: number }) => (m.tp + m.fp === 0 ? 1 : m.tp / (m.tp + m.fp));
export const recallOf = (m: { tp: number; fn: number }) => (m.tp + m.fn === 0 ? 1 : m.tp / (m.tp + m.fn));

export interface TraceResult extends MatchResult {
  name: string;
  counter: CounterId;
  rangeMode: RangeMode;
  setup: RepTrace['setup'];
  truth: number;
  predicted: number;
  precision: number;
  recall: number;
}

export function evaluateTrace(name: string, trace: RepTrace, toleranceMs: number): TraceResult {
  const predicted = replayTrace(trace);
  const m = matchReps(predicted, trace.truthRepsMs, toleranceMs);
  return {
    name,
    counter: trace.counter,
    rangeMode: trace.rangeMode,
    setup: trace.setup,
    truth: trace.truthRepsMs.length,
    predicted: predicted.length,
    ...m,
    precision: precisionOf(m),
    recall: recallOf(m),
  };
}

export interface CounterSummary {
  counter: CounterId;
  traces: number;
  truth: number;
  predicted: number;
  tp: number;
  fp: number;
  fn: number;
  precision: number;
  recall: number;
  medianLagMs: number | null;
  thresholds: EvalThresholds;
  pass: boolean;
}

/** Evaluates every trace and pools results per counter (micro-averaged over reps). */
export function evaluateAll(traces: readonly { name: string; trace: RepTrace }[], env: Record<string, string | undefined> = {}) {
  const results = traces.map(({ name, trace }) => evaluateTrace(name, trace, resolveThresholds(trace.counter, env).toleranceMs));
  const summaries: CounterSummary[] = [];
  for (const counter of Object.keys(COUNTERS) as CounterId[]) {
    const rs = results.filter((r) => r.counter === counter);
    if (!rs.length) continue;
    const sum = (k: 'truth' | 'predicted' | 'tp' | 'fp' | 'fn') => rs.reduce((a, r) => a + r[k], 0);
    const pooled = { tp: sum('tp'), fp: sum('fp'), fn: sum('fn') };
    const lags = rs.flatMap((r) => r.lagsMs).sort((a, b) => a - b);
    const thresholds = resolveThresholds(counter, env);
    const precision = precisionOf(pooled);
    const recall = recallOf(pooled);
    summaries.push({
      counter,
      traces: rs.length,
      truth: sum('truth'),
      predicted: sum('predicted'),
      ...pooled,
      precision,
      recall,
      medianLagMs: lags.length ? lags[Math.floor(lags.length / 2)]! : null,
      thresholds,
      pass: precision >= thresholds.minPrecision && recall >= thresholds.minRecall,
    });
  }
  return { results, summaries };
}

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

function table(head: string[], rows: string[][], textCols = 1): string {
  const w = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i]!.length)));
  const line = (cells: string[]) => cells.map((c, i) => (i < textCols ? c.padEnd(w[i]!) : c.padStart(w[i]!))).join('  ');
  return [line(head), w.map((n) => '-'.repeat(n)).join('  '), ...rows.map(line)].join('\n');
}

export function formatSummaryTable(summaries: readonly CounterSummary[]): string {
  return table(
    ['Exercise', 'Traces', 'Truth', 'Counted', 'TP', 'FP', 'FN', 'Precision', 'Recall', 'Lag (med)', 'Bar (P/R)', 'Result'],
    summaries.map((s) => [
      s.counter,
      String(s.traces),
      String(s.truth),
      String(s.predicted),
      String(s.tp),
      String(s.fp),
      String(s.fn),
      pct(s.precision),
      pct(s.recall),
      s.medianLagMs === null ? '–' : `${Math.round(s.medianLagMs)} ms`,
      `${pct(s.thresholds.minPrecision)}/${pct(s.thresholds.minRecall)}`,
      s.pass ? 'PASS' : 'FAIL',
    ]),
  );
}

export function formatTraceTable(results: readonly TraceResult[]): string {
  return table(
    ['Trace', 'Exercise', 'Mode', 'View', 'Light', 'Mobility', 'Truth', 'Counted', 'P', 'R'],
    results.map((r) => [r.name, r.counter, r.rangeMode, r.setup.view, r.setup.lighting, r.setup.mobility, String(r.truth), String(r.predicted), pct(r.precision), pct(r.recall)]),
    6,
  );
}
