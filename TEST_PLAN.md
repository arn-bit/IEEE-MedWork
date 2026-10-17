# Test Plan & Results

## 1. How to run

```bash
npm run check          # typecheck + lint + unit/integration tests + production build
npm run test:e2e       # Playwright (production build, Microsoft Edge, ~2.5 min incl. a 65 s telemetry test)
npm run verify:models  # checksums of model + WASM files against MODEL_MANIFEST.json
npm run eval:counters  # replay real-person validation traces in src/pose/fixtures/ (see §8)
```

E2E uses `channel: 'msedge'` (installed with Windows), so no browser download is needed. On other systems, change `channel` in `playwright.config.ts` or run `npx playwright install chromium`.

## 2. Test layers

| Layer | Tool | Files | What it proves |
|---|---|---|---|
| Domain unit | Vitest | `src/domain/**/*.test.ts` | Plan engine, safety rules, evidence integrity, progression, gamification |
| Pose logic | Vitest + synthetic landmarks | `src/pose/counters.test.ts`, `loading.test.ts` | Counting logic, jitter/partial/low-confidence handling, model/camera error paths. **Simulated data: not real-world accuracy** |
| Counter replay | Vitest + recorded landmark traces | `src/pose/replay.test.ts`, `src/pose/fixtures/*.json` | Precision/recall of each counter against people's own "Rep done" taps (§8). Skipped while there are no traces; the harness itself is tested on synthetic traces |
| Storage | Vitest (jsdom) | `src/state/storage.test.ts` | Persistence, corrupt data, export, deletion |
| UI integration | Vitest + Testing Library | `src/test/app.integration.test.tsx` | Routing/redirects, nav, minor guardian gate, dialogs, referral on Home |
| End-to-end | Playwright + axe-core | `e2e/*.spec.ts` | Real browser flows on the production build with strict CSP, real MediaPipe model, fake camera, offline |

## 3. Required tests → where they are

| Requirement | Test(s) | Result |
|---|---|---|
| Short time limit respected | `engine.test.ts` "never exceeds a N-minute limit" (5–90 min × 4 goal mixes) | ✅ |
| Equipment constraints honoured | `engine.test.ts` equipment suite | ✅ |
| Disallowed exercises excluded | pain areas, clinician restrictions, seated-only, balance concern, children/weights, pregnancy | ✅ |
| Preferences respected | disliked exercises test; Swap button (manual check) | ✅ |
| Missing/invalid inputs handled | `engine.test.ts` invalid input table (10 cases) + missing profile | ✅ |
| Assessment-needed users get no plan | `engine.test.ts` safety gating (5 triggers + known condition + minors + under-5); E2E referral test | ✅ |
| Every evidence-dependent recommendation has a valid source | `registry.test.ts` (exercises, rules, generated plans for 5 profiles) | ✅ |
| Reps count only after a valid cycle | `counters.test.ts` per counter | ✅ (simulated) |
| Partial rep not counted | squat, sit-to-stand, wall press-up, arm raise, march | ✅ (simulated) |
| Noise doesn't create false counts | standing jitter 300 frames; threshold hover; single-frame spike; fast bounce | ✅ (simulated) |
| Low confidence pauses/suppresses judgments | hidden knees → `low_confidence`/`lost`, cue null; no rep across a gap | ✅ (simulated) |
| Missing model → actionable error | `loading.test.ts` (404, HTML fallback, network, corrupt) + E2E route 404 | ✅ |
| Camera denial → manual alternative | `loading.test.ts` + E2E (denied, no hardware) | ✅ |
| Navigation & onboarding | E2E onboarding + nav; integration tests | ✅ |
| Session start/pause/resume/complete/review | E2E manual session | ✅ |
| Progress persists across reload | E2E onboarding reload; manual session reload; activity log reload | ✅ |
| Data deletion across storage locations | `storage.test.ts` + E2E delete (localStorage + sessionStorage checked) | ✅ |
| Gamification rules | `rules.test.ts` (18 tests) + E2E quiz/leaderboard/balance | ✅ |
| Mobile & desktop layouts | E2E at 375, 768, 1440 px (no horizontal scroll; compact tab bar) | ✅ |
| Critical accessibility | axe (light + dark) on key screens; skip-link focus; role-based selectors throughout | ✅ |

## 4. Latest run (2026-10-16, Windows 11, Node 22.17, Edge headless)

| Command | Result |
|---|---|
| `npm run typecheck` (TypeScript 6.0.3 strict) | ✅ 0 errors |
| `npm run lint` (ESLint 10 + typescript-eslint + react-hooks 7) | ✅ 0 problems |
| `npm test` (Vitest 5.0.5) | ✅ **154 passed**, 1 skipped (replay of real-person traces: none recorded yet), 11 files |
| `npm run build` (Vite 8.2.4) | ✅ |
| `npm run test:e2e` (Playwright 1.63, Edge) | ✅ **31 passed** (full run); the later "recorder not in production build" test was run on its own with the privacy group (3 passed) |
| `npm run verify:models` | ✅ 7 files match SHA-256 |

## 5. Systematic check: actual results

Legend: ✅ verified · ⚠️ verified with a limitation · ❌ not verified

| Check | Result | Evidence |
|---|---|---|
| App starts | ✅ | Dev server on :5180 and preview on :4180 load without console errors (E2E collects console errors) |
| All routes and nav links work | ✅ | E2E visits 11 routes and clicks all 6 nav links; 404 route renders "Page not found" (manual) |
| New user completes onboarding | ✅ | E2E + manual walkthrough in the built-in browser |
| Plan is coherent from validated inputs | ✅ | Unit tests + manual review of sample plans (knee pain → seated warm-up, no knee-loading moves) |
| Medical limitations handled safely | ✅ | Unit tests for every rule ID; E2E emergency + referral |
| Recommendations linked to credible evidence | ✅ | Registry integrity tests; every source verified by reading it (SAFETY_AND_EVIDENCE.md §3) |
| Camera works when permission is granted | ⚠️ | Real MediaPipe model loads and runs in Edge with a **fake camera**. **Not tested with a real webcam and a real person in this environment.** |
| Camera denial / no hardware | ✅ | E2E: clear message + working manual fallback |
| Rep counters stable | ⚠️ | Stable on simulated sequences (jitter, partial, gaps). **Real-world accuracy unmeasured.** The recorder and replay harness (§8) exist, but no real-person traces have been recorded yet |
| Form feedback avoids unsupported claims | ✅ | Wording tests (no "injure/damage/wrong/bad"); confidence gating; disclaimer under every cue |
| Progress, streaks, leaderboard, minigames | ✅ | Unit + E2E (quiz, balance, leaderboard validation) |
| Reaction game | ⚠️ | Manually reviewed in code; no E2E (random timing) |
| Desktop and mobile layouts | ✅ | E2E 375/768/1440 + manual screenshots (one mobile nav bug found and fixed, see §6) |
| No console or dependency errors | ✅ | E2E asserts zero console errors on all routes; `npm install` reported 0 vulnerabilities |
| Personal and health data protected | ✅ | No network egress (E2E), CSP, security headers, telemetry blocked (E2E), local-voice-only speech |
| User can delete stored data | ✅ | Unit + E2E |
| Loading / empty / error / permission-denied states | ✅ | Model loading message, empty Progress, model/camera errors, corrupt-storage banner, storage-unavailable banner, offline banner |
| Offline | ✅ | E2E reload with network disabled after first visit |
| Voice cues | ❌ | Not verified (headless browser has no audio); code restricts to on-device voices |
| Printing the clinician summary | ⚠️ | Page and print CSS verified to render; the actual print dialog was not exercised |

## 6. Defects found by testing and fixed

| # | Severity | Defect | Fix |
|---|---|---|---|
| 1 | Privacy (critical) | `@mediapipe/tasks-vision` 1.x POSTs usage metrics to Google unconditionally | CSP `connect-src 'self'` + E2E proof it's blocked; disclosed in Privacy Center |
| 2 | Privacy | Browser speech can use cloud voices | Only `localService` voices are used |
| 3 | Safety/evidence | "No weights under 13" was implicitly attributed to AAP | Relabelled as a product heuristic (AAP supports supervised resistance training) |
| 4 | Core | Endurance-only plans could contain no strength work | Strength first; aerobic block capped at 60% of the main time |
| 5 | Core | Short sessions left time unused; warm-up prescribed 35 shoulder rolls | Fill pass adds sets; shoulder rolls fixed at 10 |
| 6 | Core | "Keep fewer health details" checkbox did nothing | Wired to the setting |
| 7 | Core | Timer transitions driven by effects (cascading renders, lint errors) | Transitions moved into the ticker; refs for latest callbacks |
| 8 | Accessibility | Skip link not first in focus order | Focus moves to `<main>` only on route changes, not first load |
| 9 | Accessibility | Muted text, accent badges, locked achievements, dark-mode danger button below 4.5:1 | Token changes; danger-ink token |
| 10 | Usability | Validation errors stayed after the user fixed them | Errors clear on edit |
| 11 | Mobile | Desktop brand/footer rendered inside the mobile tab bar | Specificity fix + E2E height assertion |
| 12 | Security | `frame-ancestors` ignored in meta CSP | Moved to HTTP headers with Permissions-Policy, nosniff, no-referrer |
| 13 | Robustness | Fade-in hid content when animations were throttled | Animation moves only; never hides content |

## 7. Manual checks that could not be performed here

- **Real person + real webcam** rep-counting accuracy, lighting and angle robustness, multi-person scenes. The tooling to measure counting accuracy now exists (§8); no traces have been recorded yet.
- **Physical phones/tablets** (iOS Safari, Android Chrome): only emulated viewports were tested. WebGL/WASM performance on low-end devices is unknown.
- **Screen readers** (NVDA, VoiceOver): automated axe checks only.
- **Clinical review** of exercise content and safety rules.

## 8. Real-person counter validation (recorder + replay)

The rep counters were tuned only on synthetic landmarks. This section describes how to measure how well they agree with real people. **A handful of traces from the team and friends is a smoke test, not clinical validation.** It does not show that the counters are accurate for any population. It is not a study, and its results must not be described in the app or anywhere else as "validated" or "clinically tested".

### 8.1 Tools

| Piece | Where | What it does |
|---|---|---|
| Recorder | `/dev/record` (only in `npm run dev`; the route and its code are absent from production builds) | Consent gate → pick counter, range mode, camera view, lighting and movement label → live skeleton preview → record. Someone taps **Rep done** each time a rep is actually finished. Downloads a JSON trace with a local Blob download. Nothing is uploaded |
| Trace format | `src/pose/replay.ts` (`RepTrace`) | Per frame: time since start (ms) and 33 landmarks × (x, y, z, visibility), or `null` when no person was detected. Plus tap times, counter, range mode and coarse setup labels. **No video, images, names, dates or free text** |
| Replay test | `src/pose/replay.test.ts` (runs in `npm test` / `npm run check`) | Replays every `src/pose/fixtures/*.json` through a fresh `RepCounter` in the recorded range mode. Fails if pooled precision or recall for any counter is below its bar. Skipped when there are no traces |
| Report | `npm run eval:counters` | Prints a per-exercise table (traces, taps, counted, TP/FP/FN, precision, recall, median lag) and a per-trace table. Exits with code 1 if any counter is below its bar |

**Matching.** A counted rep matches a tap when they are at most `toleranceMs` apart (default 1500 ms). Matching is one-to-one, closest pairs first. Precision = matched counts ÷ all counts (false counts lower it). Recall = matched taps ÷ all taps (missed reps lower it). Results are pooled per counter across traces.

**Bars.** The defaults are precision ≥ 90 % and recall ≥ 90 %. Change them per counter in `COUNTER_EVAL_THRESHOLDS` in `src/pose/replay.ts`, or for one run with `REP_EVAL_MIN_PRECISION`, `REP_EVAL_MIN_RECALL` and `REP_EVAL_TOLERANCE_MS` (for example `REP_EVAL_MIN_RECALL=0.8 npm run eval:counters`). These are acceptance bars for the harness. They are separate from the counters' angle thresholds, which this tooling does not change. If a counter fails, log the result and investigate. Do not lower the bar or re-tune thresholds on the same traces you report, because that overfits to them.

### 8.2 Consent and data handling

1. **Who.** Adults (18+) who can exercise safely without supervision and who agree to take part. Do not record minors. Do not record anyone who has been told not to exercise, has unexplained pain, or answers "yes" to any of the app's safety questions. Patients are out of scope: recording people in a clinical setting needs an approved study protocol and ethics review.
2. **Explain before recording.** Tell the person what is stored (body point positions over time and tap times, no video) and where it goes (a JSON file on this computer, and, if they agree, committed to `src/pose/fixtures/` in this repository). Tell them who can see it (anyone with repository access), that they can stop at any time, and that they can ask later for their trace to be deleted. The person ticks the consent box themselves. Unticking it stops the camera and discards anything not yet downloaded.
3. **Keep consent records outside the trace.** Keep a private log that maps each trace file name to the person's consent (date and how it was given). Do not put that log in this repository, and do not rename trace files to include names.
4. **Minimise.** Use only the coarse movement label (typical range / limited range / uses support). Never put diagnoses, conditions, medications, age, sex or other health details in the trace, the file name or the commit message.
5. **Withdrawal.** If someone withdraws, delete their trace files. If the files were pushed, remove them from the repository history too.
6. **Safety while recording.** Exercise within a comfortable range only. Use a stable chair or wall when needed and clear the floor. Have a second person present for anyone with balance concerns. Stop on pain, dizziness or breathlessness and follow the app's stop-signs guidance.

### 8.3 Recording protocol

1. Run `npm run setup:models` and `npm run dev`, then open http://localhost:5180/dev/record in Chrome or Edge.
2. Tick consent. Choose the counter, the range mode (standard or reduced), the **actual** camera view, the lighting and the movement label. These are locked while the camera is on.
3. Place the camera at about hip height, 2–3 m away (never more than 4 m), so that every body part the counter needs is in view. The setup hint and on-screen position messages say what is missing. Make sure only one person is in frame.
4. Start the camera and check that the skeleton follows the person. Then press **Start recording** and begin with about 2 s of standing still (or sitting still, for sit-to-stand).
5. Do **8–12 reps** at a natural pace. In the same trace or a separate one, also include 2–3 deliberately partial reps (**do not** tap these), a pause, and a few faster reps. Where it is safe, also step briefly out of frame. These are the cases that cause false counts.
6. **Ground truth.** Tap **Rep done** once at the moment each full rep ends (back at the start position). Ideally a second person taps while watching, because tapping while exercising changes the movement. The exerciser can instead use a presentation clicker or Bluetooth keyboard: Space, Enter, → or Page Down = rep done; Backspace, ← or Page Up = undo. The app's own count is hidden during recording so that it cannot bias the taps.
7. Press **Stop recording** and check the summary (tap count, % of frames with a person detected). Then press **Download JSON** and move the file into `src/pose/fixtures/`. A one-minute trace is about 1–2 MB.
8. Run `npm run eval:counters` and add the table, date and app version to the results log below.

### 8.4 Coverage: what to include

Cover each counter across the conditions below before drawing any conclusion about it. Record at least 2 traces per person per counter, from at least 5 different people per counter.

| Factor | Include |
|---|---|
| Camera angle | The counter's recommended view (squat: front **and** side; sit-to-stand and wall press-up: side; arm raise: front and side; knee lifts: front). Also one trace about 30–45° off-axis, and one with the camera low (on a table) as well as at hip height |
| Distance | About 2 m and about 3.5 m |
| Lighting | Bright and even; normal indoor; dim (one lamp); backlit (window behind the person) |
| Clothing and background | Fitted and loose clothing (for example a long skirt or baggy trousers); plain and cluttered backgrounds |
| Body types | A range of heights and body sizes, including larger bodies, where soft tissue and clothing can hide joints. A range of skin tones, because pose models can perform differently across skin tones, especially in low light |
| Age | Younger adults and adults over 65, who are a main audience for the app |
| Mobility | Typical range. **Limited range**, recorded in **reduced** range mode. People who use support (chair arms for sit-to-stand, a wall or rail for knee lifts). Seated arm raises. Slow movers. Never ask anyone to move beyond their comfortable range |
| Assistive devices | Where safe and relevant: a walking stick or frame next to the person, and wheelchair users for arm raises |

Report results per subgroup as well as pooled. The per-trace table shows view, lighting and movement label for this. A counter that works for young, fit people facing the camera in good light but fails for older or limited-range users is a real failure for this app.

### 8.5 Limits of this method

- Ground truth is a human tap. It has reaction-time lag (the median lag column shows the offset), and it depends on the tapper agreeing with the app about what counts as a complete rep. The tolerance window absorbs lag, not disagreement.
- The traces are a convenience sample. There is no sample-size calculation, no blinding and no independent rater, so the results will not generalise beyond the people and setups recorded.
- Only rep **counting** is measured. Form cues (such as "knees appear to move inward") are not evaluated by this harness.
- Replay uses the landmarks that Pose Landmarker Lite produced on the recording device. A different model version, browser or device can produce different landmarks. Each trace stores the model name.
- Clinical validation would need an approved protocol, a defined population, a reference standard (for example video rated by two independent assessors, or motion capture) and accuracy targets set in advance. This tool provides none of these.

### 8.6 Results log

| Date | App version | Traces (people) | Summary | Notes |
|---|---|---|---|---|
| — | — | 0 (0) | No real-person traces recorded yet | Harness verified on synthetic traces only |
