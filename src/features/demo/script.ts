/**
 * The one-minute demo, as data. Every scene has a fixed duration so the whole thing runs in exactly
 * 60 seconds at normal speed, and every scene has speaker notes for the presenter.
 */

export type SceneId = 'title' | 'words' | 'plan' | 'camera' | 'rewards' | 'food' | 'privacy';

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
    id: 'title',
    label: 'Intro',
    ms: 5000,
    headline: 'Movement you can verify',
    sub: 'A private exercise coach that shows its work',
    notes: 'Verimove is an exercise coach built on three ideas: it explains every recommendation, safety comes from fixed rules and not guesses, and nothing ever leaves your device.',
  },
  {
    id: 'words',
    label: 'Your words',
    ms: 9000,
    headline: 'Tell it your way',
    sub: 'Plain words in, transparent findings out',
    notes: 'People describe their health in their own words. Fixed, testable rules pick out the injury, the symptom and the goal, and show exactly what was understood. Nothing is a black box.',
  },
  {
    id: 'plan',
    label: 'Safe plan',
    ms: 9000,
    headline: 'A plan that explains itself',
    sub: 'Deterministic, safety-first, linked to guidance',
    notes: 'The plan engine is deterministic: the same answers always give the same plan. Exercises that load the sore knee are left out, and each recommendation links to the public-health guidance behind it.',
  },
  {
    id: 'camera',
    label: 'Camera',
    ms: 12000,
    headline: 'Camera counting for every exercise',
    sub: 'On-device pose tracking, hands-free',
    notes: 'An on-device pose model counts reps, times holds and spots movement for every exercise in the library. A five-second countdown means you never walk back to the device, and a status line always says whether it is counting. The movement here is simulated; the live camera works the same way.',
  },
  {
    id: 'rewards',
    label: 'Rewards',
    ms: 8000,
    headline: 'Earn tokens, play for fun',
    sub: 'Rewards for finishing workouts, never for overdoing it',
    notes: 'Finished workouts earn tokens, capped to the plan so there is no reason to overtrain. Tokens buy relaxing mini games that are not exercise, and a garden grows with weekly consistency.',
  },
  {
    id: 'food',
    label: 'Nutrition',
    ms: 10000,
    headline: 'Snap a meal',
    sub: 'Two open-source models, running on the device',
    notes: 'A photo of a plate is read on the device by two open-source models. Each food is found, the amount is estimated from the picture, and the daily-value bars fill. If it gets something wrong, you label it and it learns, on the device.',
  },
  {
    id: 'privacy',
    label: 'Private',
    ms: 7000,
    headline: 'Private by design',
    sub: 'No account. No uploads. Works offline.',
    notes: 'No account, no server, no uploads. The security policy blocks every outside connection, and the whole app works offline. Every recommendation is linked to evidence or labelled as a product heuristic. Thank you.',
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
