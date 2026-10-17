import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseTrace, type RepTrace } from '../replay';

/** Node-only: reads every *.json validation trace in src/pose/fixtures. Never bundled into the app. */
export const FIXTURES_DIR = resolve(process.cwd(), 'src/pose/fixtures');

export function loadTraceFixtures(dir: string = FIXTURES_DIR): { name: string; trace: RepTrace }[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith('.json'))
    .sort()
    .map((name) => {
      try {
        return { name, trace: parseTrace(JSON.parse(readFileSync(join(dir, name), 'utf8'))) };
      } catch (e) {
        throw new Error(`Invalid trace fixture ${name}: ${(e as Error).message}`, { cause: e });
      }
    });
}
