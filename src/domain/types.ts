/** Core domain types shared by the plan engine, safety rules, and UI. */

export type Goal = 'general_fitness' | 'strength' | 'mobility' | 'endurance' | 'balance' | 'flexibility';
export type ActivityLevel = 'inactive' | 'some' | 'active';
export type Experience = 'new' | 'some' | 'experienced';
export type Equipment = 'none' | 'chair' | 'wall' | 'step' | 'light_weights' | 'resistance_band' | 'mat';
export type Location = 'home' | 'gym' | 'outdoors';
export type BodyArea = 'neck' | 'shoulders' | 'wrists' | 'lower_back' | 'hips' | 'knees' | 'ankles';
export type Position = 'standing' | 'seated' | 'floor_supine' | 'floor_other';
export type MovementPattern =
  | 'squat'
  | 'hinge'
  | 'push'
  | 'pull'
  | 'carry_hold'
  | 'balance'
  | 'locomotion'
  | 'mobility'
  | 'stretch'
  | 'calf';
export type ExerciseCategory = 'warmup' | 'strength' | 'balance' | 'aerobic' | 'flexibility';

export type ClinicianRestriction =
  | 'avoid_overhead'
  | 'avoid_floor'
  | 'avoid_impact'
  | 'avoid_forward_bending'
  | 'seated_only'
  | 'avoid_weights';

export type AgeBand = 'under5' | 'child' | 'teen' | 'adult' | 'older';

export interface AccessibilityNeeds {
  seatedOnly: boolean; // wheelchair user or prefers seated
  needsSupport: boolean; // wants a chair/wall available for balance
  limitedGrip: boolean;
  lowVision: boolean;
  hearingImpaired: boolean;
}

export type PainSeverity = 'mild' | 'moderate' | 'severe';

/** Yes/No screening questions that also accept "Not sure" (treated cautiously, like "Yes"). */
export type QuestionKey =
  | 'exertionalSymptoms'
  | 'knownCardioMetabolicRenal'
  | 'recentSurgery'
  | 'severeOrWorseningPain'
  | 'inRehabProgram'
  | 'balanceConcernOrFall';

export type TextField = 'injuries' | 'conditions' | 'clinician' | 'other' | 'goal' | 'avoid';

/** Things the user typed in their own words. Analysed deterministically; never sent anywhere. */
export interface HealthFreeText {
  injuries: string;
  conditions: string;
  clinician: string;
  other: string;
}

export interface HealthAnswers {
  /** Symptoms happening right now that may indicate an emergency. */
  emergencyNow: {
    chestPain: boolean;
    severeBreathlessness: boolean;
    fainting: boolean;
    strokeSigns: boolean;
  };
  /** Symptoms during or after physical activity. */
  exertionalSymptoms: boolean;
  knownCardioMetabolicRenal: boolean;
  recentSurgery: boolean;
  /** Body areas with known, stable, mild pain or a past injury. */
  painAreas: BodyArea[];
  /** Severe, new and unexplained, or worsening pain anywhere. */
  severeOrWorseningPain: boolean;
  inRehabProgram: boolean;
  pregnancy: 'no' | 'pregnant' | 'postpartum' | 'prefer_not';
  pregnancyComplications: boolean;
  balanceConcernOrFall: boolean;
  clinicianRestrictions: ClinicianRestriction[];
  clinicianRestrictedAreas: BodyArea[];
  /** User confirms a clinician has cleared them after a previous needs_assessment outcome. */
  clinicianClearedAfterReferral: boolean;
  /** Per-area pain level for the areas in `painAreas`. */
  painSeverity: Partial<Record<BodyArea, PainSeverity>>;
  /** Questions answered "Not sure". Treated like "Yes" so the app errs toward caution. */
  unsure: QuestionKey[];
  /** Questions the user has explicitly answered (so skipped ones can be reported). */
  answered: QuestionKey[];
  freeText: HealthFreeText;
  /** Ids of text findings the user marked "not accurate". */
  dismissedFindings: string[];
  /** Reasons (from the user's own words) that a professional should guide exercise first. */
  needsClinician: string[];
}

export interface Profile {
  displayName: string;
  ageYears: number;
  guardianConfirmed: boolean;
  goals: Goal[];
  activityLevel: ActivityLevel;
  experience: Experience;
  daysPerWeek: number;
  minutesPerSession: number;
  equipment: Equipment[];
  location: Location;
  dislikedExerciseIds: string[];
  /** Goal described in the user's own words. */
  goalText: string;
  /** Exercises the user typed that they'd rather avoid. */
  avoidText: string;
  avoidPositions: Position[];
  accessibility: AccessibilityNeeds;
  health: HealthAnswers;
  consentGiven: boolean;
  createdAt: string;
  /** True when the user chose not to keep detailed health answers after plan generation. */
  healthMinimized?: boolean;
}

export type EvidenceKind = 'guideline' | 'position_stand' | 'systematic_review' | 'model_card' | 'product_heuristic';

export interface EvidenceSource {
  id: string;
  title: string;
  organization: string;
  authors?: string;
  published: string; // publication or revision date as stated by the source
  url: string;
  doi?: string;
  kind: EvidenceKind;
  supports: string; // the specific claim this source is cited for
  population: string;
  limitations: string;
  lastChecked: string; // ISO date we verified the source
}

export interface Prescription {
  kind: 'reps' | 'time' | 'hold';
  sets: number;
  /** reps per set (kind=reps), seconds per set (time), seconds per hold (hold) */
  amount: number;
  perSide: boolean;
  restSeconds: number;
  /** seconds per rep used for time estimation (kind=reps) */
  secondsPerRep: number;
  intensity: string; // plain-language target, e.g. "RPE 3–5 / 10"
  rationale: string;
  evidenceIds: string[];
  evidenceKind: EvidenceKind;
}

export interface Exercise {
  id: string;
  name: string;
  category: ExerciseCategory;
  pattern: MovementPattern;
  goals: Goal[];
  equipment: Equipment[]; // all required
  position: Position;
  difficulty: 1 | 2 | 3;
  loadsAreas: BodyArea[];
  overhead: boolean;
  impact: boolean;
  forwardBending: boolean;
  usesWeights: boolean;
  supported: boolean; // performed holding a chair/wall
  unsupportedBalance: boolean;
  minAge: number;
  purpose: string;
  startPosition: string;
  steps: string[];
  commonErrors: string[];
  cautions: string[];
  alternatives: string[]; // exercise ids
  easier?: string;
  harder?: string;
  sourceIds: string[];
  evidenceReviewed: string;
  reviewStatus: 'reviewed_against_public_guidance' | 'unverified_placeholder';
  camera: { supported: false } | { supported: true; counterId: DetectorId; view: 'front' | 'side' | 'front_or_side'; notes: string };
  demo: DemoId;
}

/** Rep counters: a full movement cycle counts one rep. */
export type RepCounterId =
  | 'squat'
  | 'sit_to_stand'
  | 'wall_pushup'
  | 'arm_raise'
  | 'march'
  | 'seated_march'
  | 'shoulder_roll'
  | 'calf_raise'
  | 'side_leg_lift'
  | 'step_up'
  | 'glute_bridge'
  | 'knee_extension'
  | 'biceps_curl'
  | 'band_row'
  | 'side_step'
  | 'heel_toe'
  | 'hip_hinge'
  | 'shoulder_press'
  | 'lateral_raise';
/** Kept for the validation recorder, which only deals with rep counters. */
export type CounterId = RepCounterId;
/** Hold detectors: the timer only runs while the position is held. */
export type HoldDetectorId =
  | 'hold_one_leg'
  | 'hold_chest_open'
  | 'hold_twist'
  | 'hold_calf_stretch'
  | 'hold_ankle_stretch'
  | 'hold_side_bend'
  | 'hold_neck_turn'
  | 'hold_hamstring'
  | 'hold_wall_sit'
  | 'hold_tandem';
/** Activity detectors: the timer only runs while you are moving. */
export type ActivityDetectorId = 'activity_legs' | 'activity_arms' | 'activity_body';
export type DetectorId = RepCounterId | HoldDetectorId | ActivityDetectorId;
export type DemoId = string;

export type ScreeningOutcome = 'emergency' | 'needs_assessment' | 'proceed_with_modifications' | 'proceed';

export interface RuleHit {
  ruleId: string;
  outcome: ScreeningOutcome;
  title: string;
  message: string;
  evidenceIds: string[];
  evidenceKind: EvidenceKind;
}

export interface Constraints {
  excludedAreas: BodyArea[];
  excludePositions: Position[];
  excludeOverhead: boolean;
  excludeImpact: boolean;
  excludeForwardBending: boolean;
  excludeWeights: boolean;
  excludeUnsupportedBalance: boolean;
  seatedOnly: boolean;
  maxIntensity: 'light' | 'moderate';
  ageBand: AgeBand;
}

export interface ScreeningResult {
  outcome: ScreeningOutcome;
  hits: RuleHit[];
  constraints: Constraints;
}

export interface PlannedItem {
  exerciseId: string;
  block: 'warmup' | 'main' | 'cooldown';
  prescription: Prescription;
  estSeconds: number;
  reasons: string[];
}

export interface PlannedSession {
  id: string;
  dayIndex: number; // 0 = Monday
  title: string;
  focus: string;
  items: PlannedItem[];
  estSeconds: number;
  limitSeconds: number;
  notes: string[];
}

export interface DecisionTraceEntry {
  step: string;
  detail: string;
  evidenceIds: string[];
}

export interface Plan {
  id: string;
  createdAt: string;
  profileSnapshot: { ageBand: AgeBand; goals: Goal[]; minutesPerSession: number; daysPerWeek: number };
  screening: ScreeningResult;
  schedule: (PlannedSession | null)[]; // 7 entries, null = rest day
  assumptions: string[];
  trace: DecisionTraceEntry[];
  excluded: { exerciseId: string; reason: string }[];
}

export type PlanResult =
  | { ok: true; plan: Plan }
  | { ok: false; reason: 'invalid_input'; errors: string[] }
  | { ok: false; reason: 'emergency' | 'needs_assessment' | 'age_restricted'; screening: ScreeningResult };

export interface SetLog {
  exerciseId: string;
  setIndex: number;
  target: number;
  achieved: number;
  kind: Prescription['kind'];
  trackedBy: 'camera' | 'manual';
  manualCorrections: number;
}

export interface SessionLog {
  id: string;
  plannedSessionId: string | null;
  startedAt: string;
  endedAt: string;
  activeSeconds: number;
  sets: SetLog[];
  completedExerciseIds: string[];
  rpe: number | null; // 0–10 relative effort (CDC scale)
  note: string;
  endedReason: 'completed' | 'stopped_symptoms' | 'stopped_user';
}
