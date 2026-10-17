import { EXERCISES } from '../exercises/library';
import { generatePlan } from '../plan/engine';
import type { Profile, QuestionKey, RuleHit, ScreeningOutcome } from '../types';
import { findingStatus, resolveProfile, type Finding, type FindingStatus } from './analyze';
import { screen } from './screening';

/**
 * A plain-language readout of everything the user told us: what it means for safety, what will
 * change in the plan, what we understood from their own words, and what is still open.
 * Pure and deterministic; used on the review step and the profile page.
 */

export const QUESTION_LABEL: Record<QuestionKey, string> = {
  exertionalSymptoms: 'Symptoms during activity',
  knownCardioMetabolicRenal: 'Known heart, metabolic or kidney condition',
  recentSurgery: 'Surgery or hospital stay in the last 3 months',
  severeOrWorseningPain: 'Severe, new or worsening pain',
  inRehabProgram: 'Currently in a rehab program',
  balanceConcernOrFall: 'Falls or balance concerns',
};
export const QUESTION_KEYS = Object.keys(QUESTION_LABEL) as QuestionKey[];

export interface FindingView extends Finding {
  status: FindingStatus;
}

export type AnalysisTone = 'ok' | 'adjust' | 'refer' | 'urgent';

export interface PlanPreview {
  sessionsPerWeek: number;
  exercisesAvailable: number;
  exercisesLeftOut: number;
  leftOutBy: { label: string; count: number }[];
}

export interface AnswerAnalysis {
  outcome: ScreeningOutcome;
  tone: AnalysisTone;
  headline: string;
  lead: string;
  rules: RuleHit[];
  included: FindingView[];
  suggested: FindingView[];
  dismissed: FindingView[];
  info: FindingView[];
  notUnderstood: { field: string; text: string }[];
  unsure: QuestionKey[];
  skipped: QuestionKey[];
  answeredCount: number;
  questionCount: number;
  preview: PlanPreview | null;
  /** Number of safety adjustments that will shape the plan. */
  adjustments: number;
}

function reasonGroup(reason: string): string {
  if (reason.startsWith('Needs equipment')) return 'Equipment you don’t have';
  if (reason.startsWith('You asked')) return 'Your preferences';
  if (reason.startsWith('Mainly loads')) return 'Body areas you flagged';
  if (reason.startsWith('Not a seated') || reason.startsWith('Position excluded')) return 'Positions to avoid / seated plan';
  if (/restriction|Weights excluded|No external weights/.test(reason)) return 'Clinician restrictions';
  if (reason.startsWith('Unsupported balance')) return 'Balance safety (supported versions used)';
  if (reason.startsWith('Too advanced') || reason.startsWith('Starting with')) return 'Starting gently';
  if (reason.startsWith('Not recommended under age')) return 'Age';
  if (reason.startsWith('Requires grip')) return 'Limited grip';
  return 'Other (location or time)';
}

export function analyzeAnswers(profile: Profile, now: Date = new Date()): AnswerAnalysis {
  const resolution = resolveProfile(profile, now);
  const screening = screen(resolution.profile);
  const views: FindingView[] = resolution.analysis.findings.map((f) => ({ ...f, status: findingStatus(profile, f) }));
  const included = views.filter((v) => v.status === 'included' || v.status === 'applied');
  const suggested = views.filter((v) => v.status === 'suggested');
  const dismissed = views.filter((v) => v.status === 'dismissed');
  const info = views.filter((v) => v.status === 'info');

  const outcome = screening.outcome;
  const adjustments = screening.hits.filter((h) => h.outcome === 'proceed_with_modifications').length;
  const tone: AnalysisTone = outcome === 'emergency' ? 'urgent' : outcome === 'needs_assessment' ? 'refer' : outcome === 'proceed_with_modifications' ? 'adjust' : 'ok';

  let headline: string;
  let lead: string;
  switch (outcome) {
    case 'emergency':
      headline = 'Please get urgent medical help before exercising';
      lead = 'Something you described can be a sign of an emergency. No plan has been made.';
      break;
    case 'needs_assessment':
      headline = 'A professional should guide you first';
      lead = 'Based on your answers, a personalized plan should come from someone who can assess you. No plan has been made. This is a safety decision, not a judgment about you.';
      break;
    case 'proceed_with_modifications':
      headline = `Ready, with ${adjustments} safety adjustment${adjustments === 1 ? '' : 's'}`;
      lead = 'We can build you a plan. These adjustments shape what is included and how hard it is.';
      break;
    default:
      headline = 'Ready, with no safety adjustments needed';
      lead = 'Nothing you told us calls for changes, so your plan follows general public-health guidance.';
  }

  const answered = new Set(profile.health.answered ?? []);
  const unsure = profile.health.unsure ?? [];
  const skipped = QUESTION_KEYS.filter((k) => !answered.has(k));

  let preview: PlanPreview | null = null;
  // The preview runs before the user has ticked consent, so judge the plan on the answers alone.
  const result = generatePlan({ ...profile, consentGiven: true }, now);
  if (result.ok) {
    const plan = result.plan;
    const groups = new Map<string, number>();
    for (const x of plan.excluded) groups.set(reasonGroup(x.reason), (groups.get(reasonGroup(x.reason)) ?? 0) + 1);
    preview = {
      sessionsPerWeek: plan.schedule.filter(Boolean).length,
      exercisesAvailable: Math.max(0, EXERCISES.length - plan.excluded.length),
      exercisesLeftOut: plan.excluded.length,
      leftOutBy: [...groups.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count),
    };
  }

  return {
    outcome,
    tone,
    headline,
    lead,
    rules: screening.hits,
    included,
    suggested,
    dismissed,
    info,
    notUnderstood: resolution.analysis.notUnderstood,
    unsure,
    skipped,
    answeredCount: QUESTION_KEYS.length - skipped.length,
    questionCount: QUESTION_KEYS.length,
    preview,
    adjustments,
  };
}
