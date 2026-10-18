import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { App } from '../App';
import { AppGate } from '../state/Gate';
import { defaultData, saveData, STORAGE_KEY } from '../state/storage';
import { createVault, hasVault, kdfConfig, VAULT_KEY, writeVaultFile } from '../state/vault';
import { generatePlan } from '../domain/plan/engine';
import { makeProfile } from '../domain/profile';

beforeEach(() => {
  kdfConfig.iterations = 1000;
});
afterEach(() => {
  kdfConfig.iterations = 600_000;
});

function seeded() {
  const d = defaultData();
  d.profile = makeProfile({ displayName: 'Kim' });
  const r = generatePlan(d.profile);
  if (!r.ok) throw new Error('no plan');
  d.plan = r.plan;
  return d;
}

const mount = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppGate>
        <App />
      </AppGate>
    </MemoryRouter>,
  );

describe('passcode lock (integration)', () => {
  it('shows the unlock screen for encrypted data; a wrong passcode fails; the right one opens the app', async () => {
    const user = userEvent.setup();
    const { file } = await createVault(seeded(), 'correct horse battery');
    writeVaultFile(file);
    mount('/');

    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
    expect(screen.queryByText(/Kim/)).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Passcode'), 'not it');
    await user.click(screen.getByRole('button', { name: 'Unlock' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/didn’t work/);
    expect(screen.queryByText(/Kim/)).not.toBeInTheDocument();

    // A failed attempt adds a short wait before the next one.
    const retry = await screen.findByRole('button', { name: 'Unlock' }, { timeout: 20000 });
    await user.type(screen.getByLabelText('Passcode'), 'correct horse battery');
    await user.click(retry);
    expect(await screen.findByRole('heading', { level: 1, name: /Kim/ })).toBeInTheDocument();
  }, 40_000);

  it('forgot passcode: deleting everything opens a fresh app', async () => {
    const user = userEvent.setup();
    const { file } = await createVault(seeded(), 'correct horse battery');
    writeVaultFile(file);
    mount('/');
    await user.click(screen.getByRole('button', { name: 'Forgot your passcode?' }));
    await user.click(screen.getByRole('button', { name: 'Delete everything and start over' }));
    expect(await screen.findByRole('heading', { level: 1, name: /shows its work|verify/i })).toBeInTheDocument();
    expect(hasVault()).toBe(false);
  }, 40_000);

  it('turn on encryption from Profile, lock, unlock, then remove the passcode', async () => {
    const user = userEvent.setup();
    saveData(seeded());
    mount('/profile');
    expect(await screen.findByRole('heading', { level: 1, name: /Kim/ })).toBeInTheDocument();

    const enable = screen.getByRole('button', { name: 'Turn on encryption' });
    expect(enable).toBeDisabled();
    await user.type(screen.getByLabelText('New passcode'), 'correct horse battery');
    await user.type(screen.getByLabelText('Repeat passcode'), 'correct horse battery');
    await user.click(screen.getByRole('checkbox', { name: /can’t be recovered/ }));
    await user.click(enable);

    await waitFor(() => expect(localStorage.getItem(VAULT_KEY)).not.toBeNull(), { timeout: 20000 });
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(VAULT_KEY)).not.toMatch(/"displayName"|"Kim"/); // plaintext would show these; random base64 can contain "Kim" by chance
    expect(await screen.findByText('Passcode lock is on')).toBeInTheDocument();

    // Lock → unlock screen; data not visible.
    await user.click(screen.getByRole('button', { name: /Lock now/ }));
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
    await user.type(screen.getByLabelText('Passcode'), 'correct horse battery');
    await user.click(screen.getByRole('button', { name: 'Unlock' }));
    expect(await screen.findByRole('heading', { level: 1, name: /Kim/ })).toBeInTheDocument();

    // Remove the passcode (needs the passcode); plain data comes back, vault is gone.
    await user.click(screen.getByRole('button', { name: 'Remove passcode' }));
    await user.type(screen.getByLabelText('Enter your passcode to remove it'), 'nope nope');
    await user.click(screen.getAllByRole('button', { name: 'Remove passcode' }).at(-1)!);
    expect(await screen.findByRole('alert', {}, { timeout: 20000 })).toHaveTextContent(/didn’t work/);
    await user.clear(screen.getByLabelText('Enter your passcode to remove it'));
    await user.type(screen.getByLabelText('Enter your passcode to remove it'), 'correct horse battery');
    await user.click(screen.getAllByRole('button', { name: 'Remove passcode' }).at(-1)!);
    await waitFor(() => expect(hasVault()).toBe(false), { timeout: 20000 });
    expect(localStorage.getItem(STORAGE_KEY)).toContain('Kim');
  }, 60_000);

  it('a mismatched or weak passcode cannot be turned on', async () => {
    const user = userEvent.setup();
    saveData(seeded());
    mount('/profile');
    await user.type(await screen.findByLabelText('New passcode'), 'abc');
    expect(screen.getByText(/at least 6/i)).toBeInTheDocument();
    await user.clear(screen.getByLabelText('New passcode'));
    await user.type(screen.getByLabelText('New passcode'), 'correct horse battery');
    await user.type(screen.getByLabelText('Repeat passcode'), 'correct horse');
    expect(screen.getByText(/don’t match/)).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: /can’t be recovered/ }));
    expect(screen.getByRole('button', { name: 'Turn on encryption' })).toBeDisabled();
  });
});
