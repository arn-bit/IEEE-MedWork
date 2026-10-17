import type { SessionLog } from '../types';

/**
 * Habit-supporting gamification rules. Principles:
 *  - Consistency is measured per WEEK against the user's own plan, so rest days never break a streak.
 *  - A week counts when at least ⅔ of planned sessions (rounded up) are done — missing one is OK.
 *  - Paused weeks (illness, injury, life) are skipped: they neither add to nor break the streak.
 *  - Points are capped at the plan, so doing extra sessions earns nothing extra.
 */

export interface Pause {
  start: string; // ISO date
  end: string | null;
  reason: 'unwell' | 'injury' | 'symptoms' | 'other';
}

/** ISO-8601 week key (Monday-based), e.g. "2026-W42". */
export function weekKey(d: Date): string {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function startOfWeek(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = x.getDay() || 7;
  x.setDate(x.getDate() - (day - 1));
  return x;
}

export function weeklyTarget(plannedDays: number): number {
  return Math.max(1, Math.ceil((plannedDays * 2) / 3));
}

export function countsAsSession(s: SessionLog): boolean {
  // Stopping early for symptoms still counts as showing up.
  return s.activeSeconds >= 60 || s.endedReason === 'stopped_symptoms';
}

function weekPaused(weekStart: Date, pauses: Pause[], now: Date): boolean {
  const ws = weekStart.getTime();
  const we = ws + 7 * 86400000;
  return pauses.some((p) => {
    const ps = new Date(p.start).getTime();
    const pe = p.end ? new Date(p.end).getTime() : now.getTime();
    // A week is paused if a pause covers at least 3 of its days.
    const overlap = Math.min(we, pe) - Math.max(ws, ps);
    return overlap >= 3 * 86400000;
  });
}

export interface WeekSummary {
  key: string;
  start: Date;
  sessions: number;
  target: number;
  met: boolean;
  paused: boolean;
  current: boolean;
}

export function weekSummaries(sessions: SessionLog[], plannedDays: number, pauses: Pause[], now: Date, weeks = 12): WeekSummary[] {
  const target = weeklyTarget(plannedDays);
  const counts = new Map<string, number>();
  for (const s of sessions) {
    if (!countsAsSession(s)) continue;
    const k = weekKey(new Date(s.startedAt));
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const out: WeekSummary[] = [];
  const thisWeek = startOfWeek(now);
  for (let i = weeks - 1; i >= 0; i--) {
    const start = new Date(thisWeek);
    start.setDate(start.getDate() - 7 * i);
    const key = weekKey(start);
    const n = counts.get(key) ?? 0;
    out.push({ key, start, sessions: n, target, met: n >= target, paused: weekPaused(start, pauses, now), current: i === 0 });
  }
  return out;
}

/**
 * Consecutive consistent weeks ending now. The current week only adds once met and never breaks the
 * streak while still in progress. Paused weeks are skipped.
 */
export function consistencyStreak(sessions: SessionLog[], plannedDays: number, pauses: Pause[], now: Date): number {
  const weeks = weekSummaries(sessions, plannedDays, pauses, now, 104);
  let streak = 0;
  for (let i = weeks.length - 1; i >= 0; i--) {
    const w = weeks[i]!;
    if (w.current) {
      if (w.met) streak++;
      continue;
    }
    if (w.met) streak++;
    else if (w.paused) continue;
    else break;
  }
  return streak;
}

// ───────────────────────────── Achievements ─────────────────────────────

export interface AchievementDef {
  id: string;
  title: string;
  description: string;
  icon: 'spark' | 'calendar' | 'flame' | 'compass' | 'heart' | 'return' | 'flag' | 'book' | 'balance' | 'pause';
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_workout', title: 'First step', description: 'Completed your first workout.', icon: 'spark' },
  { id: 'consistent_week', title: 'Steady week', description: 'Met your weekly target for the first time.', icon: 'calendar' },
  { id: 'three_weeks', title: 'Habit forming', description: 'Three consistent weeks in a row (paused weeks don’t count against you).', icon: 'flame' },
  { id: 'new_moves', title: 'Movement learner', description: 'Completed 5 different exercises.', icon: 'compass' },
  { id: 'explorer', title: 'Explorer', description: 'Completed 10 different exercises.', icon: 'compass' },
  { id: 'mindful', title: 'Tuned in', description: 'Rated your effort after 5 workouts.', icon: 'heart' },
  { id: 'comeback', title: 'Welcome back', description: 'Returned to exercise after a planned pause or a break.', icon: 'return' },
  { id: 'listened', title: 'Listened to your body', description: 'Chose rest when the check-in suggested it.', icon: 'pause' },
  { id: 'personal_goal', title: 'Goal reached', description: 'Completed a personal goal you set.', icon: 'flag' },
  { id: 'quiz', title: 'Evidence-savvy', description: 'Completed the Move Smart quiz.', icon: 'book' },
  { id: 'balance_practice', title: 'Steady stance', description: 'Finished the balance game 3 times.', icon: 'balance' },
];

export interface PersonalGoal {
  targetSessions: number;
  weeks: number;
  createdAt: string;
}

export interface AchievementInput {
  sessions: SessionLog[];
  plannedDays: number;
  pauses: Pause[];
  restChoices: number;
  quizCompleted: boolean;
  balanceCompletions: number;
  personalGoal: PersonalGoal | null;
  now: Date;
}

export function personalGoalProgress(goal: PersonalGoal, sessions: SessionLog[]): { done: number; target: number; deadline: Date; complete: boolean; expired: boolean } {
  const start = new Date(goal.createdAt);
  const deadline = new Date(start.getTime() + goal.weeks * 7 * 86400000);
  const done = sessions.filter((s) => countsAsSession(s) && new Date(s.startedAt) >= start && new Date(s.startedAt) <= deadline).length;
  return { done, target: goal.targetSessions, deadline, complete: done >= goal.targetSessions, expired: Date.now() > deadline.getTime() && done < goal.targetSessions };
}

export function earnedAchievements(i: AchievementInput): Set<string> {
  const earned = new Set<string>();
  const real = i.sessions.filter(countsAsSession).sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  if (real.length >= 1) earned.add('first_workout');
  const weeks = weekSummaries(i.sessions, i.plannedDays, i.pauses, i.now, 104);
  if (weeks.some((w) => w.met)) earned.add('consistent_week');
  // Longest run of consistent weeks (skipping paused weeks).
  let run = 0;
  let best = 0;
  for (const w of weeks) {
    if (w.met) run++;
    else if (!w.paused && !w.current) run = 0;
    best = Math.max(best, run);
  }
  if (best >= 3) earned.add('three_weeks');
  const distinct = new Set(i.sessions.flatMap((s) => s.completedExerciseIds));
  if (distinct.size >= 5) earned.add('new_moves');
  if (distinct.size >= 10) earned.add('explorer');
  if (i.sessions.filter((s) => s.rpe !== null).length >= 5) earned.add('mindful');
  for (let k = 1; k < real.length; k++) {
    const prev = new Date(real[k - 1]!.startedAt).getTime();
    const cur = new Date(real[k]!.startedAt).getTime();
    const afterPause = i.pauses.some((p) => p.end && new Date(p.end).getTime() <= cur && new Date(p.start).getTime() >= prev);
    if (afterPause || cur - prev >= 10 * 86400000) earned.add('comeback');
  }
  if (i.restChoices > 0) earned.add('listened');
  if (i.personalGoal && personalGoalProgress(i.personalGoal, i.sessions).complete) earned.add('personal_goal');
  if (i.quizCompleted) earned.add('quiz');
  if (i.balanceCompletions >= 3) earned.add('balance_practice');
  return earned;
}

// ───────────────────────────── Leaderboard ─────────────────────────────

export type CompetitionBand = 'adult' | 'youth';

export interface ScoreCard {
  v: 1;
  name: string;
  week: string;
  points: number;
  plannedDays: number;
  band: CompetitionBand;
}

/** Points for a week: 10 per session up to the plan, +5 bonus when the weekly target is met. Capped. */
export function weeklyPoints(sessionsThisWeek: number, plannedDays: number): number {
  const capped = Math.min(sessionsThisWeek, plannedDays);
  return capped * 10 + (sessionsThisWeek >= weeklyTarget(plannedDays) ? 5 : 0);
}

export const maxWeeklyPoints = (plannedDays: number) => plannedDays * 10 + 5;

const NAME_RE = /^[A-Za-z0-9 _-]{2,20}$/;

export function validPseudonym(name: string): boolean {
  return NAME_RE.test(name.trim());
}

function checksum(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36).slice(0, 5);
}

function b64urlEncode(s: string): string {
  return btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(s: string): string {
  const pad = s.length % 4 ? '='.repeat(4 - (s.length % 4)) : '';
  return decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad)));
}

/** Share code contains ONLY: pseudonym, week, points, planned days, and adult/youth band. */
export function encodeScoreCard(card: ScoreCard): string {
  const payload = JSON.stringify([card.v, card.name.trim(), card.week, card.points, card.plannedDays, card.band]);
  return `MW1.${b64urlEncode(payload)}.${checksum(payload)}`;
}

export type DecodeResult = { ok: true; card: ScoreCard } | { ok: false; error: string };

export function decodeScoreCard(code: string, now: Date): DecodeResult {
  const parts = code.trim().split('.');
  if (parts.length !== 3 || parts[0] !== 'MW1') return { ok: false, error: 'That does not look like a Verimove share code.' };
  let payload: string;
  try {
    payload = b64urlDecode(parts[1]!);
  } catch {
    return { ok: false, error: 'The code is damaged. Ask your friend to copy it again.' };
  }
  if (checksum(payload) !== parts[2]) return { ok: false, error: 'The code is incomplete or was changed. Ask your friend to copy it again.' };
  let arr: unknown;
  try {
    arr = JSON.parse(payload);
  } catch {
    return { ok: false, error: 'The code is damaged.' };
  }
  if (!Array.isArray(arr) || arr.length !== 6) return { ok: false, error: 'Unsupported code version.' };
  const [v, name, week, points, plannedDays, band] = arr as unknown[];
  if (v !== 1) return { ok: false, error: 'Unsupported code version.' };
  if (typeof name !== 'string' || !validPseudonym(name)) return { ok: false, error: 'The nickname in this code is not valid.' };
  if (typeof week !== 'string' || !/^\d{4}-W\d{2}$/.test(week)) return { ok: false, error: 'The week in this code is not valid.' };
  if (week > weekKey(now)) return { ok: false, error: 'This code is for a future week.' };
  if (typeof plannedDays !== 'number' || !Number.isInteger(plannedDays) || plannedDays < 1 || plannedDays > 7) return { ok: false, error: 'The plan in this code is not valid.' };
  if (typeof points !== 'number' || !Number.isInteger(points) || points < 0 || points > maxWeeklyPoints(plannedDays))
    return { ok: false, error: 'The points in this code are higher than any plan allows, so it was rejected.' };
  if (band !== 'adult' && band !== 'youth') return { ok: false, error: 'The code is not valid.' };
  return { ok: true, card: { v: 1, name: name.trim(), week, points, plannedDays, band } };
}

/** Whether a viewer in `viewerBand` may see/compete with an entry. Children and adults are never compared. */
export function canCompare(viewerBand: CompetitionBand, entryBand: CompetitionBand): boolean {
  return viewerBand === entryBand;
}
