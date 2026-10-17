import { describe, expect, it } from 'vitest';
import {
  consistencyStreak,
  decodeScoreCard,
  earnedAchievements,
  encodeScoreCard,
  maxWeeklyPoints,
  weekKey,
  weeklyPoints,
  weeklyTarget,
  canCompare,
  type Pause,
} from './rules';
import type { SessionLog } from '../types';

let n = 0;
function session(date: string, extra: Partial<SessionLog> = {}): SessionLog {
  return {
    id: `x${n++}`,
    plannedSessionId: null,
    startedAt: new Date(date).toISOString(),
    endedAt: new Date(date).toISOString(),
    activeSeconds: 600,
    sets: [],
    completedExerciseIds: ['sit_to_stand'],
    rpe: null,
    note: '',
    endedReason: 'completed',
    ...extra,
  };
}

// 2026-10-16 is a Friday in ISO week 42.
const NOW = new Date('2026-10-16T12:00:00');

describe('weeks', () => {
  it('computes ISO week keys', () => {
    expect(weekKey(new Date('2026-10-16T12:00:00'))).toBe('2026-W42');
    expect(weekKey(new Date('2026-10-12T12:00:00'))).toBe('2026-W42'); // Monday
    expect(weekKey(new Date('2026-10-11T12:00:00'))).toBe('2026-W41'); // Sunday
    expect(weekKey(new Date('2021-01-03T12:00:00'))).toBe('2020-W53');
  });
  it('weekly target is two-thirds of planned days, rounded up', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(weeklyTarget)).toEqual([1, 2, 2, 3, 4, 4, 5]);
  });
});

describe('consistency streak', () => {
  const plan = 3; // target 2/week
  const twoPerWeek = (mondays: string[]) => mondays.flatMap((m) => [session(`${m}T09:00:00`), session(`${m.slice(0, 8)}${String(Number(m.slice(8)) + 2).padStart(2, '0')}T09:00:00`)]);

  it('rest days never break the streak — only weekly targets matter', () => {
    const s = twoPerWeek(['2026-09-28', '2026-10-05']);
    expect(consistencyStreak(s, plan, [], NOW)).toBe(2);
  });

  it('the in-progress week does not break the streak', () => {
    const s = twoPerWeek(['2026-09-28', '2026-10-05']); // nothing yet in W42
    expect(consistencyStreak(s, plan, [], NOW)).toBe(2);
  });

  it('a missed (unpaused) week breaks the streak', () => {
    const s = twoPerWeek(['2026-09-21', '2026-10-05']); // W40 missed
    expect(consistencyStreak(s, plan, [], NOW)).toBe(1);
  });

  it('a paused week (illness) is skipped rather than breaking the streak', () => {
    const s = twoPerWeek(['2026-09-21', '2026-10-05']);
    const pauses: Pause[] = [{ start: '2026-09-28T00:00:00', end: '2026-10-04T23:00:00', reason: 'unwell' }];
    expect(consistencyStreak(s, plan, pauses, NOW)).toBe(2);
  });

  it('extra sessions above the plan do not inflate anything', () => {
    const many = Array.from({ length: 14 }, (_, i) => session(`2026-10-05T0${i % 10}:00:00`));
    expect(consistencyStreak(many, plan, [], NOW)).toBe(1);
  });

  it('a session stopped early for symptoms still counts as showing up', () => {
    const s = [session('2026-10-05T09:00:00'), session('2026-10-07T09:00:00', { activeSeconds: 20, endedReason: 'stopped_symptoms' })];
    expect(consistencyStreak(s, plan, [], NOW)).toBe(1);
  });
});

describe('achievements', () => {
  const base = { plannedDays: 3, pauses: [] as Pause[], restChoices: 0, quizCompleted: false, balanceCompletions: 0, personalGoal: null, now: NOW };

  it('first workout and learning-based achievements', () => {
    const ids = ['a', 'b', 'c', 'd', 'e'];
    const s = ids.map((id, i) => session(`2026-10-0${i + 1}T09:00:00`, { completedExerciseIds: [id], rpe: 4 }));
    const e = earnedAchievements({ ...base, sessions: s });
    expect(e.has('first_workout')).toBe(true);
    expect(e.has('new_moves')).toBe(true);
    expect(e.has('explorer')).toBe(false);
    expect(e.has('mindful')).toBe(true);
  });

  it('comeback after a break of 10+ days', () => {
    const e = earnedAchievements({ ...base, sessions: [session('2026-09-01T09:00:00'), session('2026-09-20T09:00:00')] });
    expect(e.has('comeback')).toBe(true);
  });

  it('nothing is earned for zero activity', () => {
    expect(earnedAchievements({ ...base, sessions: [] }).size).toBe(0);
  });

  it('rewards choosing rest and learning, not volume', () => {
    const e = earnedAchievements({ ...base, sessions: [], restChoices: 1, quizCompleted: true, balanceCompletions: 3 });
    expect([...e].sort()).toEqual(['balance_practice', 'listened', 'quiz']);
  });

  it('personal goal completes when the target is met within the window', () => {
    const goal = { targetSessions: 2, weeks: 2, createdAt: '2026-10-01T00:00:00' };
    const e = earnedAchievements({ ...base, personalGoal: goal, sessions: [session('2026-10-02T09:00:00'), session('2026-10-05T09:00:00')] });
    expect(e.has('personal_goal')).toBe(true);
  });
});

describe('leaderboard share codes', () => {
  it('points are capped at the plan', () => {
    expect(weeklyPoints(3, 3)).toBe(35);
    expect(weeklyPoints(10, 3)).toBe(35);
    expect(weeklyPoints(1, 3)).toBe(10);
    expect(maxWeeklyPoints(3)).toBe(35);
  });

  it('round-trips a valid card and contains no health data', () => {
    const code = encodeScoreCard({ v: 1, name: 'Blue Heron', week: '2026-W42', points: 25, plannedDays: 3, band: 'adult' });
    const r = decodeScoreCard(code, NOW);
    expect(r.ok).toBe(true);
    if (r.ok) expect(Object.keys(r.card).sort()).toEqual(['band', 'name', 'plannedDays', 'points', 'v', 'week']);
  });

  it('rejects inflated points', () => {
    const code = encodeScoreCard({ v: 1, name: 'Cheater', week: '2026-W42', points: 999, plannedDays: 3, band: 'adult' });
    const r = decodeScoreCard(code, NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/higher than any plan/);
  });

  it('rejects tampered, future-week, malformed, and unsafe-name codes', () => {
    const good = encodeScoreCard({ v: 1, name: 'Ok Name', week: '2026-W42', points: 10, plannedDays: 3, band: 'adult' });
    const [a, b, c] = good.split('.');
    expect(decodeScoreCard(`${a}.${b}.zzzzz`, NOW).ok).toBe(false);
    expect(decodeScoreCard(`${a}.${b}x.${c}`, NOW).ok).toBe(false);
    expect(decodeScoreCard('hello', NOW).ok).toBe(false);
    expect(decodeScoreCard(encodeScoreCard({ v: 1, name: 'Future', week: '2026-W50', points: 10, plannedDays: 3, band: 'adult' }), NOW).ok).toBe(false);
    expect(decodeScoreCard(encodeScoreCard({ v: 1, name: '<script>', week: '2026-W42', points: 10, plannedDays: 3, band: 'adult' }), NOW).ok).toBe(false);
  });

  it('never compares youth with adults', () => {
    expect(canCompare('adult', 'youth')).toBe(false);
    expect(canCompare('youth', 'adult')).toBe(false);
    expect(canCompare('youth', 'youth')).toBe(true);
  });
});
