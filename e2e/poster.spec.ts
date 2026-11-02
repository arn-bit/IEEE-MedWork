import { test, expect } from '@playwright/test';
import { watch } from './helpers';

test.use({ serviceWorkers: 'block' });

test('poster: fits its board with nothing cut off, uses live numbers, and makes no outside requests', async ({ page }) => {
  const w = watch(page);
  await page.setViewportSize({ width: 1800, height: 1400 });
  await page.goto('/poster');
  await expect(page.getByRole('heading', { level: 1, name: /evidence-linked exercise coaching/ })).toBeVisible();
  for (const h of ['How it works', 'How it was built and how it runs', 'The models inside', 'Pose tracking', 'Gamification', 'Nutrition', 'Built with Claude: the development workflow', 'Inside the app: how a plan is made', 'Why it beats a general exercise app', 'Limits', 'References']) {
    await expect(page.getByRole('heading', { name: h })).toBeVisible();
  }
  // Three flaps, left to right: features, workflows, models.
  const boxes = await page.locator('.pz-flap').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().left)));
  expect(boxes).toHaveLength(3);
  expect(boxes[0]!).toBeLessThan(boxes[1]!);
  expect(boxes[1]!).toBeLessThan(boxes[2]!);
  // Nothing overflows its flap or the poster itself.
  const over = await page.evaluate(() => {
    const bad: string[] = [];
    for (const sel of ['.pz', '.pz-body', '.pz-flap', '.pz-head > *']) {
      document.querySelectorAll<HTMLElement>(sel).forEach((el, i) => {
        if (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1) bad.push(`${sel}[${i}] ${el.scrollWidth}x${el.scrollHeight} > ${el.clientWidth}x${el.clientHeight}`);
      });
    }
    return bad;
  });
  expect(over).toEqual([]);
  // Live numbers: the stat tiles come from the app, not from typed-in text.
  const tiles = await page.locator('.pz-stats b').allTextContents();
  expect(Number(tiles[0])).toBeGreaterThanOrEqual(48);
  expect(Number(tiles[1]!.replace('+', ''))).toBeGreaterThanOrEqual(300);
  // Every picture has alt text and loaded.
  const imgs = await page.locator('.pz img').evaluateAll((els) => els.map((e) => [(e as HTMLImageElement).alt, (e as HTMLImageElement).naturalWidth]));
  expect(imgs.length).toBeGreaterThanOrEqual(2);
  for (const [alt, nw] of imgs) {
    expect(alt).not.toBe('');
    expect(nw).toBeGreaterThan(100);
  }
  expect(w.errors).toEqual([]);
  expect(w.external).toEqual([]);
});

test('poster: prints at the poster size with no on-screen controls', async ({ page }) => {
  await page.goto('/poster');
  await expect(page.locator('.pz')).toBeVisible();
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.pz-bar')).toBeHidden();
  const size = await page.evaluate(() => {
    const r = document.querySelector<HTMLElement>('.pz-stage')!.getBoundingClientRect();
    return [Math.round(r.width), Math.round(r.height)];
  });
  expect(size).toEqual([4608, 3456]);
  const pdf = await page.pdf({ width: '48in', height: '36in', printBackground: true, preferCSSPageSize: true });
  expect(pdf.byteLength).toBeGreaterThan(50_000);
  expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
});

test('poster: the landscape poster scales to any screen without scrollbars', async ({ page }) => {
  for (const [w, h] of [[1366, 768], [1920, 1080], [820, 1180]]) {
    await page.setViewportSize({ width: w!, height: h! });
    await page.goto('/poster');
    const horizontal = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(horizontal).toBeLessThanOrEqual(0);
  }
});
