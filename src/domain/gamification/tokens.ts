import type { SessionLog } from '../types';
import { countsAsSession, startOfWeek, weekKey, weekSummaries, type Pause } from './rules';

/**
 * Token economy: workouts earn tokens, tokens buy plays of the minigames.
 *
 * Designed to reward consistency, not volume (same principle as streaks and points):
 *  - Only your first N sessions each week earn tokens, where N is the number of workouts in YOUR plan.
 *    Extra sessions are welcome but earn nothing extra, so there's no incentive to overtrain.
 *  - Only a workout you finish earns tokens. Ending early (for any reason) earns none, so the reward
 *    can't be farmed by starting and stopping. Stopping when something hurts is still always the right
 *    call; it just isn't rewarded with tokens, and it never costs you your streak or plan.
 *  - Choosing to rest earns a few tokens (limited), so rest is never the "worse" option.
 *  - Earned tokens are DERIVED from your logged sessions, so the balance can't drift out of sync.
 */

export const TOKEN_RULES = {
  /** Tokens for turning up to a planned workout. */
  base: 5,
  /** Extra tokens per exercise completed, up to `maxExerciseBonus`. */
  perExercise: 1,
  maxExerciseBonus: 8,
  /** Tokens per "I'm resting today" choice, capped overall. */
  perRestChoice: 2,
  maxRestTokens: 24,
} as const;

export type GameId = 'balance' | 'reaction' | 'memory' | 'garden_quiz';

export const GAME_COSTS: Record<'balance' | 'reaction' | 'memory', number> = {
  balance: 3,
  reaction: 3,
  memory: 2,
};

export function sessionTokens(s: SessionLog): number {
  if (!countsAsSession(s)) return 0;
  if (s.endedReason !== 'completed') return 0;
  return TOKEN_RULES.base + Math.min(TOKEN_RULES.maxExerciseBonus, s.completedExerciseIds.length * TOKEN_RULES.perExercise);
}

export interface TokenSummary {
  earnedFromWorkouts: number;
  earnedFromRest: number;
  earned: number;
  spent: number;
  balance: number;
  /** Sessions that were beyond the weekly plan and so earned nothing extra. */
  uncountedExtras: number;
}

export function tokenSummary(sessions: SessionLog[], plannedDays: number, restChoices: number, spent: number): TokenSummary {
  const perWeek = new Map<string, number>();
  let earnedFromWorkouts = 0;
  let uncountedExtras = 0;
  const ordered = [...sessions].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  for (const s of ordered) {
    const t = sessionTokens(s);
    if (t === 0) continue;
    const wk = weekKey(new Date(s.startedAt));
    const n = perWeek.get(wk) ?? 0;
    if (n >= plannedDays) {
      uncountedExtras++;
      continue;
    }
    perWeek.set(wk, n + 1);
    earnedFromWorkouts += t;
  }
  const earnedFromRest = Math.min(TOKEN_RULES.maxRestTokens, Math.max(0, restChoices) * TOKEN_RULES.perRestChoice);
  const earned = earnedFromWorkouts + earnedFromRest;
  const safeSpent = Math.max(0, Math.min(spent, earned));
  return { earnedFromWorkouts, earnedFromRest, earned, spent: safeSpent, balance: earned - safeSpent, uncountedExtras };
}

/** How many tokens would logging `next` add right now? Used for the "+N tokens" message after a workout. */
export function tokensForNewSession(sessions: SessionLog[], next: SessionLog, plannedDays: number): number {
  const before = tokenSummary(sessions, plannedDays, 0, 0).earnedFromWorkouts;
  const after = tokenSummary([...sessions, next], plannedDays, 0, 0).earnedFromWorkouts;
  return after - before;
}

// ───────────────────────────── garden (derived, cosmetic) ─────────────────────────────

export interface Plot {
  key: string;
  start: Date;
  sessions: number;
  target: number;
  /** 0 = bare soil, 1 = seed, 2 = sprout, 3 = growing, 4 = in bloom */
  stage: 0 | 1 | 2 | 3 | 4;
  paused: boolean;
  current: boolean;
}

/** One plot per week. Plants grow as you reach your own weekly target; rest and pauses never wilt them. */
export function garden(sessions: SessionLog[], plannedDays: number, pauses: Pause[], now: Date, weeks = 8): Plot[] {
  return weekSummaries(sessions, plannedDays, pauses, now, weeks).map((w) => {
    const ratio = w.target > 0 ? Math.min(1, w.sessions / w.target) : 0;
    const stage = (w.sessions === 0 ? 0 : Math.max(1, Math.round(ratio * 4))) as Plot['stage'];
    return { key: w.key, start: w.start, sessions: w.sessions, target: w.target, stage, paused: w.paused && !w.met, current: w.current };
  });
}

export { startOfWeek };
