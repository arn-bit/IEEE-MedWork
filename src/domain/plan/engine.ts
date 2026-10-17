import { EXERCISES, getExercise } from '../exercises/library';
import { ageBandFor, screen } from '../safety/screening';
import { MAX_TEXT, resolveProfile } from '../safety/analyze';
import type {
  Constraints,
  DecisionTraceEntry,
  Equipment,
  Exercise,
  ExerciseCategory,
  Goal,
  Plan,
  PlannedItem,
  PlannedSession,
  PlanResult,
  Prescription,
  Profile,
} from '../types';

/**
 * Deterministic workout-plan engine.
 *   validate → screen (safety rules) → filter library → weekly structure → per-session time budget →
 *   prescriptions with evidence → decision trace.
 * Same input always yields the same plan. The total estimated time per session never exceeds the limit.
 */

export const GOALS: Goal[] = ['general_fitness', 'strength', 'mobility', 'endurance', 'balance', 'flexibility'];
export const EQUIPMENT: Equipment[] = ['none', 'chair', 'wall', 'step', 'light_weights', 'resistance_band', 'mat'];
export const MIN_MINUTES = 5;
export const MAX_MINUTES = 90;

const TRANSITION_S = 15;
const MAX_MAIN_ITEMS = 8; // time to read instructions / get into position between exercises
const PER_SIDE = new Set([
  'side_leg_lift',
  'seated_knee_extension',
  'step_up',
  'one_leg_stand_supported',
  'one_leg_stand',
  'calf_stretch_wall',
  'ankle_stretch_seated',
  'side_bend',
  'neck_rotation',
  'hamstring_stretch_seated',
  'upper_body_twist',
  'sideways_walk',
]);
const DAY_PATTERNS: Record<number, number[]> = {
  1: [0],
  2: [0, 3],
  3: [0, 2, 4],
  4: [0, 1, 3, 4],
  5: [0, 1, 2, 4, 5],
  6: [0, 1, 2, 3, 4, 5],
  7: [0, 1, 2, 3, 4, 5, 6],
};
export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// ───────────────────────────── Validation ─────────────────────────────

export function validateProfile(p: Partial<Profile> | null | undefined): string[] {
  const errors: string[] = [];
  if (!p) return ['Profile is missing.'];
  if (typeof p.ageYears !== 'number' || !Number.isInteger(p.ageYears) || p.ageYears < 1 || p.ageYears > 120) {
    errors.push('Age must be a whole number between 1 and 120.');
  }
  if (!Array.isArray(p.goals) || p.goals.length === 0) errors.push('Choose at least one goal.');
  else if (p.goals.length > 3) errors.push('Choose up to three goals.');
  else if (p.goals.some((g) => !GOALS.includes(g))) errors.push('Unknown goal selected.');
  if (!p.activityLevel || !['inactive', 'some', 'active'].includes(p.activityLevel)) errors.push('Tell us your current activity level.');
  if (!p.experience || !['new', 'some', 'experienced'].includes(p.experience)) errors.push('Tell us your exercise experience.');
  if (typeof p.daysPerWeek !== 'number' || !Number.isInteger(p.daysPerWeek) || p.daysPerWeek < 1 || p.daysPerWeek > 7) {
    errors.push('Workout days per week must be between 1 and 7.');
  }
  if (
    typeof p.minutesPerSession !== 'number' ||
    !Number.isInteger(p.minutesPerSession) ||
    p.minutesPerSession < MIN_MINUTES ||
    p.minutesPerSession > MAX_MINUTES
  ) {
    errors.push(`Minutes per workout must be between ${MIN_MINUTES} and ${MAX_MINUTES}.`);
  }
  if (!Array.isArray(p.equipment) || p.equipment.some((e) => !EQUIPMENT.includes(e))) errors.push('Equipment list is invalid.');
  if (!p.location || !['home', 'gym', 'outdoors'].includes(p.location)) errors.push('Choose where you will exercise.');
  if (!Array.isArray(p.dislikedExerciseIds)) errors.push('Disliked exercises list is invalid.');
  if (!p.health) errors.push('Health answers are missing.');
  else {
    const ft = p.health.freeText;
    if (ft && Object.values(ft).some((v) => typeof v !== 'string' || v.length > MAX_TEXT * 2)) errors.push('Your typed health notes are too long. Please shorten them.');
  }
  if ((p.goalText !== undefined && typeof p.goalText !== 'string') || (p.avoidText !== undefined && typeof p.avoidText !== 'string')) errors.push('Typed goal or preferences are invalid.');
  if (!p.accessibility) errors.push('Accessibility answers are missing.');
  if (p.consentGiven !== true) errors.push('Consent is needed before a plan can be generated.');
  return errors;
}

// ───────────────────────────── Filtering ─────────────────────────────

export function exclusionReason(ex: Exercise, profile: Profile, c: Constraints): string | null {
  const have = new Set<Equipment>([...profile.equipment, 'none']);
  const missing = ex.equipment.filter((e) => !have.has(e));
  if (missing.length) return `Needs equipment you did not select (${missing.join(', ').replace(/_/g, ' ')})`;
  if (profile.dislikedExerciseIds.includes(ex.id)) return 'You asked not to include this exercise';
  if (c.seatedOnly && ex.position !== 'seated') return 'Not a seated exercise';
  if (c.excludePositions.includes(ex.position)) return `Position excluded (${ex.position.replace('_', ' ')})`;
  const area = ex.loadsAreas.find((a) => c.excludedAreas.includes(a));
  if (area) return `Mainly loads an area you flagged (${area.replace('_', ' ')})`;
  if (c.excludeOverhead && ex.overhead) return 'Overhead movement excluded by clinician restriction';
  if (c.excludeImpact && ex.impact) return 'Impact excluded by clinician restriction';
  if (c.excludeForwardBending && ex.forwardBending) return 'Forward bending excluded by clinician restriction';
  if (c.excludeWeights && ex.usesWeights) return c.ageBand === 'child' ? 'No external weights for ages 5–12' : 'Weights excluded';
  if (c.excludeUnsupportedBalance && ex.unsupportedBalance) return 'Unsupported balance excluded — supported version used instead';
  if (profile.accessibility.limitedGrip && (ex.usesWeights || ex.equipment.includes('resistance_band'))) return 'Requires grip (you noted limited grip)';
  if (ex.minAge > profile.ageYears) return `Not recommended under age ${ex.minAge}`;
  if (ex.difficulty === 3 && (profile.experience === 'new' || profile.activityLevel === 'inactive' || c.ageBand === 'child'))
    return 'Too advanced as a starting point';
  if (ex.difficulty === 2 && !ex.supported && profile.activityLevel === 'inactive') return 'Starting with an easier or supported version first';
  if (profile.location === 'outdoors' && ex.id !== 'brisk_walk' && ex.equipment.some((e) => e === 'wall' || e === 'chair' || e === 'step'))
    return 'Needs indoor equipment';
  if (profile.location !== 'outdoors' && ex.id === 'brisk_walk') return 'Outdoor walking only offered for outdoor location';
  return null;
}

// ───────────────────────────── Prescriptions ─────────────────────────────

function intensityText(profile: Profile, c: Constraints): string {
  if (profile.activityLevel === 'inactive' || c.ageBand === 'child') return 'Light to moderate: about 3–5 out of 10 effort — you can talk comfortably.';
  return 'Moderate: about 5–6 out of 10 effort — you can talk, but not sing.';
}

export function prescribe(ex: Exercise, profile: Profile, c: Constraints, block: PlannedItem['block'], shortSession: boolean): Prescription {
  const perSide = PER_SIDE.has(ex.id);
  const intensity = intensityText(profile, c);
  const youth = c.ageBand === 'child' || c.ageBand === 'teen';

  if (block === 'warmup') {
    return {
      kind: ex.id === 'shoulder_rolls' ? 'reps' : 'time',
      sets: 1,
      amount: ex.id === 'shoulder_rolls' ? 10 : 60,
      perSide: false,
      restSeconds: 0,
      secondsPerRep: 3,
      intensity: 'Easy: gradually build from very light to light effort.',
      rationale: 'A gradual warm-up eases you into activity. NHS guidance suggests warming up for at least 6 minutes when time allows.',
      evidenceIds: ['nhs-warmup'],
      evidenceKind: 'guideline',
    };
  }

  switch (ex.category as ExerciseCategory) {
    case 'flexibility': {
      const hold = c.ageBand === 'child' ? 15 : 30;
      return {
        kind: 'hold',
        sets: block === 'cooldown' && shortSession ? 1 : 2,
        amount: hold,
        perSide,
        restSeconds: 10,
        secondsPerRep: 0,
        intensity: 'Gentle: stretch to mild tension, never pain.',
        rationale: 'ACSM recommends flexibility exercises totalling about 60 seconds per exercise on at least 2 days a week; shorter sessions use a single hold.',
        evidenceIds: ['acsm-2011', ...ex.sourceIds.filter((s) => s.startsWith('nhs'))],
        evidenceKind: 'position_stand',
      };
    }
    case 'balance': {
      if (ex.id === 'one_leg_stand' || ex.id === 'one_leg_stand_supported') {
        return {
          kind: 'hold',
          sets: 3,
          amount: profile.activityLevel === 'inactive' || c.ageBand === 'older' ? 5 : 10,
          perSide: true,
          restSeconds: 15,
          secondsPerRep: 0,
          intensity: 'Controlled: stay close to support.',
          rationale: 'NHS balance guidance suggests holding 5–10 seconds, 3 times on each side, near a wall for support.',
          evidenceIds: ['nhs-balance', 'cochrane-falls-2019'],
          evidenceKind: 'guideline',
        };
      }
      return {
        kind: 'reps',
        sets: 2,
        amount: ex.id === 'heel_toe_walk' ? 8 : 10,
        perSide: ex.id === 'sideways_walk',
        restSeconds: 30,
        secondsPerRep: 2,
        intensity: 'Controlled: slow, steady steps.',
        rationale: 'Balance practice of about 10 steps each way, done near support, as described in NHS balance guidance. Balance and functional exercise reduce falls in older adults.',
        evidenceIds: ['nhs-balance', 'cochrane-falls-2019'],
        evidenceKind: 'guideline',
      };
    }
    case 'aerobic':
      return {
        kind: 'time',
        sets: 1,
        amount: 180, // adjusted by the budgeter
        perSide: false,
        restSeconds: 0,
        secondsPerRep: 0,
        intensity,
        rationale:
          'Moderate-intensity aerobic activity counts toward the 150 minutes a week recommended by WHO and CDC. Use the talk test: you can talk but not sing.',
        evidenceIds: ['who-2020', 'cdc-adults', 'cdc-intensity'],
        evidenceKind: 'guideline',
      };
    case 'strength':
    case 'warmup':
    default: {
      let reps: number;
      let sets: number;
      let rest: number;
      let rationale: string;
      let evidenceIds: string[];
      let kind: Prescription['evidenceKind'] = 'position_stand';
      if (youth) {
        reps = 8;
        sets = shortSession ? 1 : 2;
        rest = 60;
        rationale =
          'Technique first, with bodyweight or light resistance and supervision, in line with the AAP clinical report. The exact reps and sets are a cautious product choice.';
        evidenceIds = ['aap-resistance-2020', 'nhs-children', 'heuristic-conservative'];
      } else if (profile.activityLevel === 'inactive' || c.ageBand === 'older') {
        reps = 5;
        sets = shortSession ? 1 : 2;
        rest = 60;
        rationale = 'Start with about 5 slow, controlled reps and build up gradually, as NHS strength guidance suggests for people new to exercise.';
        evidenceIds = ['nhs-strength', 'acsm-2011'];
        kind = 'guideline';
      } else if (profile.experience === 'new') {
        reps = 8;
        sets = shortSession ? 1 : 2;
        rest = 60;
        rationale =
          'ACSM recommends 8–12 repetitions for novices, at a moderate pace (about 1–2 s up, 1–2 s down) with 1–2 minutes of rest. Applying this to bodyweight exercises is an extrapolation.';
        evidenceIds = ['acsm-rt-2009'];
      } else {
        reps = 10;
        sets = shortSession ? 1 : profile.experience === 'experienced' ? 3 : 2;
        rest = profile.experience === 'experienced' ? 90 : 60;
        rationale =
          'Within the ACSM 8–12 repetition range at a moderate pace with 1–2 minutes of rest. Progress when you can do 1–2 more reps than the target with good control.';
        evidenceIds = ['acsm-rt-2009', 'cdc-adults'];
      }
      return { kind: 'reps', sets, amount: reps, perSide, restSeconds: rest, secondsPerRep: 4, intensity, rationale, evidenceIds, evidenceKind: kind };
    }
  }
}

export function estimateSeconds(p: Prescription): number {
  const sides = p.perSide ? 2 : 1;
  let work: number;
  if (p.kind === 'reps') work = p.amount * p.secondsPerRep * sides;
  else work = p.amount * sides;
  return Math.round(p.sets * work + Math.max(0, p.sets - 1) * p.restSeconds + TRANSITION_S);
}

// ───────────────────────────── Session building ─────────────────────────────

interface Budgets {
  warmup: number;
  cooldown: number;
  note: string | null;
}

function blockBudgets(limit: number): Budgets {
  if (limit >= 20 * 60) return { warmup: 360, cooldown: 180, note: null };
  if (limit >= 10 * 60)
    return { warmup: 180, cooldown: 120, note: 'Warm-up shortened to 3 minutes to fit your time (NHS suggests at least 6 minutes when you have the time).' };
  return { warmup: 90, cooldown: 60, note: 'Very short session: a 90-second gentle start replaces a full warm-up. Keep the effort light at first.' };
}

function categoryWeights(goals: Goal[], band: Constraints['ageBand']): Record<'strength' | 'balance' | 'aerobic' | 'flexibility', number> {
  const w = { strength: 0, balance: 0, aerobic: 0, flexibility: 0 };
  for (const g of goals) {
    if (g === 'strength') w.strength += 3;
    if (g === 'balance') w.balance += 3;
    if (g === 'endurance') w.aerobic += 3;
    if (g === 'flexibility') w.flexibility += 2;
    if (g === 'mobility') {
      w.flexibility += 2;
      w.strength += 1;
    }
    if (g === 'general_fitness') {
      w.strength += 2;
      w.aerobic += 2;
      w.balance += 1;
      w.flexibility += 1;
    }
  }
  if (band === 'older') w.balance = Math.max(w.balance, 2);
  // Guidelines recommend muscle strengthening for all age groups.
  w.strength = Math.max(w.strength, 1);
  return w;
}

/** Deterministic weighted round-robin sequence of categories. */
function categorySequence(weights: Record<string, number>, length: number): string[] {
  const credit: Record<string, number> = Object.fromEntries(Object.keys(weights).map((k) => [k, 0]));
  const seq: string[] = [];
  for (let i = 0; i < length; i++) {
    for (const k of Object.keys(weights)) credit[k]! += weights[k]!;
    const best = Object.keys(credit)
      .filter((k) => weights[k]! > 0)
      .sort((a, b) => credit[b]! - credit[a]! || a.localeCompare(b))[0];
    if (!best) break;
    seq.push(best);
    credit[best]! -= Object.values(weights).reduce((s, v) => s + v, 0);
  }
  return seq;
}

function reasonsFor(ex: Exercise, profile: Profile, c: Constraints): string[] {
  const r: string[] = [];
  const goal = ex.goals.find((g) => profile.goals.includes(g));
  if (goal) r.push(`Supports your goal: ${goal.replace('_', ' ')}`);
  if (ex.equipment.length) r.push(`Uses equipment you have: ${ex.equipment.join(', ').replace(/_/g, ' ')}`);
  else r.push('No equipment needed');
  if (ex.position === 'seated' && c.seatedOnly) r.push('Seated, as you requested');
  if (ex.supported && (c.excludeUnsupportedBalance || c.ageBand === 'older')) r.push('Supported version (chair or wall) for steadier balance');
  if (ex.difficulty === 1 && profile.activityLevel === 'inactive') r.push('Beginner-friendly starting point');
  return r;
}

function pickWarmups(pool: Exercise[], c: Constraints): Exercise[] {
  const order = c.seatedOnly ? ['seated_march', 'shoulder_rolls'] : ['march_in_place', 'shoulder_rolls', 'heel_digs', 'seated_march'];
  return order.map((id) => pool.find((e) => e.id === id)).filter((e): e is Exercise => Boolean(e)).slice(0, 3);
}

function buildSession(
  profile: Profile,
  c: Constraints,
  pool: Exercise[],
  sessionIndex: number,
  dayIndex: number,
  limit: number,
  trace: DecisionTraceEntry[],
): PlannedSession {
  const items: PlannedItem[] = [];
  const notes: string[] = [];
  const budgets = blockBudgets(limit);
  const shortSession = limit < 15 * 60;
  if (budgets.note) notes.push(budgets.note);

  // Warm-up: shoulder rolls get a fixed 10 reps; timed moves share the rest of the budget.
  const warmups = pickWarmups(pool, c);
  let used = 0;
  if (warmups.length) {
    const fixed = warmups.filter((e) => e.id === 'shoulder_rolls').length * (10 * 3 + TRANSITION_S);
    const timed = warmups.filter((e) => e.id !== 'shoulder_rolls').length;
    const share = timed ? Math.floor((budgets.warmup - fixed) / timed) : 0;
    for (const ex of warmups) {
      const p = prescribe(ex, profile, c, 'warmup', shortSession);
      if (p.kind === 'time') p.amount = Math.max(30, Math.floor((share - TRANSITION_S) / 15) * 15);
      const est = estimateSeconds(p);
      if (used + est > budgets.warmup + 5) continue;
      items.push({ exerciseId: ex.id, block: 'warmup', prescription: p, estSeconds: est, reasons: ['Gradual warm-up before the main exercises'] });
      used += est;
    }
  } else {
    notes.push('No warm-up exercise matched your restrictions; start the first exercise slowly.');
  }

  // Cool-down: pick stretches until its budget is used.
  const cooldownItems: PlannedItem[] = [];
  let coolUsed = 0;
  const stretches = pool.filter((e) => e.category === 'flexibility');
  for (let i = 0; i < stretches.length && coolUsed < budgets.cooldown; i++) {
    const ex = stretches[(i + sessionIndex) % stretches.length]!;
    const p = prescribe(ex, profile, c, 'cooldown', shortSession);
    let est = estimateSeconds(p);
    if (coolUsed + est > budgets.cooldown && p.sets > 1) {
      p.sets = 1;
      est = estimateSeconds(p);
    }
    if (coolUsed + est > budgets.cooldown) continue;
    cooldownItems.push({ exerciseId: ex.id, block: 'cooldown', prescription: p, estSeconds: est, reasons: ['Gentle cool-down stretch'] });
    coolUsed += est;
  }

  // Main block.
  const mainBudget = limit - used - coolUsed;
  const weights = categoryWeights(profile.goals, c.ageBand);
  const byCat: Record<string, Exercise[]> = {
    strength: pool.filter((e) => e.category === 'strength'),
    balance: pool.filter((e) => e.category === 'balance'),
    aerobic: pool.filter((e) => e.category === 'aerobic'),
    flexibility: pool.filter((e) => e.category === 'flexibility' && !cooldownItems.some((ci) => ci.exerciseId === e.id)),
  };
  for (const k of Object.keys(weights) as (keyof typeof weights)[]) if (!byCat[k]!.length) weights[k] = 0;
  // Strength first: guidelines recommend muscle strengthening for every age group.
  const seq = weights.strength > 0 ? ['strength', ...categorySequence(weights, 12)] : categorySequence(weights, 12);
  const usedIds = new Set<string>(items.map((i) => i.exerciseId));
  const cursor: Record<string, number> = { strength: sessionIndex * 2, balance: sessionIndex, aerobic: sessionIndex, flexibility: sessionIndex };
  let mainUsed = 0;
  const main: PlannedItem[] = [];
  for (const cat of seq) {
    if (main.length >= MAX_MAIN_ITEMS) break;
    const list = byCat[cat]!;
    if (!list.length) continue;
    // Next unused exercise in this category (rotating per session for variety).
    let ex: Exercise | undefined;
    for (let t = 0; t < list.length; t++) {
      const cand = list[(cursor[cat]! + t) % list.length]!;
      if (!usedIds.has(cand.id)) {
        ex = cand;
        cursor[cat] = cursor[cat]! + t + 1;
        break;
      }
    }
    if (!ex) continue;
    const p = prescribe(ex, profile, c, 'main', shortSession);
    if (p.kind === 'time' && ex.category === 'aerobic') {
      const remaining = mainBudget - mainUsed - TRANSITION_S;
      const target = Math.min(weights.aerobic >= 3 ? 600 : 300, Math.floor(mainBudget * 0.6));
      p.amount = Math.min(target, Math.floor(remaining / 30) * 30);
      if (p.amount < 60) continue;
    }
    let est = estimateSeconds(p);
    while (mainUsed + est > mainBudget && p.sets > 1) {
      p.sets -= 1;
      est = estimateSeconds(p);
    }
    if (mainUsed + est > mainBudget) continue;
    main.push({ exerciseId: ex.id, block: 'main', prescription: p, estSeconds: est, reasons: reasonsFor(ex, profile, c) });
    usedIds.add(ex.id);
    mainUsed += est;
  }
  // Fill pass: use leftover time for extra sets (up to 3) rather than leaving it unused.
  for (let changed = true; changed; ) {
    changed = false;
    for (const it of main) {
      const p = it.prescription;
      if (p.kind === 'time' || p.sets >= 3) continue;
      const next = estimateSeconds({ ...p, sets: p.sets + 1 });
      if (mainUsed - it.estSeconds + next <= mainBudget) {
        mainUsed += next - it.estSeconds;
        p.sets += 1;
        it.estSeconds = next;
        changed = true;
      }
    }
  }
  if (!main.length) notes.push('Your time and restrictions left no room for a main exercise. Consider a longer session or more equipment options.');

  items.push(...main, ...cooldownItems);
  const estSeconds = items.reduce((s, i) => s + i.estSeconds, 0);
  if (estSeconds > limit) {
    // Should be impossible; guard so we never silently exceed the user's limit.
    throw new Error(`Plan engine invariant violated: ${estSeconds}s > ${limit}s`);
  }

  const cats = new Set(main.map((m) => getExercise(m.exerciseId)?.category));
  const focus = [...cats].filter(Boolean).join(' + ') || 'gentle movement';
  if (sessionIndex === 0) {
    trace.push({
      step: 'Session time budget',
      detail: `Each session must fit ${Math.round(limit / 60)} min. Warm-up ≤ ${Math.round(budgets.warmup / 60)} min, cool-down ≤ ${Math.round(
        budgets.cooldown / 60,
      )} min, main block uses the rest. Estimates include ~15 s between exercises and rest between sets.`,
      evidenceIds: ['nhs-warmup'],
    });
  }
  return {
    id: `s${dayIndex}`,
    dayIndex,
    title: `${DAY_NAMES[dayIndex]} workout`,
    focus,
    items,
    estSeconds,
    limitSeconds: limit,
    notes,
  };
}

// ───────────────────────────── Public API ─────────────────────────────

export function generatePlan(input: Profile, now: Date = new Date()): PlanResult {
  const errors = validateProfile(input);
  if (errors.length) return { ok: false, reason: 'invalid_input', errors };

  // The engine plans from the user's structured answers PLUS cautious findings from their own words
  // and "Not sure" answers (treated like "Yes"). Free text can only make a plan safer.
  const resolution = resolveProfile(input, now);
  const profile = resolution.profile;
  const screening = screen(profile);
  if (screening.outcome === 'emergency') return { ok: false, reason: 'emergency', screening };
  if (screening.outcome === 'needs_assessment') {
    const ageOnly = screening.hits.filter((h) => h.outcome === 'needs_assessment').every((h) => h.ruleId.startsWith('AGE-'));
    return { ok: false, reason: ageOnly ? 'age_restricted' : 'needs_assessment', screening };
  }

  const c = screening.constraints;
  const trace: DecisionTraceEntry[] = [
    { step: 'Validated your answers', detail: 'Age, goals, schedule, time, equipment and consent all passed validation.', evidenceIds: [] },
    {
      step: 'Safety screening',
      detail:
        screening.hits.length === 0
          ? 'No safety rules were triggered. The plan uses general public-health guidance.'
          : `Rules applied: ${screening.hits.map((h) => `${h.ruleId} (${h.title})`).join('; ')}.`,
      evidenceIds: [...new Set(screening.hits.flatMap((h) => h.evidenceIds))],
    },
  ];
  if (resolution.used.length > 0) {
    trace.push({
      step: 'Used from your own words',
      detail: `We read what you typed and applied: ${resolution.used.map((f) => f.title).join('; ')}. You can mark any of these “not accurate” in Profile → Your answers.`,
      evidenceIds: ['heuristic-conservative'],
    });
  }
  if (resolution.unsureApplied.length > 0) {
    trace.push({
      step: 'Answers of “Not sure”',
      detail: 'Where you answered “Not sure”, we treated it like “Yes” so the plan errs on the side of caution.',
      evidenceIds: ['heuristic-conservative'],
    });
  }

  const excluded: Plan['excluded'] = [];
  const pool: Exercise[] = [];
  for (const ex of EXERCISES) {
    const why = exclusionReason(ex, profile, c);
    if (why) excluded.push({ exerciseId: ex.id, reason: why });
    else pool.push(ex);
  }
  trace.push({
    step: 'Filtered the exercise library',
    detail: `${pool.length} of ${EXERCISES.length} exercises match your equipment, location, preferences and restrictions. ${excluded.length} were left out; each one is listed with the reason.`,
    evidenceIds: [],
  });

  const days = DAY_PATTERNS[profile.daysPerWeek]!;
  trace.push({
    step: 'Weekly structure',
    detail: `${profile.daysPerWeek} workout day(s) with rest days in between where possible. Every session includes muscle-strengthening work; guidelines recommend strengthening on at least 2 days a week${
      c.ageBand === 'child' || c.ageBand === 'teen' ? ' (3 days for children and adolescents)' : ''
    }.`,
    evidenceIds: c.ageBand === 'child' || c.ageBand === 'teen' ? ['cdc-children', 'who-2020'] : ['cdc-adults', 'who-2020'],
  });
  if (c.ageBand === 'older' || profile.goals.includes('balance')) {
    trace.push({
      step: 'Balance work included',
      detail: 'Balance exercises are included because of your age or goals. Exercise that includes balance and functional training reduces falls in older adults.',
      evidenceIds: ['cochrane-falls-2019', 'cdc-older'],
    });
  }

  const limit = profile.minutesPerSession * 60;
  const schedule: (PlannedSession | null)[] = Array.from({ length: 7 }, () => null);
  days.forEach((d, i) => {
    schedule[d] = buildSession(profile, c, pool, i, d, limit, trace);
  });

  const aerobicSecondsPerWeek = schedule
    .flatMap((s) => s?.items ?? [])
    .filter((it) => getExercise(it.exerciseId)?.category === 'aerobic')
    .reduce((s, it) => s + it.prescription.amount * it.prescription.sets, 0);
  const assumptions = [
    'This is general fitness guidance, not medical treatment or rehabilitation.',
    'Your answers are self-reported; the plan is only as accurate as the information you provided.',
    'Any chair you use is sturdy, without wheels, and placed against a wall.',
    `This plan includes about ${Math.round(aerobicSecondsPerWeek / 60)} minutes of aerobic activity a week. WHO and CDC recommend 150 minutes of moderate activity for adults; walking and other daily activity count too.`,
    'Time estimates assume about 4 seconds per repetition and the rest periods shown; your pace may vary.',
  ];
  if (pool.some((e) => e.position.startsWith('floor'))) assumptions.push('You can get down to and up from the floor comfortably.');
  if (c.ageBand === 'child' || c.ageBand === 'teen') assumptions.push('A parent or guardian is aware of the plan and supervises as appropriate.');

  const plan: Plan = {
    id: `plan-${now.getTime()}`,
    createdAt: now.toISOString(),
    profileSnapshot: { ageBand: ageBandFor(profile.ageYears), goals: profile.goals, minutesPerSession: profile.minutesPerSession, daysPerWeek: profile.daysPerWeek },
    screening,
    schedule,
    assumptions,
    trace,
    excluded,
  };
  return { ok: true, plan };
}

/** All evidence IDs a plan relies on (used by tests and the Evidence view). */
export function planEvidenceIds(plan: Plan): string[] {
  const ids = new Set<string>();
  plan.screening.hits.forEach((h) => h.evidenceIds.forEach((i) => ids.add(i)));
  plan.trace.forEach((t) => t.evidenceIds.forEach((i) => ids.add(i)));
  plan.schedule.forEach((s) =>
    s?.items.forEach((it) => {
      it.prescription.evidenceIds.forEach((i) => ids.add(i));
      getExercise(it.exerciseId)?.sourceIds.forEach((i) => ids.add(i));
    }),
  );
  return [...ids];
}
