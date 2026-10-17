import { useEffect, useState } from 'react';

export type Layout = 'phone' | 'desktop';
export type LayoutPreference = 'auto' | 'phone' | 'desktop';

export interface LayoutEnv {
  width: number;
  height: number;
  coarsePointer: boolean;
  touchPoints: number;
}

/**
 * Decide which layout to use. Pure so it can be tested.
 *  - A touch-first device (coarse pointer) whose short side is phone-sized gets the phone layout,
 *    even in landscape.
 *  - A narrow window gets the phone layout whatever the device.
 *  - Everything else (mouse/trackpad, or a large tablet) gets the desktop layout.
 */
export function resolveLayout(pref: LayoutPreference, env: LayoutEnv): Layout {
  if (pref !== 'auto') return pref;
  const short = Math.min(env.width, env.height);
  // Touch-first means the PRIMARY pointer is coarse. Touchscreen laptops report touch points but have a mouse/trackpad, so they stay desktop.
  const touchFirst = env.coarsePointer;
  if (touchFirst && short < 820) return 'phone';
  if (env.width < 700) return 'phone';
  return 'desktop';
}

export function readEnv(): LayoutEnv {
  const mm = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia.bind(window) : null;
  return {
    width: typeof window === 'undefined' ? 1280 : window.innerWidth,
    height: typeof window === 'undefined' ? 800 : window.innerHeight,
    coarsePointer: !!mm?.('(pointer: coarse)').matches,
    touchPoints: typeof navigator === 'undefined' ? 0 : (navigator.maxTouchPoints ?? 0),
  };
}

/** Keeps `<html data-layout>` in sync with the device and the user's preference. */
export function useApplyLayout(pref: LayoutPreference): Layout {
  const [layout, setLayout] = useState<Layout>(() => resolveLayout(pref, readEnv()));
  useEffect(() => {
    const update = () => setLayout(resolveLayout(pref, readEnv()));
    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, [pref]);
  useEffect(() => {
    document.documentElement.dataset.layout = layout;
  }, [layout]);
  return layout;
}

/** Set before first paint so there's no flash of the wrong layout. */
export function applyLayoutNow(pref: LayoutPreference = 'auto') {
  document.documentElement.dataset.layout = resolveLayout(pref, readEnv());
}
