import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { useStore } from '../../state/store';
import { defaultProfile, emptyHealth } from '../../domain/profile';
import { EXERCISES } from '../../domain/exercises/library';
import { ageBandFor, hasEmergencySymptoms } from '../../domain/safety/screening';
import { applyFinding, redactIdentifiers, resolveProfile, type Finding } from '../../domain/safety/analyze';
import { analyzeAnswers, QUESTION_KEYS } from '../../domain/safety/summary';
import { MAX_MINUTES, MIN_MINUTES } from '../../domain/plan/engine';
import type { BodyArea, ClinicianRestriction, Equipment, Goal, PainSeverity, PlanResult, Profile, QuestionKey } from '../../domain/types';
import { Callout, CheckCard, ChipGroup, RadioCards, Segmented, Stepper, TextAreaField } from '../../components/ui';
import { Icon, type IconName } from '../../components/Icon';
import { EmergencyPanel, ReferralPanel } from '../safety/SafetyPanels';
import { AnswerAnalysis } from './AnswerAnalysis';
import { FindingList } from './FindingList';

const STEPS: { title: string; short: string; icon: IconName; blurb: string }[] = [
  { title: 'About you', short: 'You', icon: 'user', blurb: 'Just the basics. Your age picks the right guidance and safeguards.' },
  { title: 'Goals', short: 'Goals', icon: 'flag', blurb: 'What would make this worth your time? Choose chips, or type it your way.' },
  { title: 'Activity', short: 'Activity', icon: 'flame', blurb: 'Where you are today decides how gently we start.' },
  { title: 'Schedule', short: 'Time', icon: 'timer', blurb: 'We fit every workout inside the time you give us.' },
  { title: 'Equipment', short: 'Kit', icon: 'plan', blurb: 'Nothing fancy needed. No equipment is a perfectly good answer.' },
  { title: 'Preferences', short: 'Likes', icon: 'heart', blurb: 'Tell us what you’d rather skip, and any access needs.' },
  { title: 'Health', short: 'Health', icon: 'shield', blurb: 'A few quick questions that keep you safe. They aren’t a diagnosis.' },
  { title: 'In your words', short: 'Words', icon: 'book', blurb: 'Anything else we should know? Type it normally and we’ll show you what we understood.' },
  { title: 'Review', short: 'Review', icon: 'check', blurb: 'Here’s how we read your answers, and what it means for your plan.' },
];
const LAST = STEPS.length - 1;
const STEP_HEALTH = 6;
const STEP_WORDS = 7;

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
const QUESTION_WHY: Record<QuestionKey, { q: string; why: string }> = {
  exertionalSymptoms: {
    q: 'Do you get chest discomfort, unusual breathlessness, dizziness, fainting or a racing/irregular heartbeat during or after activity?',
    why: 'Symptoms with exertion should be checked by a doctor before starting a new plan (ACSM screening).',
  },
  knownCardioMetabolicRenal: {
    q: 'Have you been told you have a heart condition, diabetes (or another metabolic condition), or kidney disease?',
    why: 'Together with your activity level, this decides whether medical clearance is recommended first.',
  },
  recentSurgery: { q: 'Have you had surgery or a hospital stay in the last 3 months?', why: 'Your care team should guide activity during recovery.' },
  severeOrWorseningPain: {
    q: 'Do you have pain that is severe, new and unexplained, or getting worse?',
    why: 'That kind of pain should be assessed by a professional. An app cannot tell whether exercise is suitable.',
  },
  inRehabProgram: { q: 'Are you currently following a rehab program from a physiotherapist or clinician?', why: 'Your clinician’s program should come first; we won’t override it.' },
  balanceConcernOrFall: { q: 'Have you fallen in the last year, or do you worry about your balance?', why: 'We’ll use supported balance exercises and include balance practice.' },
};
const SEVERITY_OPTIONS: { value: PainSeverity; label: string }[] = [
  { value: 'mild', label: 'Mild' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'severe', label: 'Severe' },
];
const HEALTH_FIELDS = ['injuries', 'conditions', 'clinician', 'other'] as const;

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

/** Remove emails, phone numbers and ID-like numbers before anything is stored. */
function scrub(p: Profile): Profile {
  const ft = p.health.freeText;
  return {
    ...p,
    goalText: redactIdentifiers(p.goalText),
    avoidText: redactIdentifiers(p.avoidText),
    health: { ...p.health, freeText: { injuries: redactIdentifiers(ft.injuries), conditions: redactIdentifiers(ft.conditions), clinician: redactIdentifiers(ft.clinician), other: redactIdentifiers(ft.other) } },
  };
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
  // Emergencies count whether they were ticked or typed in the user's own words.
  const emergency = hasEmergencySymptoms(resolveProfile(p).profile.health);
  const analysis = useMemo(() => analyzeAnswers(p), [p]);
  const allViews = useMemo(() => [...analysis.included, ...analysis.suggested, ...analysis.dismissed, ...analysis.info], [analysis]);
  const healthViews = allViews.filter((f) => f.field !== 'goal' && f.field !== 'avoid');
  const goalViews = allViews.filter((f) => f.field === 'goal');
  const avoidViews = allViews.filter((f) => f.field === 'avoid');

  // Any edit clears the step's error list; it is re-validated on Continue.
  const set = (patch: Partial<Profile>) => {
    setErrors([]);
    setP((x) => ({ ...x, ...patch }));
  };
  const setH = (patch: Partial<Profile['health']>) => setP((x) => ({ ...x, health: { ...x.health, ...patch } }));
  const setA = (patch: Partial<Profile['accessibility']>) => setP((x) => ({ ...x, accessibility: { ...x.accessibility, ...patch } }));
  const setText = (field: (typeof HEALTH_FIELDS)[number], v: string) => setP((x) => ({ ...x, health: { ...x.health, freeText: { ...x.health.freeText, [field]: v } } }));
  const dismiss = (id: string) => setH({ dismissedFindings: [...new Set([...p.health.dismissedFindings, id])] });
  const restore = (id: string) => setH({ dismissedFindings: p.health.dismissedFindings.filter((x) => x !== id) });
  const apply = (f: Finding) => setP((x) => applyFinding(x, f));

  const answer = (key: QuestionKey, v: 'yes' | 'no' | 'unsure') =>
    setH({
      [key]: v === 'yes',
      unsure: v === 'unsure' ? [...new Set([...p.health.unsure, key])] : p.health.unsure.filter((k) => k !== key),
      answered: [...new Set([...p.health.answered, key])],
    });
  const answerOf = (key: QuestionKey): 'yes' | 'no' | 'unsure' | null =>
    p.health.unsure.includes(key) ? 'unsure' : p.health[key] ? 'yes' : p.health.answered.includes(key) ? 'no' : null;

  const next = () => {
    const e = validateStep(step, p);
    setErrors(e);
    if (e.length) return;
    setStep((s) => Math.min(LAST, s + 1));
  };
  const back = () => {
    setErrors([]);
    setStep((s) => Math.max(0, s - 1));
  };

  const submit = (profile: Profile) => {
    const clean = scrub(profile);
    const r = submitProfile({ ...clean, consentGiven: true, createdAt: clean.createdAt === new Date(0).toISOString() ? new Date().toISOString() : clean.createdAt });
    if (r.ok) navigate('/plan?new=1');
    else setResult(r);
  };

  const dislikeOptions = useMemo(() => EXERCISES.filter((e) => e.category !== 'warmup').map((e) => ({ value: e.id, label: e.name })), []);

  // ───── Results that block a plan ─────
  if (result && !result.ok) {
    if (result.reason === 'emergency') {
      return (
        <div className="ob-single">
          <EmergencyPanel
            onDismiss={() => {
              setH({ emergencyNow: { chestPain: false, severeBreathlessness: false, fainting: false, strokeSigns: false } });
              setResult(null);
              setStep(STEP_HEALTH);
            }}
            dismissLabel="Go back to my answers"
          />
        </div>
      );
    }
    if (result.reason === 'invalid_input') {
      return (
        <div className="ob-single">
          <Callout tone="danger" title="Some answers need fixing">
            <ul className="bullets">
              {result.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
            <button className="btn btn-secondary btn-sm" style={{ marginTop: 8 }} onClick={() => setResult(null)}>
              Back
            </button>
          </Callout>
        </div>
      );
    }
    if (clearing) {
      return (
        <div className="ob-single">
          <div className="card stack">
            <h2>Clearance from a professional</h2>
            <p className="muted">
              Only confirm this if a doctor, physiotherapist or other qualified professional has told you it is OK to start exercising. Enter any limits they gave you. The plan will follow them,
              and intensity will be capped at moderate.
            </p>
            <CheckCard
              checked={p.health.clinicianClearedAfterReferral}
              onChange={(v) => setH({ clinicianClearedAfterReferral: v })}
              title="A health professional has cleared me to start exercising"
              hint="Follow their advice if it differs from this app."
            />
            <ChipGroup legend="Restrictions they gave you (optional)" options={RESTRICTION_OPTIONS} value={p.health.clinicianRestrictions} onChange={(v) => setH({ clinicianRestrictions: v })} />
            <ChipGroup legend="Body areas they asked you to avoid loading (optional)" options={AREA_OPTIONS} value={p.health.clinicianRestrictedAreas} onChange={(v) => setH({ clinicianRestrictedAreas: v })} />
            <div className="row">
              <button
                className="btn btn-primary"
                disabled={!p.health.clinicianClearedAfterReferral}
                onClick={() => {
                  setClearing(false);
                  submit(p);
                }}
              >
                Generate my plan
              </button>
              <button className="btn btn-ghost" onClick={() => setClearing(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="ob-single">
        <ReferralPanel
          screening={result.screening}
          onCleared={() => setClearing(true)}
          onEdit={() => {
            setResult(null);
            setStep(result.reason === 'age_restricted' ? 0 : STEP_HEALTH);
          }}
        />
      </div>
    );
  }

  const cur = STEPS[step]!;
  return (
    <div className="ob">
      <aside className="ob-rail" aria-label="Setup progress">
        <ol className="ob-steps">
          {STEPS.map((s, i) => (
            <li key={s.title} className="ob-step" data-state={i < step ? 'done' : i === step ? 'current' : 'todo'} aria-current={i === step ? 'step' : undefined}>
              <span className="ob-dot" aria-hidden="true">
                {i < step ? <Icon name="check" size={14} /> : i + 1}
              </span>
              <span className="ob-step-label">{s.title}</span>
            </li>
          ))}
        </ol>
        <div className="ob-rail-note">
          <Icon name="lock" size={16} />
          <span>Answers stay on this device. Nothing is uploaded.</span>
        </div>
      </aside>

      <div className="ob-main stack">
        <div className="stack-sm">
          <div className="ob-mobile-progress" aria-hidden="true">
            <div className="steps-bar">
              {STEPS.map((s, i) => (
                <span key={s.title} data-done={i <= step} />
              ))}
            </div>
          </div>
          <span className="eyebrow">
            {editing ? 'Update your answers' : 'Set up'} · Step {step + 1} of {STEPS.length}
          </span>
          <h1 className="ob-title">
            <span className="ob-title-icon" aria-hidden="true">
              <Icon name={cur.icon} size={22} />
            </span>
            {cur.title}
          </h1>
          <p className="muted" style={{ maxWidth: '62ch' }}>
            {cur.blurb}
          </p>
        </div>

        <form
          className="card stack ob-card"
          onSubmit={(e) => {
            e.preventDefault();
            if (step < LAST) next();
          }}
          noValidate
          aria-label={`${cur.title} step`}
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
            <>
              <ChipGroup legend="What would you like to work on?" hint="Choose up to three. You can change these later." options={GOAL_OPTIONS} value={p.goals} onChange={(v) => set({ goals: v })} max={3} />
              <TextAreaField
                label="Or describe it in your own words (optional)"
                hint="For example, what you’d like to be able to do. We’ll suggest matching goals; you decide what to add."
                value={p.goalText}
                onChange={(v) => set({ goalText: v })}
                max={300}
                rows={2}
                placeholder="e.g. I want to climb stairs without getting out of breath and feel steadier on my feet"
                examples={['I want to get stronger', 'feel steadier on my feet', 'be less stiff in the mornings']}
              />
              <FindingList findings={goalViews} onApply={apply} onDismiss={dismiss} onRestore={restore} />
            </>
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
                Every workout will fit inside this time, including warm-up and cool-down. Short sessions still count. Public-health guidance says some activity is better than none.
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
              <TextAreaField
                label="Exercises you’d rather not do (type them)"
                hint="Name anything you dislike. We’ll match it to our exercise library and leave it out."
                value={p.avoidText}
                onChange={(v) => set({ avoidText: v })}
                max={300}
                rows={2}
                placeholder="e.g. squats, push-ups, anything with jumping"
                examples={['squats', 'push-ups', 'jumping', 'balancing on one leg']}
              />
              <FindingList findings={avoidViews} onDismiss={dismiss} onRestore={restore} />
              {analysis.notUnderstood.filter((n) => n.field === 'avoid').map((n) => (
                <p key={n.text} className="small muted">
                  We couldn’t match “{n.text}” to an exercise in our library, so nothing changed. It likely isn’t in your plan anyway.
                </p>
              ))}
              <details className="disclosure">
                <summary>Or pick from the list ({p.dislikedExerciseIds.length})</summary>
                <div>
                  <ChipGroup legend="Leave these out" options={dislikeOptions} value={p.dislikedExerciseIds} onChange={(v) => set({ dislikedExerciseIds: v })} />
                </div>
              </details>
              <p className="small muted">Large text, high contrast, reduced motion and spoken cues are in Profile → Settings.</p>
            </>
          )}

          {step === STEP_HEALTH && (
            <>
              <Callout tone="info" title="These questions help keep you safe">
                They are not a diagnosis. Answers stay on this device. “Not sure” is a fine answer: we’ll treat it cautiously. You can add detail in your own words on the next step.
              </Callout>
              {p.healthMinimized ? (
                <Callout tone="warn" title="Please answer these again">
                  You chose to keep fewer health details, so your earlier answers were not stored. Your new plan needs them.
                </Callout>
              ) : null}
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

              <div className="qlist">
                {QUESTION_KEYS.map((k) => (
                  <div key={k} className="qrow">
                    <Segmented
                      legend={QUESTION_WHY[k].q}
                      hint={<Why>{QUESTION_WHY[k].why}</Why>}
                      value={answerOf(k)}
                      onChange={(v) => answer(k, v)}
                      name={`q-${k}`}
                      options={[
                        { value: 'no', label: 'No' },
                        { value: 'yes', label: 'Yes' },
                        { value: 'unsure', label: 'Not sure' },
                      ]}
                    />
                  </div>
                ))}
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
                onChange={(v) => {
                  const sev = { ...p.health.painSeverity };
                  for (const a of Object.keys(sev) as BodyArea[]) if (!v.includes(a)) delete sev[a];
                  setH({ painAreas: v, painSeverity: sev });
                }}
              />
              {p.health.painAreas.length > 0 ? (
                <div className="stack-sm severity-list">
                  <span className="label">How bad is it? (optional)</span>
                  {p.health.painAreas.map((a) => (
                    <div key={a} className="row-between severity-row">
                      <span className="small" style={{ fontWeight: 600 }}>
                        {AREA_OPTIONS.find((o) => o.value === a)?.label}
                      </span>
                      <Segmented
                        legend={`Pain level: ${a.replace('_', ' ')}`}
                        hideLegend
                        size="sm"
                        name={`sev-${a}`}
                        value={p.health.painSeverity[a] ?? null}
                        onChange={(v) => setH({ painSeverity: { ...p.health.painSeverity, [a]: v } })}
                        options={SEVERITY_OPTIONS}
                      />
                    </div>
                  ))}
                  {Object.values(p.health.painSeverity).includes('severe') ? (
                    <Callout tone="warn">Severe pain should be assessed by a doctor or physiotherapist first, so we’ll suggest that instead of a plan.</Callout>
                  ) : null}
                </div>
              ) : null}
              <details className="disclosure">
                <summary>Restrictions from a clinician ({p.health.clinicianRestrictions.length + p.health.clinicianRestrictedAreas.length})</summary>
                <div className="stack">
                  <ChipGroup legend="Movement restrictions" options={RESTRICTION_OPTIONS} value={p.health.clinicianRestrictions} onChange={(v) => setH({ clinicianRestrictions: v })} />
                  <ChipGroup legend="Areas not to load" options={AREA_OPTIONS} value={p.health.clinicianRestrictedAreas} onChange={(v) => setH({ clinicianRestrictedAreas: v })} />
                </div>
              </details>
            </>
          )}

          {step === STEP_WORDS && (
            <>
              <Callout tone="info" title="Type it however you like" icon="book">
                We read what you write with fixed rules (no AI, nothing leaves your device) and show you exactly what we understood. Anything that would make your plan less safe is ignored, and
                anything that restricts it is included. Please don’t include names, phone numbers or ID numbers.
              </Callout>
              {emergency ? <EmergencyPanel /> : null}
              <TextAreaField
                label="Injuries, pain or anything that hurts"
                hint="Where, what it feels like, how long, what makes it worse."
                value={p.health.freeText.injuries}
                onChange={(v) => setText('injuries', v)}
                placeholder="e.g. my left knee aches when I go down stairs, and my lower back gets stiff after sitting"
                examples={['my knee hurts on stairs', 'sore lower back', 'shoulder pain when I reach up']}
              />
              <TextAreaField
                label="Health conditions you manage"
                hint="Anything a professional has diagnosed that could affect exercise."
                value={p.health.freeText.conditions}
                onChange={(v) => setText('conditions', v)}
                placeholder="e.g. type 2 diabetes, asthma, high blood pressure"
                examples={['type 2 diabetes', 'asthma', 'high blood pressure', 'arthritis in my knees']}
              />
              <TextAreaField
                label="Advice from a doctor or physio"
                hint="Any limits or instructions you’ve been given."
                value={p.health.freeText.clinician}
                onChange={(v) => setText('clinician', v)}
                placeholder="e.g. my physio said to avoid heavy lifting and deep squats"
                examples={['avoid heavy lifting', 'no running or jumping', 'avoid bending forward']}
              />
              <TextAreaField
                label="Anything else we should know?"
                hint="Medicines, recent surgery, pregnancy, falls, how you’ve been feeling lately."
                value={p.health.freeText.other}
                onChange={(v) => setText('other', v)}
                placeholder="e.g. I had hip surgery two months ago and I sometimes feel dizzy when I stand up quickly"
              />
              <div className="stack-sm" aria-live="polite">
                <h3>What we understood</h3>
                {healthViews.length === 0 ? (
                  <p className="small muted">Nothing yet. If you type something above, you’ll see how we read it right here.</p>
                ) : (
                  <FindingList findings={healthViews} onDismiss={dismiss} onRestore={restore} onApply={apply} />
                )}
                {analysis.notUnderstood.filter((n) => n.field !== 'avoid').map((n) => (
                  <p key={n.field + n.text} className="small muted">
                    We couldn’t interpret “{n.text}”. It won’t change your plan. If it matters for exercise, mention it to a professional.
                  </p>
                ))}
              </div>
            </>
          )}

          {step === LAST && (
            <>
              <AnswerAnalysis profile={p} onChange={setP} />
              <details className="disclosure">
                <summary>Your answers at a glance</summary>
                <dl className="stack-sm small" style={{ margin: 0 }}>
                  {[
                    ['Age', `${p.ageYears}${minor ? ' (guardian confirmed)' : ''}`],
                    ['Goals', p.goals.map((g) => g.replace('_', ' ')).join(', ') + (p.goalText ? ` · “${p.goalText}”` : '')],
                    ['Activity / experience', `${p.activityLevel} / ${p.experience}`],
                    ['Schedule', `${p.daysPerWeek} days × ${p.minutesPerSession} min`],
                    ['Where / equipment', `${p.location} · ${p.equipment.length ? p.equipment.join(', ').replace(/_/g, ' ') : 'bodyweight only'}`],
                    ['Typed notes', HEALTH_FIELDS.some((f) => p.health.freeText[f]) ? 'Yes (shown above)' : 'None'],
                  ].map(([k, v]) => (
                    <div key={k} className="row-between" style={{ borderBottom: '1px solid var(--line)', paddingBottom: 8 }}>
                      <dt className="muted">{k}</dt>
                      <dd style={{ margin: 0, fontWeight: 600, textAlign: 'right' }}>{v}</dd>
                    </div>
                  ))}
                </dl>
              </details>
              <div className="card card-soft stack-sm">
                <h3>How your answers are used</h3>
                <ul className="bullets small">
                  <li>Transparent safety rules decide whether a plan is appropriate and what to leave out. You can see every rule in “Why this plan?”.</li>
                  <li>Your answers are saved only in this browser on this device. Nothing is uploaded. You can export or delete everything at any time.</li>
                  <li>No AI model makes safety decisions; nothing is used for advertising or training.</li>
                </ul>
              </div>
              <CheckCard
                checked={understand}
                onChange={setUnderstand}
                title="I understand this is general fitness guidance, not medical advice, diagnosis or treatment"
                hint="Stop and seek help if you feel unwell while exercising."
              />
              <CheckCard checked={storeOk} onChange={setStoreOk} title="Save my answers on this device" hint="Required to create and keep your plan." />
              <CheckCard
                checked={data.settings.minimizeHealthData}
                onChange={(v) => updateSettings({ minimizeHealthData: v })}
                title="Keep fewer health details (optional)"
                hint="After your plan is made, only the restrictions it needs are kept; your individual answers and typed notes are discarded. You will need to answer the health questions again to change your plan."
              />
            </>
          )}

          {errors.length ? (
            <Callout tone="danger" title="Please check this step">
              <ul className="bullets">
                {errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </Callout>
          ) : null}

          <div className="row-between ob-nav">
            <button type="button" className="btn btn-ghost" onClick={step === 0 ? () => navigate(editing ? '/profile' : '/welcome') : back}>
              <Icon name="arrowLeft" size={18} /> {step === 0 ? 'Cancel' : 'Back'}
            </button>
            <div className="row">
              {step === STEP_HEALTH && !emergency && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setH({
                      exertionalSymptoms: false,
                      knownCardioMetabolicRenal: false,
                      recentSurgery: false,
                      severeOrWorseningPain: false,
                      inRehabProgram: false,
                      balanceConcernOrFall: false,
                      unsure: [],
                      answered: [...QUESTION_KEYS],
                    });
                    next();
                  }}
                >
                  No to all
                </button>
              )}
              {step < LAST ? (
                <button type="submit" className="btn btn-primary" disabled={((step === STEP_HEALTH || step === STEP_WORDS) && emergency) || (step === 0 && band === 'under5')}>
                  Continue <Icon name="arrowRight" size={18} />
                </button>
              ) : (
                <button type="button" className="btn btn-primary btn-lg" disabled={!understand || !storeOk} onClick={() => submit(p)}>
                  {editing ? 'Update my plan' : 'Create my plan'}
                </button>
              )}
            </div>
          </div>
        </form>

        {step === 0 && !editing ? (
          <p className="small muted">
            Already have a backup? <Link to="/welcome#restore">Restore it instead</Link>.
          </p>
        ) : null}
      </div>
    </div>
  );
}

