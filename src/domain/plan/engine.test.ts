import { describe, expect, it } from 'vitest';
import { generatePlan, planEvidenceIds, validateProfile, estimateSeconds, tryability, buildTrySession, TRY_SESSION_PREFIX } from './engine';
import { makeProfile } from '../profile';
import { getExercise, EXERCISES } from '../exercises/library';
import type { Plan, PlannedSession, Profile } from '../types';

const NOW = new Date('2026-10-16T09:00:00Z');

function okPlan(p: Profile): Plan {
  const r = generatePlan(p, NOW);
  if (!r.ok) throw new Error(`expected plan, got ${r.reason}: ${JSON.stringify(r)}`);
  return r.plan;
}
const sessions = (plan: Plan) => plan.schedule.filter((s): s is PlannedSession => s !== null);
const allItems = (plan: Plan) => sessions(plan).flatMap((s) => s.items);

describe('plan engine — time limits', () => {
  it.each([5, 8, 10, 12, 15, 20, 30, 45, 60, 90])('never exceeds a %i-minute limit', (minutes) => {
    for (const goals of [['strength'], ['endurance'], ['balance', 'flexibility'], ['general_fitness', 'mobility']] as Profile['goals'][]) {
      const plan = okPlan(makeProfile({ minutesPerSession: minutes, goals, equipment: ['chair', 'wall', 'step', 'mat', 'light_weights', 'resistance_band'] }));
      for (const s of sessions(plan)) {
        expect(s.estSeconds).toBeLessThanOrEqual(minutes * 60);
        expect(s.items.reduce((a, i) => a + i.estSeconds, 0)).toBe(s.estSeconds);
        for (const it of s.items) expect(it.estSeconds).toBe(estimateSeconds(it.prescription));
      }
    }
  });

  it('a 5-minute session still contains a main exercise and explains the shortened warm-up', () => {
    const plan = okPlan(makeProfile({ minutesPerSession: 5 }));
    const s = sessions(plan)[0]!;
    expect(s.items.some((i) => i.block === 'main')).toBe(true);
    expect(s.notes.join(' ')).toMatch(/short session/i);
  });

  it('uses a full ≥6-minute warm-up budget when time allows (NHS)', () => {
    const plan = okPlan(makeProfile({ minutesPerSession: 30 }));
    const warm = sessions(plan)[0]!.items.filter((i) => i.block === 'warmup');
    const total = warm.reduce((a, i) => a + i.estSeconds, 0);
    expect(total).toBeGreaterThanOrEqual(300);
    expect(total).toBeLessThanOrEqual(365);
  });
});

describe('plan engine — schedule', () => {
  it.each([1, 2, 3, 4, 5, 6, 7])('creates exactly %i workout days', (days) => {
    const plan = okPlan(makeProfile({ daysPerWeek: days }));
    expect(plan.schedule).toHaveLength(7);
    expect(sessions(plan)).toHaveLength(days);
  });

  it('includes muscle-strengthening work in every session', () => {
    const plan = okPlan(makeProfile({ goals: ['endurance'], minutesPerSession: 20 }));
    for (const s of sessions(plan)) {
      expect(s.items.some((i) => getExercise(i.exerciseId)!.category === 'strength')).toBe(true);
    }
  });

  it('is deterministic for the same input', () => {
    const p = makeProfile({ goals: ['strength', 'balance'] });
    expect(okPlan(p)).toEqual(okPlan(p));
  });
});

describe('plan engine — equipment and location', () => {
  it('honors equipment: with nothing selected, no exercise requires equipment', () => {
    const plan = okPlan(makeProfile({ equipment: [] }));
    for (const it of allItems(plan)) expect(getExercise(it.exerciseId)!.equipment).toEqual([]);
  });

  it('never includes an exercise whose equipment was not selected', () => {
    const owned = new Set(['chair']);
    const plan = okPlan(makeProfile({ equipment: ['chair'], goals: ['strength', 'balance', 'flexibility'] }));
    for (const it of allItems(plan)) {
      for (const e of getExercise(it.exerciseId)!.equipment) expect(owned.has(e)).toBe(true);
    }
    expect(plan.excluded.find((x) => x.exerciseId === 'wall_pushup')?.reason).toMatch(/equipment/i);
  });

  it('includes light-weight exercises only when weights are available', () => {
    const without = okPlan(makeProfile({ goals: ['strength'], equipment: ['chair', 'wall'] }));
    expect(allItems(without).some((i) => i.exerciseId === 'biceps_curl')).toBe(false);
    expect(without.excluded.some((x) => x.exerciseId === 'biceps_curl')).toBe(true);
  });
});

describe('plan engine — restrictions and preferences', () => {
  it('excludes exercises loading a flagged painful area', () => {
    const plan = okPlan(makeProfile({}, { painAreas: ['knees'] }));
    for (const it of allItems(plan)) expect(getExercise(it.exerciseId)!.loadsAreas).not.toContain('knees');
    expect(plan.excluded.find((x) => x.exerciseId === 'sit_to_stand')?.reason).toMatch(/knees/);
  });

  it('applies clinician restrictions (overhead, floor, forward bending)', () => {
    const plan = okPlan(
      makeProfile(
        { equipment: ['chair', 'wall', 'mat'], goals: ['mobility', 'flexibility', 'strength'] },
        { clinicianRestrictions: ['avoid_overhead', 'avoid_floor', 'avoid_forward_bending'] },
      ),
    );
    for (const it of allItems(plan)) {
      const ex = getExercise(it.exerciseId)!;
      expect(ex.overhead).toBe(false);
      expect(ex.forwardBending).toBe(false);
      expect(ex.position.startsWith('floor')).toBe(false);
    }
  });

  it('seated-only users get only seated exercises', () => {
    const plan = okPlan(makeProfile({ accessibility: { seatedOnly: true, needsSupport: false, limitedGrip: false, lowVision: false, hearingImpaired: false } }));
    expect(allItems(plan).length).toBeGreaterThan(0);
    for (const it of allItems(plan)) expect(getExercise(it.exerciseId)!.position).toBe('seated');
  });

  it('respects disliked exercises', () => {
    const plan = okPlan(makeProfile({ goals: ['strength'], dislikedExerciseIds: ['sit_to_stand', 'mini_squat', 'wall_pushup'] }));
    const ids = allItems(plan).map((i) => i.exerciseId);
    expect(ids).not.toContain('sit_to_stand');
    expect(ids).not.toContain('mini_squat');
    expect(ids).not.toContain('wall_pushup');
  });

  it('balance concern removes unsupported balance exercises', () => {
    const plan = okPlan(makeProfile({ goals: ['balance'], experience: 'experienced', activityLevel: 'active' }, { balanceConcernOrFall: true }));
    for (const it of allItems(plan)) expect(getExercise(it.exerciseId)!.unsupportedBalance).toBe(false);
  });

  it('children get no external weights and a technique-first rationale', () => {
    const plan = okPlan(makeProfile({ ageYears: 10, guardianConfirmed: true, equipment: ['chair', 'wall', 'light_weights'], goals: ['strength'] }));
    for (const it of allItems(plan)) expect(getExercise(it.exerciseId)!.usesWeights).toBe(false);
    const strength = allItems(plan).find((i) => i.block === 'main' && getExercise(i.exerciseId)!.category === 'strength')!;
    expect(strength.prescription.evidenceIds).toContain('aap-resistance-2020');
  });

  it('older adults get balance work in their plan', () => {
    const plan = okPlan(makeProfile({ ageYears: 72, goals: ['strength'] }));
    expect(allItems(plan).some((i) => getExercise(i.exerciseId)!.category === 'balance')).toBe(true);
  });

  it('pregnancy excludes lying-on-back exercises and caps intensity', () => {
    const plan = okPlan(makeProfile({ equipment: ['mat', 'chair', 'wall'], goals: ['strength'] }, { pregnancy: 'pregnant' }));
    expect(allItems(plan).some((i) => getExercise(i.exerciseId)!.position === 'floor_supine')).toBe(false);
    expect(plan.screening.constraints.maxIntensity).toBe('moderate');
  });
});

describe('plan engine — safety gating', () => {
  it('refuses a plan and returns emergency guidance for emergency symptoms', () => {
    const r = generatePlan(makeProfile({}, { emergencyNow: { chestPain: true, severeBreathlessness: false, fainting: false, strokeSigns: false } }), NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('emergency');
  });

  it.each([
    ['exertional symptoms', { exertionalSymptoms: true }],
    ['recent surgery', { recentSurgery: true }],
    ['severe or worsening pain', { severeOrWorseningPain: true }],
    ['rehab program', { inRehabProgram: true }],
    ['pregnancy complications', { pregnancy: 'pregnant' as const, pregnancyComplications: true }],
  ])('does not generate a personalized plan when %s need professional assessment', (_label, health) => {
    const r = generatePlan(makeProfile({}, health), NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('needs_assessment');
  });

  it('inactive person with known heart/metabolic/kidney disease is referred', () => {
    const r = generatePlan(makeProfile({ activityLevel: 'inactive' }, { knownCardioMetabolicRenal: true }), NOW);
    expect(r.ok).toBe(false);
  });

  it('clinician clearance allows a plan, capped at moderate', () => {
    const plan = okPlan(makeProfile({}, { exertionalSymptoms: true, clinicianClearedAfterReferral: true }));
    expect(plan.screening.constraints.maxIntensity).toBe('moderate');
  });

  it('a rehab program is not unlocked by clearance (scope boundary)', () => {
    const r = generatePlan(makeProfile({}, { inRehabProgram: true, clinicianClearedAfterReferral: true }), NOW);
    expect(r.ok).toBe(false);
  });

  it('minors need a guardian before a plan is generated', () => {
    const r = generatePlan(makeProfile({ ageYears: 15, guardianConfirmed: false }), NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('age_restricted');
  });

  it('under-5s never get a structured plan, even with guardian confirmation', () => {
    const r = generatePlan(makeProfile({ ageYears: 3, guardianConfirmed: true }), NOW);
    expect(r.ok).toBe(false);
  });
});

describe('plan engine — invalid input', () => {
  it.each([
    [{ ageYears: 0 }, /Age/],
    [{ ageYears: 12.5 }, /Age/],
    [{ ageYears: 130 }, /Age/],
    [{ goals: [] }, /goal/],
    [{ daysPerWeek: 0 }, /days/],
    [{ daysPerWeek: 8 }, /days/],
    [{ minutesPerSession: 2 }, /Minutes/],
    [{ minutesPerSession: 200 }, /Minutes/],
    [{ consentGiven: false }, /Consent/],
    [{ equipment: ['rocket'] as never }, /Equipment/],
  ])('rejects %o', (override, msg) => {
    const r = generatePlan(makeProfile(override as Partial<Profile>), NOW);
    expect(r.ok).toBe(false);
    if (!r.ok && r.reason === 'invalid_input') expect(r.errors.join(' ')).toMatch(msg);
    else throw new Error('expected invalid_input');
  });

  it('handles a missing profile', () => {
    expect(validateProfile(null)).toEqual(['Profile is missing.']);
  });
});

describe('plan engine — explanations', () => {
  it('every planned item has reasons, a rationale, and evidence', () => {
    const plan = okPlan(makeProfile({ goals: ['strength', 'endurance', 'balance'], minutesPerSession: 40 }));
    for (const it of allItems(plan)) {
      expect(it.reasons.length).toBeGreaterThan(0);
      expect(it.prescription.rationale.length).toBeGreaterThan(20);
      expect(it.prescription.evidenceIds.length).toBeGreaterThan(0);
    }
    expect(plan.trace.length).toBeGreaterThanOrEqual(4);
    expect(planEvidenceIds(plan).length).toBeGreaterThan(3);
  });

  it('every alternative/easier/harder reference points to a real exercise', () => {
    for (const ex of EXERCISES) {
      for (const id of [...ex.alternatives, ex.easier, ex.harder].filter(Boolean) as string[]) {
        expect(getExercise(id), `${ex.id} → ${id}`).toBeDefined();
      }
    }
  });
});

describe('plans differ between people and between days', () => {
  const mainIds = (plan: Plan) => new Set(sessions(plan).flatMap((s) => s.items.filter((i) => i.block === 'main').map((i) => i.exerciseId)));
  const jaccard = (a: Set<string>, b: Set<string>) => [...a].filter((x) => b.has(x)).length / new Set([...a, ...b]).size;
  const kit = ['chair', 'wall', 'step', 'mat', 'light_weights', 'resistance_band'] as const;

  it('days in one week have different themes and different exercises', () => {
    const plan = okPlan(makeProfile({ goals: ['strength', 'endurance', 'balance'], daysPerWeek: 4, minutesPerSession: 40, equipment: [...kit] }));
    const ss = sessions(plan);
    expect(new Set(ss.map((s) => s.focus)).size).toBeGreaterThanOrEqual(3);
    const perDay = ss.map((s) => new Set(s.items.filter((i) => i.block === 'main').map((i) => i.exerciseId)));
    for (let i = 0; i < perDay.length; i++) for (let j = i + 1; j < perDay.length; j++) expect(jaccard(perDay[i]!, perDay[j]!)).toBeLessThan(0.6);
    expect(mainIds(plan).size).toBeGreaterThanOrEqual(10);
  });

  it('different goals give clearly different plans', () => {
    const base = { daysPerWeek: 3, minutesPerSession: 30, equipment: [...kit] };
    const strength = okPlan(makeProfile({ ...base, goals: ['strength'], experience: 'experienced', activityLevel: 'active' }));
    const balance = okPlan(makeProfile({ ...base, goals: ['balance'] }));
    const cardio = okPlan(makeProfile({ ...base, goals: ['endurance'] }));
    expect(jaccard(mainIds(strength), mainIds(balance))).toBeLessThan(0.5);
    expect(jaccard(mainIds(strength), mainIds(cardio))).toBeLessThan(0.5);
    const cat = (plan: Plan, c: string) => allItems(plan).filter((i) => i.block === 'main' && getExercise(i.exerciseId)!.category === c).length;
    expect(cat(balance, 'balance')).toBeGreaterThan(cat(strength, 'balance'));
    expect(cat(cardio, 'aerobic')).toBeGreaterThan(cat(strength, 'aerobic'));
  });

  it('a seated-only endurance plan includes seated cardio', () => {
    const plan = okPlan(makeProfile({ goals: ['endurance'], minutesPerSession: 30, accessibility: { seatedOnly: true, needsSupport: false, limitedGrip: false, lowVision: false, hearingImpaired: false } }));
    const aerobic = allItems(plan).filter((i) => getExercise(i.exerciseId)!.category === 'aerobic');
    expect(aerobic.length).toBeGreaterThan(0);
    for (const it of allItems(plan)) expect(getExercise(it.exerciseId)!.position).toBe('seated');
  });

  it('every exercise in the library can be tracked by the camera', () => {
    for (const ex of EXERCISES) expect(ex.camera.supported, ex.id).toBe(true);
  });
});

describe('free play from the library', () => {
  const base = makeProfile({ displayName: 'T', ageYears: 40, goals: ['strength'], equipment: ['chair', 'wall'] });
  const planOf = (p: Profile) => {
    const r = generatePlan(p);
    if (!r.ok) throw new Error('no plan');
    return r.plan.screening.constraints;
  };

  it('a normal profile can try ordinary exercises', () => {
    const c = planOf(base);
    expect(tryability(getExercise('sit_to_stand')!, base, c).level).toBe('ok');
  });

  it('missing equipment or difficulty only warns; it never blocks', () => {
    const c = planOf({ ...base, equipment: [] });
    const needsChair = EXERCISES.find((e) => e.equipment.includes('chair'))!;
    expect(['ok', 'warn']).toContain(tryability(needsChair, { ...base, equipment: [] }, c).level);
  });

  it('safety constraints block: a seated-only profile cannot try standing exercises', () => {
    const p = { ...base, accessibility: { ...base.accessibility, seatedOnly: true } };
    const c = planOf(p);
    const standing = EXERCISES.find((e) => e.position !== 'seated')!;
    const t = tryability(standing, p, c);
    expect(t.level).toBe('blocked');
  });

  it('builds a free-play session with a try- id, drops blocked exercises, and returns null if nothing is allowed', () => {
    const p = { ...base, accessibility: { ...base.accessibility, seatedOnly: true } };
    const c = planOf(p);
    const seated = EXERCISES.find((e) => e.position === 'seated')!;
    const standing = EXERCISES.find((e) => e.position !== 'seated')!;
    const s = buildTrySession([seated.id, standing.id], p, c)!;
    expect(s.id.startsWith(TRY_SESSION_PREFIX)).toBe(true);
    expect(s.items.map((i) => i.exerciseId)).toEqual([seated.id]);
    expect(buildTrySession([standing.id], p, c)).toBeNull();
    expect(buildTrySession(['not_real'], p, c)).toBeNull();
  });
});

describe('harder strength training', () => {
  const kit = ['chair', 'wall', 'step', 'mat', 'light_weights', 'resistance_band'] as Profile['equipment'];
  const strong = makeProfile({ ageYears: 30, goals: ['strength'], experience: 'experienced', activityLevel: 'active', equipment: kit, daysPerWeek: 4, minutesPerSession: 45 });
  const mainIds = (p: Plan) => allItems(p).filter((i) => i.block === 'main').map((i) => i.exerciseId);

  it('the library has a good set of hard (difficulty 3) strength moves, each with camera counting', () => {
    const hard = EXERCISES.filter((e) => e.category === 'strength' && e.difficulty === 3);
    expect(hard.length).toBeGreaterThanOrEqual(8);
    for (const e of hard) {
      expect(e.camera.supported, e.id).toBe(true);
      expect(e.easier, `${e.id} needs an easier option`).toBeTruthy();
    }
  });

  it('an experienced person training for strength is given hard moves with heavier-style prescriptions', () => {
    const plan = okPlan(strong);
    const hard = allItems(plan).filter((i) => i.block === 'main' && getExercise(i.exerciseId)!.difficulty === 3 && getExercise(i.exerciseId)!.category === 'strength');
    expect(hard.length).toBeGreaterThanOrEqual(3);
    for (const h of hard) {
      expect(h.prescription.restSeconds).toBeGreaterThanOrEqual(90);
      expect(h.prescription.evidenceIds).toContain('acsm-rt-2009');
      if (h.prescription.kind === 'reps') {
        expect(h.prescription.amount).toBeLessThanOrEqual(8);
        expect(h.prescription.sets).toBeGreaterThanOrEqual(1); // the time budget may trim sets
      }
    }
  });

  it('the plan still respects the time limit with these harder sets', () => {
    for (const minutes of [20, 30, 45, 60]) {
      const plan = okPlan({ ...strong, minutesPerSession: minutes });
      for (const s of sessions(plan)) expect(s.estSeconds).toBeLessThanOrEqual(minutes * 60);
    }
  });

  it('beginners and inactive people are not given the hard moves', () => {
    for (const p of [makeProfile({ goals: ['strength'], experience: 'new', equipment: kit }), makeProfile({ goals: ['strength'], experience: 'experienced', activityLevel: 'inactive', equipment: kit })]) {
      const hard = mainIds(okPlan(p)).filter((id) => getExercise(id)!.difficulty === 3);
      expect(hard).toEqual([]);
    }
  });

  it('safety still comes first: impact moves are dropped when impact is restricted, and weights for children', () => {
    const restricted = makeProfile({ ...strong, health: { ...strong.health, clinicianRestrictions: ['avoid_impact'] } });
    expect(mainIds(okPlan(restricted))).not.toContain('jump_squat');
    expect(EXERCISES.find((e) => e.id === 'jump_squat')!.minAge).toBeGreaterThanOrEqual(16);
    expect(EXERCISES.find((e) => e.id === 'goblet_squat')!.usesWeights).toBe(true);
  });

  it('the person who is not training for strength is not pushed to the hard moves', () => {
    const hardCount = (p: Plan) => mainIds(p).filter((id) => getExercise(id)!.difficulty === 3 && getExercise(id)!.category === 'strength').length;
    const balance = makeProfile({ ...strong, goals: ['balance'] });
    expect(hardCount(okPlan(balance))).toBeLessThan(hardCount(okPlan(strong)));
  });
});
