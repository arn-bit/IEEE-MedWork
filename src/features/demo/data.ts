import { makeProfile, emptyHealth } from '../../domain/profile';
import { generatePlan } from '../../domain/plan/engine';
import { analyzeText, type Finding } from '../../domain/safety/analyze';
import type { Plan, PlannedSession, Profile } from '../../domain/types';

/** What the demo "person" types, character by character, in the second scene. */
export const DEMO_INJURY_TEXT = 'My left knee hurts when I squat, and I want to keep my legs strong.';
/** A second sentence, to show what the safety rules do when the answer is not fine. */
export const DEMO_ALERT_TEXT = 'I get chest pain when I climb stairs.';
export const DEMO_GOAL_TEXT = 'Stronger legs and better balance.';

/** A realistic example person. This is sample data: the demo never reads or writes the real profile. */
export function demoProfile(): Profile {
  const base = emptyHealth();
  return makeProfile(
    {
      displayName: 'Sam',
      ageYears: 58,
      goals: ['strength', 'balance'],
      equipment: ['chair', 'wall'],
      minutesPerSession: 20,
      daysPerWeek: 3,
      location: 'home',
      goalText: DEMO_GOAL_TEXT,
      createdAt: '2026-01-05T09:00:00.000Z',
    },
    { freeText: { ...base.freeText, injuries: DEMO_INJURY_TEXT } },
  );
}

export interface DemoResult {
  profile: Profile;
  findings: Finding[];
  plan: Plan | null;
  /** The first workout of the week: the one the demo shows. */
  session: PlannedSession | null;
  leftOut: number;
  /** What the rules say about the alarming sentence (it must stop the plan). */
  alert: Finding[];
  alertBlocksPlan: boolean;
}

/** Real analysis and a real plan from the sample person, computed on demand with the app's own engine. */
export function buildDemo(now: Date = new Date('2026-10-19T09:00:00')): DemoResult {
  const profile = demoProfile();
  const analysis = analyzeText(profile, now);
  const r = generatePlan(profile, now);
  const plan = r.ok ? r.plan : null;
  const session = plan?.schedule.find((s): s is PlannedSession => !!s) ?? null;
  const alarming = makeProfile({ ageYears: 58, goals: ['strength'] }, { freeText: { ...emptyHealth().freeText, injuries: DEMO_ALERT_TEXT } });
  const alert = analyzeText(alarming, now).findings;
  const alertPlan = generatePlan(alarming, now);
  return { profile, findings: analysis.findings, plan, session, leftOut: plan?.excluded.length ?? 0, alert, alertBlocksPlan: !alertPlan.ok };
}
