import { getExercise } from '../exercises/library';
import type { Plan, Prescription, SessionLog } from '../types';

/**
 * Transparent, rule-based progression suggestions (never automatic plan changes).
 * Basis: ACSM (2009) — progress when the current workload can be done for 1–2 reps over the target.
 * Safety: no suggestion to progress within 7 days of a session stopped because of symptoms.
 */
export type ProgressionSuggestion =
  | { kind: 'progress'; message: string; harderId: string | null; evidenceIds: string[] }
  | { kind: 'hold'; message: string; evidenceIds: string[] };

const DAY = 86_400_000;

export function progressionSuggestion(exerciseId: string, rx: Prescription, plan: Plan, sessions: SessionLog[], now: Date): ProgressionSuggestion | null {
  if (rx.kind !== 'reps') return null;
  const recentStop = sessions.some((s) => s.endedReason === 'stopped_symptoms' && now.getTime() - new Date(s.startedAt).getTime() < 7 * DAY);
  const target = rx.amount * (rx.perSide ? 2 : 1);
  const window = sessions.filter((s) => now.getTime() - new Date(s.startedAt).getTime() < 21 * DAY);
  // Sessions in which every logged set of this exercise beat the target by ≥ 2 reps.
  const strongSessions = window.filter((s) => {
    const sets = s.sets.filter((l) => l.exerciseId === exerciseId && l.kind === 'reps');
    return sets.length > 0 && sets.every((l) => l.achieved >= target + 2);
  });
  if (strongSessions.length < 2) return null;
  if (recentStop) {
    return {
      kind: 'hold',
      message: 'You have been beating your target, but a recent workout ended early because you felt unwell. Stay at this level for now.',
      evidenceIds: ['heuristic-conservative'],
    };
  }
  const ex = getExercise(exerciseId);
  const harder = ex?.harder && !plan.excluded.some((x) => x.exerciseId === ex.harder) ? ex.harder : null;
  const harderName = harder ? getExercise(harder)?.name : null;
  return {
    kind: 'progress',
    harderId: harder,
    message: harderName
      ? `You beat your target by 2+ reps in your last two sessions. If it feels comfortable, try ${harderName}, or add 2 reps per set.`
      : 'You beat your target by 2+ reps in your last two sessions. If it feels comfortable, add 2 reps per set (up to 12), then an extra set.',
    evidenceIds: ['acsm-rt-2009'],
  };
}

// ───────────────────────────── Weekly activity minutes ─────────────────────────────

export interface ActivityEntry {
  id: string;
  date: string; // ISO
  minutes: number;
  intensity: 'light' | 'moderate' | 'vigorous';
  kind: string;
}

/**
 * Moderate-equivalent minutes: WHO/CDC treat 1 vigorous minute ≈ 2 moderate minutes.
 * Light activity is shown but not counted toward the target. Workout aerobic exercises count as moderate.
 */
export function moderateEquivalentMinutes(entries: ActivityEntry[], sessions: SessionLog[], from: Date, to: Date): { counted: number; light: number } {
  const inRange = (iso: string) => {
    const t = new Date(iso).getTime();
    return t >= from.getTime() && t < to.getTime();
  };
  let counted = 0;
  let light = 0;
  for (const e of entries) {
    if (!inRange(e.date)) continue;
    if (e.intensity === 'vigorous') counted += e.minutes * 2;
    else if (e.intensity === 'moderate') counted += e.minutes;
    else light += e.minutes;
  }
  for (const s of sessions) {
    if (!inRange(s.startedAt)) continue;
    for (const l of s.sets) {
      if (getExercise(l.exerciseId)?.category === 'aerobic' && l.kind === 'time') counted += l.achieved / 60;
    }
  }
  return { counted: Math.round(counted), light: Math.round(light) };
}

/** Weekly aerobic target by age band, from WHO 2020 / CDC. */
export function weeklyAerobicTarget(ageYears: number): { minutes: number; label: string; evidenceIds: string[] } {
  if (ageYears < 18)
    return { minutes: 420, label: 'an average of 60 minutes a day of moderate-to-vigorous activity', evidenceIds: ['cdc-children', 'who-2020'] };
  return { minutes: 150, label: '150 minutes of moderate (or 75 vigorous) activity a week', evidenceIds: ['who-2020', 'cdc-adults'] };
}
