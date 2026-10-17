import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { App } from '../App';
import { StoreProvider } from '../state/store';
import { defaultData, type AppData } from '../state/storage';
import { generatePlan } from '../domain/plan/engine';
import { makeProfile } from '../domain/profile';

function seeded(): AppData {
  const d = defaultData();
  d.profile = makeProfile({ displayName: 'Kim' });
  const r = generatePlan(d.profile);
  if (!r.ok) throw new Error('no plan');
  d.plan = r.plan;
  return d;
}

function renderAt(path: string, data?: AppData) {
  return render(
    <StoreProvider initial={data ?? defaultData()}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </StoreProvider>,
  );
}

describe('app integration (jsdom)', () => {
  it('redirects a new user to the welcome page', () => {
    renderAt('/');
    expect(screen.getByRole('heading', { level: 1, name: /shows its work/ })).toBeInTheDocument();
  });

  it('renders every main area for a user with a plan, each with a level-1 heading', async () => {
    const user = userEvent.setup();
    renderAt('/', seeded());
    expect(screen.getByRole('heading', { level: 1, name: /Kim/ })).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Main' });
    for (const [link, heading] of [
      ['My Plan', /days a week/],
      ['Progress', /Your progress/],
      ['Challenges', /Challenges & games/],
      ['Profile & Health', /Kim/],
    ] as const) {
      await user.click(within(nav).getByRole('link', { name: link }));
      expect(screen.getByRole('heading', { level: 1, name: heading })).toBeInTheDocument();
    }
  });

  it('onboarding step 1 validates the guardian requirement for minors', async () => {
    const user = userEvent.setup();
    renderAt('/onboarding');
    const age = screen.getByRole('spinbutton', { name: 'Age' });
    await user.clear(age);
    await user.type(age, '10');
    await user.click(screen.getByRole('button', { name: /Continue/ }));
    expect(screen.getByText('A parent or guardian needs to confirm before continuing.')).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: /I am the parent or guardian/ }));
    await user.click(screen.getByRole('button', { name: /Continue/ }));
    expect(screen.getByRole('heading', { level: 1, name: 'Goals' })).toBeInTheDocument();
  });

  it('"Why this plan?" opens an explanation dialog with rules and assumptions', async () => {
    const user = userEvent.setup();
    renderAt('/plan', seeded());
    await user.click(screen.getByRole('button', { name: /Why this plan\?/ }));
    expect(screen.getByRole('heading', { name: 'How this plan was built' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Assumptions and uncertainty' })).toBeInTheDocument();
  });

  it('a user who needs assessment sees a referral on Home, not a workout', () => {
    const d = defaultData();
    d.profile = makeProfile({}, { recentSurgery: true });
    renderAt('/', d);
    expect(screen.getByRole('heading', { name: 'Please check with a health professional first' })).toBeInTheDocument();
    expect(screen.queryByText('Start workout')).not.toBeInTheDocument();
  });
});
