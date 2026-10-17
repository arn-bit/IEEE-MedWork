import { describe, expect, it } from 'vitest';
import { moderateEquivalentMinutes, progressionSuggestion, weeklyAerobicTarget, type ActivityEntry } from './progression';
import { generatePlan } from './engine';
import { makeProfile } from '../profile';
import type { Plan, Prescription, SessionLog } from '../types';

const NOW = new Date('2026-10-16T12:00:00Z');
const plan = (() => {
  const r = generatePlan(makeProfile({ goals: ['strength'] }), NOW);
  if (!r.ok) throw new Error('no plan');
  return r.plan as Plan;
})();
const rx: Prescription = {
  kind: 'reps', sets: 2, amount: 8, perSide: false, restSeconds: 60, secondsPerRep: 4, intensity: '', rationale: '', evidenceIds: [], evidenceKind: 'position_stand',
};
let n = 0;
const log = (daysAgo: number, achieved: number[], extra: Partial<SessionLog> = {}, exerciseId = 'mini_squat'): SessionLog => ({
  id: `s${n++}`,
  plannedSessionId: null,
  startedAt: new Date(NOW.getTime() - daysAgo * 86400000).toISOString(),
  endedAt: new Date(NOW.getTime() - daysAgo * 86400000).toISOString(),
  activeSeconds: 600,
  sets: achieved.map((a, i) => ({ exerciseId, setIndex: i, target: 8, achieved: a, kind: 'reps', trackedBy: 'manual', manualCorrections: 0 })),
  completedExerciseIds: [exerciseId],
  rpe: null,
  note: '',
  endedReason: 'completed',
  ...extra,
});

describe('progression suggestions', () => {
  it('suggests nothing without two strong recent sessions', () => {
    expect(progressionSuggestion('mini_squat', rx, plan, [log(2, [10, 10])], NOW)).toBeNull();
    expect(progressionSuggestion('mini_squat', rx, plan, [log(2, [10, 10]), log(4, [10, 9])], NOW)).toBeNull();
  });

  it('suggests progressing (to the harder variant) after two sessions ≥ target + 2', () => {
    const s = progressionSuggestion('mini_squat', rx, plan, [log(2, [10, 10]), log(4, [11, 10])], NOW);
    expect(s?.kind).toBe('progress');
    if (s?.kind === 'progress') {
      expect(s.harderId).toBe('bodyweight_squat');
      expect(s.evidenceIds).toContain('acsm-rt-2009');
    }
  });

  it('ignores sessions older than 21 days', () => {
    expect(progressionSuggestion('mini_squat', rx, plan, [log(30, [12, 12]), log(25, [12, 12])], NOW)).toBeNull();
  });

  it('holds (never pushes) within 7 days of a session stopped for symptoms', () => {
    const s = progressionSuggestion('mini_squat', rx, plan, [log(2, [10, 10]), log(4, [10, 10]), log(1, [], { endedReason: 'stopped_symptoms' })], NOW);
    expect(s?.kind).toBe('hold');
  });

  it('never suggests a harder variant the plan excluded', () => {
    const knees = generatePlan(makeProfile({ goals: ['strength'] }, { painAreas: ['lower_back'] }), NOW);
    if (!knees.ok) throw new Error('no plan');
    const s = progressionSuggestion('mini_squat', rx, knees.plan, [log(2, [10, 10]), log(4, [10, 10])], NOW);
    expect(s?.kind).toBe('progress');
    if (s?.kind === 'progress') expect(s.harderId).toBeNull(); // bodyweight_squat loads lower back
  });

  it('only applies to rep-based prescriptions', () => {
    expect(progressionSuggestion('mini_squat', { ...rx, kind: 'time' }, plan, [log(2, [10, 10]), log(4, [10, 10])], NOW)).toBeNull();
  });
});

describe('weekly activity minutes', () => {
  const from = new Date('2026-10-12T00:00:00Z');
  const to = new Date('2026-10-19T00:00:00Z');
  const e = (date: string, minutes: number, intensity: ActivityEntry['intensity']): ActivityEntry => ({ id: date + minutes, date, minutes, intensity, kind: 'walk' });

  it('counts vigorous minutes double and excludes light minutes from the target', () => {
    const r = moderateEquivalentMinutes([e('2026-10-13T10:00:00Z', 30, 'moderate'), e('2026-10-14T10:00:00Z', 20, 'vigorous'), e('2026-10-15T10:00:00Z', 40, 'light')], [], from, to);
    expect(r).toEqual({ counted: 70, light: 40 });
  });

  it('ignores entries outside the week', () => {
    expect(moderateEquivalentMinutes([e('2026-10-01T10:00:00Z', 30, 'moderate')], [], from, to).counted).toBe(0);
  });

  it('age-appropriate weekly targets', () => {
    expect(weeklyAerobicTarget(35).minutes).toBe(150);
    expect(weeklyAerobicTarget(70).minutes).toBe(150);
    expect(weeklyAerobicTarget(12).minutes).toBe(420);
  });
});
