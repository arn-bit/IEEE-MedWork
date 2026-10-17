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
