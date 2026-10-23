# One-minute demo: presenter's guide

Verimove has a built-in **Demo mode** that tells the whole story in exactly 60 seconds. It is a tab in the app's own navigation (sidebar on desktop, **More → Demo mode** on a phone), plus a link on the landing page. The address is `/demo`; add `?autostart=1` to start it automatically.

It is self-contained. It runs the app's **real engines** (health-text analysis, plan generation, rep counting, food recognition) on a made-up person, and it never reads or writes your own data, even if your profile is locked.

## Before you present (30 seconds)

1. Open the site once **online** so the models are cached, then open **Demo mode**.
2. Wait for the three ticks on the start card: *On-device AI ready*, *Sample plate already read on this device* and *No network needed once loaded*. The **Start** button stays disabled until the AI is ready. This keeps the demo smooth, because loading the models briefly occupies the page.
3. Press **F** for full screen. Use a 16:9 display (1280 × 720 or larger looks best).
4. Optional: turn on **Notes** (press **N**) on the presenter's screen to see the talking points.

## Controls

| Key | What it does |
|---|---|
| Space | Start, pause, resume (or replay at the end) |
| → / ← | Next scene / back to the start of this scene |
| N | Show or hide the speaker notes |
| S | Relaxed pace (about 90 seconds) |
| R | Restart |
| F | Full screen |
| Esc | Leave Demo mode |

You can also click any scene in the bar at the bottom.

## The 60 seconds

| Time | Scene | What you see | What to say |
|---|---|---|---|
| 0:00 – 0:05 | **Intro** | Logo and three pillars | Verimove is an exercise coach built on three ideas: it explains every recommendation, safety comes from fixed rules and not guesses, and nothing leaves your device. |
| 0:05 – 0:14 | **Tell it your way** | A sentence is typed; the app's real analyser lists what it understood. Then a chest-pain sentence stops the plan. | People describe their health in their own words. Fixed, testable rules pick out the injury and the goal and show exactly what was understood. When an answer is alarming, no plan is made. That is decided by rules, not by an AI's guess. |
| 0:14 – 0:23 | **A plan that explains itself** | A real weekly plan, with the reason and the guideline behind each exercise | The plan engine is deterministic: the same answers give the same plan. Exercises that load the sore knee are left out, and each recommendation links to the public-health guidance behind it. |
| 0:23 – 0:35 | **Camera counting** | Full-screen workout view: timer, rep counter, status line, a 5-second hands-free countdown | An on-device pose model counts reps, times holds and spots movement for every exercise in the library. The countdown means you never walk back to the device, and the status line always says whether it is counting. **The movement here is simulated; the live camera works the same way.** |
| 0:35 – 0:43 | **Earn tokens, play for fun** | Token counter, three reward games, a garden that grows | Finished workouts earn tokens, capped to the plan so there is no reason to overtrain. Tokens buy relaxing games that are not exercise. |
| 0:43 – 0:53 | **Snap a meal** | A photo of a burger and chips is read on the device: two foods, amounts, whole-plate totals, daily-value bars filling | A photo of a plate is read on the device by two open-source models. Each food is found, the amount is estimated from the picture, and the daily-value bars fill. If it is wrong, you label it and it learns, on the device. |
| 0:53 – 1:00 | **Private by design** | 0 accounts, 0 uploads, a live count of requests to other sites (0), works offline | No account, no uploads, no outside connections, and it works offline. Every recommendation is linked to evidence or labelled as a product heuristic. Thank you. |

## Be upfront about these (reviewers will ask)

- The camera scene uses **simulated body landmarks** (clearly labelled on screen) driving the real rep counter. It shows the interface and the counting logic. It is not a video of a real person.
- Camera counting, hold timing and movement detection were **tuned on simulated landmarks and have not been validated on real people**. The app says so in its About page.
- Food recognition uses two open-source models (EfficientNet-B0 on Food-101, and OpenAI's CLIP). Amounts are guesses from how much of the plate each food covers, and calories come from a rough per-serving table. They are estimates, not measurements.
- Exercise content is checked against public guidance but has **not been reviewed by a clinician**. The app gives general fitness guidance, not medical advice.

## If something goes wrong

- **The AI is slow to load** (first visit, slow connection): the Start button waits up to 45 seconds, then starts anyway, and the nutrition scene falls back to a prepared result so the timeline never stalls.
- **Projector or laptop is offline:** the demo works offline once it has loaded once while online.
- **You need more time:** press **S** for the relaxed pace, or pause with Space and talk.
- **You lost your place:** use the scene bar at the bottom, or **R** to restart.

## How it was checked

The timeline totals exactly 60 seconds (unit-tested). A browser test runs the demo start to finish in real time and checks it ends on the thank-you screen in under 62 seconds with no errors and no requests to other sites. Other tests cover pausing, jumping between scenes, the Demo mode tab, and accessibility of every scene.
