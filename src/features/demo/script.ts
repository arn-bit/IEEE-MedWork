/**
 * The live demo, as data. The scenes follow the order of the presentation: workflows, pose tracking,
 * nutrition, gamification, the AI models, limits and references, comparison, privacy. Every scene has a
 * fixed duration so the whole thing runs in exactly 90 seconds at normal speed, and every scene has
 * speaker notes for the presenter.
 */

export type SceneId = 'workflows' | 'pose' | 'food' | 'rewards' | 'models' | 'limits' | 'compare' | 'privacy';

export interface SceneDef {
  id: SceneId;
  /** Short label for the progress bar. */
  label: string;
  ms: number;
  headline: string;
  sub: string;
  /** What to say, in one or two sentences. */
  notes: string;
}

export const SCENES: readonly SceneDef[] = [
  {
    id: 'workflows',
    label: 'Workflows',
    ms: 18000,
    headline: 'Workflows',
    sub: 'Your words in, a safe and explained plan out',
    notes:
      'People describe their health in plain words. Fixed, testable rules find the injury and the goal and show exactly what was understood, and an alarming answer stops the plan and sends you to a professional. Then the plan engine builds a week from the same answers every time, leaves out what loads the sore knee, and links each exercise to its source.',
  },
  {
    id: 'pose',
    label: 'Pose tracking',
    ms: 12000,
    headline: 'Pose tracking',
    sub: 'On-device body tracking counts every exercise, hands-free',
    notes:
      'An on-device pose model finds 33 body points in every video frame, and joint angles become reps, holds and movement time. A five-second countdown means you never walk back to the device, and a status line always says whether it is counting. The movement here is simulated; the live camera works the same way and the video never leaves the device.',
  },
  {
    id: 'food',
    label: 'Nutrition',
    ms: 10000,
    headline: 'Nutrition',
    sub: 'Photo in, plate totals out, read on the device',
    notes:
      'A photo of a plate is read on the device by two open-source models working together. Each food is found, the amount is estimated from the picture, and the daily-value bars fill. Amounts are estimates, and if it gets something wrong you label it once and it learns, on the device.',
  },
  {
    id: 'rewards',
    label: 'Gamification',
    ms: 8000,
    headline: 'Gamification',
    sub: 'Rewards for finishing workouts, never for overdoing it',
    notes:
      'Finished workouts earn tokens, capped to the plan so there is no reason to overtrain, and stopping early earns nothing. Tokens buy relaxing mini games that are not exercise, and a garden grows with weekly consistency.',
  },
  {
    id: 'models',
    label: 'AI models',
    ms: 12000,
    headline: 'AI models & use',
    sub: 'Four open-source parts, all running in the page',
    notes:
      'The camera feed goes to MediaPipe Pose Landmarker for body points. A meal photo goes to CLIP, which matches over 300 foods, and to an EfficientNet-B0 trained on Food-101, whose votes are combined. ONNX Runtime Web runs both food models in the browser. We trained none of them; the safety rules and the plan engine are ordinary tested code, not AI.',
  },
  {
    id: 'limits',
    label: 'Limits & refs',
    ms: 10000,
    headline: 'Limits & references',
    sub: 'What this does not do yet, and where the evidence comes from',
    notes:
      'We are upfront about the limits: it is not yet validated on real people, food amounts are estimates, it has not been reviewed by a clinician, and it is general fitness guidance, not medical advice. The models and the exercise guidance come from published work, listed here and in the app.',
  },
  {
    id: 'compare',
    label: 'Comparison',
    ms: 10000,
    headline: 'Comparison',
    sub: 'Verimove against a typical general exercise app',
    notes:
      'This is a general comparison of common app features, not a test of any named product. The differences are that every pick is explained, safety rules run before any plan, camera counting covers every exercise, and meal photos and privacy need no account or upload.',
  },
  {
    id: 'privacy',
    label: 'Privacy',
    ms: 10000,
    headline: 'Privacy',
    sub: 'No account. No uploads. Works offline.',
    notes:
      'No account, no server, no uploads. The security policy blocks every outside connection, and the whole app works offline. Every recommendation is linked to evidence or labelled as a product heuristic. Thank you.',
  },
];

export const TOTAL_MS = SCENES.reduce((a, s) => a + s.ms, 0);

/** Which scene is playing at time `t` (ms), how far into it, and how far through it (0..1). */
export function sceneAt(t: number): { index: number; elapsed: number; progress: number; done: boolean } {
  const clamped = Math.max(0, t);
  let acc = 0;
  for (let i = 0; i < SCENES.length; i++) {
    const s = SCENES[i]!;
    if (clamped < acc + s.ms) return { index: i, elapsed: clamped - acc, progress: (clamped - acc) / s.ms, done: false };
    acc += s.ms;
  }
  const last = SCENES.length - 1;
  return { index: last, elapsed: SCENES[last]!.ms, progress: 1, done: true };
}

/** Start time (ms) of a scene. */
export function sceneStart(index: number): number {
  let acc = 0;
  for (let i = 0; i < Math.max(0, Math.min(index, SCENES.length)); i++) acc += SCENES[i]!.ms;
  return acc;
}

export const formatClock = (ms: number) => {
  const s = Math.max(0, Math.min(TOTAL_MS, ms)) / 1000;
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
};
