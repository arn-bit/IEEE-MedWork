import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { watch } from './helpers';

test.use({ serviceWorkers: 'block' });

const clock = (page: Page) => page.locator('.demo-clock .num');
const secs = async (page: Page) => {
  const [m, s] = ((await clock(page).textContent()) ?? '0:00').split(':').map(Number);
  return m! * 60 + s!;
};

test('demo: opens without a profile, starts, and jumps between all seven scenes with the keyboard', async ({ page }) => {
  test.setTimeout(120_000);
  const w = watch(page);
  await page.goto('/demo');
  await expect(page.getByRole('heading', { level: 1, name: 'Verimove in one minute' })).toBeVisible();
  await page.getByRole('button', { name: 'Start the demo' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Movement you can verify' })).toBeVisible();

  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('heading', { level: 1, name: 'Tell it your way' })).toBeVisible();
  await expect(page.locator('.demo-finding').first()).toBeVisible({ timeout: 8000 });

  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('heading', { level: 1, name: 'A plan that explains itself' })).toBeVisible();
  await expect(page.locator('.demo-ex').nth(2)).toBeVisible({ timeout: 8000 });
  await expect(page.getByText(/exercises left out for safety or fit/)).toBeVisible({ timeout: 8000 });

  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('heading', { level: 1, name: 'Camera counting for every exercise' })).toBeVisible();
  await expect(page.getByText(/Get into position/)).toBeVisible();
  await expect(page.locator('.demo-chip-count')).toContainText('0');
  // After the hands-free countdown it really counts reps.
  await expect(page.locator('.demo-chip-count .num')).toContainText(/[1-9]/, { timeout: 12_000 });

  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('heading', { level: 1, name: 'Earn tokens, play for fun' })).toBeVisible();
  await expect(page.getByText('Photo Puzzle')).toBeVisible({ timeout: 4000 });

  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('heading', { level: 1, name: 'Snap a meal' })).toBeVisible();
  await expect(page.locator('.demo-item').first()).toBeVisible({ timeout: 25_000 });
  await expect(page.getByRole('group', { name: /This plate: share of the daily value/ })).toBeVisible({ timeout: 8000 });

  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('heading', { level: 1, name: 'Private by design' })).toBeVisible();
  await expect(page.getByText('accounts needed')).toBeVisible({ timeout: 4000 });
  await expect(page.getByText('requests to other sites (live)').locator('xpath=preceding-sibling::strong')).toHaveText('0', { timeout: 4000 });

  expect(w.errors).toEqual([]);
  expect(w.external).toEqual([]);
});

test('demo: pause really pauses, notes show for each scene, and it never touches the visitor’s own data', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('mw:v1', JSON.stringify({ sentinel: 'keep me' })));
  await page.goto('/demo?autostart=1');
  await expect(page.getByRole('heading', { level: 1, name: 'Movement you can verify' })).toBeVisible();
  await page.keyboard.press('n');
  await expect(page.getByLabel('Speaker notes')).toContainText(/three ideas/);
  await page.waitForTimeout(1500);
  await page.keyboard.press(' ');
  const frozen = await secs(page);
  await page.waitForTimeout(1800);
  expect(await secs(page)).toBe(frozen);
  await page.keyboard.press(' ');
  await page.waitForTimeout(1800);
  expect(await secs(page)).toBeGreaterThan(frozen);
  expect(await page.evaluate(() => localStorage.getItem('mw:v1'))).toContain('keep me');
});

test('demo: the whole thing runs by itself in one minute and ends on the thank-you screen', async ({ page }) => {
  test.setTimeout(150_000);
  const w = watch(page);
  await page.goto('/demo?autostart=1');
  await expect(page.getByRole('heading', { level: 1, name: 'Movement you can verify' })).toBeVisible();
  const t0 = Date.now();
  await expect(page.getByRole('heading', { level: 1, name: 'Private by design' })).toBeVisible({ timeout: 75_000 });
  const took = (Date.now() - t0) / 1000;
  expect(took).toBeGreaterThan(50);
  expect(took).toBeLessThan(62);
  await expect(page.getByText('Thank you')).toBeVisible({ timeout: 10_000 });
  await expect(clock(page)).toHaveText('1:00', { timeout: 10_000 });
  await expect(page.getByRole('button', { name: 'Replay the demo' })).toBeVisible();
  expect(w.errors).toEqual([]);
  expect(w.external).toEqual([]);
});

test('demo: no serious accessibility problems on the start card and on the main scenes', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/demo');
  const check = async (label: string) => {
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(bad.map((v) => `${label}: ${v.id} (${v.nodes.length}) ${v.nodes[0]?.target}`)).toEqual([]);
  };
  await check('start');
  await page.getByRole('button', { name: 'Start the demo' }).click();
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(4500); // let the staggered fade-ins finish so contrast is measured on settled colours
    await check(`scene ${i + 1}`);
    await page.keyboard.press('ArrowRight');
  }
  await page.waitForTimeout(5000);
  await check('last');
});

test('demo: there is a Demo mode tab in the main navigation of the app, and it can be left again', async ({ page }) => {
  const { seed } = await import('./helpers');
  await seed(page);
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Demo mode' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Verimove in one minute' })).toBeVisible();
  await page.getByRole('link', { name: 'Exit demo', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
});

test('demo: the landing page links to it', async ({ page }) => {
  await page.goto('/welcome');
  await page.getByRole('link', { name: /Watch the 1-minute demo/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Verimove in one minute' })).toBeVisible();
});
