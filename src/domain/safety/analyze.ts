import { EXERCISES } from '../exercises/library';
import type {
  AccessibilityNeeds,
  BodyArea,
  ClinicianRestriction,
  Goal,
  HealthAnswers,
  PainSeverity,
  Profile,
  QuestionKey,
  TextField,
} from '../types';

/**
 * Deterministic analysis of the things a user types in their own words.
 *
 * No AI model and no network: ordered regular-expression rules, applied clause by clause, with
 * simple handling of negation ("no chest pain"), timing ("right now" vs "when I climb stairs")
 * and past events ("healed years ago"). Every finding records the phrase it came from so the user
 * can check it, and can mark any finding "not accurate".
 *
 * Safety principle: free text can only ever make a plan MORE cautious. Findings that restrict or
 * refer are applied by default unless the user dismisses them (see `resolveProfile`). Findings
 * that would widen a plan (goals) are only ever suggestions.
 *
 * Limits: this is keyword matching, not understanding. It misses unusual wording, and it can
 * misread (e.g. a relative's condition). It is a safety net and a convenience, not a diagnosis.
 */

export const MAX_TEXT = 600;

export type FindingKind = 'urgent' | 'refer' | 'adjust' | 'info' | 'goal' | 'warning';

export type Effect =
  | { t: 'emergency'; key: keyof HealthAnswers['emergencyNow'] }
  | { t: 'flag'; key: QuestionKey | 'pregnancyComplications' }
  | { t: 'assess'; reason: string }
  | { t: 'pain'; area: BodyArea; severity?: PainSeverity }
  | { t: 'restrictArea'; area: BodyArea }
  | { t: 'restriction'; value: ClinicianRestriction }
  | { t: 'pregnancy'; value: 'pregnant' | 'postpartum' }
  | { t: 'access'; key: keyof AccessibilityNeeds }
  | { t: 'goal'; goal: Goal }
  | { t: 'avoid'; exerciseIds: string[] };

export interface Finding {
  id: string;
  field: TextField;
  kind: FindingKind;
  title: string;
  detail: string;
  quote: string;
  effects: Effect[];
  /** Applied by default unless the user dismisses it. */
  auto: boolean;
  /** Label for the add/confirm button on suggestions. */
  actionLabel?: string;
}

export type FindingStatus = 'included' | 'applied' | 'suggested' | 'dismissed' | 'info';

export interface TextAnalysis {
  findings: Finding[];
  notUnderstood: { field: TextField; text: string }[];
  truncated: TextField[];
}

export const AREA_LABEL: Record<BodyArea, string> = {
  neck: 'neck',
  shoulders: 'shoulders / upper back',
  wrists: 'wrists, hands & elbows',
  lower_back: 'lower back',
  hips: 'hips & hamstrings',
  knees: 'knees',
  ankles: 'ankles, feet & calves',
};

export const RESTRICTION_LABEL: Record<ClinicianRestriction, string> = {
  avoid_overhead: 'No overhead arm movements',
  avoid_floor: 'No floor exercises',
  avoid_impact: 'No impact (running, jumping)',
  avoid_forward_bending: 'No forward bending',
  seated_only: 'Seated exercises only',
  avoid_weights: 'No weights or heavy lifting',
};

// ───────────────────────────── helpers ─────────────────────────────

const NEG = /\b(no|not|never|without|none|denies|deny|neither)\b|n't\b/;
const PAST = /\b(years?|yrs?) ago\b|\bused to\b|\bhealed\b|\bfully recovered\b|\bresolved\b|\bin the past\b|\bas a (?:kid|child|teen\w*)\b|\blong ago\b|\bwhen i was (?:young|a kid|a child|little)\b|\blast year\b|\bdecade\w* ago\b/;
const NOW = /\b(right now|currently|at the moment|just now|today|this (?:morning|afternoon|evening)|at present|ongoing|as i (?:write|type)|happening now)\b/;
const EXERT = /\b(exercis\w*|walk\w*|stairs|climb\w*|run\w*|jog\w*|exert\w*|activity|activities|workout\w*|gym|lifting|effort|hills?|cycl\w*)\b/;

function negated(lc: string, index: number): boolean {
  return NEG.test(lc.slice(Math.max(0, index - 28), index));
}

function snip(s: string): string {
  const t = s.trim().replace(/\s+/g, ' ');
  return t.length > 90 ? `${t.slice(0, 87)}…` : t;
}

const CONNECT = /\s+(?:and|but|while|though|although|however)\s+(?=(?:my|i|i'm|im|the|it|both|sometimes|also)\b)|,\s+(?=(?:my|i|i'm|the|it)\b)/gi;
const CONTRAST = /\b(?:but|however|while|though|although)\b/i;

/**
 * Split text into short clauses: at sentence ends, at "but/however", and before a new subject
 * ("... and my back ...") but only when the left part is already a complete clause (contains a pain
 * word). That keeps one joint's severity from leaking onto another while "knee, hip and my back
 * pain" stays one list.
 */
function clauses(text: string): string[] {
  // Phones type curly apostrophes; normalise so "can’t" matches "can't".
  const norm = text.replace(/[\u2018\u2019\u02bc]/g, "'");
  const out: string[] = [];
  for (const seg of norm.split(/[.;!?\n]+/)) {
    let from = 0;
    for (const m of seg.matchAll(CONNECT)) {
      const left = seg.slice(from, m.index);
      if (CONTRAST.test(m[0]) || PAINWORD.test(left.toLowerCase())) {
        out.push(left);
        from = (m.index ?? 0) + m[0].length;
      }
    }
    out.push(seg.slice(from));
  }
  return out.map((c) => c.trim()).filter((c) => c.length > 1);
}

/** First match of `re` in `lc` that is not negated. */
function hit(lc: string, re: RegExp): RegExpMatchArray | null {
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
  for (const m of lc.matchAll(g)) if (!negated(lc, m.index ?? 0)) return m;
  return null;
}

/** First match of `re` regardless of negation (used where negation words are cues, not negators). */
function any(lc: string, re: RegExp): RegExpMatchArray | null {
  return lc.match(re);
}

// ───────────────────────────── rules ─────────────────────────────

const CHEST = /\b(chest (?:pain|pains|pressure|tightness|discomfort)|tight(?:ness)? (?:in|across) (?:my )?chest|pressure (?:in|on) (?:my )?chest|crushing chest)\b/;
const BREATH_SEVERE = /\b(can(?:'|no)?t breathe|cannot breathe|struggling to breathe|gasping|severe(?:ly)? (?:short of breath|breathless)|short of breath (?:at rest|sitting)|breathless at rest)\b/;
const FAINT = /\b(faint(?:ed|ing)?|pass(?:ed|ing) out|black(?:ed|ing) out|collaps\w+|lost consciousness|unconscious)\b/;
const STROKE = /\b(face (?:is )?droop\w*|droop\w* face|slurred speech|slurring|arm (?:is )?(?:weak|numb)\w*|weakness (?:in|on one side)|one[- ]sided weakness|trouble speaking|can(?:'|no)?t speak|sudden (?:confusion|vision loss|loss of vision))\b/;
const DIZZY = /\b(dizz(?:y|iness)|light-?headed\w*|vertigo)\b/;
const PALP = /\b(palpitations?|heart (?:rac\w+|pound\w+|flutter\w+|skip\w+|beat\w* (?:fast|irregularly))|irregular heart ?beat|racing heart|skipped beats?)\b/;
const BREATHLESS = /\b(short(?:ness)? of breath|breathless\w*|out of breath|wheez\w*|can(?:'|no)?t catch my breath|winded)\b/;

const HEART = /\b(heart (?:disease|condition|failure|attack|problems?|surgery|murmur|defect)|cardiac|cardiovascular disease|angina|arrhythmia|atrial fibrillation|a-?fib|pacemaker|stents?|bypass|coronary|cardiomyopathy|myocardial|tachycardia)\b/;
const DIABETES = /\b(diabet\w*|insulin|hypoglyc\w*)\b/;
const KIDNEY = /\b(kidney (?:disease|failure|problems?|transplant)|renal|dialysis|ckd)\b/;
const PREDIABETES = /\bpre-?diabet\w*\b/;
const HYPERTENSION = /\b(hypertension|high blood pressure|raised blood pressure)\b/;
const RESPIRATORY = /\b(asthma|copd|emphysema|chronic bronchitis|lung disease)\b/;
const EPILEPSY = /\b(epilep\w*|seizures?)\b/;
const OSTEOPOROSIS = /\b(osteoporosis|osteopenia|brittle bones|low bone density)\b/;
const ARTHRITIS = /\b(arthritis|arthritic|osteoarthritis|rheumatoid|fibromyalgia)\b/;
const MEDS = /\b(blood thinners?|anticoagulants?|warfarin|beta[- ]?blockers?|steroids?|medications?|medicines?)\b/;

const ASSESS_RULES: { id: string; re: RegExp; reason: string; title: string; detail: string }[] = [
  {
    id: 'cancer',
    re: /\b(cancer|chemo\w*|radiotherapy|radiation therapy|oncolog\w*|tumou?rs?|leuk(?:a)?emia|lymphoma)\b/,
    reason: 'cancer or cancer treatment',
    title: 'Cancer or cancer treatment',
    detail: 'Exercise during or after cancer treatment should be guided by your care team. This app cannot tailor a plan for it.',
  },
  {
    id: 'clot',
    re: /\b(blood clots?|dvt|deep vein thrombosis|embol\w*|thrombo\w*)\b/,
    reason: 'a blood clot',
    title: 'Blood clot',
    detail: 'A current or recent blood clot needs medical guidance before exercising.',
  },
  {
    id: 'eating',
    re: /\b(eating disorders?|anorexi\w*|bulimi\w*|binge eating|orthorexi\w*|exercise addiction|compulsive exercis\w*)\b/,
    reason: 'an eating disorder',
    title: 'Eating disorder',
    detail: 'Exercise can support recovery or work against it. Your care team should guide whether and how to exercise. Verimove never sets weight or appearance targets.',
  },
  {
    id: 'concussion',
    re: /\b(concussion|head injur\w*|brain injur\w*|head trauma)\b/,
    reason: 'a recent head injury',
    title: 'Head injury',
    detail: 'After a concussion or head injury, a clinician should say when and how to return to exercise.',
  },
  {
    id: 'aneurysm',
    re: /\b(aneurysm|marfan|aortic (?:dissection|stenosis|aneurysm))\b/,
    reason: 'an aortic or aneurysm condition',
    title: 'Aortic or aneurysm condition',
    detail: 'These conditions need specialist guidance on exercise intensity.',
  },
  {
    id: 'fracture',
    re: /\b(fracture\w*|broke(?:n)? (?:my |a )?(?:bone|leg|arm|wrist|ankle|hip|rib|back|collarbone|foot|toe|finger))\b/,
    reason: 'a recent fracture',
    title: 'Broken bone',
    detail: 'A fracture should be cleared by your clinician before exercise that loads it.',
  },
  {
    id: 'hernia',
    re: /\bhernia\b/,
    reason: 'a hernia',
    title: 'Hernia',
    detail: 'A hernia can be aggravated by straining. Ask your clinician what is safe.',
  },
];

const AREA_RULES: { area: BodyArea; re: RegExp }[] = [
  { area: 'knees', re: /\b(knees?|kneecap|patella\w*|acl|mcl|meniscus)\b/ },
  { area: 'lower_back', re: /\b(?:(?:my|lower|low|bad|sore|the)\s+back|back\s+(?:pain|ache|aches|problems?|injur\w+|strain|spasms?|issues?|surgery|brace)|lumbar|sciatic\w*|spine|spinal|slipped disc|herniated disc|disc)\b/ },
  { area: 'shoulders', re: /\b(shoulders?|rotator cuff|collar ?bone|clavicle|ac joint|upper back|mid(?:dle)? back|thoracic)\b/ },
  { area: 'wrists', re: /\b(wrists?|hands?|thumbs?|fingers?|carpal tunnel|elbows?|forearms?)\b/ },
  { area: 'hips', re: /\b(hips?|groin|glutes?|pelvi\w*|si joint|sacroiliac|hamstrings?)\b/ },
  { area: 'ankles', re: /\b(ankles?|feet|foot|heels?|achilles|plantar|toes?|shins?|calf|calves)\b/ },
  { area: 'neck', re: /\b(neck|cervical|whiplash)\b/ },
];
const PAINWORD = /\b(bad (?:back|knees?|hips?|shoulders?|neck|ankles?|wrists?)|tennis elbow|golfer'?s elbow|frozen shoulder|carpal tunnel|fasciitis|shin splints|runner'?s knee|pain\w*|ache\w*|aching|sore\w*|hurts?|hurting|injur\w*|strain\w*|sprain\w*|tear\w*|tore|torn|tendon\w*|tendin\w*|bursitis|arthritis|arthritic|stiff\w*|swell\w*|swollen|surgery|inflam\w*|slipped|herniated|sciatic\w*|clicking|locking|giving way|gives way)\b/;
const SEVERE = /\b(severe\w*|sharp|stabbing|shooting|unbearable|excruciating|agony|worst|getting worse|gets worse|worsening|worse and worse|can(?:'|no)?t (?:walk|bear weight|put weight|move|sleep)|numb\w*|tingl\w*|pins and needles|giving way|gives way)\b/;
const MILD = /\b(mild|slight|minor|little|occasional\w*|now and then|sometimes|a bit)\b/;

const RESTRICT_CUE = /\b(told me|said|advised|recommended|instructed|restricted|not allowed|must not|mustn'?t|shouldn'?t|should not|avoid\w*|no |don'?t|do not|can(?:'|no)?t|cannot|unable to|not able to|limit\w*|only)\b/;
const RESTRICT_SKIP = /\b(fine|no problem|without (?:pain|issues?)|don'?t mind|do not mind|love|enjoy|no restrictions?|any restrictions?)\b/;
const RESTRICT_RULES: { value: ClinicianRestriction; re: RegExp; access?: boolean; standalone?: boolean }[] = [
  { value: 'avoid_weights', re: /\b(lift\w*|weights?|heavy|carry\w*|dumbbells?|straining)\b/ },
  { value: 'avoid_overhead', re: /\b(overhead|above (?:my |the )?(?:head|shoulders?)|reach\w* up|raise (?:my )?arms?)\b/ },
  { value: 'avoid_forward_bending', re: /\b(bend\w* (?:over|forward|down)|forward ?bend\w*|touch\w* (?:my )?toes|stoop\w*)\b/ },
  { value: 'avoid_impact', re: /\b(runn?ing|jogg?ing|jump\w*|hopp\w*|impact|plyo\w*|skipping|burpees?)\b/ },
  { value: 'avoid_floor', re: /\b(floor|kneel\w*|lying (?:down|on)|get(?:ting)? (?:down )?(?:on|to) the (?:floor|ground)|lie flat|on my (?:back|knees))\b/ },
  { value: 'seated_only', re: /\b(wheelchair|seated only|sit(?:ting)? only|chair[- ]?bound|can(?:'|no)?t stand|unable to stand|cannot stand)\b/, access: true, standalone: true },
];

const BALANCE = /\b(balance (?:problems?|issues?|is (?:poor|bad))|poor balance|unsteady|wobbl\w*|off[- ]balance|falls?|falling|fallen|fell|tripp?(?:ed|ing)|trips? over|unstable)\b/;
const GRIP = /\b(weak grip|poor grip|can(?:'|no)?t grip|trouble (?:gripping|holding)|arthritis in (?:my )?(?:hands?|fingers?)|(?:hand|finger) arthritis|grip (?:problems?|issues?)|tremors?)\b/;
const LOWVISION = /\b(blind\w*|low vision|poor (?:eye ?sight|vision)|visually impaired|can(?:'|no)?t see (?:well|properly))\b/;
const HEARING = /\b(deaf|hard of hearing|hearing (?:loss|impaired)|hearing impairment)\b/;
const REHAB = /\b(physio\w*|physical therap\w*|rehab\w*|occupational therap\w*)\b/;

const SURGERY = /\b(surger\w*|operation|operated|post[- ]?op|replacement|stitches|c-section|caesarean)\b/;
const RECENT_WORDS = /\b(recent(?:ly)?|last (?:week|month|few weeks)|this (?:week|month)|few (?:days|weeks) ago|just had|just got out|since (?:my )?(?:surgery|operation))\b/;
const AGO = /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|a couple of|couple of|a few|few) (day|week|month|year)s? ago\b/;
const NUM: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, 'a couple of': 2, 'couple of': 2, 'a few': 3, few: 3 };

const PREGNANT = /\b(pregnan\w*|expecting a baby|expecting|trimester|due date|weeks pregnant)\b/;
const POSTPARTUM = /\b(postpartum|post-?natal|gave birth|given birth|had a baby|new mum|new mom|c-section|caesarean|breastfeeding)\b/;
const PREG_COMPLICATIONS = /\b(pre-?eclampsia|gestational (?:diabetes|hypertension)|placenta previa|bleeding|high[- ]risk|bed ?rest|cervical (?:insufficiency|incompetence)|contractions|threatened miscarriage)\b/;

function recentSurgery(lc: string, now: Date): 'recent' | 'old' | 'unknown' {
  if (RECENT_WORDS.test(lc)) return 'recent';
  const ago = lc.match(AGO);
  if (ago) {
    const n = NUM[ago[1]!] ?? Number(ago[1]);
    const unit = ago[2]!;
    if (unit === 'year') return 'old';
    if (unit === 'month') return n <= 3 ? 'recent' : 'old';
    if (unit === 'week') return n <= 13 ? 'recent' : 'old';
    return 'recent';
  }
  const year = lc.match(/\b(19|20)\d{2}\b/);
  if (year && Number(year[0]) < now.getFullYear()) return 'old';
  if (/\blast year\b|\byears? ago\b/.test(lc)) return 'old';
  return 'unknown';
}

// goals
const GOAL_RULES: { goal: Goal; re: RegExp; label: string }[] = [
  { goal: 'strength', re: /\b(strong\w*|strength|muscles?|toned?|tone up|lift\w*|build)\b/, label: 'Strength' },
  { goal: 'endurance', re: /\b(stamina|endurance|cardio|aerobic|walk\w*|run\w*|jog\w*|cycl\w*|stairs|keep up|energy|breath\w*|fitter)\b/, label: 'Endurance' },
  { goal: 'balance', re: /\b(balance|steady|steadier|stability|falls?|unsteady|wobbl\w*)\b/, label: 'Balance' },
  { goal: 'flexibility', re: /\b(flexib\w*|stretch\w*|supple|touch (?:my )?toes|loosen\w*)\b/, label: 'Flexibility' },
  { goal: 'mobility', re: /\b(mobility|range of motion|move (?:easier|better|freely)|stiff\w*|joints?|getting (?:up|down)|get (?:up|down))\b/, label: 'Mobility' },
  { goal: 'general_fitness', re: /\b(healthy|health|general|overall|feel better|lifestyle|more active|fit|fitness)\b/, label: 'General fitness' },
];
const WEIGHT_GOAL = /\b(lose weight|losing weight|weight loss|slim\w*|burn (?:fat|calories|off)|get thin|skinny)\b/;
const EXTREME_GOAL = /\b(punish\w*|as fast as possible|no matter what|whatever it takes|extreme|compensate|make up for (?:eating|food)|earn (?:my )?(?:food|meal)|every day without rest)\b/;

// avoid
const AVOID_RULES: { re: RegExp; ids: string[]; label: string }[] = [
  { re: /\bsquat\w*\b/, ids: ['bodyweight_squat', 'mini_squat'], label: 'Squats' },
  { re: /\bsit[- ]?to[- ]?stand\b/, ids: ['sit_to_stand'], label: 'Sit-to-stand' },
  { re: /\b(push[- ]?ups?|press[- ]?ups?)\b/, ids: ['wall_pushup'], label: 'Wall press-ups' },
  { re: /\b(jump\w*|jacks?|hopp\w*)\b/, ids: ['step_jacks'], label: 'Step jacks' },
  { re: /\bbridg\w*\b/, ids: ['glute_bridge'], label: 'Glute bridge' },
  { re: /\bcalf (?:raises?|lifts?)\b|\btiptoes?\b/, ids: ['calf_raise_supported'], label: 'Calf raises' },
  { re: /\bcurls?\b/, ids: ['biceps_curl'], label: 'Biceps curls' },
  { re: /\b(rows?|bands?)\b/, ids: ['band_row_seated'], label: 'Band rows' },
  { re: /\bstep[- ]?ups?\b|\bstairs?\b/, ids: ['step_up'], label: 'Step-ups' },
  { re: /\b(one|single)[- ]?leg\w*|\bbalanc\w* on one\b/, ids: ['one_leg_stand', 'one_leg_stand_supported'], label: 'One-leg stands' },
  { re: /\bmarch\w*\b/, ids: ['march_in_place', 'brisk_march', 'seated_march'], label: 'Marching' },
  { re: /\bwalk\w*\b/, ids: ['brisk_walk'], label: 'Brisk walking' },
  { re: /\bwall\b/, ids: ['wall_pushup', 'calf_stretch_wall', 'heel_toe_walk', 'one_leg_stand_supported'], label: 'Wall exercises' },
  { re: /\bhamstring\b/, ids: ['hamstring_stretch_seated'], label: 'Hamstring stretch' },
  { re: /\b(twist\w*|rotat\w*)\b/, ids: ['upper_body_twist', 'neck_rotation'], label: 'Twists and rotations' },
  { re: /\barm raises?\b|\boverhead\b/, ids: ['arm_raise', 'step_jacks'], label: 'Arm raises' },
];

// identifiers we never want stored
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const PHONE = /(?:\+?\d[\s().-]?){9,}\d/g;
const SSN = /\b\d{3}-\d{2}-\d{4}\b/g;
const URL_RE = /\bhttps?:\/\/\S+/gi;

/** Replace emails, phone numbers, ID-like numbers and links with "[removed]". */
export function redactIdentifiers(text: string): string {
  return text.replace(EMAIL, '[removed]').replace(URL_RE, '[removed]').replace(SSN, '[removed]').replace(PHONE, '[removed]');
}
export function hasIdentifiers(text: string): boolean {
  return [EMAIL, URL_RE, SSN, PHONE].some((re) => new RegExp(re.source, re.flags).test(text));
}

// ───────────────────────────── analysis ─────────────────────────────

const KIND_ORDER: Record<FindingKind, number> = { urgent: 0, refer: 1, adjust: 2, warning: 3, info: 4, goal: 5 };

class Collector {
  readonly byId = new Map<string, Finding>();
  /** Keeps the first finding for an id, unless a later one is more serious. */
  add(f: Omit<Finding, 'auto' | 'effects'> & { auto?: boolean; effects?: Effect[] }) {
    const old = this.byId.get(f.id);
    if (old && KIND_ORDER[f.kind] >= KIND_ORDER[old.kind]) return;
    this.byId.set(f.id, { auto: true, effects: [], ...f });
  }
}

const HEALTH_FIELDS: TextField[] = ['injuries', 'conditions', 'clinician', 'other'];

function scanHealthClause(raw: string, field: TextField, c: Collector, ctx: { pregnant: boolean; now: Date }): boolean {
  const lc = raw.toLowerCase();
  const q = snip(raw);
  const past = PAST.test(lc);
  const now = NOW.test(lc);
  const exert = EXERT.test(lc);
  let matched = false;
  const m = (re: RegExp) => hit(lc, re);

  // Possible emergencies (only when happening now) or exertional symptoms.
  const emergencyRules: { re: RegExp; key: keyof HealthAnswers['emergencyNow']; id: string; title: string }[] = [
    { re: CHEST, key: 'chestPain', id: 'chest', title: 'Chest pain or tightness' },
    { re: BREATH_SEVERE, key: 'severeBreathlessness', id: 'breath', title: 'Severe shortness of breath' },
    { re: FAINT, key: 'fainting', id: 'faint', title: 'Fainting or collapsing' },
    { re: STROKE, key: 'strokeSigns', id: 'stroke', title: 'Possible stroke signs' },
  ];
  for (const r of emergencyRules) {
    if (!m(r.re)) continue;
    matched = true;
    if (past) {
      c.add({ id: `past:${r.id}`, field, kind: 'info', title: `${r.title} (in the past)`, detail: 'Mention this to your doctor if it has ever happened with activity.', quote: q, auto: false });
    } else if (now) {
      c.add({
        id: `emerg:${r.id}`,
        field,
        kind: 'urgent',
        title: `${r.title} right now?`,
        detail: 'If this is happening now, get urgent medical help instead of exercising.',
        quote: q,
        effects: [{ t: 'emergency', key: r.key }],
      });
    } else {
      c.add({
        id: `sym:${r.id}`,
        field,
        kind: 'refer',
        title: r.title,
        detail:
          r.key === 'chestPain'
            ? 'Chest pain or tightness should be checked by a doctor before you start. If it is happening right now, call your emergency number.'
            : 'Please have this checked by a doctor before you start a new exercise plan.',
        quote: q,
        effects: [{ t: 'flag', key: 'exertionalSymptoms' }],
      });
    }
  }

  const sym: [RegExp, string, string][] = [
    [DIZZY, 'dizzy', 'Dizziness or light-headedness'],
    [PALP, 'palp', 'Heart racing or irregular heartbeat'],
    [BREATHLESS, 'breathless', exert ? 'Breathlessness with activity' : 'Shortness of breath'],
  ];
  for (const [re, id, title] of sym) {
    if (!m(re) || past) continue;
    matched = true;
    c.add({
      id: `sym:${id}`,
      field,
      kind: 'refer',
      title,
      detail: 'Dizziness, a racing or irregular heartbeat, or unusual breathlessness with activity should be checked by a doctor before you start (ACSM screening).',
      quote: q,
      effects: [{ t: 'flag', key: 'exertionalSymptoms' }],
    });
  }

  // Conditions that feed the existing screening rules.
  const cond: [RegExp, string, string][] = [
    [HEART, 'heart', 'A heart condition'],
    [DIABETES, 'diabetes', 'Diabetes or insulin use'],
    [KIDNEY, 'kidney', 'A kidney condition'],
  ];
  for (const [re, id, title] of cond) {
    const mm = m(re);
    if (!mm) continue;
    if (id === 'diabetes' && PREDIABETES.test(lc)) {
      matched = true;
      c.add({ id: 'info:prediabetes', field, kind: 'info', title: 'Pre-diabetes', detail: 'Regular activity is widely recommended. We don’t change your plan for this; mention it to your doctor.', quote: q, auto: false });
      continue;
    }
    matched = true;
    c.add({
      id: `cond:${id}`,
      field,
      kind: 'refer',
      title,
      detail: 'Together with your activity level, this decides whether to check with your doctor first (ACSM screening). If you are already active, intensity is capped at moderate.',
      quote: q,
      effects: [{ t: 'flag', key: 'knownCardioMetabolicRenal' }],
    });
  }

  for (const r of ASSESS_RULES) {
    if (!m(r.re)) continue;
    matched = true;
    if (past) {
      c.add({ id: `past:${r.id}`, field, kind: 'info', title: `${r.title} (in the past)`, detail: 'Mention it to your clinician if it affects what exercise is right for you.', quote: q, auto: false });
    } else {
      c.add({ id: `assess:${r.id}`, field, kind: 'refer', title: r.title, detail: r.detail, quote: q, effects: [{ t: 'assess', reason: r.reason }] });
    }
  }

  // Informational conditions.
  const infos: [RegExp, string, string, string][] = [
    [HYPERTENSION, 'bp', 'High blood pressure', 'We don’t change your plan for this. If it isn’t well controlled, ask your doctor before starting.'],
    [RESPIRATORY, 'resp', 'A breathing condition', 'Keep any reliever medicine within reach and tell your clinician you’re starting exercise. We don’t change your plan for this.'],
    [EPILEPSY, 'epilepsy', 'Seizures or epilepsy', 'Talk to your clinician about exercising safely. We don’t change your plan for this.'],
    [ARTHRITIS, 'arthritis', 'Arthritis or joint condition', 'Tell us which joints (for example “knee arthritis”) and we’ll leave out exercises that load them.'],
    [MEDS, 'meds', 'Medicines', 'Some medicines change how exercise feels (heart rate, blood sugar, bruising). Your prescriber or pharmacist can tell you what to watch for.'],
  ];
  for (const [re, id, title, detail] of infos) {
    if (!m(re)) continue;
    matched = true;
    c.add({ id: `info:${id}`, field, kind: 'info', title, detail, quote: q, auto: false });
  }
  if (m(OSTEOPOROSIS)) {
    matched = true;
    c.add({
      id: 'bone',
      field,
      kind: 'adjust',
      title: 'Bone health',
      detail: 'Clinicians often advise caution with impact and forward bending for low bone density. Ask yours. Tap Add to apply cautious limits.',
      quote: q,
      auto: false,
      effects: [
        { t: 'restriction', value: 'avoid_impact' },
        { t: 'restriction', value: 'avoid_forward_bending' },
      ],
      actionLabel: 'Add cautious limits',
    });
  }

  // Surgery.
  if (m(SURGERY)) {
    matched = true;
    const when = recentSurgery(lc, ctx.now);
    if (when === 'recent') {
      c.add({
        id: 'surg:recent',
        field,
        kind: 'refer',
        title: 'Recent surgery',
        detail: 'After surgery in the last 3 months, your care team should say what activity is safe.',
        quote: q,
        effects: [{ t: 'flag', key: 'recentSurgery' }],
      });
    } else if (when === 'old') {
      c.add({ id: 'surg:old', field, kind: 'info', title: 'Past surgery', detail: 'If it still limits you, add the area under pain or injury so we leave out exercises that load it.', quote: q, auto: false });
    } else {
      c.add({
        id: 'surg:unknown',
        field,
        kind: 'adjust',
        title: 'Surgery: when was it?',
        detail: 'We couldn’t tell when this was. If it was in the last 3 months, your care team should guide activity first.',
        quote: q,
        auto: false,
        effects: [{ t: 'flag', key: 'recentSurgery' }],
        actionLabel: 'It was in the last 3 months',
      });
    }
  }

  // Pregnancy.
  const preg = m(PREGNANT);
  const post = !past && m(POSTPARTUM);
  if (preg) {
    matched = true;
    c.add({ id: 'preg:pregnant', field, kind: 'adjust', title: 'Pregnancy', detail: 'Intensity is capped at moderate and exercises lying on your back are left out. Discuss activity with your obstetric care provider.', quote: q, effects: [{ t: 'pregnancy', value: 'pregnant' }] });
  } else if (post) {
    matched = true;
    c.add({ id: 'preg:postpartum', field, kind: 'adjust', title: 'Recently had a baby', detail: 'Intensity is capped at moderate. Discuss activity with your obstetric care provider.', quote: q, effects: [{ t: 'pregnancy', value: 'postpartum' }] });
  }
  if ((preg || post || ctx.pregnant) && m(PREG_COMPLICATIONS)) {
    matched = true;
    c.add({
      id: 'preg:complications',
      field,
      kind: 'refer',
      title: 'Pregnancy complications',
      detail: 'Please ask your obstetric care provider which exercise is right for you.',
      quote: q,
      effects: [{ t: 'flag', key: 'pregnancyComplications' }, { t: 'pregnancy', value: preg || ctx.pregnant ? 'pregnant' : 'postpartum' }],
    });
  }

  // Pain, injury and body areas.
  const painWord = m(PAINWORD);
  const isRestrictionCue = RESTRICT_CUE.test(lc) && !RESTRICT_SKIP.test(lc);
  for (const a of AREA_RULES) {
    const am = any(lc, a.re);
    if (!am) continue;
    if (painWord) {
      matched = true;
      const severe = !!m(SEVERE);
      const mild = !severe && !!any(lc, MILD);
      const sev: PainSeverity | undefined = severe ? 'severe' : mild ? 'mild' : undefined;
      if (severe) {
        c.add({
          id: `pain:${a.area}`,
          field,
          kind: 'refer',
          title: `Severe or worsening pain in your ${AREA_LABEL[a.area]}`,
          detail: 'Pain that is severe, sharp, getting worse, or comes with numbness or giving way should be assessed by a doctor or physiotherapist first.',
          quote: q,
          effects: [{ t: 'pain', area: a.area, severity: 'severe' }, { t: 'flag', key: 'severeOrWorseningPain' }],
        });
      } else if (past) {
        c.add({
          id: `pain:${a.area}`,
          field,
          kind: 'adjust',
          title: `Past problem with your ${AREA_LABEL[a.area]}`,
          detail: 'Sounds like it’s behind you. Tap Add if you’d still like to avoid loading it.',
          quote: q,
          auto: false,
          effects: [{ t: 'pain', area: a.area, severity: sev }],
          actionLabel: 'Avoid this area',
        });
      } else {
        c.add({
          id: `pain:${a.area}`,
          field,
          kind: 'adjust',
          title: `${AREA_LABEL[a.area][0]!.toUpperCase()}${AREA_LABEL[a.area].slice(1)}: leave out exercises that load this`,
          detail: 'This is a cautious choice and may leave out exercises that would be fine for you. A physiotherapist can advise on what is suitable.',
          quote: q,
          effects: [{ t: 'pain', area: a.area, severity: sev }],
        });
      }
    } else if (field === 'clinician' && isRestrictionCue) {
      matched = true;
      c.add({
        id: `area:${a.area}`,
        field,
        kind: 'adjust',
        title: `Avoid loading ${AREA_LABEL[a.area]}`,
        detail: 'You said a clinician asked you to avoid this, so exercises that load it are left out.',
        quote: q,
        effects: [{ t: 'restrictArea', area: a.area }],
      });
    }
  }

  // Movement restrictions.
  if (isRestrictionCue || any(lc, /\bwheelchair\b/)) {
    for (const r of RESTRICT_RULES) {
      if (!any(lc, r.re)) continue;
      if (!r.standalone && !isRestrictionCue) continue;
      matched = true;
      c.add({
        id: `restrict:${r.value}`,
        field,
        kind: 'adjust',
        title: RESTRICTION_LABEL[r.value],
        detail: 'Exercises that conflict with this are left out of your plan.',
        quote: q,
        effects: [{ t: 'restriction', value: r.value }, ...(r.access ? ([{ t: 'access', key: 'seatedOnly' }] as Effect[]) : [])],
      });
    }
  }

  // Access needs, balance, rehab.
  if (m(BALANCE)) {
    matched = true;
    c.add({ id: 'balance', field, kind: 'adjust', title: 'Balance or falls', detail: 'Balance exercises use a chair or wall for support, and unsupported balance exercises are left out.', quote: q, effects: [{ t: 'flag', key: 'balanceConcernOrFall' }] });
  }
  if (m(GRIP)) {
    matched = true;
    c.add({ id: 'grip', field, kind: 'adjust', title: 'Limited grip', detail: 'Exercises that need weights or a band are left out.', quote: q, effects: [{ t: 'access', key: 'limitedGrip' }] });
  }
  if (m(LOWVISION)) {
    matched = true;
    c.add({ id: 'vision', field, kind: 'info', title: 'Low vision', detail: 'Turn on Larger text and Higher contrast in Profile → Settings. Spoken cues can also help.', quote: q, auto: false, effects: [{ t: 'access', key: 'lowVision' }] });
  }
  if (m(HEARING)) {
    matched = true;
    c.add({ id: 'hearing', field, kind: 'info', title: 'Hearing', detail: 'All guidance is shown on screen, so nothing depends on sound.', quote: q, auto: false, effects: [{ t: 'access', key: 'hearingImpaired' }] });
  }
  if (m(REHAB)) {
    matched = true;
    if (past || /\b(finished|discharged|completed|no longer)\b/.test(lc)) {
      c.add({ id: 'info:rehab-past', field, kind: 'info', title: 'Past rehab', detail: 'Great that you’ve finished. If your clinician gave you exercises to keep doing, keep following them.', quote: q, auto: false });
    } else {
      c.add({
        id: 'rehab',
        field,
        kind: 'refer',
        title: 'You’re working with a physio or rehab program',
        detail: 'Please follow the program your clinician designed. Verimove does not replace individualized rehabilitation.',
        quote: q,
        effects: [{ t: 'flag', key: 'inRehabProgram' }],
      });
    }
  }
  return matched;
}

function scanGoalClause(raw: string, c: Collector) {
  const lc = raw.toLowerCase();
  const q = snip(raw);
  if (EXTREME_GOAL.test(lc)) {
    c.add({
      id: 'goal:extreme',
      field: 'goal',
      kind: 'warning',
      title: 'We keep plans sustainable',
      detail: 'Verimove doesn’t build extreme or punishing plans, and exercise isn’t used to make up for eating. Steady, enjoyable activity works better and is safer.',
      quote: q,
      auto: false,
    });
  }
  if (WEIGHT_GOAL.test(lc)) {
    c.add({
      id: 'goal:weight',
      field: 'goal',
      kind: 'info',
      title: 'About weight goals',
      detail: 'We don’t set weight or body-shape targets. Regular activity supports health whatever the scale says, so we focus on consistency and fitness.',
      quote: q,
      auto: false,
    });
  }
  for (const g of GOAL_RULES) {
    const mm = lc.match(g.re);
    if (!mm || negated(lc, mm.index ?? 0)) continue;
    c.add({
      id: `goal:${g.goal}`,
      field: 'goal',
      kind: 'goal',
      title: `Goal: ${g.label}`,
      detail: 'Add this to your goals so the plan leans toward it.',
      quote: q,
      auto: false,
      effects: [{ t: 'goal', goal: g.goal }],
      actionLabel: 'Add goal',
    });
  }
}

function scanAvoidClause(raw: string, c: Collector): boolean {
  const lc = raw.toLowerCase();
  const q = snip(raw);
  let matched = false;
  for (const r of AVOID_RULES) {
    if (!r.re.test(lc)) continue;
    matched = true;
    c.add({
      id: `avoid:${r.label}`,
      field: 'avoid',
      kind: 'adjust',
      title: `Leave out: ${r.label}`,
      detail: 'These exercises won’t appear in your plan.',
      quote: q,
      effects: [{ t: 'avoid', exerciseIds: r.ids }],
    });
  }
  // direct name matches
  for (const ex of EXERCISES) {
    const name = ex.name.toLowerCase().replace(/\s*\(.*\)\s*/g, '').trim();
    if (name.length > 5 && lc.includes(name)) {
      matched = true;
      c.add({ id: `avoid:${ex.id}`, field: 'avoid', kind: 'adjust', title: `Leave out: ${ex.name}`, detail: 'This exercise won’t appear in your plan.', quote: q, effects: [{ t: 'avoid', exerciseIds: [ex.id] }] });
    }
  }
  return matched;
}

/** "squats, push-ups and burpees" → three items, so each can be matched (or reported) on its own. */
function avoidItems(text: string): string[] {
  return text
    .replace(/[\u2018\u2019\u02bc]/g, "'")
    .split(/[.;,!?\n]+|\s+(?:and|or|plus|&)\s+/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function analyzeText(p: Pick<Profile, 'health' | 'goalText' | 'avoidText'>, now: Date = new Date()): TextAnalysis {
  const c = new Collector();
  const notUnderstood: TextAnalysis['notUnderstood'] = [];
  const truncated: TextField[] = [];
  const texts: Record<TextField, string> = {
    injuries: p.health.freeText?.injuries ?? '',
    conditions: p.health.freeText?.conditions ?? '',
    clinician: p.health.freeText?.clinician ?? '',
    other: p.health.freeText?.other ?? '',
    goal: p.goalText ?? '',
    avoid: p.avoidText ?? '',
  };
  const all = HEALTH_FIELDS.map((f) => texts[f]).join(' . ').toLowerCase();
  const ctx = { pregnant: p.health.pregnancy === 'pregnant' || p.health.pregnancy === 'postpartum' || PREGNANT.test(all), now };

  for (const field of HEALTH_FIELDS) {
    let t = texts[field];
    if (t.length > MAX_TEXT) {
      truncated.push(field);
      t = t.slice(0, MAX_TEXT);
    }
    if (hasIdentifiers(t)) {
      c.add({
        id: `pii:${field}`,
        field,
        kind: 'warning',
        title: 'Please don’t include contact or ID details',
        detail: 'This looks like an email, phone number, link or ID number. We don’t need it, so it will be removed when you save.',
        quote: '[hidden]',
        auto: false,
      });
    }
    for (const cl of clauses(t)) {
      const matched = scanHealthClause(cl, field, c, ctx);
      if (!matched && cl.split(/\s+/).length >= 2 && !hasIdentifiers(cl)) notUnderstood.push({ field, text: snip(cl) });
    }
  }
  for (const cl of clauses(texts.goal.slice(0, MAX_TEXT))) scanGoalClause(cl, c);
  for (const item of avoidItems(texts.avoid.slice(0, MAX_TEXT))) {
    if (!scanAvoidClause(item, c)) notUnderstood.push({ field: 'avoid', text: snip(item) });
  }

  const findings = [...c.byId.values()].sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
  return { findings, notUnderstood: notUnderstood.slice(0, 5), truncated };
}

// ───────────────────────────── applying findings ─────────────────────────────

export function effectSatisfied(p: Profile, e: Effect): boolean {
  const h = p.health;
  switch (e.t) {
    case 'emergency':
      return h.emergencyNow[e.key];
    case 'flag':
      return !!h[e.key];
    case 'assess':
      return (h.needsClinician ?? []).includes(e.reason);
    case 'pain':
      return h.painAreas.includes(e.area) && (e.severity !== 'severe' || h.painSeverity?.[e.area] === 'severe');
    case 'restrictArea':
      return h.clinicianRestrictedAreas.includes(e.area);
    case 'restriction':
      return h.clinicianRestrictions.includes(e.value);
    case 'pregnancy':
      return h.pregnancy === e.value;
    case 'access':
      return p.accessibility[e.key];
    case 'goal':
      return p.goals.includes(e.goal);
    case 'avoid':
      return e.exerciseIds.every((id) => p.dislikedExerciseIds.includes(id));
  }
}

export function applyEffect(p: Profile, e: Effect): Profile {
  const h = { ...p.health, emergencyNow: { ...p.health.emergencyNow }, painSeverity: { ...p.health.painSeverity } };
  const out: Profile = { ...p, health: h, accessibility: { ...p.accessibility } };
  switch (e.t) {
    case 'emergency':
      h.emergencyNow[e.key] = true;
      break;
    case 'flag':
      h[e.key] = true;
      break;
    case 'assess':
      h.needsClinician = [...new Set([...(h.needsClinician ?? []), e.reason])];
      break;
    case 'pain':
      h.painAreas = [...new Set([...h.painAreas, e.area])];
      if (e.severity) h.painSeverity[e.area] = e.severity;
      break;
    case 'restrictArea':
      h.clinicianRestrictedAreas = [...new Set([...h.clinicianRestrictedAreas, e.area])];
      break;
    case 'restriction':
      h.clinicianRestrictions = [...new Set([...h.clinicianRestrictions, e.value])];
      break;
    case 'pregnancy':
      // Never downgrade: "pregnant" beats "postpartum".
      if (!(e.value === 'postpartum' && h.pregnancy === 'pregnant')) h.pregnancy = e.value;
      break;
    case 'access':
      out.accessibility[e.key] = true;
      break;
    case 'goal':
      if (!out.goals.includes(e.goal) && out.goals.length < 3) out.goals = [...out.goals, e.goal];
      break;
    case 'avoid':
      out.dislikedExerciseIds = [...new Set([...out.dislikedExerciseIds, ...e.exerciseIds])];
      break;
  }
  return out;
}

export function applyFinding(p: Profile, f: Finding): Profile {
  return f.effects.reduce(applyEffect, p);
}

export function findingStatus(p: Profile, f: Finding): FindingStatus {
  if (p.health.dismissedFindings.includes(f.id)) return 'dismissed';
  if (f.effects.length === 0) return 'info';
  if (f.effects.every((e) => effectSatisfied(p, e))) return 'applied';
  return f.auto ? 'included' : 'suggested';
}

export interface Resolution {
  profile: Profile;
  /** Findings applied automatically for safety/preferences (not dismissed). */
  used: Finding[];
  /** "Not sure" answers that were treated as "Yes". */
  unsureApplied: QuestionKey[];
  analysis: TextAnalysis;
}

/**
 * The profile the plan engine actually uses: the user's structured answers, plus "Not sure"
 * answers treated as "Yes", plus every automatic finding from their own words that they have not
 * dismissed. Goals are never added automatically.
 */
export function resolveProfile(profile: Profile, now: Date = new Date()): Resolution {
  let p: Profile = { ...profile, health: { ...profile.health } };
  const unsureApplied: QuestionKey[] = [];
  for (const k of profile.health.unsure ?? []) {
    if (!p.health[k]) {
      p.health = { ...p.health, [k]: true };
      unsureApplied.push(k);
    }
  }
  const analysis = analyzeText(profile, now);
  const used: Finding[] = [];
  for (const f of analysis.findings) {
    if (!f.auto || f.effects.length === 0) continue;
    if (profile.health.dismissedFindings.includes(f.id)) continue;
    const effects = f.effects.filter((e) => e.t !== 'goal');
    if (effects.length === 0) continue;
    p = effects.reduce(applyEffect, p);
    used.push(f);
  }
  return { profile: p, used, unsureApplied, analysis };
}
