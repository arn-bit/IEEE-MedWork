import { describe, expect, it } from 'vitest';
import { GAME_COSTS, garden, sessionTokens, tokenSummary, tokensForNewSession, TOKEN_RULES } from './tokens';
import type { SessionLog } from '../types';

let n = 0;
const log = (date: string, extra: Partial<SessionLog> = {}): SessionLog => ({
  id: `t${n++}`,
  plannedSessionId: null,
  startedAt: new Date(date).toISOString(),
  endedAt: new Date(date).toISOString(),
  activeSeconds: 900,
  sets: [],
  completedExerciseIds: ['a', 'b', 'c'],
  rpe: null,
  note: '',
  endedReason: 'completed',
  ...extra,
});
const NOW = new Date('2026-10-16T12:00:00');

describe('earning tokens', () => {
  it('a completed workout earns a base reward plus one per exercise (capped)', () => {
    expect(sessionTokens(log('2026-10-12T09:00:00'))).toBe(TOKEN_RULES.base + 3);
    expect(sessionTokens(log('2026-10-12T09:00:00', { completedExerciseIds: Array.from({ length: 20 }, (_, i) => `e${i}`) }))).toBe(TOKEN_RULES.base + TOKEN_RULES.maxExerciseBonus);
  });

  it('ending a workout early earns no tokens, whatever the reason (no farming)', () => {
    expect(sessionTokens(log('2026-10-12T09:00:00', { activeSeconds: 20, endedReason: 'stopped_symptoms', completedExerciseIds: [] }))).toBe(0);
    expect(sessionTokens(log('2026-10-12T09:00:00', { activeSeconds: 600, endedReason: 'stopped_user', completedExerciseIds: ['a', 'b'] }))).toBe(0);
  });

  it('library free-play sessions earn no tokens', () => {
    expect(sessionTokens(log('2026-10-12T09:00:00', { plannedSessionId: 'try-sit_to_stand' }))).toBe(0);
  });

  it('a session under a minute with no symptoms earns nothing', () => {
    expect(sessionTokens(log('2026-10-12T09:00:00', { activeSeconds: 10 }))).toBe(0);
  });

  it('only the first N sessions each week earn tokens, where N is your plan', () => {
    const week = ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16'].map((d) => log(`${d}T09:00:00`));
    const s = tokenSummary(week, 3, 0, 0);
    expect(s.earnedFromWorkouts).toBe(3 * 8);
    expect(s.uncountedExtras).toBe(2);
  });

  it('a new week starts fresh', () => {
    const s = tokenSummary([log('2026-10-12T09:00:00'), log('2026-10-19T09:00:00')], 1, 0, 0);
    expect(s.earnedFromWorkouts).toBe(16);
  });

  it('choosing rest earns a few tokens, capped', () => {
    expect(tokenSummary([], 3, 2, 0).earnedFromRest).toBe(4);
    expect(tokenSummary([], 3, 500, 0).earnedFromRest).toBe(TOKEN_RULES.maxRestTokens);
  });

  it('new-session reward is zero once the weekly plan is covered', () => {
    const done = [log('2026-10-12T09:00:00'), log('2026-10-13T09:00:00')];
    expect(tokensForNewSession(done, log('2026-10-15T09:00:00'), 3)).toBe(8);
    expect(tokensForNewSession(done, log('2026-10-15T09:00:00'), 2)).toBe(0);
  });
});

describe('spending tokens', () => {
  it('balance is earned minus spent, and can never go negative', () => {
    const s = tokenSummary([log('2026-10-12T09:00:00')], 3, 0, 5);
    expect(s.earned).toBe(8);
    expect(s.balance).toBe(3);
    expect(tokenSummary([], 3, 0, 99).balance).toBe(0);
    expect(tokenSummary([log('2026-10-12T09:00:00')], 3, 0, 99).balance).toBe(0);
  });

  it('every game has a positive cost and the first workout can pay for one', () => {
    for (const c of Object.values(GAME_COSTS)) expect(c).toBeGreaterThan(0);
    expect(TOKEN_RULES.base + 1).toBeGreaterThanOrEqual(Math.max(...Object.values(GAME_COSTS)));
  });
});

describe('garden', () => {
  it('plants grow with progress toward your own weekly target', () => {
    const sessions = [log('2026-10-12T09:00:00'), log('2026-10-14T09:00:00'), log('2026-10-05T09:00:00')];
    const plots = garden(sessions, 3, [], NOW, 3);
    expect(plots).toHaveLength(3);
    const cur = plots[2]!;
    expect(cur.current).toBe(true);
    expect(cur.target).toBe(2);
    expect(cur.stage).toBe(4); // 2 of 2 → in bloom
    expect(plots[1]!.stage).toBe(2); // 1 of 2 → half grown
  });

  it('a missed week is bare soil, a paused week is not shown as a failure', () => {
    const plots = garden([], 3, [{ start: '2026-10-05T00:00:00', end: '2026-10-11T23:00:00', reason: 'unwell' }], NOW, 3);
    expect(plots[0]!.stage).toBe(0);
    expect(plots[1]!.paused).toBe(true);
  });
});
