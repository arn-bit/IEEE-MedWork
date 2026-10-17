import type { Page } from '@playwright/test';
import { generatePlan } from '../src/domain/plan/engine';
import { makeProfile } from '../src/domain/profile';
import { defaultData, STORAGE_KEY, type AppData } from '../src/state/storage';
import type { Profile } from '../src/domain/types';

/** Seed a valid profile + plan into localStorage before the app loads. */
export async function seed(page: Page, overrides: Partial<Profile> = {}, mutate?: (d: AppData) => void) {
  const profile = makeProfile({ displayName: 'Robin', createdAt: new Date().toISOString(), ...overrides });
  const r = generatePlan(profile);
  if (!r.ok) throw new Error(`seed profile did not produce a plan: ${r.reason}`);
  const data = defaultData();
  data.profile = profile;
  data.plan = r.plan;
  mutate?.(data);
  await page.addInitScript(
    ([key, value]) => {
      if (!sessionStorage.getItem('e2e-seeded')) {
        localStorage.setItem(key, value);
        sessionStorage.setItem('e2e-seeded', '1');
      }
    },
    [STORAGE_KEY, JSON.stringify(data)] as const,
  );
  return { profile, plan: r.plan };
}

/** Collect console errors and any request that leaves localhost. */
export function watch(page: Page) {
  const errors: string[] = [];
  const external: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('request', (req) => {
    const u = new URL(req.url());
    if (!['localhost', '127.0.0.1'].includes(u.hostname) && u.protocol !== 'data:' && u.protocol !== 'blob:') external.push(req.url());
  });
  return { errors, external };
}
