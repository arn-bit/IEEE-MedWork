import { describe, expect, it } from 'vitest';
import { EVIDENCE, getEvidence } from './registry';
import { EXERCISES } from '../exercises/library';
import { generatePlan, planEvidenceIds } from '../plan/engine';
import { makeProfile } from '../profile';
import { screen, EMERGENCY_GUIDANCE } from '../safety/screening';

describe('evidence registry integrity', () => {
  it('has unique ids and complete records', () => {
    const ids = EVIDENCE.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of EVIDENCE) {
      expect(e.title.length, e.id).toBeGreaterThan(3);
      expect(e.organization.length, e.id).toBeGreaterThan(2);
      expect(e.supports.length, e.id).toBeGreaterThan(20);
      expect(e.population.length, e.id).toBeGreaterThan(2);
      expect(e.limitations.length, e.id).toBeGreaterThan(5);
      expect(e.lastChecked).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(() => new URL(e.url)).not.toThrow();
      expect(new URL(e.url).protocol).toBe('https:');
      if (e.doi) {
        expect(e.doi).toMatch(/^10\.\d{4,9}\/\S+$/);
      }
    }
  });

  it('every exercise cites at least one existing source and has review metadata', () => {
    for (const ex of EXERCISES) {
      expect(ex.sourceIds.length, ex.id).toBeGreaterThan(0);
      for (const id of ex.sourceIds) expect(getEvidence(id), `${ex.id} → ${id}`).toBeDefined();
      expect(ex.evidenceReviewed).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(ex.steps.length).toBeGreaterThan(1);
      expect(ex.cautions.length).toBeGreaterThan(0);
    }
  });

  it('every evidence id used by safety rules exists', () => {
    for (const id of EMERGENCY_GUIDANCE.evidenceIds) expect(getEvidence(id)).toBeDefined();
    const everything = makeProfile(
      { ageYears: 70, activityLevel: 'active' },
      {
        knownCardioMetabolicRenal: true,
        painAreas: ['knees'],
        pregnancy: 'postpartum',
        balanceConcernOrFall: true,
        clinicianRestrictions: ['avoid_overhead'],
        exertionalSymptoms: true,
        recentSurgery: true,
        severeOrWorseningPain: true,
        inRehabProgram: true,
      },
    );
    for (const hit of screen(everything).hits) for (const id of hit.evidenceIds) expect(getEvidence(id), `${hit.ruleId} → ${id}`).toBeDefined();
  });

  it('every evidence id referenced by generated plans exists', () => {
    const profiles = [
      makeProfile(),
      makeProfile({ ageYears: 9, guardianConfirmed: true, goals: ['strength', 'balance'] }),
      makeProfile({ ageYears: 16, guardianConfirmed: true, goals: ['endurance'] }),
      makeProfile({ ageYears: 80, goals: ['balance', 'flexibility'], activityLevel: 'inactive' }),
      makeProfile({ goals: ['strength', 'endurance', 'mobility'], experience: 'experienced', activityLevel: 'active', minutesPerSession: 60, equipment: ['chair', 'wall', 'step', 'mat', 'light_weights', 'resistance_band'] }),
    ];
    for (const p of profiles) {
      const r = generatePlan(p, new Date('2026-10-16'));
      expect(r.ok).toBe(true);
      if (r.ok) for (const id of planEvidenceIds(r.plan)) expect(getEvidence(id), id).toBeDefined();
    }
  });

  it('product heuristics are labelled as such, never as guidelines', () => {
    expect(getEvidence('heuristic-conservative')!.kind).toBe('product_heuristic');
  });
});
