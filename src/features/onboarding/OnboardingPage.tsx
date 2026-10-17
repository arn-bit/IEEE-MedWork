import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useStore } from '../../state/store';
import { defaultProfile, emptyHealth } from '../../domain/profile';
import { EXERCISES } from '../../domain/exercises/library';
import { ageBandFor, hasEmergencySymptoms } from '../../domain/safety/screening';
import { MAX_MINUTES, MIN_MINUTES } from '../../domain/plan/engine';
import type { BodyArea, ClinicianRestriction, Equipment, Goal, PlanResult, Profile } from '../../domain/types';
import { Callout, CheckCard, ChipGroup, RadioCards, Stepper } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { EmergencyPanel, ReferralPanel } from '../safety/SafetyPanels';

const STEPS = ['About you', 'Goals', 'Activity', 'Schedule', 'Equipment', 'Preferences', 'Health', 'Review'] as const;

const GOAL_OPTIONS: { value: Goal; label: string }[] = [
  { value: 'general_fitness', label: 'General fitness' },
  { value: 'strength', label: 'Strength' },
  { value: 'mobility', label: 'Mobility' },
  { value: 'endurance', label: 'Endurance' },
  { value: 'balance', label: 'Balance' },
  { value: 'flexibility', label: 'Flexibility' },
];
const EQUIPMENT_OPTIONS: { value: Equipment; label: string }[] = [
  { value: 'chair', label: 'Sturdy chair (no wheels)' },
  { value: 'wall', label: 'Clear wall space' },
  { value: 'step', label: 'Low step or stair' },
  { value: 'mat', label: 'Exercise mat' },
  { value: 'light_weights', label: 'Light weights / water bottles' },
  { value: 'resistance_band', label: 'Resistance band' },
];
const AREA_OPTIONS: { value: BodyArea; label: string }[] = [
  { value: 'neck', label: 'Neck' },
  { value: 'shoulders', label: 'Shoulders' },
  { value: 'wrists', label: 'Wrists / hands' },
  { value: 'lower_back', label: 'Lower back' },
  { value: 'hips', label: 'Hips' },
  { value: 'knees', label: 'Knees' },
  { value: 'ankles', label: 'Ankles / feet' },
];
const RESTRICTION_OPTIONS: { value: ClinicianRestriction; label: string }[] = [
  { value: 'avoid_overhead', label: 'No overhead arm movements' },
  { value: 'avoid_floor', label: 'No floor exercises' },
  { value: 'avoid_impact', label: 'No impact' },
  { value: 'avoid_forward_bending', label: 'No forward bending' },
  { value: 'avoid_weights', label: 'No weights' },
  { value: 'seated_only', label: 'Seated only' },
];

function Why({ children }: { children: ReactNode }) {
  return (
    <span className="hint" style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
      <span style={{ flex: 'none', marginTop: 2 }}>
        <Icon name="info" size={15} />
      </span>
      <span>
        <strong>Why we ask:</strong> {children}
      </span>
    </span>
  );
}

function YesNo({ label, why, value, onChange }: { label: string; why: ReactNode; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <fieldset className="field" style={{ padding: '12px 0', borderBottom: '1px solid var(--line)' }}>
      <legend>{label}</legend>
      <Why>{why}</Why>
      <div className="chip-group" style={{ marginTop: 6 }}>
        {[
          { v: false, l: 'No' },
          { v: true, l: 'Yes' },
        ].map((o) => (
          <label key={o.l} className="chip">
            <input type="radio" name={label} checked={value === o.v} onChange={() => onChange(o.v)} />
            <span>{o.l}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function validateStep(step: number, p: Profile): string[] {
  const e: string[] = [];
  if (step === 0) {
    if (!Number.isInteger(p.ageYears) || p.ageYears < 1 || p.ageYears > 120) e.push('Enter an age between 1 and 120 (whole years).');
    if (p.displayName.length > 30) e.push('Keep the nickname under 30 characters.');
    if (p.ageYears < 18 && p.ageYears >= 5 && !p.guardianConfirmed) e.push('A parent or guardian needs to confirm before continuing.');
  }
  if (step === 1 && (p.goals.length < 1 || p.goals.length > 3)) e.push('Choose one to three goals.');
  if (step === 3) {
    if (!Number.isInteger(p.daysPerWeek) || p.daysPerWeek < 1 || p.daysPerWeek > 7) e.push('Choose between 1 and 7 days.');
    if (!Number.isInteger(p.minutesPerSession) || p.minutesPerSession < MIN_MINUTES || p.minutesPerSession > MAX_MINUTES)
      e.push(`Choose between ${MIN_MINUTES} and ${MAX_MINUTES} minutes.`);
  }
  return e;
}

export function OnboardingPage() {
  const { data, submitProfile, updateSettings } = useStore();
  const navigate = useNavigate();
  const editing = !!data.profile;
  const [p, setP] = useState<Profile>(() => {
    if (!data.profile) return defaultProfile();
    const prev = structuredClone(data.profile);
    if (prev.healthMinimized) prev.health = emptyHealth();
    prev.consentGiven = false;
    return prev;
  });
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const [result, setResult] = useState<PlanResult | null>(null);
  const [clearing, setClearing] = useState(false);
  const [understand, setUnderstand] = useState(false);
  const [storeOk, setStoreOk] = useState(false);
  const band = ageBandFor(p.ageYears || 30);
  const minor = p.ageYears < 18;
  const emergency = hasEmergencySymptoms(p.health);

  // Any edit clears the step's error list; it is re-validated on Continue.
  const set = (patch: Partial<Profile>) => {
    setErrors([]);
    setP((x) => ({ ...x, ...patch }));
  };
  const setH = (patch: Partial<Profile['health']>) => setP((x) => ({ ...x, health: { ...x.health, ...patch } }));
  const setA = (patch: Partial<Profile['accessibility']>) => setP((x) => ({ ...x, accessibility: { ...x.accessibility, ...patch } }));

  const next = () => {
    const e = validateStep(step, p);
    setErrors(e);
    if (e.length) return;
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  };
  const back = () => {
    setErrors([]);
    setStep((s) => Math.max(0, s - 1));
  };

  const submit = (profile: Profile) => {
    const r = submitProfile({ ...profile, consentGiven: true, createdAt: profile.createdAt === new Date(0).toISOString() ? new Date().toISOString() : profile.createdAt });
    if (r.ok) navigate('/plan?new=1');
    else setResult(r);
  };

  const dislikeOptions = useMemo(() => EXERCISES.filter((e) => e.category !== 'warmup').map((e) => ({ value: e.id, label: e.name })), []);

  // ───── Results that block a plan ─────
  if (result && !result.ok) {
    if (result.reason === 'emergency') {
      return <EmergencyPanel onDismiss={() => { setH({ emergencyNow: { chestPain: false, severeBreathlessness: false, fainting: false, strokeSigns: false } }); setResult(null); setStep(6); }} dismissLabel="Go back to my answers" />;
    }
    if (result.reason === 'invalid_input') {
      return (
        <Callout tone="danger" title="Some answers need fixing">
          <ul className="bullets">{result.errors.map((e) => <li key={e}>{e}</li>)}</ul>
          <button className="btn btn-secondary btn-sm" style={{ marginTop: 8 }} onClick={() => setResult(null)}>Back</button>
        </Callout>
      );
    }
    if (clearing) {
      return (
        <div className="card stack" style={{ maxWidth: 680 }}>
          <h2>Clearance from a professional</h2>
          <p className="muted">Only confirm this if a doctor, physiotherapist or other qualified professional has told you it is OK to start exercising. Enter any limits they gave you — the plan will follow them, and intensity will be capped at moderate.</p>
          <CheckCard checked={p.health.clinicianClearedAfterReferral} onChange={(v) => setH({ clinicianClearedAfterReferral: v })} title="A health professional has cleared me to start exercising" hint="Follow their advice if it differs from this app." />
          <ChipGroup legend="Restrictions they gave you (optional)" options={RESTRICTION_OPTIONS} value={p.health.clinicianRestrictions} onChange={(v) => setH({ clinicianRestrictions: v })} />
          <ChipGroup legend="Body areas they asked you to avoid loading (optional)" options={AREA_OPTIONS} value={p.health.clinicianRestrictedAreas} onChange={(v) => setH({ clinicianRestrictedAreas: v })} />
          <div className="row">
            <button className="btn btn-primary" disabled={!p.health.clinicianClearedAfterReferral} onClick={() => { setClearing(false); submit(p); }}>
              Generate my plan
            </button>
            <button className="btn btn-ghost" onClick={() => setClearing(false)}>Cancel</button>
          </div>
        </div>
      );
    }
    return <ReferralPanel screening={result.screening} onCleared={() => setClearing(true)} onEdit={() => { setResult(null); setStep(result.reason === 'age_restricted' ? 0 : 6); }} />;
  }

  return (
    <div className="stack" style={{ maxWidth: 760 }}>
      <div className="stack-sm">
        <span className="eyebrow">
          {editing ? 'Update your answers' : 'Set up'} · Step {step + 1} of {STEPS.length}
        </span>
        <div className="steps-bar" aria-hidden="true">
          {STEPS.map((s, i) => <span key={s} data-done={i <= step} />)}
        </div>
        <h1>{STEPS[step]}</h1>
      </div>

      <form
        className="card stack"
        onSubmit={(e) => {
          e.preventDefault();
          if (step < STEPS.length - 1) next();
        }}
        noValidate
        aria-label={`${STEPS[step]} step`}
      >
        {step === 0 && (
          <>
            <div className="field">
              <label htmlFor="nick">Nickname (optional)</label>
              <span className="hint">Shown only on this device. Not your real name if you prefer.</span>
              <input id="nick" className="input" maxLength={30} value={p.displayName} onChange={(e) => set({ displayName: e.target.value })} autoComplete="off" />
            </div>
            <Stepper label="Age" value={p.ageYears} min={1} max={120} unit="years" onChange={(v) => set({ ageYears: v })} id="age" />
            <Why>Exercise guidance differs for children, teens, adults and older adults. Your age is only used to pick the right guidance and safeguards.</Why>
            {band === 'under5' && (
              <Callout tone="info" title="Designed for ages 5 and up">
                Young children need lots of active play rather than a structured plan. A pediatrician or health visitor can advise.
              </Callout>
            )}
            {minor && p.ageYears >= 5 && (
              <div className="stack-sm">
                <Callout tone="info" title={band === 'child' ? 'A parent or guardian must set this up' : 'A parent or guardian should be involved'}>
                  {band === 'child'
                    ? 'For ages 5–12, the plan uses play-style and bodyweight movements only, with adult supervision. Competitive features stay off.'
                    : 'For ages 13–17, the plan is technique-first with bodyweight or light resistance. Leaderboards, if used, only include other youth.'}
                </Callout>
                <CheckCard
                  checked={p.guardianConfirmed}
                  onChange={(v) => set({ guardianConfirmed: v })}
                  title={band === 'child' ? 'I am the parent or guardian, and I will supervise exercise' : 'A parent or guardian has reviewed this and agrees'}
                />
              </div>
            )}
          </>
        )}

        {step === 1 && (
          <ChipGroup legend="What would you like to work on?" hint="Choose up to three. You can change these later." options={GOAL_OPTIONS} value={p.goals} onChange={(v) => set({ goals: v })} max={3} />
        )}

        {step === 2 && (
          <>
            <RadioCards
              legend="How active are you at the moment?"
              value={p.activityLevel}
              onChange={(v) => set({ activityLevel: v })}
              options={[
                { value: 'inactive', title: 'Not very active', hint: 'Little planned exercise in recent months' },
                { value: 'some', title: 'Somewhat active', hint: 'Some activity, less than 150 min a week' },
                { value: 'active', title: 'Regularly active', hint: 'About 150+ min of moderate activity a week' },
              ]}
            />
            <Why>Your current activity level is part of standard exercise screening and decides how gently your plan starts.</Why>
            <RadioCards
              legend="Experience with strength exercises"
              value={p.experience}
              onChange={(v) => set({ experience: v })}
              options={[
                { value: 'new', title: 'New to it' },
                { value: 'some', title: 'Some experience' },
                { value: 'experienced', title: 'Experienced', hint: '6+ months consistent' },
              ]}
            />
          </>
        )}

        {step === 3 && (
          <div className="grid-2">
            <Stepper label="Workout days per week" value={p.daysPerWeek} min={1} max={7} onChange={(v) => set({ daysPerWeek: v })} id="days" unit="days" />
            <Stepper label="Minutes per workout" value={p.minutesPerSession} min={MIN_MINUTES} max={MAX_MINUTES} step={5} onChange={(v) => set({ minutesPerSession: v })} id="mins" unit="min" />
            <p className="small muted" style={{ gridColumn: '1 / -1' }}>
              Every workout will fit inside this time, including warm-up and cool-down. Short sessions still count — public-health guidance says some activity is better than none.
            </p>
          </div>
        )}

        {step === 4 && (
          <>
            <RadioCards
              legend="Where will you usually exercise?"
              value={p.location}
              onChange={(v) => set({ location: v })}
              options={[
                { value: 'home', title: 'At home' },
                { value: 'gym', title: 'At a gym' },
                { value: 'outdoors', title: 'Outdoors' },
              ]}
            />
            <ChipGroup legend="What do you have available?" hint="Choose everything that applies. Nothing selected = bodyweight-only plan." options={EQUIPMENT_OPTIONS} value={p.equipment} onChange={(v) => set({ equipment: v })} />
          </>
        )}

        {step === 5 && (
          <>
            <fieldset className="field stack-sm">
              <legend>Accessibility</legend>
              <CheckCard checked={p.accessibility.seatedOnly} onChange={(v) => setA({ seatedOnly: v })} title="I use a wheelchair or prefer seated exercises" hint="Your plan will only include seated exercises." />
              <CheckCard checked={p.accessibility.needsSupport} onChange={(v) => setA({ needsSupport: v })} title="I like to have a chair or wall for support" />
              <CheckCard checked={p.accessibility.limitedGrip} onChange={(v) => setA({ limitedGrip: v })} title="Gripping is difficult for me" hint="Leaves out weights and bands." />
            </fieldset>
            <ChipGroup
              legend="Positions to avoid"
              options={[
                { value: 'floor_supine', label: 'Lying on my back' },
                { value: 'floor_other', label: 'Kneeling / other floor work' },
              ]}
              value={p.avoidPositions.filter((x) => x.startsWith('floor')) as ('floor_supine' | 'floor_other')[]}
              onChange={(v) => set({ avoidPositions: v })}
            />
            <details className="disclosure">
              <summary>Exercises you’d rather not do ({p.dislikedExerciseIds.length})</summary>
              <div>
                <ChipGroup legend="Leave these out" options={dislikeOptions} value={p.dislikedExerciseIds} onChange={(v) => set({ dislikedExerciseIds: v })} />
              </div>
            </details>
            <p className="small muted">Large text, high contrast, reduced motion and spoken cues are in Profile → Settings.</p>
          </>
        )}

        {step === 6 && (
          <>
            {p.healthMinimized ? (
              <Callout tone="warn" title="Please answer these again">
                You chose to keep fewer health details, so your earlier answers were not stored. Your new plan needs them.
              </Callout>
            ) : null}
            <Callout tone="info" title="These questions help keep you safe">
              They are not a diagnosis. Answers stay on this device. You can skip any question — skipped questions are treated as “no”, so please answer if something applies.
            </Callout>
            <fieldset className="field stack-sm">
              <legend>Right now, are you having any of these?</legend>
              <Why>These can be signs of an emergency. If any apply, you need urgent help, not a workout.</Why>
              {(
                [
                  ['chestPain', 'Chest pain, pressure or tightness'],
                  ['severeBreathlessness', 'Severe shortness of breath at rest'],
                  ['fainting', 'Fainting or nearly fainting'],
                  ['strokeSigns', 'Face drooping, arm weakness, or trouble speaking'],
                ] as const
              ).map(([k, label]) => (
                <CheckCard key={k} checked={p.health.emergencyNow[k]} onChange={(v) => setH({ emergencyNow: { ...p.health.emergencyNow, [k]: v } })} title={label} />
              ))}
            </fieldset>
            {emergency ? <EmergencyPanel /> : null}

            <div>
              <YesNo
                label="Do you get chest discomfort, unusual breathlessness, dizziness, fainting or a racing/irregular heartbeat during or after activity?"
                why="Symptoms with exertion should be checked by a doctor before starting a new plan (ACSM screening)."
                value={p.health.exertionalSymptoms}
                onChange={(v) => setH({ exertionalSymptoms: v })}
              />
              <YesNo
                label="Have you been told you have a heart condition, diabetes (or another metabolic condition), or kidney disease?"
                why="Together with your activity level, this decides whether medical clearance is recommended first."
                value={p.health.knownCardioMetabolicRenal}
                onChange={(v) => setH({ knownCardioMetabolicRenal: v })}
              />
              <YesNo label="Have you had surgery or a hospital stay in the last 3 months?" why="Your care team should guide activity during recovery." value={p.health.recentSurgery} onChange={(v) => setH({ recentSurgery: v })} />
              <YesNo
                label="Do you have pain that is severe, new and unexplained, or getting worse?"
                why="That kind of pain should be assessed by a professional — an app cannot tell whether exercise is suitable."
                value={p.health.severeOrWorseningPain}
                onChange={(v) => setH({ severeOrWorseningPain: v })}
              />
              <YesNo label="Are you currently following a rehab program from a physiotherapist or clinician?" why="Your clinician’s program should come first; we won’t override it." value={p.health.inRehabProgram} onChange={(v) => setH({ inRehabProgram: v })} />
              <YesNo label="Have you fallen in the last year, or do you worry about your balance?" why="We’ll use supported balance exercises and include balance practice." value={p.health.balanceConcernOrFall} onChange={(v) => setH({ balanceConcernOrFall: v })} />
            </div>

            <RadioCards
              legend="Pregnancy"
              hint="Optional. Used only to cap intensity and leave out lying-on-back exercises."
              value={p.health.pregnancy}
              onChange={(v) => setH({ pregnancy: v })}
              cols={2}
              options={[
                { value: 'no', title: 'Not pregnant / not applicable' },
                { value: 'pregnant', title: 'Pregnant' },
                { value: 'postpartum', title: 'Had a baby in the last year' },
                { value: 'prefer_not', title: 'Prefer not to say' },
              ]}
            />
            {(p.health.pregnancy === 'pregnant' || p.health.pregnancy === 'postpartum') && (
              <CheckCard checked={p.health.pregnancyComplications} onChange={(v) => setH({ pregnancyComplications: v })} title="I have complications, or was told to limit activity" />
            )}

            <ChipGroup
              legend="Any areas with known, mild or ongoing pain or past injury?"
              hint="Exercises that mainly load these areas are left out. This is cautious and may leave out things that would be fine for you."
              options={AREA_OPTIONS}
              value={p.health.painAreas}
              onChange={(v) => setH({ painAreas: v })}
            />
            <details className="disclosure">
              <summary>Restrictions from a clinician ({p.health.clinicianRestrictions.length + p.health.clinicianRestrictedAreas.length})</summary>
              <div className="stack">
                <ChipGroup legend="Movement restrictions" options={RESTRICTION_OPTIONS} value={p.health.clinicianRestrictions} onChange={(v) => setH({ clinicianRestrictions: v })} />
                <ChipGroup legend="Areas not to load" options={AREA_OPTIONS} value={p.health.clinicianRestrictedAreas} onChange={(v) => setH({ clinicianRestrictedAreas: v })} />
              </div>
            </details>
          </>
        )}

        {step === 7 && (
          <>
            <dl className="stack-sm small" style={{ margin: 0 }}>
              {[
                ['Age', `${p.ageYears}${minor ? ' (guardian confirmed)' : ''}`],
                ['Goals', p.goals.map((g) => g.replace('_', ' ')).join(', ')],
                ['Activity / experience', `${p.activityLevel} / ${p.experience}`],
                ['Schedule', `${p.daysPerWeek} days × ${p.minutesPerSession} min`],
                ['Where / equipment', `${p.location} · ${p.equipment.length ? p.equipment.join(', ').replace(/_/g, ' ') : 'bodyweight only'}`],
                ['Health notes', summarizeHealth(p)],
              ].map(([k, v]) => (
                <div key={k} className="row-between" style={{ borderBottom: '1px solid var(--line)', paddingBottom: 8 }}>
                  <dt className="muted">{k}</dt>
                  <dd style={{ margin: 0, fontWeight: 600, textAlign: 'right' }}>{v}</dd>
                </div>
              ))}
            </dl>
            <div className="card card-soft stack-sm">
              <h3>How your answers are used</h3>
              <ul className="bullets small">
                <li>Transparent safety rules decide whether a plan is appropriate and what to leave out. You can see every rule in “Why this plan?”.</li>
                <li>Your answers are saved only in this browser on this device. Nothing is uploaded. You can export or delete everything at any time.</li>
                <li>No AI model makes safety decisions; nothing is used for advertising or training.</li>
              </ul>
            </div>
            <CheckCard checked={understand} onChange={setUnderstand} title="I understand this is general fitness guidance, not medical advice, diagnosis or treatment" hint="Stop and seek help if you feel unwell while exercising." />
            <CheckCard checked={storeOk} onChange={setStoreOk} title="Save my answers on this device" hint="Required to create and keep your plan." />
            <CheckCard
              checked={data.settings.minimizeHealthData}
              onChange={(v) => updateSettings({ minimizeHealthData: v })}
              title="Keep fewer health details (optional)"
              hint="After your plan is made, only the restrictions it needs are kept; your individual answers are discarded. You will need to answer the health questions again to change your plan."
            />
          </>
        )}

        {errors.length ? (
          <Callout tone="danger" title="Please check this step">
            <ul className="bullets">{errors.map((e) => <li key={e}>{e}</li>)}</ul>
          </Callout>
        ) : null}

        <div className="row-between" style={{ marginTop: 8 }}>
          <button type="button" className="btn btn-ghost" onClick={step === 0 ? () => navigate(editing ? '/profile' : '/welcome') : back}>
            <Icon name="arrowLeft" size={18} /> {step === 0 ? 'Cancel' : 'Back'}
          </button>
          <div className="row">
            {step === 6 && !emergency && (
              <button type="button" className="btn btn-secondary" onClick={() => { setH({ ...emptyHealth(), emergencyNow: p.health.emergencyNow }); next(); }}>
                Skip — none apply
              </button>
            )}
            {step < STEPS.length - 1 ? (
              <button type="submit" className="btn btn-primary" disabled={(step === 6 && emergency) || (step === 0 && band === 'under5')}>
                Continue <Icon name="arrowRight" size={18} />
              </button>
            ) : (
              <button type="button" className="btn btn-primary" disabled={!understand || !storeOk} onClick={() => submit(p)}>
                {editing ? 'Update my plan' : 'Create my plan'}
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}

function summarizeHealth(p: Profile): string {
  const h = p.health;
  const items: string[] = [];
  if (h.exertionalSymptoms) items.push('symptoms with activity');
  if (h.knownCardioMetabolicRenal) items.push('known condition');
  if (h.recentSurgery) items.push('recent surgery');
  if (h.severeOrWorseningPain) items.push('severe/worsening pain');
  if (h.inRehabProgram) items.push('in rehab');
  if (h.balanceConcernOrFall) items.push('balance concern');
  if (h.pregnancy === 'pregnant' || h.pregnancy === 'postpartum') items.push(h.pregnancy);
  if (h.painAreas.length) items.push(`avoid: ${h.painAreas.join(', ').replace(/_/g, ' ')}`);
  if (h.clinicianRestrictions.length) items.push(`${h.clinicianRestrictions.length} clinician restriction(s)`);
  if (p.accessibility.seatedOnly) items.push('seated only');
  return items.length ? items.join('; ') : 'None reported';
}
