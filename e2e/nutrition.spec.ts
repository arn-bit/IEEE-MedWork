import { test, expect } from '@playwright/test';
import { seed, watch } from './helpers';

test.use({ serviceWorkers: 'block' });

test('nutrition: a pizza photo is recognised on-device, with no external requests, and can be logged', async ({ page }) => {
  test.setTimeout(120_000);
  await seed(page);
  const w = watch(page);
  const uploads: string[] = [];
  page.on('request', (r) => {
    if (r.method() !== 'GET' && r.method() !== 'HEAD') uploads.push(`${r.method()} ${r.url()}`);
  });
  await page.goto('/nutrition');
  await expect(page.getByRole('heading', { level: 1, name: /Snap a meal/ })).toBeVisible();
  await page.getByLabel('Choose a photo of your meal').setInputFiles('e2e/fixtures/pizza.jpg');
  await expect(page.getByRole('heading', { level: 3, name: 'Pizza' })).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText(/kcal \(estimate\)/)).toBeVisible();
  await page.getByRole('radio', { name: /Large/ }).check();
  await page.getByRole('button', { name: 'Add to today' }).first().click();
  await expect(page.getByRole('list').getByText('Pizza')).toBeVisible();
  expect(uploads).toEqual([]);
  expect(w.external).toEqual([]);
  expect(w.errors).toEqual([]);
});

test('nutrition: a burger photo is recognised, and numbers can be hidden', async ({ page }) => {
  test.setTimeout(120_000);
  await seed(page);
  await page.goto('/nutrition');
  await page.getByRole('checkbox', { name: /Hide calories and nutrients/ }).check();
  await page.getByLabel('Choose a photo of your meal').setInputFiles('e2e/fixtures/burger.jpg');
  await expect(page.getByRole('heading', { level: 3, name: /Hamburger/ })).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText(/kcal \(estimate\)/)).toHaveCount(0);
});

test('nutrition: whole foods are recognised too (banana is a banana, not churros)', async ({ page }) => {
  test.setTimeout(150_000);
  await seed(page);
  await page.goto('/nutrition');
  await page.getByLabel('Choose a photo of your meal').setInputFiles('e2e/fixtures/banana.jpg');
  await expect(page.getByRole('heading', { level: 3, name: 'Banana' })).toBeVisible({ timeout: 120_000 });
  await page.getByLabel('Choose a photo of your meal').setInputFiles('e2e/fixtures/broccoli.jpg');
  await expect(page.getByRole('heading', { level: 3, name: 'Broccoli' })).toBeVisible({ timeout: 60_000 });
  await page.getByLabel('Choose a photo of your meal').setInputFiles('e2e/fixtures/apple.jpg');
  await expect(page.getByRole('radio', { name: /^Apple/ })).toBeVisible({ timeout: 60_000 });
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
