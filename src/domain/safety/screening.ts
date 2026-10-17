import type { AgeBand, Constraints, HealthAnswers, Profile, RuleHit, ScreeningOutcome, ScreeningResult } from '../types';

/**
 * Deterministic safety screening. Pure and fully unit-tested.
 * Each rule is documented in SAFETY_AND_EVIDENCE.md §2 with the same rule ID.
 * Nothing in the UI or any explanation layer may override these outcomes.
 */

const SEVERITY: Record<ScreeningOutcome, number> = {
  proceed: 0,
  proceed_with_modifications: 1,
  needs_assessment: 2,
  emergency: 3,
};

export function ageBandFor(age: number): AgeBand {
  if (age < 5) return 'under5';
  if (age < 13) return 'child';
  if (age < 18) return 'teen';
  if (age < 65) return 'adult';
  return 'older';
}

export function isMinor(age: number): boolean {
  return age < 18;
}

export function hasEmergencySymptoms(h: Pick<HealthAnswers, 'emergencyNow'>): boolean {
  const e = h.emergencyNow;
  return e.chestPain || e.severeBreathlessness || e.fainting || e.strokeSigns;
}

export const EMERGENCY_GUIDANCE = {
  title: 'Get urgent medical help now',
  lines: [
    'Call your local emergency number now (for example 911 in the US or Canada, 999 in the UK, 112 in the EU, 000 in Australia).',
    'Stop exercising. Sit down and rest while you wait.',
    'Do not drive yourself to hospital.',
    'Signs of a stroke (face drooping, arm weakness, speech problems) need an emergency call even if they go away.',
  ],
  evidenceIds: ['nhs-heart-attack', 'nhs-stroke'],
} as const;

export function screen(profile: Pick<Profile, 'ageYears' | 'activityLevel' | 'health' | 'accessibility' | 'avoidPositions' | 'guardianConfirmed'>): ScreeningResult {
  const h = profile.health;
  const hits: RuleHit[] = [];
  const band = ageBandFor(profile.ageYears);
  const constraints: Constraints = {
    excludedAreas: [],
    excludePositions: [...profile.avoidPositions],
    excludeOverhead: false,
    excludeImpact: false,
    excludeForwardBending: false,
    excludeWeights: false,
    excludeUnsupportedBalance: false,
    seatedOnly: false,
    maxIntensity: 'moderate',
    ageBand: band,
  };

  // ── Emergency ──
  if (hasEmergencySymptoms(h)) {
    hits.push({
      ruleId: 'EMERG-01',
      outcome: 'emergency',
      title: 'Possible emergency symptoms',
      message: 'You reported symptoms that can be a sign of a medical emergency. Please get urgent help now instead of exercising.',
      evidenceIds: [...EMERGENCY_GUIDANCE.evidenceIds],
      evidenceKind: 'guideline',
    });
  }

  // ── Age gates ──
  if (band === 'under5') {
    hits.push({
      ruleId: 'AGE-01',
      outcome: 'needs_assessment',
      title: 'Designed for ages 5 and up',
      message:
        'Young children need active play throughout the day rather than a structured workout plan. A pediatrician or health visitor can advise on activity for under-5s.',
      evidenceIds: ['cdc-children'],
      evidenceKind: 'guideline',
    });
  } else if ((band === 'child' || band === 'teen') && !profile.guardianConfirmed) {
    hits.push({
      ruleId: band === 'child' ? 'AGE-02' : 'AGE-03',
      outcome: 'needs_assessment',
      title: 'A parent or guardian needs to be involved',
      message:
        band === 'child'
          ? 'For ages 5–12, a parent or guardian must set up the app and supervise exercise.'
          : 'For ages 13–17, a parent or guardian should review the plan and agree to it.',
      evidenceIds: ['aap-resistance-2020', 'nhs-children'],
      evidenceKind: 'position_stand',
    });
  }
  if (band === 'child' || band === 'teen') {
    constraints.excludeWeights = band === 'child';
    hits.push({
      ruleId: band === 'child' ? 'AGE-02' : 'AGE-03',
      outcome: 'proceed_with_modifications',
      title: band === 'child' ? 'Child-appropriate plan' : 'Teen-appropriate plan',
      message:
        band === 'child'
          ? 'Uses bodyweight and play-style movements with a focus on technique and adult supervision. As a cautious app choice (not an AAP requirement — AAP supports properly supervised resistance training), external weights are not used. Competitive features stay off.'
          : 'Uses bodyweight and light resistance with a focus on technique. Leaderboards, if turned on, only include other youth.',
      evidenceIds: band === 'child' ? ['aap-resistance-2020', 'cdc-children', 'heuristic-conservative'] : ['aap-resistance-2020', 'cdc-children', 'nhs-children'],
      evidenceKind: band === 'child' ? 'product_heuristic' : 'position_stand',
    });
  }
  if (band === 'older') {
    hits.push({
      ruleId: 'AGE-04',
      outcome: 'proceed_with_modifications',
      title: 'Strength and balance included',
      message: 'For adults 65 and over, plans include balance and strength work, using supported versions (chair or wall).',
      evidenceIds: ['cdc-older', 'nhs-older', 'cochrane-falls-2019'],
      evidenceKind: 'guideline',
    });
  }

  // ── Professional assessment needed (unless clinician has cleared) ──
  const cleared = h.clinicianClearedAfterReferral;
  const assessment = (ruleId: string, title: string, message: string, evidenceIds: string[], kind: RuleHit['evidenceKind']) => {
    if (cleared) {
      hits.push({
        ruleId,
        outcome: 'proceed_with_modifications',
        title: `${title} — clinician clearance confirmed`,
        message:
          'You told us a health professional has cleared you to exercise. Intensity is capped at moderate, and any restrictions you entered are applied. Follow their advice if it differs from this app.',
        evidenceIds,
        evidenceKind: kind,
      });
      constraints.maxIntensity = 'moderate';
    } else {
      hits.push({ ruleId, outcome: 'needs_assessment', title, message, evidenceIds, evidenceKind: kind });
    }
  };

  if (h.exertionalSymptoms) {
    assessment(
      'SCREEN-01',
      'Symptoms during activity',
      'Chest discomfort, unusual breathlessness, dizziness, fainting or palpitations with activity should be checked by a doctor before you start an exercise plan.',
      ['acsm-screening-2015'],
      'position_stand',
    );
  }
  if (h.knownCardioMetabolicRenal && profile.activityLevel === 'inactive') {
    assessment(
      'SCREEN-02',
      'Known heart, metabolic or kidney condition',
      'Because you are not currently active and have a known heart, metabolic (such as diabetes) or kidney condition, check with your doctor before starting a new exercise plan.',
      ['acsm-screening-2015'],
      'position_stand',
    );
  } else if (h.knownCardioMetabolicRenal) {
    constraints.maxIntensity = 'moderate';
    hits.push({
      ruleId: 'SCREEN-03',
      outcome: 'proceed_with_modifications',
      title: 'Known condition — moderate intensity only',
      message:
        'You are already active, so you can continue at light to moderate intensity. Check with your doctor before doing vigorous exercise, and keep up your regular follow-up.',
      evidenceIds: ['acsm-screening-2015'],
      evidenceKind: 'position_stand',
    });
  }
  if (h.recentSurgery) {
    assessment(
      'SCREEN-04',
      'Recent surgery or hospital stay',
      'After surgery or a hospital stay in the last 3 months, your care team should tell you what activity is safe before you follow a general plan.',
      ['heuristic-conservative'],
      'product_heuristic',
    );
  }
  if (h.severeOrWorseningPain) {
    assessment(
      'SCREEN-05',
      'Severe, new or worsening pain',
      'Pain that is severe, new and unexplained, or getting worse should be assessed by a doctor or physiotherapist. This app cannot tell whether exercise is suitable for it.',
      ['nhs-adults', 'heuristic-conservative'],
      'product_heuristic',
    );
  }
  if (h.inRehabProgram) {
    // A rehab program is a scope boundary: clearance does not change it.
    hits.push({
      ruleId: 'SCREEN-06',
      outcome: 'needs_assessment',
      title: 'You are in a rehab program',
      message:
        'Please follow the program your clinician or physiotherapist designed. Medical Workout does not replace individualized rehabilitation. You can still use the minigames, quiz, and evidence library.',
      evidenceIds: ['heuristic-conservative'],
      evidenceKind: 'product_heuristic',
    });
  }
  if ((h.pregnancy === 'pregnant' || h.pregnancy === 'postpartum') && h.pregnancyComplications) {
    assessment(
      'SCREEN-07',
      'Pregnancy or postpartum with complications',
      'Because you reported complications or were told to limit activity, please ask your obstetric care provider which exercise is right for you.',
      ['acog-pregnancy-2020'],
      'position_stand',
    );
  } else if (h.pregnancy === 'pregnant' || h.pregnancy === 'postpartum') {
    constraints.maxIntensity = 'moderate';
    if (h.pregnancy === 'pregnant') constraints.excludePositions.push('floor_supine');
    hits.push({
      ruleId: 'MOD-01',
      outcome: 'proceed_with_modifications',
      title: h.pregnancy === 'pregnant' ? 'Pregnancy adjustments' : 'Postpartum adjustments',
      message:
        (h.pregnancy === 'pregnant'
          ? 'Intensity is capped at moderate and exercises lying on your back are left out (a cautious product choice). '
          : 'Intensity is capped at moderate. ') + 'Please discuss your activity with your obstetric care provider.',
      evidenceIds: ['acog-pregnancy-2020', 'heuristic-conservative'],
      evidenceKind: 'position_stand',
    });
  }

  // ── Modifications ──
  if (h.painAreas.length > 0) {
    constraints.excludedAreas.push(...h.painAreas);
    hits.push({
      ruleId: 'MOD-02',
      outcome: 'proceed_with_modifications',
      title: 'Avoiding areas you flagged',
      message: `Exercises that mainly load your ${h.painAreas.map(areaLabel).join(', ')} are left out. This is a cautious choice and may leave out exercises that would be fine for you. A physiotherapist can advise on what is suitable.`,
      evidenceIds: ['heuristic-conservative'],
      evidenceKind: 'product_heuristic',
    });
  }
  const r = h.clinicianRestrictions;
  if (r.length > 0 || h.clinicianRestrictedAreas.length > 0) {
    if (r.includes('avoid_overhead')) constraints.excludeOverhead = true;
    if (r.includes('avoid_floor')) constraints.excludePositions.push('floor_supine', 'floor_other');
    if (r.includes('avoid_impact')) constraints.excludeImpact = true;
    if (r.includes('avoid_forward_bending')) constraints.excludeForwardBending = true;
    if (r.includes('seated_only')) constraints.seatedOnly = true;
    if (r.includes('avoid_weights')) constraints.excludeWeights = true;
    constraints.excludedAreas.push(...h.clinicianRestrictedAreas);
    hits.push({
      ruleId: 'MOD-03',
      outcome: 'proceed_with_modifications',
      title: 'Clinician restrictions applied',
      message: 'Exercises that conflict with the restrictions your clinician gave you are left out.',
      evidenceIds: ['heuristic-conservative'],
      evidenceKind: 'product_heuristic',
    });
  }
  if (h.balanceConcernOrFall || profile.accessibility.needsSupport) {
    constraints.excludeUnsupportedBalance = true;
    hits.push({
      ruleId: 'MOD-04',
      outcome: 'proceed_with_modifications',
      title: 'Supported balance work',
      message: 'Balance exercises use a chair or wall for support, and unsupported balance exercises are left out.',
      evidenceIds: ['cochrane-falls-2019', 'nhs-balance'],
      evidenceKind: 'systematic_review',
    });
  }
  if (profile.accessibility.seatedOnly) {
    constraints.seatedOnly = true;
    hits.push({
      ruleId: 'MOD-05',
      outcome: 'proceed_with_modifications',
      title: 'Seated plan',
      message: 'Only exercises that can be done seated are included.',
      evidenceIds: ['who-2020', 'nhs-sitting'],
      evidenceKind: 'guideline',
    });
  }
  if (profile.activityLevel === 'inactive') {
    hits.push({
      ruleId: 'INT-01',
      outcome: 'proceed_with_modifications',
      title: 'Starting gently',
      message: 'Because you are not currently active, the plan starts at the lighter end and builds up gradually.',
      evidenceIds: ['acsm-2011', 'nhs-adults'],
      evidenceKind: 'position_stand',
    });
  }

  constraints.excludedAreas = [...new Set(constraints.excludedAreas)];
  constraints.excludePositions = [...new Set(constraints.excludePositions)];

  const outcome = hits.reduce<ScreeningOutcome>((worst, hit) => (SEVERITY[hit.outcome] > SEVERITY[worst] ? hit.outcome : worst), 'proceed');
  return { outcome, hits, constraints };
}

export function areaLabel(a: string): string {
  return a.replace('_', ' ');
}

/** In-session symptom check. Returns what the session should do next. */
export type SymptomReport =
  | 'chest_pain'
  | 'severe_breathless'
  | 'faint_or_dizzy'
  | 'stroke_signs'
  | 'sharp_pain'
  | 'unusual_fatigue'
  | 'discomfort'
  | 'just_stop';

export function triageSymptom(s: SymptomReport): { action: 'emergency' | 'stop_and_rest' | 'stop'; message: string } {
  switch (s) {
    case 'chest_pain':
    case 'severe_breathless':
    case 'stroke_signs':
      return { action: 'emergency', message: EMERGENCY_GUIDANCE.title };
    case 'faint_or_dizzy':
      return {
        action: 'stop_and_rest',
        message:
          'Stop and sit or lie down somewhere safe. If you faint, or the dizziness does not settle quickly, get medical help. Mention it to a doctor before exercising again.',
      };
    case 'sharp_pain':
      return {
        action: 'stop_and_rest',
        message:
          'Stop the exercise that caused it. Pain that is sharp, or does not settle, should be checked by a doctor or physiotherapist before you continue that movement.',
      };
    case 'unusual_fatigue':
      return { action: 'stop_and_rest', message: 'Rest is part of training. Ending early is the right call when your body says so.' };
    case 'discomfort':
      return { action: 'stop_and_rest', message: 'Session ended. Try an easier alternative next time, or ask a professional if the discomfort keeps happening.' };
    case 'just_stop':
      return { action: 'stop', message: 'Session saved. Nice work showing up.' };
  }
}
