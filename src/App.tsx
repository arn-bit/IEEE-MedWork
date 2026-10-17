import { lazy, Suspense, useEffect, useRef, type ReactNode } from 'react';
import { Navigate, NavLink, Route, Routes, useLocation, Link } from 'react-router';
import { Icon, LogoMark, type IconName } from './components/Icon';
import { useStore } from './state/store';
import { WelcomePage } from './features/welcome/WelcomePage';
import { OnboardingPage } from './features/onboarding/OnboardingPage';
import { HomePage } from './features/home/HomePage';
import { PlanPage } from './features/plan/PlanPage';
import { WorkoutPage } from './features/workout/WorkoutPage';
import { ProgressPage } from './features/progress/ProgressPage';
import { ChallengesPage } from './features/challenges/ChallengesPage';
import { ProfilePage } from './features/profile/ProfilePage';
import { EvidencePage } from './features/profile/EvidencePage';
import { AboutPage } from './features/profile/AboutPage';
import { SummaryPage } from './features/profile/SummaryPage';
import { useOnline } from './hooks/useOnline';
import { BalanceGame } from './features/challenges/games/BalanceGame';
import { ReactionGame } from './features/challenges/games/ReactionGame';
import { QuizGame } from './features/challenges/games/QuizGame';
import { Callout } from './components/ui';

// Dev-only validation-trace recorder. `import.meta.env.DEV` is false in production builds, so this
// branch (and the dynamic import) is removed and /dev/record falls through to "Page not found".
const RecordTracePage = import.meta.env.DEV ? lazy(() => import('./features/dev/RecordTracePage').then((m) => ({ default: m.RecordTracePage }))) : null;

const NAV: { to: string; label: string; short: string; icon: IconName }[] = [
  { to: '/', label: 'Home', short: 'Home', icon: 'home' },
  { to: '/plan', label: 'My Plan', short: 'Plan', icon: 'plan' },
  { to: '/workout', label: 'Workout', short: 'Workout', icon: 'play' },
  { to: '/progress', label: 'Progress', short: 'Progress', icon: 'chart' },
  { to: '/challenges', label: 'Challenges', short: 'Challenges', icon: 'trophy' },
  { to: '/profile', label: 'Profile & Health', short: 'Profile', icon: 'user' },
];

function useApplySettings() {
  const { data } = useStore();
  const s = data.settings;
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.text = s.textSize;
    root.dataset.contrast = s.highContrast ? 'high' : 'normal';
    root.dataset.motion = s.motion === 'reduce' ? 'reduce' : 'system';
  }, [s.textSize, s.highContrast, s.motion]);
}

/** On route changes (not the first load), scroll to top and move focus to the main region for screen readers. */
function ScrollToTop() {
  const { pathname } = useLocation();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    window.scrollTo?.(0, 0);
    document.getElementById('main')?.focus({ preventScroll: true });
  }, [pathname]);
  return null;
}

function Shell({ children }: { children: ReactNode }) {
  const { loadStatus } = useStore();
  const online = useOnline();
  return (
    <div className="shell">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <nav className="nav" aria-label="Main">
        <Link to="/" className="brand nav-desktop-only" aria-label="Medical Workout home">
          <LogoMark />
          <span>Medical Workout</span>
        </Link>
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'} aria-label={n.label}>
            <Icon name={n.icon} size={22} />
            <span className="nav-label-short">{n.short}</span>
            <span className="nav-label-long">{n.label}</span>
          </NavLink>
        ))}
        <div className="nav-foot nav-desktop-only stack-sm">
          <span className="row" style={{ gap: 6 }}>
            <Icon name="lock" size={14} /> Stored only on this device
          </span>
          <span>General fitness guidance — not medical care.</span>
        </div>
      </nav>
      <div>
        <header className="topbar">
          <Link to="/" className="brand">
            <LogoMark size={28} />
            <span>Medical Workout</span>
          </Link>
          <Link to="/profile#privacy" className="badge badge-brand" aria-label="Privacy: data stays on this device">
            <Icon name="lock" size={13} /> On-device
          </Link>
        </header>
        <main id="main" className="main" tabIndex={-1}>
          {!online ? (
            <div style={{ marginBottom: 16 }} role="status">
              <Callout tone="info" title="You’re offline">
                Everything still works on this device. Camera tracking works offline once the model has loaded at least once.
              </Callout>
            </div>
          ) : null}
          {loadStatus === 'corrupt' ? (
            <div style={{ marginBottom: 16 }}>
              <Callout tone="warn" title="Saved data could not be read">
                Your saved data on this device was damaged or from an incompatible version, so the app started fresh. Nothing was sent anywhere.
              </Callout>
            </div>
          ) : null}
          {loadStatus === 'unavailable' ? (
            <div style={{ marginBottom: 16 }}>
              <Callout tone="warn" title="Storage is unavailable">
                This browser is blocking local storage (for example, in some private modes). The app works, but your progress will not be saved after you close this tab.
              </Callout>
            </div>
          ) : null}
          {children}
        </main>
      </div>
    </div>
  );
}

function RequireProfile({ children }: { children: ReactNode }) {
  const { data } = useStore();
  if (!data.profile) return <Navigate to="/welcome" replace />;
  return <>{children}</>;
}

export function App() {
  useApplySettings();
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route path="/welcome" element={<Shell><WelcomePage /></Shell>} />
        <Route path="/onboarding" element={<Shell><OnboardingPage /></Shell>} />
        <Route path="/about" element={<Shell><AboutPage /></Shell>} />
        <Route path="/evidence" element={<Shell><EvidencePage /></Shell>} />
        <Route path="/" element={<Shell><RequireProfile><HomePage /></RequireProfile></Shell>} />
        <Route path="/plan" element={<Shell><RequireProfile><PlanPage /></RequireProfile></Shell>} />
        <Route path="/workout" element={<Shell><RequireProfile><WorkoutPage /></RequireProfile></Shell>} />
        <Route path="/progress" element={<Shell><RequireProfile><ProgressPage /></RequireProfile></Shell>} />
        <Route path="/challenges" element={<Shell><RequireProfile><ChallengesPage /></RequireProfile></Shell>} />
        <Route path="/challenges/balance" element={<Shell><RequireProfile><BalanceGame /></RequireProfile></Shell>} />
        <Route path="/challenges/reaction" element={<Shell><RequireProfile><ReactionGame /></RequireProfile></Shell>} />
        <Route path="/challenges/quiz" element={<Shell><QuizGame /></Shell>} />
        <Route path="/profile" element={<Shell><ProfilePage /></Shell>} />
        <Route path="/summary" element={<Shell><RequireProfile><SummaryPage /></RequireProfile></Shell>} />
        {RecordTracePage ? (
          <Route
            path="/dev/record"
            element={
              <Shell>
                <Suspense fallback={<p className="muted">Loading…</p>}>
                  <RecordTracePage />
                </Suspense>
              </Shell>
            }
          />
        ) : null}
        <Route path="*" element={<Shell><NotFound /></Shell>} />
      </Routes>
    </>
  );
}

function NotFound() {
  return (
    <div className="card empty">
      <h1>Page not found</h1>
      <p className="muted">That page does not exist.</p>
      <Link className="btn btn-primary" to="/">
        Go home
      </Link>
    </div>
  );
}
