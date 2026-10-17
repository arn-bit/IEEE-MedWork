# Competitive Review

Researched on 2026-10-16. Capabilities below come from each product's own pages, help centres or reviews found during research. **Most claims are self-reported by the companies and were not independently verified.** We tested none of these products hands-on, and nothing proprietary (designs, code, content) was copied.

## Products reviewed

| Product | Category | Why it's relevant | Sources |
|---|---|---|---|
| **Kaia Health – Motion Coach** | Digital MSK therapy | Phone-camera movement feedback for therapeutic exercise | [kaiahealth.com/motion-coach](https://kaiahealth.com/motion-coach/), [Kaia help centre](https://kaiahealth.zammad.com/help/en-us/18-motion-coach/60-how-does-the-kaia-motion-coach-work), [MobiHealthNews on JMIR study](https://www.mobihealthnews.com/news/digital-msk-therapy-tool-kaia-gives-equally-reliable-exercise-recommendations-physiotherapists) |
| **Peloton Guide** | Connected strength / camera | Camera rep counting, "Movement Tracker", privacy controls | [Tom's Guide review](https://www.tomsguide.com/reviews/peloton-guide-review), [Peloton press release](https://investor.onepeloton.com/news-releases/news-release-details/peloton-introduces-peloton-guide-first-connected-strength/) |
| **Sword Health** | Clinician-led digital physical therapy | Gold-standard comparator for "rehab", which we deliberately do *not* do | [Utah Business](https://www.utahbusiness.com/sword-health-is-changing-physical-therapy-in-utah), [Sword kit page](https://go.swordhealth.com/rs/675-GJP-011/images/iterablesample.html) |
| **Fitbod** | Algorithmic strength programming | Personalization from history, recovery and equipment | [Fitbod help: How Fitbod creates your workout](https://help.fitbod.me/hc/en-us/articles/360004429814-How-Fitbod-Creates-Your-Workout), [Fitbod blog](https://fitbod.me/blog/fitbod-algorithm) |
| **NHS Active 10** | Public-health activity app | Evidence-based, free, simple brisk-walking tracking | [App Store listing](https://apps.apple.com/gb/app/nhs-active-10-walking-tracker/id1204295312) |
| **LearnOpenCV "AI Fitness Trainer" (MediaPipe)** | Open-source tutorial | Reference for MediaPipe angle-based squat analysis | [learnopencv.com](https://learnopencv.com/ai-fitness-trainer-using-mediapipe) |

### What each one appears to do (as reported)

- **Kaia Motion Coach**: uses the phone's front camera with no wearables and gives real-time audio guidance, rep counting and hold-duration cues. Its help centre says it is "currently not available for all exercises". A small company-highlighted study in people with knee/hip osteoarthritis reported correction accuracy comparable to physiotherapists. The help page we read **does not say** whether video is processed on the device.
- **Peloton Guide**: a camera device with a subscription. It does rep counting and a Movement Tracker for strength classes. Peloton states that no video or images are uploaded and that processing happens on the device. The camera has a physical cover and the microphone a physical switch. One reviewer noted that its privacy policy reserves possible future biometric uses, and another reported unreliable tracking when a second person was in frame.
- **Sword Health**: a licensed PT designs and supervises the program, using wearable motion sensors or computer vision on a supplied tablet. The PT checks in about twice a week and adjusts the program from the data. It is mostly sold through employers and insurers.
- **Fitbod**: an algorithm that uses preferences, history and equipment, scores muscle recovery, and estimates 1RM to adjust load. The exact model isn't published and there's no independent evaluation.
- **NHS Active 10**: free and government-developed. It counts brisk walking minutes using phone sensors, includes a "Pace Checker", and offers goals, rewards and 12 months of history.
- **LearnOpenCV tutorial**: MediaPipe Pose joint angles with beginner/pro thresholds for squat feedback. It's a tutorial rather than a product, with no safety screening.

## Comparison

Rating key: ●●● strong, ●● adequate, ● limited, ○ absent, ? not verifiable from public sources.

| Dimension | Verimove (this build) | Kaia | Peloton Guide | Sword | Fitbod | NHS Active 10 |
|---|---|---|---|---|---|---|
| Ease of onboarding | ●● 8 short steps (~4 min), skip-able health step | ? | ● hardware + subscription | ● employer enrolment + PT intake | ●● | ●●● |
| Personalization | ●● goals, time, equipment, age, restrictions, preferences; deterministic | ●● condition programs | ●● class-based | ●●● PT-designed | ●●● history-driven | ● walking only |
| Scientific transparency | ●●● every prescription cites a source and labels heuristics; public decision trace | ● study claims | ○ | ●● published studies (company-sponsored) | ● blog citations | ●● NHS-backed, little in-app citation |
| Exercise demonstrations | ●● original animated figures + steps; no video | ●●● video | ●●● instructor video | ●●● video | ●●● video | ○ |
| Camera rep counting | ●● 5 movement families, conservative; not validated on real users | ●●● (claimed) | ●● (mixed reviews) | ●● (sensors/CV) | ○ | ○ |
| Form feedback | ● deliberately limited, hedged, confidence-gated | ●●● (claimed) | ● | ●●● (PT + data) | ○ | ○ |
| Accessibility | ●● seated plans, large text, contrast, reduced motion, keyboard, axe-tested | ? | ? | ? | ? | ●● |
| Privacy & security | ●●● no account, local-only, CSP blocks third-party traffic incl. MediaPipe metrics; delete/export | ? | ●● on-device claim + physical cover | ● clinical data shared with PT (by design) | ● cloud account | ●● |
| Motivation & progress | ●● weekly consistency with pauses, capped points, opt-in friends board, 3 games | ? | ●● | ●● | ●● | ●● rewards for brisk minutes |
| Safety escalation | ●●● emergency + referral rules, in-session stop | ? | ○ | ●●● clinician oversight | ○ | ● |
| Cost | Free, open | Paid / insured | Hardware + subscription | Employer/insurer | Subscription | Free |

### Where Verimove is weaker

- **No clinician review of content** and **no validation of camera counting on real users.** Kaia and Sword both cite studies. This is the biggest trust gap.
- **Demonstrations are stick figures**, not instructor video. That's clear enough for setup but less engaging.
- **There is no backend.** Friends leaderboards use share codes on an honour system, and there's no cross-device sync.

### Where Verimove is differentiated

- It **shows its work.** The rule trace, labelled evidence types and verified sources go further than anything else reviewed.
- It is **conservative by design.** It refers people on instead of attempting rehab, and it never pushes through symptoms to protect a streak.
- It is **private by architecture**, not just by policy. A CSP prevents any third-party connection, and the test suite proves MediaPipe's metrics POST is blocked.

## Improvements identified and implemented

| # | Improvement | Inspired by | Status | Where |
|---|---|---|---|---|
| 1 | **"In position" readiness indicator.** The camera view shows a clear check mark once every required joint is visible and confidence is adequate, alongside the positioning hints. | Kaia / Peloton camera setup | ✅ Implemented | `CameraTracker.tsx` |
| 2 | **Camera on/off control mid-session.** Turning it off fully stops the stream (camera light off) and switches to buttons. It's a software equivalent of Peloton's lens cover. | Peloton physical privacy controls | ✅ Implemented + E2E test (stream `readyState` checked) | `SessionRunner.tsx`, `e2e/camera.spec.ts` |
| 3 | **Printable summary for a health professional.** It holds the answers, rules applied, current plan, 8-week consistency and sessions stopped for symptoms. It's generated locally and printed or saved by the user. It's also linked from the referral screen. | Sword's PT feedback loop (without sending data anywhere) | ✅ Implemented + E2E test | `SummaryPage.tsx` |
| 4 | **Rule-based progression hints.** After two sessions in 21 days beating the target by ≥2 reps (ACSM 2009), the app suggests the harder variant or more reps. It never acts automatically, never suggests a variant the plan excluded, and **holds** for 7 days after a session stopped for symptoms. | Fitbod's history-based progression, made transparent | ✅ Implemented + 6 unit tests + E2E | `domain/plan/progression.ts` |
| 5 | **Weekly activity minutes + "log other activity".** Moderate-equivalent minutes (vigorous ×2) are tracked against WHO/CDC targets (150 min adults; 60 min/day youth). Light activity is shown but not counted, framed as "every minute counts". | NHS Active 10 | ✅ Implemented + unit/E2E tests | `ActivityLog.tsx` |
| 6 | **Offline support.** A service worker caches only the app's own files and the model, and an offline banner explains what works. | Offline-capable fitness apps generally | ✅ Implemented + E2E offline reload test | `public/sw.js` |

### Deliberately **not** adopted

- **Range-of-motion "measurements"** (Kaia markets flexibility and ROM assessment). 2D webcam angles aren't validated for this, and showing them as numbers would overstate accuracy.
- **Automatic load progression** (Fitbod). Every change stays a user-visible suggestion with its rule shown.
- **Daily streaks / push notifications.** They risk guilt-based engagement and exercising while ill.
- **Cloud accounts.** Not without a lawful basis review, a server-side authorization design, and a decision about which health-data laws apply (see SAFETY_AND_EVIDENCE.md).

## Next highest-value improvements (not built)

1. Clinician review of the exercise library and safety rules (licensed PT/physician sign-off, recorded per item).
2. A real-user validation study of each counter, with consented, locally recorded landmark traces only, published per-exercise accuracy, and thresholds tuned to it.
3. Short, captioned, licensed demonstration videos alongside the figures.
4. Optional end-to-end encrypted sync (local key), only after a legal and regulatory review.
