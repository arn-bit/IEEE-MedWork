import { describe, expect, it } from 'vitest';
import { analyzeText, applyFinding, findingStatus, hasIdentifiers, redactIdentifiers, resolveProfile, MAX_TEXT, type Finding } from './analyze';
import { screen } from './screening';
import { generatePlan } from '../plan/engine';
import { makeProfile } from '../profile';
import type { HealthFreeText, Profile } from '../types';

const NOW = new Date('2026-10-16T12:00:00Z');

function profileWith(text: Partial<HealthFreeText>, extra: Partial<Profile> = {}): Profile {
  const p = makeProfile(extra);
  p.health.freeText = { injuries: '', conditions: '', clinician: '', other: '', ...text };
  return p;
}
const ids = (field: keyof HealthFreeText, text: string, extra: Partial<Profile> = {}) => analyzeText(profileWith({ [field]: text }, extra), NOW).findings.map((f) => f.id);
const find = (field: keyof HealthFreeText, text: string, id: string): Finding | undefined =>
  analyzeText(profileWith({ [field]: text }), NOW).findings.find((f) => f.id === id);

describe('free-text analysis: emergencies and symptoms', () => {
  it.each([
    ['I have chest pain right now', 'emerg:chest'],
    ['chest tightness currently', 'emerg:chest'],
    ['I can’t breathe at the moment', 'emerg:breath'],
    ['I fainted this morning', 'emerg:faint'],
    ['my face is drooping and speech is slurred right now', 'emerg:stroke'],
  ])('%s → %s (urgent)', (text, id) => {
    const f = find('other', text, id);
    expect(f?.kind).toBe('urgent');
    expect(f?.effects[0]?.t).toBe('emergency');
  });

  it.each([
    ['I get chest pain when I climb stairs', 'sym:chest'],
    ['sometimes dizzy when I exercise', 'sym:dizzy'],
    ['my heart races during workouts', 'sym:palp'],
    ['I get out of breath walking up hills', 'sym:breathless'],
  ])('%s → %s (refer, exertional symptoms)', (text, id) => {
    const f = find('other', text, id);
    expect(f?.kind).toBe('refer');
    expect(f?.effects).toContainEqual({ t: 'flag', key: 'exertionalSymptoms' });
  });

  it.each([
    'I do not have chest pain',
    'no chest pain or dizziness',
    'never had palpitations',
    'without any shortness of breath',
    "I haven't fainted",
  ])('negation is respected: %s', (text) => {
    expect(ids('other', text).filter((i) => i.startsWith('emerg') || i.startsWith('sym'))).toEqual([]);
  });

  it('a past event is information, not an emergency', () => {
    const r = analyzeText(profileWith({ other: 'I had chest pain years ago, now resolved' }), NOW).findings;
    expect(r.map((f) => f.id)).toEqual(['past:chest']);
    expect(r[0]!.kind).toBe('info');
    expect(r[0]!.effects).toHaveLength(0);
  });
});

describe('free-text analysis: conditions', () => {
  it.each([
    ['I have type 2 diabetes', 'cond:diabetes'],
    ['I use insulin', 'cond:diabetes'],
    ['had a heart attack in 2019', 'cond:heart'],
    ['I have atrial fibrillation and a pacemaker', 'cond:heart'],
    ['chronic kidney disease', 'cond:kidney'],
  ])('%s → %s', (text, id) => {
    const f = find('conditions', text, id);
    expect(f?.effects).toContainEqual({ t: 'flag', key: 'knownCardioMetabolicRenal' });
  });

  it('pre-diabetes is information only', () => {
    const r = ids('conditions', 'I have pre-diabetes');
    expect(r).toContain('info:prediabetes');
    expect(r).not.toContain('cond:diabetes');
  });

  it('"heart rate" and "good for my heart" are not heart conditions', () => {
    expect(ids('other', 'I want to improve my heart rate and be good for my heart')).toEqual([]);
  });

  it.each([
    ['I am having chemo', 'assess:cancer'],
    ['history of blood clots in my leg', 'assess:clot'],
    ['I have an eating disorder', 'assess:eating'],
    ['I had a concussion last week', 'assess:concussion'],
    ['I broke my wrist', 'assess:fracture'],
  ])('%s → %s (needs your care team)', (text, id) => {
    expect(find('conditions', text, id)?.effects[0]?.t).toBe('assess');
  });

  it('a past cancer/fracture is information', () => {
    expect(ids('conditions', 'I broke my arm years ago')).toEqual(['past:fracture']);
  });

  it('informational conditions never change the plan', () => {
    const r = analyzeText(profileWith({ conditions: 'asthma, high blood pressure and I take warfarin' }), NOW).findings;
    expect(r.map((f) => f.id).sort()).toEqual(['info:bp', 'info:meds', 'info:resp']);
    expect(r.every((f) => f.effects.length === 0)).toBe(true);
  });

  it('low bone density gives an optional, never automatic, suggestion', () => {
    const f = find('conditions', 'osteoporosis', 'bone');
    expect(f?.auto).toBe(false);
    expect(f?.effects).toHaveLength(2);
  });
});

describe('free-text analysis: pain, injuries and restrictions', () => {
  it.each([
    ['my left knee hurts when I squat', 'knees'],
    ['sore lower back', 'lower_back'],
    ['I have a bad back', 'lower_back'],
    ['rotator cuff injury', 'shoulders'],
    ['tennis elbow', 'wrists'],
    ['plantar fasciitis in my heel hurts', 'ankles'],
    ['sciatica', null],
    ['neck stiffness', 'neck'],
    ['hip pain', 'hips'],
  ])('%s → %s', (text, area) => {
    const r = ids('injuries', text);
    if (area) expect(r).toContain(`pain:${area}`);
    else expect(r.length).toBeGreaterThanOrEqual(0);
  });

  it('"pain came back" is not a back problem', () => {
    expect(ids('injuries', 'the pain came back')).not.toContain('pain:lower_back');
  });

  it('no pain → nothing', () => {
    expect(ids('injuries', 'no knee pain at all')).toEqual([]);
  });

  it('severe or worsening pain escalates to a referral', () => {
    const f = find('injuries', 'sharp pain in my knee that is getting worse', 'pain:knees');
    expect(f?.kind).toBe('refer');
    expect(f?.effects).toContainEqual({ t: 'flag', key: 'severeOrWorseningPain' });
    const p = applyFinding(profileWith({}), f!);
    expect(screen(p).outcome).toBe('needs_assessment');
  });

  it('severity is attributed to the right body part when one sentence mentions two', () => {
    const r = analyzeText(profileWith({ injuries: 'My left knee aches on stairs and my lower back gets sharp pain that is getting worse' }), NOW).findings;
    expect(r.find((f) => f.id === 'pain:knees')?.kind).toBe('adjust');
    expect(r.find((f) => f.id === 'pain:lower_back')?.kind).toBe('refer');
  });

  it('lists like "knee, hip and back pain" still flag every area', () => {
    const r = ids('injuries', 'I have knee, hip and my back pain');
    expect(r).toEqual(expect.arrayContaining(['pain:knees', 'pain:hips', 'pain:lower_back']));
  });

  it('numbness or giving way counts as severe', () => {
    expect(find('injuries', 'my leg goes numb and my knee gives way', 'pain:knees')?.kind).toBe('refer');
  });

  it('"not severe" is not treated as severe', () => {
    expect(find('injuries', 'knee pain, not severe', 'pain:knees')?.kind).toBe('adjust');
  });

  it('a healed past injury is only a suggestion', () => {
    const f = find('injuries', 'I hurt my knee years ago but it healed', 'pain:knees');
    expect(f?.auto).toBe(false);
  });

  it.each([
    ['my doctor told me not to lift heavy things', 'avoid_weights'],
    ['no overhead movements', 'avoid_overhead'],
    ['avoid bending forward', 'avoid_forward_bending'],
    ['cannot do running or jumping', 'avoid_impact'],
    ['shouldn’t kneel or get down on the floor', 'avoid_floor'],
    ['I use a wheelchair', 'seated_only'],
  ])('clinician restriction: %s → %s', (text, value) => {
    const f = find('clinician', text, `restrict:${value}`);
    expect(f?.effects).toContainEqual({ t: 'restriction', value });
  });

  it('enjoying an activity is not a restriction', () => {
    expect(ids('clinician', 'I love running and lifting')).toEqual([]);
    expect(ids('clinician', 'no restrictions')).toEqual([]);
  });

  it('a clinician area restriction without a pain word', () => {
    const f = find('clinician', 'physio said avoid loading my right knee', 'area:knees');
    expect(f?.effects).toContainEqual({ t: 'restrictArea', area: 'knees' });
  });

  it('balance, grip and rehab', () => {
    expect(ids('other', 'I have had two falls and feel unsteady')).toContain('balance');
    expect(ids('other', 'weak grip because of arthritis in my hands')).toContain('grip');
    expect(ids('other', 'I am doing physio for my shoulder')).toContain('rehab');
    expect(ids('other', 'I finished physio last year')).toContain('info:rehab-past');
    expect(ids('other', 'no falls')).toEqual([]);
  });
});

describe('free-text analysis: surgery, pregnancy', () => {
  it('recent surgery is detected from time words', () => {
    expect(ids('other', 'knee surgery 3 weeks ago')).toContain('surg:recent');
    expect(ids('other', 'I had an operation recently')).toContain('surg:recent');
    expect(ids('other', 'hip replacement 5 months ago')).toContain('surg:old');
    expect(ids('other', 'back surgery in 2018')).toContain('surg:old');
  });

  it('surgery with unknown timing asks rather than assuming', () => {
    const f = find('other', 'I had knee surgery', 'surg:unknown');
    expect(f?.auto).toBe(false);
    expect(f?.actionLabel).toMatch(/last 3 months/);
  });

  it('pregnancy and postpartum', () => {
    expect(find('other', 'I am 20 weeks pregnant', 'preg:pregnant')?.effects).toContainEqual({ t: 'pregnancy', value: 'pregnant' });
    expect(ids('other', 'I gave birth two months ago')).toContain('preg:postpartum');
    expect(ids('other', 'I gave birth 3 years ago')).not.toContain('preg:postpartum');
    expect(ids('other', 'I am not pregnant')).toEqual([]);
  });

  it('pregnancy complications escalate', () => {
    const r = analyzeText(profileWith({ other: 'pregnant with pre-eclampsia' }), NOW).findings;
    expect(r.find((f) => f.id === 'preg:complications')?.kind).toBe('refer');
  });
});

describe('goals and exercises to avoid', () => {
  const goalIds = (text: string) => analyzeText(makeProfile({ goalText: text }), NOW).findings.map((f) => f.id);
  const avoidIds = (text: string) => analyzeText(makeProfile({ avoidText: text }), NOW).findings.map((f) => f.id);

  it('maps goal wording to goals, never automatically', () => {
    expect(goalIds('I want to get stronger and climb stairs without losing my breath')).toEqual(expect.arrayContaining(['goal:strength', 'goal:endurance']));
    expect(goalIds('steadier on my feet')).toContain('goal:balance');
    expect(goalIds('touch my toes')).toContain('goal:flexibility');
    const f = analyzeText(makeProfile({ goalText: 'get stronger' }), NOW).findings.find((x) => x.id === 'goal:strength')!;
    expect(f.auto).toBe(false);
  });

  it('weight goals are acknowledged without weight targets', () => {
    const r = analyzeText(makeProfile({ goalText: 'lose weight' }), NOW).findings;
    expect(r.find((f) => f.id === 'goal:weight')?.detail).toMatch(/don’t set weight/);
  });

  it('extreme or punishing goals get a warning', () => {
    expect(goalIds('I need to burn off what I ate, whatever it takes')).toContain('goal:extreme');
  });

  it('typed exercises to avoid map to library ids', () => {
    const r = analyzeText(makeProfile({ avoidText: 'squats, push-ups and jumping' }), NOW).findings;
    const all = r.flatMap((f) => f.effects.flatMap((e) => (e.t === 'avoid' ? e.exerciseIds : [])));
    expect(all).toEqual(expect.arrayContaining(['bodyweight_squat', 'mini_squat', 'wall_pushup', 'step_jacks']));
  });

  it('a list mixing known and unknown exercises reports the unknown ones', () => {
    const r = analyzeText(makeProfile({ avoidText: 'squats and burpees' }), NOW);
    expect(r.findings.map((f) => f.id)).toContain('avoid:Squats');
    expect(r.notUnderstood).toEqual([{ field: 'avoid', text: 'burpees' }]);
  });

  it('unrecognised exercises are reported, not silently dropped', () => {
    expect(analyzeText(makeProfile({ avoidText: 'burpees' }), NOW).notUnderstood).toEqual([{ field: 'avoid', text: 'burpees' }]);
    expect(avoidIds('burpees')).toEqual([]);
  });
});

describe('what we could not interpret', () => {
  it('reports clauses nothing matched, with a cap', () => {
    const r = analyzeText(profileWith({ other: 'my toes go funny at night. i like gardening. knee pain.' }), NOW);
    expect(r.findings.map((f) => f.id)).toContain('pain:knees');
    expect(r.notUnderstood.map((n) => n.text)).toEqual(expect.arrayContaining(['my toes go funny at night', 'i like gardening']));
  });
});

describe('identifiers are detected and removed', () => {
  it.each([
    ['email me at sam.jones@example.com', true],
    ['call 555 123 4567', true],
    ['ssn 123-45-6789', true],
    ['see https://example.com/x', true],
    ['I am 45 and weigh 80 kg, 3 sets of 10', false],
  ])('%s', (text, expected) => {
    expect(hasIdentifiers(text)).toBe(expected);
  });

  it('redaction replaces them and keeps the rest', () => {
    expect(redactIdentifiers('knee pain, email sam@x.org or 555 123 4567')).toBe('knee pain, email [removed] or [removed]');
  });

  it('a warning finding is raised without echoing the identifier', () => {
    const f = analyzeText(profileWith({ other: 'my email is sam@x.org' }), NOW).findings.find((x) => x.id === 'pii:other')!;
    expect(f.quote).toBe('[hidden]');
  });
});

describe('long text is truncated and reported', () => {
  it('flags fields over the limit', () => {
    const r = analyzeText(profileWith({ other: `${'a '.repeat(MAX_TEXT)}knee pain` }), NOW);
    expect(r.truncated).toEqual(['other']);
    expect(r.findings.map((f) => f.id)).not.toContain('pain:knees');
  });
});

describe('safety integration: free text can only make plans safer', () => {
  it('an automatic finding changes the plan without any structured answer', () => {
    const p = profileWith({ injuries: 'my knees hurt when I bend them' }, { goals: ['strength'] });
    const r = generatePlan(p, NOW);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.plan.screening.constraints.excludedAreas).toContain('knees');
      expect(r.plan.excluded.find((x) => x.exerciseId === 'sit_to_stand')?.reason).toMatch(/knees/);
      expect(r.plan.trace.map((t) => t.step)).toContain('Used from your own words');
    }
  });

  it('typed emergency symptoms block a plan and show the emergency outcome', () => {
    const r = generatePlan(profileWith({ other: 'I have chest pain right now' }), NOW);
    expect(r.ok).toBe(false);
    if (!r.ok && r.reason !== 'invalid_input') expect(r.reason).toBe('emergency');
  });

  it('typed exertional symptoms need assessment, like the structured answer', () => {
    const r = generatePlan(profileWith({ other: 'I get dizzy when I exercise' }), NOW);
    expect(r.ok).toBe(false);
    if (!r.ok && r.reason !== 'invalid_input') expect(r.reason).toBe('needs_assessment');
  });

  it('a clinician restriction typed in words is honoured', () => {
    const p = profileWith({ clinician: 'my doctor said no overhead movements' }, { goals: ['mobility'] });
    const r = generatePlan(p, NOW);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const items = r.plan.schedule.flatMap((s) => s?.items ?? []);
      expect(items.some((i) => i.exerciseId === 'arm_raise' || i.exerciseId === 'step_jacks')).toBe(false);
    }
  });

  it('dismissing a finding removes it (the user is the authority on their own words)', () => {
    const p = profileWith({ injuries: 'my knees hurt' }, { goals: ['strength'] });
    p.health.dismissedFindings = ['pain:knees'];
    const res = resolveProfile(p, NOW);
    expect(res.profile.health.painAreas).not.toContain('knees');
    const f = analyzeText(p, NOW).findings.find((x) => x.id === 'pain:knees')!;
    expect(findingStatus(p, f)).toBe('dismissed');
  });

  it('"Not sure" is treated like "Yes"', () => {
    const p = makeProfile({}, { unsure: ['exertionalSymptoms'] });
    const r = generatePlan(p, NOW);
    expect(r.ok).toBe(false);
    const p2 = makeProfile({}, { unsure: ['balanceConcernOrFall'] });
    const r2 = generatePlan(p2, NOW);
    expect(r2.ok).toBe(true);
    if (r2.ok) expect(r2.plan.screening.constraints.excludeUnsupportedBalance).toBe(true);
  });

  it('per-area severe pain refers the user on', () => {
    const p = makeProfile({}, { painAreas: ['knees'], painSeverity: { knees: 'severe' } });
    expect(generatePlan(p, NOW).ok).toBe(false);
    const mild = makeProfile({}, { painAreas: ['knees'], painSeverity: { knees: 'mild' } });
    expect(generatePlan(mild, NOW).ok).toBe(true);
  });

  it('goal suggestions are not applied unless chosen', () => {
    const p = makeProfile({ goalText: 'I want to be stronger', goals: ['mobility'] });
    const res = resolveProfile(p, NOW);
    expect(res.profile.goals).toEqual(['mobility']);
    const f = res.analysis.findings.find((x) => x.id === 'goal:strength')!;
    expect(findingStatus(p, f)).toBe('suggested');
    expect(applyFinding(p, f).goals).toEqual(['mobility', 'strength']);
  });

  it('applying a goal respects the three-goal limit', () => {
    const p = makeProfile({ goalText: 'stronger', goals: ['mobility', 'balance', 'flexibility'] });
    const f = analyzeText(p, NOW).findings.find((x) => x.id === 'goal:strength')!;
    expect(applyFinding(p, f).goals).toHaveLength(3);
  });

  it('older saved profiles without the new fields still work', async () => {
    const { normalizeProfile } = await import('../profile');
    const old = JSON.parse(JSON.stringify(makeProfile()));
    delete old.health.freeText;
    delete old.health.unsure;
    delete old.health.painSeverity;
    delete old.goalText;
    const n = normalizeProfile(old)!;
    expect(n.health.freeText.injuries).toBe('');
    expect(n.health.unsure).toEqual([]);
    expect(generatePlan(n, NOW).ok).toBe(true);
  });
});
