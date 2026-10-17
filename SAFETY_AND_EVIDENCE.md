# Safety and Evidence

Verimove is a **general fitness** application with **medically informed safeguards**. It is **not** a doctor, physical therapist, diagnostic device or treatment program, and it does not claim HIPAA compliance, clinical certification or regulatory approval.

## 1. What the app is and isn't

| Category | What it means | Does Verimove do it? |
|---|---|---|
| General fitness | Public-health activity guidance (WHO, CDC, NHS) applied to everyday exercise for people without unresolved medical concerns | **Yes**, this is the core |
| Medically informed exercise guidance | General fitness adjusted by conservative, transparent rules when someone reports a limitation (e.g. leaving out exercises that load a painful joint) or follows a clinician's restrictions | **Yes, limited.** It applies exclusions and caps and explains them. It does not judge whether exercise is right for a condition |
| Individualized rehabilitation or treatment | A program designed by a licensed professional after assessment, for a specific injury or condition | **No.** In these cases the app refers the person to a professional and does not generate a plan |

## 2. Deterministic safety rules

All rules live in `src/domain/safety/screening.ts`, are pure functions, and are unit-tested in `screening.test.ts`. The UI can't bypass them, and no AI model is involved.

Outcomes, most restrictive first:

1. **`emergency`**: shows concise urgent-help guidance and stops everything else.
2. **`needs_assessment`**: no personalized plan. The person is asked to see an appropriate professional. They can return after clearance by confirming it and entering any restrictions.
3. **`proceed_with_modifications`**: a plan is generated with exclusions and intensity caps, each one explained.
4. **`proceed`**: a plan is generated using general guidance.

| Rule ID | Trigger (self-reported) | Outcome | Basis |
|---|---|---|---|
| `EMERG-01` | Chest pain/pressure/tightness **right now**, severe breathlessness at rest, fainting, signs of stroke (face drooping, arm weakness, speech problems) | `emergency` | NHS heart attack and stroke symptom pages (`nhs-heart-attack`, `nhs-stroke`) |
| `SCREEN-01` | Chest discomfort, unusual breathlessness, dizziness/fainting, or palpitations **during or after activity** | `needs_assessment` | ACSM 2015 screening update: signs/symptoms suggestive of cardiovascular, metabolic or renal disease warrant medical clearance (`acsm-screening-2015`) |
| `SCREEN-02` | Known heart, metabolic (e.g. diabetes) or kidney disease **and** currently inactive | `needs_assessment` | `acsm-screening-2015` |
| `SCREEN-03` | Known heart/metabolic/kidney disease **and** currently active | `proceed_with_modifications`: intensity capped at moderate; advised to keep up clinician follow-up | `acsm-screening-2015` (clearance advised before vigorous intensity) |
| `SCREEN-04` | Surgery or hospital stay in the last 3 months | `needs_assessment` | Product safety heuristic (conservative), labelled as such |
| `SCREEN-05` | Pain that is severe, new and unexplained, or getting worse | `needs_assessment` | Product safety heuristic; NHS adult guidance advises speaking to a GP with a medical condition or concern (`nhs-adults`) |
| `SCREEN-06` | Currently under a clinician- or physio-directed rehab program for the issue | `needs_assessment`: follow that program; the app won't substitute for it | Scope boundary (§1) |
| `SCREEN-07` | Pregnancy with complications, or told by a provider to limit activity | `needs_assessment` | ACOG Committee Opinion 804 (`acog-pregnancy-2020`) |
| `MOD-01` | Pregnant or postpartum without complications | Intensity capped at moderate; supine (lying on back) exercises excluded; advised to discuss with obstetric care provider | ACOG 804 supports activity without complications (`acog-pregnancy-2020`). **The supine exclusion is a conservative product heuristic**, not a claim attributed to ACOG |
| `MOD-02` | Known, stable, mild pain in a body area | Exercises that load that area are excluded | Product heuristic (conservative) |
| `MOD-03` | Clinician restrictions selected (avoid overhead / floor / impact / forward bending / seated only / area) | Matching exercises excluded | Clinician instruction overrides the library |
| `MOD-04` | Balance concern or fall in the last 12 months | Unsupported balance exercises excluded; supported variants (chair/wall) used; balance work included | Cochrane falls review (`cochrane-falls-2019`), WHO 2020 (`who-2020`) |
| `MOD-05` | Uses a wheelchair or prefers seated only | Only seated exercises | Accessibility; WHO 2020 includes people living with disability |
| `AGE-01` | Under 5 | No plan; active play guidance (CDC 3–5) and a pediatrician referral | CDC children (`cdc-children`) |
| `AGE-02` | 5–12 | Guardian must set up and confirm supervision; play/bodyweight, technique-first; no leaderboards. **No external weights is a conservative product heuristic**: AAP supports properly designed and supervised resistance training for youth, so this is not attributed to AAP | Supervision and technique focus: AAP 2020 (`aap-resistance-2020`); activity targets: CDC children; weights exclusion: `heuristic-conservative` |
| `AGE-03` | 13–17 | Guardian acknowledgement; bodyweight/light bands; technique-first; youth-only leaderboards | AAP 2020, NHS children and young people (`nhs-children`) |
| `AGE-04` | 65+ | Balance and strength included; supported variants preferred | CDC older adults (`cdc-older`), NHS older adults (`nhs-older`), Cochrane falls |
| `INT-01` | Currently inactive | Starts at the lighter end (RPE 3–5/10) | ACSM 2011 position stand: program modified to habitual activity (`acsm-2011`); NHS "build up slowly" |

### In-session safety

- A **"Stop — I don't feel right"** button is always visible during a workout. Choosing emergency symptoms shows urgent guidance. Other symptoms end the session, suggest rest, and **pause the streak** so it isn't lost.
- A pre-workout check-in ("feeling unwell, feverish, new pain?") suggests a rest day; it never pushes someone to keep a streak going.
- Effort is self-rated on CDC's 0–10 relative-intensity scale. Pain reports are never treated as progress.

## 3. Evidence registry

`src/domain/evidence/registry.ts` holds every source. Each record stores the title, organization/authors, publication or revision date, URL/DOI, the **specific claim it supports**, population, limitations, and the date we checked it. A unit test confirms that every evidence ID referenced by an exercise, rule or prescription exists, and that every URL is a well-formed `https://` link.

Evidence types shown in the UI:

- **Guideline**: national or international public-health guideline (WHO, CDC, NHS, HHS)
- **Position stand / policy**: professional body statement (ACSM, AAP, ACOG)
- **Systematic review**: e.g. Cochrane
- **Product heuristic**: a conservative rule we chose for safety or simplicity, **not** a claim that evidence prescribes it

### Verification log (2026-10-16)

| ID | Source | How it was verified |
|---|---|---|
| `who-2020` | WHO guidelines on physical activity and sedentary behaviour (2020); Bull FC et al., BJSM 2020, DOI 10.1136/bjsports-2020-102955 | WHO page HTTP 200; DOI metadata via Crossref; abstract via Europe PMC (PMID 33239350) |
| `cdc-adults` | CDC, Physical activity guidelines for adults (page dated 2023-12-20) | Page content read |
| `cdc-children` | CDC, Physical activity guidelines for children (page dated 2025-12-04) | Page content read |
| `cdc-older` | CDC, Physical activity guidelines for older adults (page dated 2025-12-04) | Page content read |
| `cdc-intensity` | CDC, Measuring physical activity intensity (page dated 2025-12-04) | Page content read |
| `hhs-pag-2018` | HHS, Physical Activity Guidelines for Americans, 2nd ed. | ODPHP page HTTP 200 |
| `acsm-2011` | Garber CE et al. ACSM Position Stand, MSSE 2011;43(7):1334–59, DOI 10.1249/MSS.0b013e318213fefb | Crossref + Europe PMC abstract (PMID 21694556) |
| `acsm-rt-2009` | ACSM Position Stand: Progression models in resistance training, MSSE 2009;41(3):687–708, DOI 10.1249/MSS.0b013e3181915670 | Crossref + abstract (PMID 19204579) |
| `acsm-screening-2015` | Riebe D et al. Updating ACSM's recommendations for exercise preparticipation health screening, MSSE 2015;47(11):2473–9, DOI 10.1249/MSS.0000000000000664 | Crossref + abstract (PMID 26473759) |
| `aap-resistance-2020` | Stricker PR, Faigenbaum AD, McCambridge TM; AAP. Resistance training for children and adolescents. Pediatrics 2020;145(6):e20201011, DOI 10.1542/peds.2020-1011 | Crossref + abstract (PMID 32457216) |
| `cochrane-falls-2019` | Sherrington C et al. Exercise for preventing falls in older people living in the community. Cochrane 2019, DOI 10.1002/14651858.CD012424.pub2 | Crossref + abstract (PMID 30703272): exercise reduces rate of falls by 23% (high-certainty) |
| `acog-pregnancy-2020` | ACOG Committee Opinion No. 804, Obstet Gynecol 2020, DOI 10.1097/AOG.0000000000003772 | Crossref + abstract (PMID 32217980) |
| `nhs-adults`, `nhs-older`, `nhs-children` | NHS physical activity guidelines pages | Page content read (review dates recorded in registry) |
| `nhs-strength`, `nhs-sitting`, `nhs-balance`, `nhs-flexibility`, `nhs-warmup` | NHS exercise instruction pages | Page content read; our instructions are paraphrased, not copied |
| `nhs-heart-attack`, `nhs-stroke` | NHS symptom pages | Page content read |
| `mediapipe-model-card` | BlazePose GHUM 3D model card (Google) | PDF downloaded and read: Apache-2.0; intended uses include fitness and rep counting; out of scope: multiple people, >4 m distance, head not visible |

Sources that blocked automated access (HTTP 403 for CDC/AAP/AHA/Cochrane via curl) were verified through their content via a browser-like fetch or the Europe PMC/Crossref APIs. The American Heart Association page could not be read, so it is **not cited**.

## 4. What is NOT verified

- Exercise instructions and cautions are our own paraphrase of NHS pages and general practice. **They have not been reviewed by a licensed clinician.** The UI marks the library as "Reviewed against NHS public guidance — not clinician-reviewed".
- Specific rep/set/rest numbers for bodyweight exercises are product choices informed by ACSM 2009 (novice 8–12 repetitions; 1–2 min rest for moderate loads) and NHS pages (e.g. 5 slow repetitions to begin). They are labelled as such.
- **Pose tracking and form cues are not medically validated.** Thresholds were tuned against simulated landmark sequences and reasoned joint angles, not a clinical dataset. The UI states this wherever cues appear. A dev-only recorder and replay harness (TEST_PLAN.md §8) can now measure counting agreement on real-person landmark traces, but no traces have been collected yet, and a small convenience sample would still not be clinical validation.

## 5. Form-feedback language rules

- Feedback is only issued when all required landmarks have visibility ≥ 0.65 for the last several frames.
- Phrasing describes what was tracked, never injury risk: "Your tracked knees appear to move inward — try a slower rep if comfortable."
- Tracking failures ("I can't see your hips — step back so your whole body is in view") are shown separately from technique cues.
- No shaming, scoring of "bad reps", or pain-based scoring.
