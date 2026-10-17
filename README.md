# Verimove

A personalized, evidence-linked exercise coach that runs entirely in your browser.

It builds a plan from your age, goals, time, equipment, preferences, accessibility needs and health answers, and explains every recommendation with its sources. Deterministic safety rules refer you to a professional when needed. On-device pose tracking counts reps for supported movements.

> **General fitness guidance, not medical care.** Verimove does not diagnose, treat or replace a doctor or physiotherapist. Its content has not been reviewed by a licensed clinician, and its camera tracking has not been medically validated. See [SAFETY_AND_EVIDENCE.md](SAFETY_AND_EVIDENCE.md).

## Quick start

Requirements: Node 20+ (tested on 22.17) and npm 10.

```bash
cd medical-workout
npm install
npm run setup:models   # downloads + verifies the pose model, copies the WASM runtime
npm run dev            # http://localhost:5180
```

Open http://localhost:5180 and choose **Build my plan**. Camera tracking needs `localhost` or HTTPS.

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload (port 5180) |
| `npm run build` / `npm run preview` | Production build / serve it on port 4180 |
| `npm run check` | Typecheck + lint + unit/integration tests + build |
| `npm run test:e2e` | Playwright end-to-end tests (uses installed Microsoft Edge) |
| `npm run setup:models` / `verify:models` | Download / verify model assets |
| `npm run eval:counters` | Replay recorded real-person traces through the rep counters and print precision/recall per exercise (record traces at `/dev/record` in dev; see TEST_PLAN.md §8) |

## Features

- **Onboarding (8 steps):** age with guardian safeguards for minors, goals, activity, schedule, equipment, preferences and accessibility, health screening ("why we ask" on each question), then review and consent.
- **Safety:**
  - Emergency symptoms show urgent-help guidance.
  - Answers that need professional assessment get a referral instead of a plan, with an optional clearance flow.
  - Mild limitations become explained exclusions.
  - An in-session "Stop — I don't feel right" button triages symptoms.
- **Plan engine:** deterministic and time-budgeted (never exceeds your limit), using a 30-exercise structured library. Every prescription cites sources and is labelled as guideline, position stand, systematic review or *product heuristic*. "Why this plan?" shows the full decision trace, assumptions and exclusions.
- **Plans** differ by person: goals, ability, equipment, age and time shape a weekly theme rotation and exercise choice.
- **Layout:** phone or desktop layout is detected automatically (bottom tabs vs. sidebar) and can be overridden in Profile.
- **Workouts:**
  - A check-in suggests rest when you're unwell.
  - Animated demos, then sets, rest timers, pause/resume/restart/skip.
  - Manual or camera tracking, with manual count correction.
  - A summary with self-rated effort (CDC 0–10 scale).
- **Camera tracking:**
  - MediaPipe Pose Landmarker Lite runs on-device.
  - **Every exercise** is camera-trackable: rep counters (joint-angle state machines), hold detectors (timer runs only while you're in position) and movement detectors (marching, walking in place).
  - A full-screen view with a timer in one corner, a rep counter in the other, and a status pill that says plainly whether you're being counted.
  - Optional beep/vibration on each counted rep.
  - Positioning guidance and an "In position" check.
  - Hedged, confidence-gated form cues and a reduced-range mode.
  - The camera can be turned off at any time.
- **Workouts tab:** every exercise in the library to try on its own or mix into a free-play session (camera counting works for all of them). Anything that conflicts with your safety answers is shown but can't be started; free play earns no tokens.
- **Hands-free workouts:** a 5-second "get into position" countdown after you press Start and between exercises, so you never have to walk back to the device.
- **Nutrition (snap a meal):** photograph a plate and an on-device model (EfficientNet-B0 trained on Food-101, MIT, run with ONNX Runtime Web) suggests which of 101 dishes it is. You confirm or change it, pick a portion and log it. Estimates only; photos are never uploaded or stored; numbers can be hidden, and under-18s see an extra note about not using them as targets.
- **Progress:**
  - Weekly consistency against your own plan; paused weeks are protected.
  - Activity minutes against WHO/CDC targets, with logging for other activity.
  - Effort ratings and history.
  - Rule-based "ready to progress" hints, held back after symptom stops.
- **Challenges:** achievements for consistency, learning and choosing rest; a personal goal; an opt-in friends leaderboard using share codes (no health data, youth never compared with adults, private mode); and minigames you play with **tokens** earned from your workouts (Steady Stance, Reaction Reach, Memory Match; the Move Smart Quiz is free). Tokens reward finished workouts in your own plan, never extra volume or pushing through discomfort (ending early earns none), and a weekly garden grows with your consistency.
- **Privacy:** no account, server, analytics or CDN. A CSP blocks all third-party connections. Includes JSON export, delete-everything, a "keep fewer health details" mode, offline support, and a printable summary for a health professional.
- **Accessibility:** seated-only plans, large text, high contrast, reduced motion, keyboard navigation, on-device spoken cues, and axe-tested light and dark themes.

## Pose model: source, verification and loading

| Item | Value |
|---|---|
| Model | MediaPipe Pose Landmarker **Lite**, float16 (`pose_landmarker_lite.task`, 5,777,746 bytes) |
| Downloaded from | `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task`, the URL published on [Google's Pose Landmarker page](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker) (server Last-Modified 2023-04-27) |
| Integrity | MD5 checked against Google Cloud Storage's `x-goog-hash` header and size against `Content-Length`; ZIP bundle structure checked (contains `pose_detector.tflite` and `pose_landmarks_detector.tflite`). SHA-256 `59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a` recorded in `public/models/MODEL_MANIFEST.json` |
| License | Apache-2.0 per the [BlazePose GHUM 3D model card](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20BlazePose%20GHUM%203D.pdf) |
| Runtime | `@mediapipe/tasks-vision` **1.0.1** (Apache-2.0). Its WASM files are copied from `node_modules` into `public/mediapipe/wasm/` |
| Loading | `src/pose/poseModel.ts` fetches the model from this app's origin, validates it, then calls `PoseLandmarker.createFromOptions` with `modelAssetBuffer`. It tries the GPU delegate first and falls back to the CPU delegate (same model). If a file is missing, it shows an actionable error. It never substitutes another model and never uses a CDN |
| Model card limits | Single person, within about 4 m, head visible; quality degrades with poor light, motion and occlusion |

**Privacy note:** `@mediapipe/tasks-vision` 1.x sends usage metrics (not images) to `odml.pa.googleapis.com`. This app's Content-Security-Policy (`connect-src 'self'`) blocks that request, and an end-to-end test verifies the browser blocks it.

## Deploying

Serve `dist/` over HTTPS and send these headers (the dev and preview servers already do):

```
Content-Security-Policy: frame-ancestors 'none'
Permissions-Policy: camera=(self), microphone=(), geolocation=(), payment=(), usb=()
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Cross-Origin-Opener-Policy: same-origin
```

The rest of the CSP is in a `<meta>` tag injected at build time.

## Documentation

- [PROJECT_PLAN.md](PROJECT_PLAN.md): requirements, decisions, milestones
- [ARCHITECTURE.md](ARCHITECTURE.md): modules, model choice, counters, privacy design
- [SAFETY_AND_EVIDENCE.md](SAFETY_AND_EVIDENCE.md): scope, safety rules, evidence registry, verification log, what isn't verified
- [TEST_PLAN.md](TEST_PLAN.md): test layers, results, defects fixed, manual checks not performed
- [COMPETITIVE_REVIEW.md](COMPETITIVE_REVIEW.md): Kaia, Peloton Guide, Sword, Fitbod, NHS Active 10, and the improvements implemented

## Known limitations

- Food recognition knows 101 dishes (Food-101 is biased toward Western dishes), can't judge portion size or hidden ingredients, and its calorie table is a rough average per serving. Treat results as starting points.
- Rep counting, hold timing, movement detection and form cues were tuned on simulated landmarks. **Accuracy with real people is unmeasured**, especially for the newer detectors.
- Exercise content is checked against public NHS guidance but **not clinician-reviewed**.
- Data is in browser localStorage, which is **not encrypted at rest**.
- Leaderboards use honour-system share codes (there's no server to verify them).
- Tested on Windows/Edge plus emulated mobile viewports, not on physical phones.
