import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { seed, watch } from './helpers';

test.describe('onboarding', () => {
  test('a new user completes onboarding; the plan persists across reload', async ({ page }) => {
    const w = watch(page);
    await page.goto('/');
    await expect(page).toHaveURL(/\/welcome$/);
    await expect(page.getByRole('heading', { level: 1, name: /Movement you can verify/ })).toBeVisible();
    await page.getByRole('button', { name: /Create my private profile/ }).first().click();

    await page.getByLabel('Nickname (optional)').fill('Alex');
    await page.getByRole('spinbutton', { name: 'Age' }).fill('41');
    await page.getByRole('button', { name: 'Continue' }).click();

    // Validation: goals are required.
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByText('Choose one to three goals.')).toBeVisible();
    await page.getByRole('checkbox', { name: 'Strength' }).check();
    await page.getByRole('checkbox', { name: 'Endurance' }).check();
    await expect(page.getByText('Choose one to three goals.')).toHaveCount(0);
    await page.getByRole('button', { name: 'Continue' }).click();

    await page.getByRole('radio', { name: /Regularly active/ }).check();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('spinbutton', { name: 'Minutes per workout' }).fill('15');
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Continue' }).click(); // equipment defaults
    await page.getByRole('button', { name: 'Continue' }).click(); // preferences
    await page.getByRole('button', { name: 'No to all' }).click(); // health → "in your words"
    await expect(page.getByRole('heading', { level: 1, name: 'In your words' })).toBeVisible();
    await page.getByRole('button', { name: 'Continue' }).click(); // → review
    await expect(page.getByRole('heading', { name: 'Ready, with no safety adjustments needed' })).toBeVisible();

    const create = page.getByRole('button', { name: 'Create my plan' });
    await expect(create).toBeDisabled();
    await page.getByRole('checkbox', { name: /I understand this is general fitness guidance/ }).check();
    await page.getByRole('checkbox', { name: /Save my answers on this device/ }).check();
    await create.click();

    await expect(page).toHaveURL(/\/plan\?new=1/);
    await expect(page.getByText('Your plan is ready')).toBeVisible();
    await expect(page.getByText('Your limit: 15 min')).toBeVisible();

    await page.reload();
    await expect(page.getByRole('heading', { name: /3 days a week · 15 min/ })).toBeVisible();
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Alex/ })).toBeVisible();
    expect(w.errors).toEqual([]);
    expect(w.external).toEqual([]);
  });

  test('emergency symptoms show urgent guidance and no plan can be created', async ({ page }) => {
    await page.goto('/onboarding');
    for (let i = 0; i < 6; i++) {
      if (i === 1) await page.getByRole('checkbox', { name: 'General fitness' }).check();
      await page.getByRole('button', { name: 'Continue' }).click();
    }
    await page.getByRole('checkbox', { name: 'Chest pain, pressure or tightness' }).check();
    await expect(page.getByRole('heading', { name: 'Get urgent medical help now' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'No to all' })).toHaveCount(0);
  });

  test('answers needing professional assessment get a referral (no plan), and the clearance button leads to confirmation', async ({ page }) => {
    await page.goto('/onboarding');
    for (let i = 0; i < 6; i++) {
      if (i === 1) await page.getByRole('checkbox', { name: 'General fitness' }).check();
      await page.getByRole('button', { name: 'Continue' }).click();
    }
    const q = page.getByRole('group', { name: /chest discomfort, unusual breathlessness/ });
    await q.getByRole('radio', { name: 'Yes' }).check();
    await page.getByRole('button', { name: 'Continue' }).click(); // → in your words
    await page.getByRole('button', { name: 'Continue' }).click(); // → review
    await expect(page.getByRole('heading', { name: 'A professional should guide you first' })).toBeVisible();
    await page.getByRole('checkbox', { name: /I understand this is general fitness guidance/ }).check();
    await page.getByRole('checkbox', { name: /Save my answers on this device/ }).check();
    await page.getByRole('button', { name: 'Create my plan' }).click();

    await expect(page.getByRole('heading', { name: 'Please check with a health professional first' })).toBeVisible();
    await expect(page.getByText('Symptoms during activity')).toBeVisible();
    await expect(page).toHaveURL(/\/onboarding$/);

    // The referral persists: Plan page has no plan.
    await page.goto('/plan');
    await expect(page.getByRole('heading', { name: 'No plan yet' })).toBeVisible();

    await page.goto('/');
    await page.getByRole('button', { name: 'A professional has cleared me to exercise' }).click();
    // Navigates back to onboarding to confirm clearance.
    await expect(page).toHaveURL(/\/onboarding/);
  });
});

test.describe('navigation and pages', () => {
  test('every main area renders without console errors or external requests', async ({ page }) => {
    await seed(page);
    const w = watch(page);
    const routes: [string, RegExp][] = [
      ['/', /Good (morning|afternoon|evening), Robin/],
      ['/plan', /days a week/],
      ['/workout', /Quick check-in|Choose a workout/],
      ['/progress', /Your progress/],
      ['/challenges', /Challenges & games/],
      ['/profile', /Robin/],
      ['/evidence', /Where the guidance comes from/],
      ['/about', /Scope, methods & limitations/],
      ['/challenges/quiz', /Move Smart Quiz/],
      ['/challenges/balance', /Steady Stance/],
      ['/challenges/reaction', /Reaction Reach/],
    ];
    for (const [path, heading] of routes) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    }
    // Sidebar navigation works by clicking.
    await page.goto('/');
    for (const name of ['My Plan', 'Workout', 'Progress', 'Challenges', 'Profile & Health', 'Home']) {
      await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name, exact: true }).click();
      await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name, exact: true })).toHaveAttribute('aria-current', 'page');
    }
    expect(w.errors).toEqual([]);
    expect(w.external).toEqual([]);
  });

  test('progress shows a useful empty state before any workout', async ({ page }) => {
    await seed(page);
    await page.goto('/progress');
    await expect(page.getByText('No workouts logged yet')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Start your first workout' })).toBeVisible();
  });

  test('"Why?" explains an exercise with sources, and the plan explains its rules', async ({ page }) => {
    await seed(page, { goals: ['strength'] }, undefined);
    await page.goto('/plan');
    await page.getByRole('button', { name: 'Why?' }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Why these numbers' })).toBeVisible();
    await expect(dialog.getByRole('heading', { name: 'Sources' })).toBeVisible();
    await expect(dialog.getByRole('link').first()).toHaveAttribute('href', /^https:\/\//);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Why this plan?' }).click();
    await expect(page.getByRole('dialog').getByRole('heading', { name: 'How this plan was built' })).toBeVisible();
    await expect(page.getByRole('dialog').getByRole('heading', { name: 'Assumptions and uncertainty' })).toBeVisible();
  });
});

test.describe('workout session', () => {
  test('manual session: start, pause, resume, complete a set, end, save and review', async ({ page }) => {
    await seed(page, { minutesPerSession: 10, daysPerWeek: 7 });
    const w = watch(page);
    await page.goto('/workout?session=s0');
    await page.getByText('I feel fine').click();
    await page.getByRole('button', { name: 'Track manually' }).click();

    // First item is a timed warm-up: start, pause, verify it holds, resume.
    await page.getByRole('button', { name: /Start (set|timer)/ }).click();
    const pauseBtn = page.getByRole('button', { name: 'Pause' });
    await pauseBtn.click();
    const t1 = await page.locator('.big-count').textContent();
    await page.waitForTimeout(1500);
    expect(await page.locator('.big-count').textContent()).toBe(t1);
    await expect(page.getByText('Paused. Timers and camera counting are stopped.')).toBeVisible();
    await page.getByRole('button', { name: 'Resume' }).click();
    await page.getByRole('button', { name: 'Finish early' }).click();

    // Move through items until a rep-based set appears.
    for (let i = 0; i < 6 && !(await page.getByRole('button', { name: 'Add one rep' }).isVisible()); i++) {
      if (await page.getByRole('button', { name: /Start (set|timer)/ }).isVisible()) await page.getByRole('button', { name: /Start (set|timer)/ }).click();
      if (await page.getByRole('button', { name: 'Finish early' }).isVisible()) await page.getByRole('button', { name: 'Finish early' }).click();
      if (await page.getByRole('button', { name: 'Skip rest' }).isVisible()) await page.getByRole('button', { name: 'Skip rest' }).click();
    }
    await page.getByRole('button', { name: 'Add one rep' }).click();
    await page.getByRole('button', { name: 'Add one rep' }).click();
    await page.getByRole('button', { name: 'Add one rep' }).click();
    await page.getByRole('button', { name: 'Remove one rep' }).click();
    await expect(page.locator('.big-count')).toContainText('2');
    await page.getByRole('button', { name: 'Done with this set' }).click();

    await page.getByRole('button', { name: 'End workout and save' }).click();
    await expect(page.getByRole('heading', { name: 'Workout ended' })).toBeVisible();
    await page.getByLabel(/How hard did that feel/).fill('4');
    await page.getByLabel(/Notes/).fill('Felt good');
    await page.getByRole('button', { name: 'Save workout' }).click();
    // Ending after under a minute is saved but does not count toward achievements (min. 60 s active).
    await expect(page.getByText('Logged on this device.')).toBeVisible();

    await page.goto('/progress');
    await expect(page.getByText('Felt good')).toBeVisible();
    await page.reload();
    await expect(page.getByText('Felt good')).toBeVisible();
    expect(w.errors).toEqual([]);
  });

  test('check-in: feeling unwell leads to rest, not a workout, and can pause the plan', async ({ page }) => {
    await seed(page, { daysPerWeek: 7 });
    await page.goto('/workout?session=s0');
    await page.getByText('Unwell (cold, fever, sick)').click();
    await expect(page.getByRole('heading', { name: 'Rest today' })).toBeVisible();
    await page.getByRole('button', { name: 'Pause my plan and rest' }).click();
    await expect(page.getByText('Your plan is paused')).toBeVisible();
    await page.getByRole('button', { name: 'I’m ready to resume' }).click();
    await expect(page.getByText('Your plan is paused')).toHaveCount(0);
  });

  test('stop button with an emergency symptom shows urgent guidance', async ({ page }) => {
    await seed(page, { daysPerWeek: 7 });
    await page.goto('/workout?session=s0');
    await page.getByText('I feel fine').click();
    await page.getByRole('button', { name: 'Track manually' }).click();
    await page.getByRole('button', { name: /Stop: I don’t feel right/ }).click();
    await page.getByRole('button', { name: 'Chest pain, pressure or tightness' }).click();
    await expect(page.getByRole('heading', { name: 'Get urgent medical help now' })).toBeVisible();
  });
});

test.describe('privacy', () => {
  test('export downloads a JSON file and delete removes all app storage', async ({ page }) => {
    await seed(page);
    await page.goto('/profile');
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Export my data/ }).click()]);
    expect(download.suggestedFilename()).toMatch(/^verimove-export-\d{4}-\d{2}-\d{2}\.json$/);

    await page.getByRole('button', { name: /Delete all my data/ }).click();
    const del = page.getByRole('button', { name: 'Delete everything' });
    await expect(del).toBeDisabled();
    await page.getByLabel(/Type DELETE to confirm/).fill('DELETE');
    await del.click();
    await expect(page.getByText('All data deleted')).toBeVisible();
    const keys = await page.evaluate(() => [...Object.keys(localStorage), ...Object.keys(sessionStorage)].filter((k) => k.startsWith('mw:')));
    expect(keys).toEqual([]);
    await page.goto('/');
    await expect(page).toHaveURL(/\/welcome$/);
  });

  test('the production build sends a strict Content-Security-Policy and security headers', async ({ page }) => {
    const res = await page.goto('/welcome');
    const h = res!.headers();
    expect(h['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(h['permissions-policy']).toContain('microphone=()');
    expect(h['x-content-type-options']).toBe('nosniff');
    const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
    expect(csp).toContain("connect-src 'self'");
    expect(csp).not.toContain('unsafe-inline\'; connect');
    expect(csp).toMatch(/script-src 'self' 'wasm-unsafe-eval'/);
  });

  test('the dev-only validation-trace recorder is not in the production build', async ({ page }) => {
    await page.goto('/dev/record');
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
    await expect(page.getByText(/validation trace/i)).toHaveCount(0);
  });
});

test.describe('gamification', () => {
  test('quiz can be completed and awards the learning achievement', async ({ page }) => {
    await seed(page);
    await page.goto('/challenges/quiz');
    for (let i = 0; i < 8; i++) {
      await page.getByRole('group', { name: 'Answers' }).getByRole('button').first().click();
      await page.getByRole('button', { name: /Next question|See result/ }).click();
    }
    await expect(page.getByRole('heading', { name: /of 8/ })).toBeVisible();
    await page.goto('/challenges');
    await expect(page.locator('.achv[data-earned="true"]', { hasText: 'Evidence-savvy' })).toBeVisible();
  });

  test('leaderboard is opt-in and rejects inflated share codes', async ({ page }) => {
    await seed(page);
    await page.goto('/challenges');
    await page.getByRole('button', { name: 'Turn on leaderboard' }).click();
    await page.getByLabel(/Your nickname/).fill('Blue Heron');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByLabel('Your share code')).toContainText('MW1.');
    await page.getByLabel(/Add a friend’s code/).fill('MW1.bogus.code');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByText(/does not look like|damaged|incomplete/)).toBeVisible();
  });

  test('balance game is self-timed and can be completed', async ({ page }) => {
    await seed(page);
    await page.goto('/challenges/balance');
    await page.getByRole('radio', { name: '10 seconds' }).check();
    await page.getByRole('button', { name: 'Start' }).click();
    await expect(page.getByText('Hold complete')).toBeVisible({ timeout: 20_000 });
  });
});

test.describe('responsive and accessible', () => {
  for (const vp of [
    { name: 'mobile', width: 375, height: 812 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'desktop', width: 1440, height: 900 },
  ]) {
    test(`${vp.name}: no horizontal scrolling and navigation is visible`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await seed(page);
      for (const path of ['/', '/plan', '/workout', '/progress', '/challenges', '/profile', '/evidence']) {
        await page.goto(path);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow, `${path} overflows by ${overflow}px`).toBeLessThanOrEqual(0);
        await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
        if (vp.width < 960) {
          // Bottom tab bar: one compact row; desktop-only brand/footer hidden.
          const navBox = await page.getByRole('navigation', { name: 'Main' }).boundingBox();
          expect(navBox!.height).toBeLessThan(100);
          await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Verimove home' })).toBeHidden();
        }
      }
    });
  }

  test('keyboard: the skip link is the first focusable element', async ({ page }) => {
    await seed(page);
    await page.goto('/');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  });

  test('axe finds no serious or critical violations on key screens', async ({ page }) => {
    await seed(page);
    for (const path of ['/welcome', '/onboarding', '/', '/plan', '/workout', '/challenges', '/profile', '/evidence', '/about']) {
      if (path === '/welcome') await page.context().clearCookies();
      await page.goto(path);
      await page.getByRole('heading', { level: 1 }).first().waitFor();
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(bad.map((v) => `${path}: ${v.id} (${v.nodes.length}) ${v.nodes[0]?.target}`)).toEqual([]);
    }
  });

  test('axe in dark mode finds no serious or critical violations', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await seed(page);
    for (const path of ['/', '/plan', '/challenges', '/profile', '/progress']) {
      await page.goto(path);
      await page.getByRole('heading', { level: 1 }).first().waitFor();
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(bad.map((v) => `${path}: ${v.id} (${v.nodes.length}) ${v.nodes[0]?.target}`)).toEqual([]);
    }
  });
});
