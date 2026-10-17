# Medical Workout — Project Plan

## 1. Starting point (Stage A inspection, 2026-10-16)

- Working folder `C:\Users\aarin\New folder` held one unrelated project, `fitcoach-ai/` (vanilla TS, soccer and coaching features). **Nothing from it was reused.** Medical Workout is a new project in `medical-workout/`, with its own design system and architecture.
- Environment: Windows 11, Node 22.17, npm 10.9, Python 3.11, git. There's no backend infrastructure, accounts or cloud database, so the build is **local-first**.

## 2. Product requirements (ranked)

| # | Requirement | Why it ranks here |
|---|---|---|
| R1 | Deterministic safety screening that blocks plans when professional assessment is needed, plus an emergency escalation | Safety comes first; an LLM never overrides these rules |
| R2 | Evidence registry with verified sources; every prescription links to sources and is labelled by evidence type | Trust and transparency are the core value proposition |
| R3 | Rule-based plan engine that respects time, equipment, restrictions, preferences and age | Core functionality |
| R4 | Guided session runner (warm-up → sets/rest → cool-down → summary) with manual tracking | Must work without a camera |
| R5 | On-device pose tracking with exercise-specific rep counters and limited, explainable form cues | Differentiating feature |
| R6 | Progress, fair streaks, achievements, opt-in pseudonymous leaderboard, at least 2 minigames | Supports healthy habits |
| R7 | Privacy: local storage, export, full deletion, no video leaving the device, blocked third-party telemetry | Health data is sensitive |
| R8 | Responsive, accessible, reduced-motion-aware UI | Usability |

## 3. Key technical decisions

| Decision | Choice | Reason |
|---|---|---|
| Framework | React 19.2 + TypeScript 6.0 (strict) + Vite 8.2 | Requested stack; current stable versions |
| Routing | react-router 7.18 | Stable, well documented |
| Styling | Hand-built CSS design tokens + component classes | No external font/CDN requests (privacy); full control |
| Pose model | MediaPipe Pose Landmarker **Lite** (`@mediapipe/tasks-vision` 1.0.1) | Runs on device in WASM/WebGL, 33 landmarks including heels and feet, Apache-2.0, model card lists "fitness and repetition counting" as an intended use. Lite (5.8 MB) was chosen over Full (9.4 MB) and Heavy (30.7 MB) for load time on phones. Comparison in ARCHITECTURE.md |
| Telemetry | Content-Security-Policy `connect-src 'self'` | `@mediapipe/tasks-vision` 1.x POSTs usage metrics (not images) to `odml.pa.googleapis.com`; the CSP blocks this so nothing leaves the device |
| Storage | `localStorage` behind a versioned, validated repository module | Small data volume; easy to wipe and export |
| Tests | Vitest + Testing Library (jsdom), Playwright with Chromium (fake camera) | Unit, integration and E2E |
| AI/LLM | **None.** Explanations come from the deterministic rule trace | Avoids fabricated AI output and keeps safety logic testable |

## 4. Milestones and acceptance criteria

| M | Milestone | Acceptance criteria (evidence needed) |
|---|---|---|
| M0 | Scaffold, toolchain, model assets | `npm run typecheck`, `lint`, `test` and `build` run; `npm run verify:models` passes (checksums) |
| M1 | Domain core: evidence registry, exercise library, safety screening, plan engine | Unit tests: time limit respected, equipment honoured, restricted exercises excluded, preferences respected, invalid input rejected, assessment-needed users get no plan, every evidence reference resolves |
| M2 | App shell, design system, onboarding | All 6 nav areas render with empty states; onboarding validates and needs consent; integration test completes onboarding |
| M3 | Plan view + "Why this recommendation?" | Each exercise shows purpose, parameters, alternatives, sources and evidence level |
| M4 | Session runner (manual) + symptom stop + summary | Start, pause, resume, complete and review a session; the stop flow surfaces guidance and pauses the streak |
| M5 | Pose pipeline + counters + form cues | Simulated landmark tests: full cycle counts, partial does not, jitter does not, low confidence suppresses cues; missing model gives an actionable error; camera denial falls back to manual. Real model loads in Chromium (E2E) |
| M6 | Progress, gamification, minigames, leaderboard | Unit tests for streak and achievement rules; share-code validation; 3 minigames playable |
| M7 | Privacy controls | Export works; delete wipes every storage location (test) |
| M8 | Competitive review + improvements | COMPETITIVE_REVIEW.md with at least 3 products and at least 5 improvements, appropriate ones implemented |
| M9 | Check / fix / final review | Checklist of actual results in TEST_PLAN.md; E2E at mobile and desktop sizes; browser walkthrough |

## 5. Known risks and unknowns

- **2D pose accuracy** varies with camera angle, clothing, lighting and body differences. Counters are conservative and form cues are limited and hedged. Simulated tests are not presented as real-world accuracy.
- **No real person on camera in automated tests.** Chromium's fake camera shows a test pattern, so E2E can prove the model loads and runs and handles "no body detected", but not that counting is accurate on real people. This is documented as unverified.
- **Leaderboards without a server** can't be authoritative. They use an honour-system, opt-in share-code design with point caps, documented as such.
- **Content review**: exercise instructions are written in our own words, informed by NHS exercise pages. They have **not** been reviewed by a licensed clinician; the UI and docs say so.

## 6. Status (2026-10-16)

| M | Status | Evidence |
|---|---|---|
| M0 | ✅ | typecheck/lint/test/build all pass; `verify:models` passes |
| M1 | ✅ | 56 engine tests, 12 screening tests, 5 registry tests |
| M2 | ✅ | E2E onboarding + navigation; integration tests |
| M3 | ✅ | E2E "Why?" dialogs |
| M4 | ✅ | E2E manual session, check-in rest path, stop/emergency |
| M5 | ⚠️ | Simulated-landmark tests pass; real model loads and runs in Edge (fake camera). **Real-person accuracy not measured.** |
| M6 | ✅ | 18 gamification tests + E2E quiz/leaderboard/balance |
| M7 | ✅ | Unit + E2E export/delete; CSP/telemetry blocking proven in E2E |
| M8 | ✅ | COMPETITIVE_REVIEW.md: 6 products, 6 improvements implemented and tested |
| M9 | ✅ | TEST_PLAN.md §5–§7 (13 defects found and fixed; manual checks not performed are listed) |
