import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { seed, watch } from './helpers';

/** Walk onboarding with defaults up to the "In your words" step (health answered "No to all"). */
async function toWords(page: Page) {
  await page.goto('/onboarding');
  await page.getByRole('button', { name: 'Continue' }).click(); // about → goals
  await page.getByRole('checkbox', { name: 'General fitness' }).check();
  for (let i = 0; i < 5; i++) await page.getByRole('button', { name: 'Continue' }).click(); // → health
  await page.getByRole('button', { name: 'No to all' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'In your words' })).toBeVisible();
}

async function consentAndCreate(page: Page) {
  await page.getByRole('checkbox', { name: /I understand this is general fitness guidance/ }).check();
  await page.getByRole('checkbox', { name: /Save my answers on this device/ }).check();
  await page.getByRole('button', { name: 'Create my plan' }).click();
}

test.describe('typed health answers and analysis', () => {
  test('what you type is analysed live, can be rejected or restored, and shapes the plan', async ({ page }) => {
    const w = watch(page);
    await toWords(page);
    await page.getByLabel('Injuries, pain or anything that hurts').fill('my knees hurt when I go down stairs');

    const finding = page.locator('.finding', { hasText: 'knees' });
    await expect(finding).toContainText('You wrote');
    await expect(finding.getByText('Included')).toBeVisible();
    await finding.getByRole('button', { name: 'Not accurate' }).click();
    await expect(finding.getByText('Dismissed')).toBeVisible();
    await finding.getByRole('button', { name: 'Include again' }).click();
    await expect(finding.getByText('Included')).toBeVisible();

    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('heading', { name: 'Ready, with 1 safety adjustment' })).toBeVisible();
    await expect(page.getByText('What we understood from your words')).toBeVisible();
    await expect(page.getByText(/left out: body areas you flagged/)).toBeVisible();
    await consentAndCreate(page);

    await expect(page).toHaveURL(/\/plan\?new=1/);
    await page.getByRole('button', { name: 'Why this plan?' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Used from your own words')).toBeVisible();
    await dialog.getByText(/Left out of your plan/).click();
    await expect(dialog.getByText(/Mainly loads an area you flagged \(knees\)/).first()).toBeVisible();
    expect(w.errors).toEqual([]);
    expect(w.external).toEqual([]);
  });

  test('typed emergency symptoms stop the flow, and can be rejected if misread', async ({ page }) => {
    await toWords(page);
    await page.getByLabel('Anything else we should know?').fill('I have chest pain right now');
    await expect(page.getByRole('heading', { name: 'Get urgent medical help now' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled();
    await page.locator('.finding', { hasText: 'Chest pain' }).getByRole('button', { name: 'Not accurate' }).click();
    await expect(page.getByRole('heading', { name: 'Get urgent medical help now' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Continue' })).toBeEnabled();
  });

  test('symptoms typed in words lead to a referral, like the structured answer', async ({ page }) => {
    await toWords(page);
    await page.getByLabel('Anything else we should know?').fill('I sometimes get dizzy when I exercise');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('heading', { name: 'A professional should guide you first' })).toBeVisible();
    await consentAndCreate(page);
    await expect(page.getByRole('heading', { name: 'Please check with a health professional first' })).toBeVisible();
  });

  test('negation and past events are respected', async ({ page }) => {
    await toWords(page);
    await page.getByLabel('Anything else we should know?').fill('No chest pain, no dizziness. I had a broken arm years ago.');
    await expect(page.locator('.finding', { hasText: 'Chest pain' })).toHaveCount(0);
    await expect(page.locator('.finding', { hasText: 'Dizziness' })).toHaveCount(0);
    await expect(page.locator('.finding', { hasText: 'in the past' })).toBeVisible();
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('heading', { name: 'Ready, with no safety adjustments needed' })).toBeVisible();
  });

  test('what we could not interpret is reported honestly', async ({ page }) => {
    await toWords(page);
    await page.getByLabel('Anything else we should know?').fill('my toes go funny at night');
    await expect(page.getByText(/We couldn’t interpret “my toes go funny at night”/)).toBeVisible();
  });

  test('a goal typed in words becomes a suggestion you choose to add', async ({ page }) => {
    await page.goto('/onboarding');
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByLabel('Or describe it in your own words (optional)').fill('I want to get stronger and feel steadier on my feet');
    const strength = page.locator('.finding', { hasText: 'Goal: Strength' });
    await expect(strength).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Strength' })).not.toBeChecked();
    await strength.getByRole('button', { name: 'Add goal' }).click();
    await expect(page.getByRole('checkbox', { name: 'Strength' })).toBeChecked();
    await page.locator('.finding', { hasText: 'Goal: Balance' }).getByRole('button', { name: 'Add goal' }).click();
    await expect(page.getByRole('checkbox', { name: 'Balance' })).toBeChecked();
  });

  test('exercises typed to avoid are matched to the library and left out', async ({ page }) => {
    await page.goto('/onboarding');
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('checkbox', { name: 'Strength' }).check();
    for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Continue' }).click(); // → preferences
    await page.getByLabel('Exercises you’d rather not do (type them)').fill('squats and burpees');
    await expect(page.locator('.finding', { hasText: 'Leave out: Squats' })).toBeVisible();
    await expect(page.getByText(/couldn’t match “burpees”/)).toBeVisible();
  });

  test('"Not sure" is accepted and treated cautiously', async ({ page }) => {
    await page.goto('/onboarding');
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('checkbox', { name: 'General fitness' }).check();
    for (let i = 0; i < 5; i++) await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('group', { name: /fallen in the last year/ }).getByRole('radio', { name: 'Not sure' }).check();
    await page.getByRole('button', { name: 'Continue' }).click(); // → words
    await page.getByRole('button', { name: 'Continue' }).click(); // → review
    await expect(page.getByText(/You answered Not sure to “Falls or balance concerns”/)).toBeVisible();
    await consentAndCreate(page);
    await page.getByRole('button', { name: 'Why this plan?' }).click();
    await expect(page.getByRole('dialog').getByText('Answers of “Not sure”')).toBeVisible();
  });

  test('per-area pain severity: "severe" suggests a professional instead of a plan', async ({ page }) => {
    await page.goto('/onboarding');
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('checkbox', { name: 'General fitness' }).check();
    for (let i = 0; i < 5; i++) await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('checkbox', { name: 'Knees' }).first().check();
    await page.getByRole('group', { name: /Pain level: knees/ }).getByRole('radio', { name: 'Severe' }).check();
    await expect(page.getByText(/Severe pain should be assessed/)).toBeVisible();
    await page.getByRole('button', { name: 'No to all' }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('heading', { name: 'A professional should guide you first' })).toBeVisible();
  });

  test('emails and phone numbers typed into notes are never stored', async ({ page }) => {
    await toWords(page);
    await page.getByLabel('Anything else we should know?').fill('my knee hurts. email me at sam.jones@example.com or call 555 123 4567');
    await expect(page.getByText('Please don’t include contact or ID details')).toBeVisible();
    await page.getByRole('button', { name: 'Continue' }).click();
    await consentAndCreate(page);
    await expect(page).toHaveURL(/\/plan\?new=1/);
    const stored = await page.evaluate(() => localStorage.getItem('mw:v1') ?? '');
    expect(stored).toContain('[removed]');
    expect(stored).not.toContain('sam.jones@example.com');
    expect(stored).not.toContain('555 123 4567');
  });

  test('the analysis lives on the profile page, and dismissing a finding rebuilds the plan', async ({ page }) => {
    await seed(page, {}, (d) => {
      d.profile!.health.freeText.injuries = 'my knees hurt';
    });
    await page.goto('/profile');
    const finding = page.locator('.finding', { hasText: 'knees' });
    await expect(finding.getByText('Included')).toBeVisible();
    await finding.getByRole('button', { name: 'Not accurate' }).click();
    await expect(finding.getByText('Dismissed')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Ready, with no safety adjustments needed' })).toBeVisible();
  });
});

test.describe('landing page and first-run', () => {
  test('the example plan is interactive and shows real sources', async ({ page }) => {
    await page.goto('/welcome');
    const tabs = page.getByRole('tab');
    await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
    const second = tabs.nth(1);
    await second.click();
    await expect(second).toHaveAttribute('aria-selected', 'true');
    const panel = page.getByRole('tabpanel');
    await expect(panel.getByRole('heading', { name: 'Sources' })).toBeVisible();
    await expect(panel.getByRole('link').first()).toHaveAttribute('href', /^https:\/\//);
  });

  test('FAQ opens, and the nav anchors work', async ({ page }) => {
    await page.goto('/welcome');
    await page.getByText('Do I need an account?').click();
    await expect(page.getByText(/There’s no sign-up and no server/)).toBeVisible();
    await page.getByRole('navigation', { name: 'On this page' }).getByRole('link', { name: 'Privacy' }).click();
    await expect(page.getByRole('heading', { name: /Your health data never has to leave your device/ })).toBeInViewport();
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`welcome page has no serious accessibility violations (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto('/welcome');
      await page.getByRole('heading', { level: 1 }).waitFor();
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(bad.map((v) => `${v.id} (${v.nodes.length}) ${v.nodes[0]?.target}`)).toEqual([]);
    });
  }

  for (const vp of [
    { name: 'mobile', width: 375, height: 812 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'desktop', width: 1440, height: 900 },
  ]) {
    test(`welcome and onboarding have no horizontal overflow (${vp.name})`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      for (const path of ['/welcome', '/onboarding']) {
        await page.goto(path);
        await page.getByRole('heading', { level: 1 }).first().waitFor();
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow, `${path} overflows by ${overflow}px`).toBeLessThanOrEqual(0);
      }
    });
  }

  test('fonts are bundled: no request leaves localhost and no CSP violations', async ({ page }) => {
    const w = watch(page);
    const violations: string[] = [];
    await page.addInitScript(() => document.addEventListener('securitypolicyviolation', (e) => ((window as unknown as { __v: string[] }).__v ??= []).push(e.blockedURI)));
    await page.goto('/welcome');
    await page.waitForLoadState('networkidle');
    violations.push(...(await page.evaluate(() => (window as unknown as { __v?: string[] }).__v ?? [])));
    expect(violations).toEqual([]);
    expect(w.external).toEqual([]);
    const fonts = await page.evaluate(async () => {
      await document.fonts.ready;
      return [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family);
    });
    expect(fonts.join(' ')).toMatch(/Fraunces/);
    expect(fonts.join(' ')).toMatch(/Inter/);
  });
});

test.describe('passcode lock and backups', () => {
  test('encrypt with a passcode, reload to the unlock screen, unlock, lock again', async ({ page }) => {
    await seed(page);
    await page.goto('/profile');
    await page.getByLabel('New passcode').fill('correct horse battery');
    await page.getByLabel('Repeat passcode').fill('correct horse battery');
    await page.getByRole('checkbox', { name: /can’t be recovered/ }).check();
    await page.getByRole('button', { name: 'Turn on encryption' }).click();
    await expect(page.getByText('Passcode lock is on')).toBeVisible();

    const vault = await page.evaluate(() => ({ vault: localStorage.getItem('mw:vault:v1'), plain: localStorage.getItem('mw:v1') }));
    expect(vault.plain).toBeNull();
    expect(vault.vault).not.toBeNull();
    expect(vault.vault).not.toContain('Robin');
    expect(vault.vault).not.toContain('knee');

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await expect(page.getByText('Robin')).toHaveCount(0);
    await page.getByLabel('Passcode').fill('wrong one');
    await page.getByRole('button', { name: 'Unlock' }).click();
    await expect(page.getByRole('alert')).toContainText(/didn’t work/);
    await page.getByLabel('Passcode').fill('correct horse battery');
    await expect(page.getByRole('button', { name: 'Unlock' })).toBeEnabled({ timeout: 5000 });
    await page.getByRole('button', { name: 'Unlock' }).click();
    await expect(page.getByRole('heading', { level: 1, name: /Robin/ })).toBeVisible();

    // Changes made while unlocked are persisted encrypted. (Navigate in-app: a full reload would lock again.)
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Challenges', exact: true }).click();
    await page.getByRole('button', { name: 'Use private mode instead' }).click();
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Profile & Health', exact: true }).click();
    await page.getByRole('button', { name: /Lock now/ }).click();
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    const after = await page.evaluate(() => localStorage.getItem('mw:v1'));
    expect(after).toBeNull();
  });

  test('forgot passcode → delete → a fresh start, and nothing is left behind', async ({ page }) => {
    await seed(page);
    await page.goto('/profile');
    await page.getByLabel('New passcode').fill('correct horse battery');
    await page.getByLabel('Repeat passcode').fill('correct horse battery');
    await page.getByRole('checkbox', { name: /can’t be recovered/ }).check();
    await page.getByRole('button', { name: 'Turn on encryption' }).click();
    await expect(page.getByText('Passcode lock is on')).toBeVisible();
    await page.reload();
    await page.getByRole('button', { name: 'Forgot your passcode?' }).click();
    await page.getByRole('button', { name: 'Delete everything and start over' }).click();
    await expect(page.getByRole('heading', { level: 1, name: /Movement you can verify/ })).toBeVisible();
    const keys = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('mw:') && k !== 'mw:v1'));
    expect(keys).toEqual([]);
  });

  test('export → delete → restore from the welcome page', async ({ page }, testInfo) => {
    await seed(page);
    await page.goto('/profile');
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Export my data/ }).click()]);
    const file = testInfo.outputPath('backup.json');
    await download.saveAs(file);

    await page.getByRole('button', { name: /Delete all my data/ }).click();
    await page.getByLabel(/Type DELETE to confirm/).fill('DELETE');
    await page.getByRole('button', { name: 'Delete everything' }).click();
    await expect(page.getByText('All data deleted')).toBeVisible();

    await page.goto('/welcome');
    // A bad file is rejected without touching anything.
    await page.locator('input[type="file"]').first().setInputFiles({ name: 'nope.json', mimeType: 'application/json', buffer: Buffer.from('definitely not json') });
    await expect(page.getByRole('alert')).toContainText(/isn’t a valid backup/);
    // The real backup restores the profile.
    await page.locator('input[type="file"]').first().setInputFiles(file);
    await expect(page.getByRole('heading', { level: 1, name: /Robin/ })).toBeVisible();
  });
});
