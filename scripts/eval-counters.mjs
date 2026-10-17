#!/usr/bin/env node
/**
 * Prints a per-exercise accuracy table for the camera rep counters by replaying every validation
 * trace in src/pose/fixtures/ (recorded on-device with the dev-only /dev/record page).
 *
 *   npm run eval:counters               # summary + per-trace table
 *   REP_EVAL_TOLERANCE_MS=1000 npm run eval:counters
 *
 * Runs entirely locally. Exit code 1 if any counter is below its precision/recall bar.
 * A handful of traces is not clinical validation — see TEST_PLAN.md §8.
 */
import { runnerImport } from 'vite';
import { fileURLToPath } from 'node:url';

const root = new URL('..', import.meta.url);
// Vite's module runner loads the TypeScript sources directly (no build step needed).
const load = async (p) => (await runnerImport(fileURLToPath(new URL(p, root)), { root: fileURLToPath(root), configFile: false })).module;

const { loadTraceFixtures, FIXTURES_DIR } = await load('src/pose/testing/traceFixtures.ts');
const { evaluateAll, formatSummaryTable, formatTraceTable } = await load('src/pose/replay.ts');

const traces = loadTraceFixtures();
if (traces.length === 0) {
  console.log(`No validation traces in ${FIXTURES_DIR}.`);
  console.log('Record some with `npm run dev` → http://localhost:5180/dev/record (see TEST_PLAN.md §8).');
  process.exit(0);
}

const { results, summaries } = evaluateAll(traces, process.env);
console.log(`\nCamera rep counter accuracy — ${traces.length} trace(s) from ${FIXTURES_DIR}\n`);
console.log(formatSummaryTable(summaries));
console.log('\nPer trace:\n');
console.log(formatTraceTable(results));
console.log('\nTP = counted rep matched to a "Rep done" tap within the tolerance; FP = counted with no tap; FN = tap with no count.');
console.log('Lag = counter time minus tap time (positive = counter after the tap). Not clinical validation.\n');
process.exit(summaries.every((s) => s.pass) ? 0 : 1);
