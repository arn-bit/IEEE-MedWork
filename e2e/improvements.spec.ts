import { test, expect } from '@playwright/test';
import { seed, watch } from './helpers';
import type { SessionLog } from '../src/domain/types';

test('offline: after one visit the app reloads with no network', async ({ page, context }) => {
  await seed(page);
  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // Reload once so the active worker controls the page and caches the assets it serves.
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: /Robin/ })).toBeVisible();
  await expect(page.getByText('You’re offline')).toBeVisible();
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'My Plan', exact: true }).click();
  await expect(page.getByRole('heading', { name: /days a week/ })).toBeVisible();
  await context.setOffline(false);
});

test('clinician summary is generated locally and is printable', async ({ page }) => {
  await seed(page, {}, (d) => {
    d.profile!.health.painAreas = ['knees'];
  });
  const w = watch(page);
  await page.goto('/profile');
  await page.getByRole('link', { name: /Summary for a health professional/ }).click();
  await expect(page.getByRole('heading', { name: 'Summary for a health professional' })).toBeVisible();
  await expect(page.getByText('Areas with known mild pain or past injury')).toBeVisible();
  await expect(page.getByRole('button', { name: /Print or save as PDF/ })).toBeVisible();
  expect(w.external).toEqual([]);
});

test('activity minutes: logging a walk counts toward the weekly WHO/CDC target', async ({ page }) => {
  await seed(page);
  await page.goto('/progress');
  await expect(page.getByText('0 / 150 min')).toBeVisible();
  await page.getByLabel('Minutes', { exact: true }).fill('30');
  await page.getByLabel('Effort').selectOption('vigorous');
  await page.getByRole('button', { name: 'Log activity' }).click();
  await expect(page.getByText('60 / 150 min')).toBeVisible();
  await page.getByLabel('Minutes', { exact: true }).fill('0');
  await page.getByRole('button', { name: 'Log activity' }).click();
  await expect(page.getByText('Enter between 1 and 300 minutes.')).toBeVisible();
  await page.reload();
  await expect(page.getByText('60 / 150 min')).toBeVisible();
});

test('progression: two strong sessions produce a transparent “ready to progress” hint', async ({ page }) => {
  const { plan } = await seed(page, { goals: ['strength'], daysPerWeek: 3 }, (d) => {
    const first = d.plan!.schedule.find(Boolean)!;
    const main = first.items.find((i) => i.block === 'main' && i.prescription.kind === 'reps')!;
    const target = main.prescription.amount * (main.prescription.perSide ? 2 : 1);
    const mk = (daysAgo: number): SessionLog => ({
      id: `p${daysAgo}`,
      plannedSessionId: first.id,
      startedAt: new Date(Date.now() - daysAgo * 86400000).toISOString(),
      endedAt: new Date(Date.now() - daysAgo * 86400000).toISOString(),
      activeSeconds: 900,
      sets: [{ exerciseId: main.exerciseId, setIndex: 0, target, achieved: target + 3, kind: 'reps', trackedBy: 'manual', manualCorrections: 0 }],
      completedExerciseIds: [main.exerciseId],
      rpe: 4,
      note: '',
      endedReason: 'completed',
    });
    d.sessions = [mk(2), mk(4)];
  });
  expect(plan).toBeTruthy();
  await page.goto('/plan');
  const dayButtons = page.getByRole('group', { name: 'Choose a day' }).getByRole('button');
  await dayButtons.nth(0).click();
  await expect(page.getByText(/Ready to progress\?/).first()).toBeVisible();
});
