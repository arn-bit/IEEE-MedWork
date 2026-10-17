import { test, expect } from '@playwright/test';
import { seed, watch } from './helpers';

/**
 * Real-model tests. Chromium's fake camera shows a synthetic test pattern (no person), so these
 * prove the model assets load and run on-device under the strict CSP, and that the UI handles
 * "no body detected". They do NOT measure real-world counting accuracy.
 */
test.use({
  launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
  permissions: ['camera'],
  // Requests made by a service worker bypass page.route(); block it so network fakes apply.
  serviceWorkers: 'block',
});

async function startCameraWorkout(page: import('@playwright/test').Page) {
  // A day where the first main exercise is camera-capable: strength goal, chair + wall.
  await seed(page, { daysPerWeek: 7, goals: ['strength'], minutesPerSession: 20 });
  await page.goto('/workout?session=s0');
  await page.getByText('I feel fine').click();
  await page.getByRole('button', { name: 'Use camera' }).click();
}

test('camera permission granted: the local model loads and runs, with no external requests', async ({ page }) => {
  test.setTimeout(120_000);
  const w = watch(page);
  const modelRequests: string[] = [];
  page.on('response', (r) => {
    if (r.url().includes('/models/') || r.url().includes('/mediapipe/wasm/')) modelRequests.push(`${r.status()} ${new URL(r.url()).pathname}`);
  });
  await startCameraWorkout(page);
  await expect(page.getByText(/Model: MediaPipe Pose Landmarker Lite · running on (GPU|CPU)/)).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText('On-device only')).toBeVisible();
  // Start a rep-based set so the counter runs against the fake (person-free) video.
  for (let i = 0; i < 8 && !(await page.getByRole('button', { name: 'Add one rep' }).isVisible()); i++) {
    const startBtn = page.getByRole('button', { name: /Start (set|timer)/ });
    if (await startBtn.isVisible()) await startBtn.click();
    const finish = page.getByRole('button', { name: 'Finish early' });
    if (await finish.isVisible()) await finish.click();
    const skipRest = page.getByRole('button', { name: 'Skip rest' });
    if (await skipRest.isVisible()) await skipRest.click();
  }
  await expect(page.locator('.cam-wrap')).toBeVisible();
  expect(modelRequests).toContain('200 /models/pose_landmarker_lite.task');
  expect(modelRequests.some((r) => r.startsWith('200 /mediapipe/wasm/vision_wasm'))).toBe(true);
  expect(w.external).toEqual([]);
});

test('camera on a camera-capable exercise reports "No body detected" for the synthetic test pattern', async ({ page }) => {
  test.setTimeout(120_000);
  await seed(page, { daysPerWeek: 7, goals: ['strength'], minutesPerSession: 20, equipment: ['chair', 'wall'] });
  await page.goto('/workout?session=s0');
  await page.getByText('I feel fine').click();
  await page.getByRole('button', { name: 'Use camera' }).click();
  // Skip to the first exercise whose card shows camera counting is available.
  for (let i = 0; i < 12; i++) {
    const noCounting = await page.getByText('No camera counting for this exercise').isVisible();
    const intro = await page.getByRole('button', { name: /Start (set|timer)/ }).isVisible();
    if (!noCounting && intro && (await page.getByText(/Model: MediaPipe/).isVisible())) break;
    if (await page.getByRole('button', { name: 'Skip exercise' }).isVisible()) await page.getByRole('button', { name: 'Skip exercise' }).click();
    await page.waitForTimeout(300);
  }
  await expect(page.getByText(/Model: MediaPipe/)).toBeVisible({ timeout: 90_000 });
  await page.getByRole('button', { name: 'Start set' }).click();
  await expect(page.locator('.cam-overlay-msg')).toContainText(/No body detected|can't clearly see/, { timeout: 20_000 });
  await expect(page.locator('.big-count')).toContainText('0');
  await expect(page.getByText('Not tracking')).toBeVisible();
});

test('MediaPipe usage metrics are blocked by the CSP (no telemetry leaves the device)', async ({ page }) => {
  test.slow();
  test.setTimeout(180_000);
  await page.addInitScript(() => {
    (window as unknown as { __csp: string[] }).__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => (window as unknown as { __csp: string[] }).__csp.push(e.blockedURI));
  });
  const w = watch(page);
  await startCameraWorkout(page);
  await expect(page.getByText(/Model: MediaPipe/)).toBeVisible({ timeout: 90_000 });
  // The library flushes metrics every 60 s.
  await page.waitForTimeout(65_000);
  const blocked = await page.evaluate(() => (window as unknown as { __csp: string[] }).__csp);
  expect(blocked.some((u) => u.includes('odml.pa.googleapis.com'))).toBe(true);
  expect(w.external).toEqual([]);
});

test('the camera can be turned off mid-session (stream fully stopped) and back on', async ({ page }) => {
  test.setTimeout(120_000);
  await startCameraWorkout(page);
  await expect(page.getByText(/Model: MediaPipe/)).toBeVisible({ timeout: 90_000 });
  const live = () => page.evaluate(() => {
    const v = document.querySelector('.cam-wrap video') as HTMLVideoElement | null;
    const s = v?.srcObject as MediaStream | null;
    return !!s && s.getTracks().some((t) => t.readyState === 'live');
  });
  expect(await live()).toBe(true);
  await page.getByRole('button', { name: 'Turn camera off' }).click();
  await expect(page.getByText('Camera is off')).toBeVisible();
  await expect(page.locator('.cam-wrap video')).toHaveCount(0);
  await page.getByRole('button', { name: 'Turn camera on' }).click();
  await expect(page.getByText(/Model: MediaPipe/)).toBeVisible({ timeout: 60_000 });
  expect(await live()).toBe(true);
});

test('camera denied → clear message and a working manual alternative', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(Object.assign(new Error('denied'), { name: 'NotAllowedError' }));
  });
  await startCameraWorkout(page);
  await expect(page.getByText('Camera unavailable')).toBeVisible();
  await expect(page.getByText(/Camera permission was not granted/)).toBeVisible();
  await page.getByRole('button', { name: 'Continue with manual tracking' }).click();
  await expect(page.getByText('Switched to manual tracking')).toBeVisible();
  await expect(page.getByRole('button', { name: /Start (set|timer)/ })).toBeVisible();
});

test('no camera hardware → clear message and manual alternative', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(Object.assign(new Error('none'), { name: 'NotFoundError' }));
  });
  await startCameraWorkout(page);
  await expect(page.getByText(/No camera was found/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue with manual tracking' })).toBeVisible();
});

test('missing model file → actionable error, never a silent substitute', async ({ page }) => {
  await page.route('**/models/pose_landmarker_lite.task', (route) => route.fulfill({ status: 404, body: 'not found' }));
  await startCameraWorkout(page);
  await expect(page.getByText('Tracking model unavailable')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/npm run setup:models/)).toBeVisible();
  await page.getByRole('button', { name: 'Continue with manual tracking' }).click();
  await expect(page.getByRole('button', { name: /Start (set|timer)/ })).toBeVisible();
});
