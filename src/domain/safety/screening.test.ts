import { describe, expect, it } from 'vitest';
import { ageBandFor, screen, triageSymptom } from './screening';
import { makeProfile } from '../profile';

describe('safety screening', () => {
  it('healthy active adult proceeds without rules', () => {
    const r = screen(makeProfile({ activityLevel: 'active' }));
    expect(r.outcome).toBe('proceed');
    expect(r.hits).toHaveLength(0);
  });

  it.each(['chestPain', 'severeBreathlessness', 'fainting', 'strokeSigns'] as const)('%s right now → emergency', (k) => {
    const p = makeProfile();
    p.health.emergencyNow[k] = true;
    const r = screen(p);
    expect(r.outcome).toBe('emergency');
    expect(r.hits[0]!.ruleId).toBe('EMERG-01');
  });

  it('emergency outranks everything else, including clearance', () => {
    const p = makeProfile({}, { clinicianClearedAfterReferral: true, exertionalSymptoms: true });
    p.health.emergencyNow.chestPain = true;
    expect(screen(p).outcome).toBe('emergency');
  });

  it('known condition: inactive → needs assessment; active → moderate cap', () => {
    expect(screen(makeProfile({ activityLevel: 'inactive' }, { knownCardioMetabolicRenal: true })).outcome).toBe('needs_assessment');
    const active = screen(makeProfile({ activityLevel: 'active' }, { knownCardioMetabolicRenal: true }));
    expect(active.outcome).toBe('proceed_with_modifications');
    expect(active.constraints.maxIntensity).toBe('moderate');
    expect(active.hits.map((h) => h.ruleId)).toContain('SCREEN-03');
  });

  it('pain areas become excluded areas', () => {
    const r = screen(makeProfile({}, { painAreas: ['knees', 'lower_back'] }));
    expect(r.constraints.excludedAreas).toEqual(['knees', 'lower_back']);
    expect(r.outcome).toBe('proceed_with_modifications');
  });

  it('clinician restrictions map to constraints', () => {
    const r = screen(
      makeProfile({}, { clinicianRestrictions: ['avoid_overhead', 'avoid_floor', 'avoid_impact', 'seated_only', 'avoid_weights'], clinicianRestrictedAreas: ['shoulders'] }),
    );
    expect(r.constraints).toMatchObject({ excludeOverhead: true, excludeImpact: true, seatedOnly: true, excludeWeights: true });
    expect(r.constraints.excludePositions).toEqual(expect.arrayContaining(['floor_supine', 'floor_other']));
    expect(r.constraints.excludedAreas).toContain('shoulders');
  });

  it('age bands', () => {
    expect(ageBandFor(4)).toBe('under5');
    expect(ageBandFor(5)).toBe('child');
    expect(ageBandFor(12)).toBe('child');
    expect(ageBandFor(13)).toBe('teen');
    expect(ageBandFor(17)).toBe('teen');
    expect(ageBandFor(18)).toBe('adult');
    expect(ageBandFor(64)).toBe('adult');
    expect(ageBandFor(65)).toBe('older');
  });

  it('children are excluded from external weights', () => {
    expect(screen(makeProfile({ ageYears: 8, guardianConfirmed: true })).constraints.excludeWeights).toBe(true);
    expect(screen(makeProfile({ ageYears: 15, guardianConfirmed: true })).constraints.excludeWeights).toBe(false);
  });

  it('in-session triage escalates emergencies and never says "push through"', () => {
    expect(triageSymptom('chest_pain').action).toBe('emergency');
    expect(triageSymptom('stroke_signs').action).toBe('emergency');
    expect(triageSymptom('severe_breathless').action).toBe('emergency');
    for (const s of ['faint_or_dizzy', 'sharp_pain', 'unusual_fatigue', 'discomfort', 'just_stop'] as const) {
      const t = triageSymptom(s);
      expect(t.action).not.toBe('emergency');
      expect(t.message).not.toMatch(/push through|keep going|don't stop/i);
    }
  });
});
