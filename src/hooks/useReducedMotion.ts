import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

function subscribe(cb: () => void) {
  const mql = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(QUERY) : null;
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-motion'] });
  mql?.addEventListener?.('change', cb);
  return () => {
    obs.disconnect();
    mql?.removeEventListener?.('change', cb);
  };
}

function snapshot(): boolean {
  if (document.documentElement.dataset.motion === 'reduce') return true;
  return typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(QUERY).matches;
}

/** True when the OS prefers reduced motion or the user turned it on in settings. */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
