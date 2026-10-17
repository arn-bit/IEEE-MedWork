# Architecture

Medical Workout is a **local-first single-page app** with no server, no account and no third-party network calls. Health-critical logic is pure TypeScript, separated from the UI and tested without a browser or camera.

```
                      ┌──────────────────────────── Browser tab ────────────────────────────┐
  user ──► React UI ──┤ features/*  (onboarding, plan, workout, progress, challenges, profile)│
                      │      │ uses                                                         │
                      │      ▼                                                              │
                      │ state/store.tsx (React context + reducer) ──► state/storage.ts ──► localStorage "mw:v1"
                      │      │                                                              │
                      │      ▼  pure functions, no DOM                                      │
                      │ domain/ safety/screening ─► plan/engine ─► plan/progression         │
                      │         exercises/library    evidence/registry   gamification/rules │
                      │                                                                     │
                      │ pose/ camera.ts ─► poseModel.ts (MediaPipe WASM, local files) ─►    │
                      │       geometry.ts ─► counters.ts (state machines + form cues)       │
                      └──────────────────────────────────────────────────────────────────────┘
   CSP connect-src 'self' ── blocks every third-party request (incl. MediaPipe usage metrics)
   public/sw.js ── caches app files + model for offline use (never personal data)
```

## Directory map

| Path | Responsibility |
|---|---|
| `src/domain/types.ts` | Shared domain types (Profile, Exercise, Prescription, Plan, SessionLog…) |
| `src/domain/evidence/registry.ts` | Evidence registry: verified sources, the specific claim each supports, population, limitations, checked date |
| `src/domain/exercises/library.ts` | 30 structured exercises: equipment, position, loaded areas, cautions, alternatives, sources, review date, camera support |
| `src/domain/safety/screening.ts` | **Deterministic safety rules** (emergency → assessment → modifications), in-session symptom triage |
| `src/domain/plan/engine.ts` | Validation → screening → library filtering → weekly structure → time-budgeted sessions → prescriptions → decision trace |
| `src/domain/plan/progression.ts` | Rule-based progression hints; weekly moderate-equivalent activity minutes |
| `src/domain/gamification/rules.ts` | Weekly consistency streak with pauses, achievements, capped points, share-code encode/validate |
| `src/pose/geometry.ts` | Landmark indices, joint angles, view estimation, One-Euro filter |
| `src/pose/counters.ts` | Exercise-specific rep counters (squat, sit-to-stand, wall press-up, arm raise, knee lift), positioning checks, form cues |
| `src/pose/poseModel.ts` | Loads `@mediapipe/tasks-vision` PoseLandmarker from local files; GPU → CPU delegate fallback; typed errors |
| `src/pose/camera.ts` | `getUserMedia` wrapper with classified errors (denied, no camera, in use, insecure, unsupported) |
| `src/pose/testing/simulate.ts` | Deterministic synthetic landmark generator (tests only) |
| `src/state/storage.ts` | Versioned, shape-checked persistence; export; delete-everything across localStorage, sessionStorage, Cache Storage, IndexedDB |
| `src/state/store.tsx` | React context; recomputes referral status from the profile when no plan is stored |
| `src/components/` | Design-system primitives (`ui.tsx`), icons, animated exercise figures (`demo/`) |
| `src/features/` | Screens. Each feature only calls domain functions; no medical rules live in components |
| `scripts/setup-models.mjs` | Downloads + verifies the pose model, copies WASM, writes `public/models/MODEL_MANIFEST.json` |
| `e2e/` | Playwright tests against the production build (strict CSP) in Microsoft Edge |

## Key design decisions

### Safety rules are deterministic and come first
`generatePlan()` calls `screen()` before touching the library. `emergency` and `needs_assessment` outcomes return **no plan**. Modifications become `Constraints` that `exclusionReason()` applies to every exercise, and each exclusion is recorded with its reason. No AI model is involved anywhere; explanations come straight from the rule trace.

### Time limits are an invariant
Each session is budgeted as warm-up + main + cool-down. Every item's estimate is computed by `estimateSeconds()` (reps × ~4 s, sides, rest between sets, 15 s transitions), and `buildSession()` throws if the sum would exceed the limit. Tests check limits from 5 to 90 minutes across goal mixes.

### Evidence is data, not prose
Prescriptions carry `evidenceIds` and an `evidenceKind`. A test fails if any ID used by an exercise, rule or generated plan is missing from the registry. Product heuristics have their own kind and are labelled "Product heuristic (not evidence)" in the UI.

### Pose model choice

| Option | Notes | Decision |
|---|---|---|
| **MediaPipe Pose Landmarker Lite** (`@mediapipe/tasks-vision` 1.0.1) | 33 landmarks incl. heels/feet; WASM + WebGL in the browser; Apache-2.0; model card lists "fitness and repetition counting" as intended use; 5.8 MB | **Chosen** |
| MediaPipe Full / Heavy | Same API; 9.4 MB / 30.7 MB; slower on phones | Not chosen; could be a setting |
| TF.js MoveNet (`@tensorflow-models/pose-detection`) | 17 keypoints (no heels/feet), needs the TF.js runtime | Not chosen: fewer joints, larger runtime |

**Loading:** `fetchModelBytes()` downloads `/models/pose_landmarker_lite.task` from this origin. It rejects HTML fallbacks and non-ZIP files and passes the bytes to `PoseLandmarker.createFromOptions({ baseOptions: { modelAssetBuffer, delegate } })`. The WASM fileset is resolved from `/mediapipe/wasm`. If anything is missing, a typed `PoseModelError` with a `npm run setup:models` instruction is shown and the user can continue manually. The app never falls back to a different model.

**Inference loop:** `requestAnimationFrame` calls `detectForVideo(video, performance.now())` once per new video frame. Landmarks go to the active `RepCounter`, and the UI state updates at about 8 Hz to limit re-renders. The overlay draws joints dimmed or dashed when visibility is below 0.65.

### Rep counting

Each counter is a hysteresis state machine `idle → ready → bottom → ready (+1)` over a One-Euro-smoothed joint metric:

| Counter | Metric | Start | Enter / exit (standard) | Reduced range |
|---|---|---|---|---|
| Squat (mini & bodyweight) | Knee angle hip-knee-ankle | High | ≤125° / ≥160° | 148° / 163° |
| Sit-to-stand | Knee angle | Low (seated) | ≥155° / ≤115° | 145° / 120° |
| Wall press-up | Elbow angle | High | ≤115° / ≥150° | 130° / 152° |
| Arm raise | Shoulder angle hip-shoulder-wrist | Low | ≥140° / ≤45° | 95° / 40° |
| Knee lift (march) | Knee-below-hip ÷ torso, relative to a standing baseline | High | ≤0.62× / ≥0.85× baseline | 0.75× / 0.90× |

Anti-false-count measures:
- 3 consecutive frames are needed for any state change.
- A minimum rep duration applies.
- A rep is never completed across a tracking gap (four bad frames reset to `idle`).
- Partial reps are reported but not counted.
- Manual correction is always available.

Form cues need 3 qualifying frames within a rep and reliable tracking, are rate-limited to one per cue per 8 s, and use hedged wording.

### Privacy architecture
- **CSP** is injected by a Vite plugin: `connect-src 'self'`, `script-src 'self' 'wasm-unsafe-eval'`, `object-src 'none'`. Dev mode adds the HMR websocket and inline preamble.
- **HTTP headers** (dev/preview): `frame-ancestors 'none'`, `Permissions-Policy: camera=(self), microphone=()…`, `nosniff`, `no-referrer`. Production hosting must send the same.
- MediaPipe 1.x POSTs usage metrics to `odml.pa.googleapis.com` unconditionally. The CSP blocks it, and an E2E test asserts the browser blocks the request.
- Spoken cues use only voices with `localService === true`.
- No analytics, fonts, CDNs or third-party scripts.

### Data model & persistence
A single JSON document lives under `localStorage["mw:v1"]`, with `version: 1`. `sanitize()` shape-checks on load, and corrupt data never crashes the app (it is reported in a banner). An optional "keep fewer health details" mode discards raw health answers after plan generation and keeps only the plan's derived constraints.

**Limitation:** localStorage is not encrypted at rest. Anyone with access to the device's browser profile can read it, and the Privacy Center says so.

### Accounts / cloud
There are none. Adding them would require a server-side authorization design, encryption, a lawful-basis review, and determining which health-privacy obligations apply (for example HIPAA only for covered entities and business associates, GDPR special-category data, or US state consumer-health-data laws). None of that work has been done, so none of it is claimed.
