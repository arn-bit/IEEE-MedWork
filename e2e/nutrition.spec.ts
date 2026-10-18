import { test, expect, type Page } from '@playwright/test';
import { seed, watch } from './helpers';

test.use({ serviceWorkers: 'block' });

const upload = (page: Page, file: string) => page.getByLabel('Choose a photo of your meal').setInputFiles('e2e/fixtures/' + file);
const plateTitle = (page: Page) => page.locator('#plate-h');
const itemNames = (page: Page) => page.locator('.nut-item-name');

test('nutrition: a pizza photo is recognised on-device with no size question, shows daily-value bars, and logs', async ({ page }) => {
  test.setTimeout(180_000);
  await seed(page);
  const w = watch(page);
  const uploads: string[] = [];
  page.on('request', (r) => {
    if (r.method() !== 'GET' && r.method() !== 'HEAD') uploads.push(`${r.method()} ${r.url()}`);
  });
  await page.goto('/nutrition');
  await expect(page.getByRole('heading', { level: 1, name: /Snap a meal/ })).toBeVisible();
  await upload(page, 'pizza.jpg');
  await expect(plateTitle(page)).toHaveText('Pizza', { timeout: 150_000 });
  // The amount is assumed from the picture: no portion question is asked.
  await expect(page.getByText('How much did you have?')).toHaveCount(0);
  // Nutrition and the daily-value bars appear straight away.
  await expect(page.getByText(/kcal \(estimate\)/)).toBeVisible();
  const bars = page.getByRole('group', { name: /This plate: share of the daily value/ });
  await expect(bars).toBeVisible();
  for (const label of ['Calories', 'Protein', 'Carbs', 'Fat']) await expect(bars.getByText(label, { exact: true })).toBeVisible();
  await expect(bars.getByText(/% DV/).first()).toBeVisible();
  await page.getByRole('button', { name: 'Add whole plate to today' }).click();
  await expect(page.locator('.nut-log').getByText('Pizza')).toBeVisible();
  // "Today" now has bars of its own.
  await expect(page.getByRole('group', { name: /Today: share of the daily value/ })).toBeVisible();
  expect(uploads).toEqual([]);
  expect(w.external).toEqual([]);
  expect(w.errors).toEqual([]);
});

test('nutrition: a plate with several foods is split into items and totalled', async ({ page }) => {
  test.setTimeout(240_000);
  await seed(page);
  await page.goto('/nutrition');
  await upload(page, 'plates/chickenrice.jpg');
  await expect(plateTitle(page)).toBeVisible({ timeout: 180_000 });
  await expect(itemNames(page).first()).toBeVisible();
  const count = await itemNames(page).count();
  expect(count).toBeGreaterThanOrEqual(2);
  await expect(page.getByRole('heading', { name: 'Whole plate' })).toBeVisible();
  // The plate total is the sum of its items.
  const kcals = await page.locator('.nut-item .badge-brand').allTextContents();
  const sum = kcals.reduce((a, t) => a + Number(t.replace(/\D/g, '')), 0);
  const total = Number((await page.locator('.nut-total .nut-kcal .num').textContent())!.replace(/\D/g, ''));
  expect(Math.abs(total - sum)).toBeLessThanOrEqual(count);
  await page.getByRole('button', { name: 'Add whole plate to today' }).click();
  await expect(page.locator('.nut-log li').first()).toBeVisible();
  expect(await page.locator('.nut-log li').count()).toBeGreaterThanOrEqual(count);
});

test('nutrition: you can label a photo the app got wrong, and it remembers it', async ({ page }) => {
  test.setTimeout(240_000);
  await seed(page);
  await page.goto('/nutrition');
  await upload(page, 'dumplings.jpg');
  await expect(plateTitle(page)).toBeVisible({ timeout: 180_000 });
  // Teach it that this is a food of our own.
  await page.getByRole('button', { name: 'Not right? Label it' }).first().click();
  await page.getByRole('radio', { name: /something else/ }).check();
  await page.locator('[id^=tn-]').fill('Grandma’s special');
  await page.getByLabel('Calories per serving').fill('432');
  await page.getByRole('button', { name: 'Save label' }).click();
  await expect(page.getByText(/Photos that look like this will now suggest/)).toBeVisible();
  await expect(itemNames(page).first()).toHaveText('Grandma’s special');
  await expect(page.locator('.nut-item .badge-brand').first()).toContainText(/\d+ kcal/);
  // It is listed, and the same photo is now recognised as the new food.
  await expect(page.getByRole('heading', { name: /What you’ve taught the app/ })).toBeVisible();
  await expect(page.locator('#taught-h').locator('xpath=..').getByText('Grandma’s special')).toBeVisible();
  await upload(page, 'dumplings.jpg');
  await expect(itemNames(page).first()).toHaveText('Grandma’s special', { timeout: 120_000 });
  // The user can forget it again.
  await page.getByRole('button', { name: 'Forget Grandma’s special' }).click();
  await expect(page.getByRole('button', { name: 'Forget Grandma’s special' })).toHaveCount(0);
});

test('nutrition: a burger photo is recognised, and numbers can be hidden', async ({ page }) => {
  test.setTimeout(180_000);
  await seed(page);
  await page.goto('/nutrition');
  await page.getByRole('checkbox', { name: /Hide calories and nutrients/ }).check();
  await upload(page, 'burger.jpg');
  await expect(plateTitle(page)).toHaveText(/Hamburger/, { timeout: 150_000 });
  await expect(page.getByText(/kcal \(estimate\)/)).toHaveCount(0);
  await expect(page.getByRole('group', { name: /share of the daily value/ })).toHaveCount(0);
});

test('nutrition: whole foods, nuts and other cuisines are recognised (banana is a banana, not churros)', async ({ page }) => {
  test.setTimeout(300_000);
  await seed(page);
  await page.goto('/nutrition');
  const pick = async (file: string, re: RegExp, timeout = 120_000) => {
    await upload(page, file);
    await expect(itemNames(page).filter({ hasText: re }).first()).toBeVisible({ timeout });
  };
  await pick('banana.jpg', /^Banana$/, 200_000);
  await pick('broccoli.jpg', /Broccoli/);
  await pick('falafel.jpg', /Falafel/);
  await pick('ramen.jpg', /Ramen/);
  await pick('sushi.jpg', /Sushi/);
});

test('nutrition: a non-image file is rejected kindly', async ({ page }) => {
  await seed(page);
  await page.goto('/nutrition');
  await page.getByLabel('Choose a photo of your meal').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
  await expect(page.getByText(/not a picture/)).toBeVisible();
});

test('nutrition: under-18s see the numbers with an extra disclaimer, and can hide them', async ({ page }) => {
  await seed(page, { ageYears: 15, guardianConfirmed: true });
  await page.goto('/nutrition');
  await expect(page.getByText(/For under-18s: a note on calorie numbers/)).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /Hide calories/ })).toBeVisible();
});

test('home promotes nutrition and links to it', async ({ page }) => {
  await seed(page);
  await page.goto('/');
  await page.getByRole('link', { name: /Open Nutrition/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: /Snap a meal/ })).toBeVisible();
});
