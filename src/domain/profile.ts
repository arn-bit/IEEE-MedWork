import type { HealthAnswers, Profile } from './types';

export function emptyHealth(): HealthAnswers {
  return {
    emergencyNow: { chestPain: false, severeBreathlessness: false, fainting: false, strokeSigns: false },
    exertionalSymptoms: false,
    knownCardioMetabolicRenal: false,
    recentSurgery: false,
    painAreas: [],
    severeOrWorseningPain: false,
    inRehabProgram: false,
    pregnancy: 'no',
    pregnancyComplications: false,
    balanceConcernOrFall: false,
    clinicianRestrictions: [],
    clinicianRestrictedAreas: [],
    clinicianClearedAfterReferral: false,
    painSeverity: {},
    unsure: [],
    answered: [],
    freeText: { injuries: '', conditions: '', clinician: '', other: '' },
    dismissedFindings: [],
    needsClinician: [],
  };
}

export function defaultProfile(): Profile {
  return {
    displayName: '',
    ageYears: 30,
    guardianConfirmed: false,
    goals: [],
    activityLevel: 'some',
    experience: 'new',
    daysPerWeek: 3,
    minutesPerSession: 20,
    equipment: ['chair', 'wall'],
    location: 'home',
    dislikedExerciseIds: [],
    goalText: '',
    avoidText: '',
    avoidPositions: [],
    accessibility: { seatedOnly: false, needsSupport: false, limitedGrip: false, lowVision: false, hearingImpaired: false },
    health: emptyHealth(),
    consentGiven: false,
    createdAt: new Date(0).toISOString(),
  };
}

/** Test/fixture helper: a valid adult profile with overrides. */
export function makeProfile(overrides: Partial<Profile> = {}, health: Partial<HealthAnswers> = {}): Profile {
  const base = defaultProfile();
  return {
    ...base,
    goals: ['general_fitness'],
    consentGiven: true,
    ...overrides,
    health: { ...base.health, ...(overrides.health ?? {}), ...health },
    accessibility: { ...base.accessibility, ...(overrides.accessibility ?? {}) },
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Fill any fields missing from older saved profiles with safe defaults, so code can rely on the
 * current shape. Never invents answers: new fields default to "no / empty".
 */
export function normalizeProfile(raw: unknown): Profile | null {
  if (!isObj(raw)) return null;
  const base = defaultProfile();
  const rh = isObj(raw.health) ? raw.health : {};
  const health = {
    ...emptyHealth(),
    ...rh,
    emergencyNow: { ...emptyHealth().emergencyNow, ...(isObj(rh.emergencyNow) ? rh.emergencyNow : {}) },
    freeText: { ...emptyHealth().freeText, ...(isObj(rh.freeText) ? rh.freeText : {}) },
    painSeverity: isObj(rh.painSeverity) ? rh.painSeverity : {},
  } as Profile['health'];
  for (const k of ['painAreas', 'clinicianRestrictions', 'clinicianRestrictedAreas', 'unsure', 'answered', 'dismissedFindings', 'needsClinician'] as const) {
    if (!Array.isArray(health[k])) (health as unknown as Record<string, unknown>)[k] = [];
  }
  const ra = isObj(raw.accessibility) ? raw.accessibility : {};
  const profile = {
    ...base,
    ...raw,
    health,
    accessibility: { ...base.accessibility, ...ra },
  } as Profile;
  for (const k of ['goals', 'equipment', 'dislikedExerciseIds', 'avoidPositions'] as const) {
    if (!Array.isArray(profile[k])) (profile as unknown as Record<string, unknown>)[k] = base[k];
  }
  if (typeof profile.goalText !== 'string') profile.goalText = '';
  if (typeof profile.avoidText !== 'string') profile.avoidText = '';
  return profile;
}
