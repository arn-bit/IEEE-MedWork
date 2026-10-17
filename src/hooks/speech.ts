/**
 * Optional spoken cues via the Web Speech API.
 * Privacy: some browsers offer network (cloud) voices. We only use voices that report
 * `localService === true`, so cue text stays on the device. If no local voice exists, we stay silent.
 */
export function localVoice(): SpeechSynthesisVoice | null {
  try {
    const voices = globalThis.speechSynthesis?.getVoices() ?? [];
    const local = voices.filter((v) => v.localService);
    const lang = (globalThis.navigator?.language ?? 'en').slice(0, 2);
    return local.find((v) => v.lang.startsWith(lang)) ?? local[0] ?? null;
  } catch {
    return null;
  }
}

export function speechAvailable(): boolean {
  return localVoice() !== null;
}

export function speak(text: string, enabled: boolean) {
  if (!enabled) return;
  try {
    const s = globalThis.speechSynthesis;
    const voice = localVoice();
    if (!s || !voice || typeof SpeechSynthesisUtterance === 'undefined') return;
    s.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.voice = voice;
    u.rate = 1;
    s.speak(u);
  } catch {
    /* unsupported */
  }
}
