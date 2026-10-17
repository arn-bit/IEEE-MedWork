/**
 * Tiny sensory feedback for rep counting: a short tone (Web Audio, generated locally) and a light
 * vibration on phones. Both are optional settings. Nothing is downloaded or recorded.
 */
let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    const AC = globalThis.AudioContext ?? (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx ??= new AC();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** Call from a user gesture (e.g. pressing Start) so browsers allow audio later. */
export function primeAudio() {
  audio();
}

export type Tone = 'rep' | 'target' | 'lost' | 'found';

const TONES: Record<Tone, number[]> = {
  rep: [880],
  target: [660, 880, 1100],
  lost: [300],
  found: [520, 780],
};

export function playTone(kind: Tone, enabled: boolean) {
  if (!enabled) return;
  const c = audio();
  if (!c) return;
  try {
    let t = c.currentTime;
    for (const f of TONES[kind]) {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = 'sine';
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.18, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
      osc.connect(gain).connect(c.destination);
      osc.start(t);
      osc.stop(t + 0.16);
      t += 0.12;
    }
  } catch {
    /* audio unavailable */
  }
}

export function vibrate(pattern: number | number[], enabled: boolean) {
  if (!enabled) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* unsupported */
  }
}
