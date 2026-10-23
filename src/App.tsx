import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { Navigate, NavLink, Route, Routes, useLocation, Link } from 'react-router';
import { Icon, LogoMark, Wordmark, type IconName } from './components/Icon';
import { FocusedLayout, StatusBanners } from './components/Layouts';
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
import { LibraryPage } from './features/library/LibraryPage';
import { NutritionPage } from './features/nutrition/NutritionPage';
import { BalanceGame } from './features/challenges/games/BalanceGame';
import { ReactionGame } from './features/challenges/games/ReactionGame';
import { QuizGame } from './features/challenges/games/QuizGame';
import { MemoryGame } from './features/challenges/games/MemoryGame';
import { PuzzleGame } from './features/challenges/games/PuzzleGame';
import { SimonGame } from './features/challenges/games/SimonGame';
import { TokenGate } from './features/challenges/TokenGate';
import { GAME_COSTS } from './domain/gamification/tokens';
import { BRAND } from './brand';
import { useApplyLayout } from './hooks/useLayout';

// Dev-only validation-trace recorder. `import.meta.env.DEV` is false in production builds, so this
// branch (and the dynamic import) is removed and /dev/record falls through to "Page not found".
const RecordTracePage = import.meta.env.DEV ? lazy(() => import('./features/dev/RecordTracePage').then((m) => ({ default: m.RecordTracePage }))) : null;

const NAV: { to: string; label: string; short: string; icon: IconName; phone: boolean }[] = [
  { to: '/', label: 'Home', short: 'Home', icon: 'home', phone: true },
  { to: '/plan', label: 'My Plan', short: 'Plan', icon: 'plan', phone: true },
  { to: '/workout', label: 'Today’s Workout', short: 'Today', icon: 'play', phone: true },
  { to: '/workouts', label: 'Workouts', short: 'Workouts', icon: 'dumbbell', phone: true },
  { to: '/nutrition', label: 'Nutrition', short: 'Nutrition', icon: 'apple', phone: false },
  { to: '/progress', label: 'Progress', short: 'Progress', icon: 'chart', phone: false },
  { to: '/challenges', label: 'Challenges', short: 'Challenges', icon: 'trophy', phone: false },
  { to: '/profile', label: 'Profile & Health', short: 'Profile', icon: 'user', phone: false },
  { to: '/demo', label: 'Demo mode', short: 'Demo', icon: 'spark', phone: false },
];

function useApplySettings() {
  const { data } = useStore();
  const s = data.settings;
  useApplyLayout(s.layout);
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.text = s.textSize;
    root.dataset.contrast = s.highContrast ? 'high' : 'normal';
    root.dataset.motion = s.motion === 'reduce' ? 'reduce' : 'system';
  }, [s.textSize, s.highContrast, s.motion]);
}

/** On route changes (not the first load), scroll to top and move focus to the main region for screen readers. */
function ScrollToTop() {
  const { pathname, hash } = useLocation();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (hash) return; // in-page anchors scroll themselves
    window.scrollTo?.(0, 0);
    document.getElementById('main')?.focus({ preventScroll: true });
  }, [pathname, hash]);
  return null;
}

function TokenChip() {
  const { tokens } = useStore();
  return (
    <Link to="/challenges" className="token-chip" aria-label={`${tokens.balance} tokens. Open challenges and games`}>
      <span className="coin coin-sm" aria-hidden="true">
        <Icon name="coin" size={14} />
      </span>
      <span className="num">{tokens.balance}</span>
    </Link>
  );
}

/** Phone only: the tabs that don't fit the bottom bar. Closes when you go anywhere (derived from the path it opened on). */
function MoreMenu({ tokens }: { tokens: number }) {
  const { pathname } = useLocation();
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === pathname;
  const extra = NAV.filter((n) => !n.phone);
  const active = extra.some((n) => pathname.startsWith(n.to));
  return (
    <div className="nav-more nav-phone-only">
      <button type="button" className="nav-more-btn" aria-expanded={open} aria-haspopup="true" aria-controls="more-menu" data-active={active} onClick={() => setOpenAt(open ? null : pathname)}>
        <Icon name="menu" size={22} />
        <span className="nav-label-short">More</span>
        {tokens > 0 ? <span className="nav-badge nav-badge-more" aria-hidden="true">{tokens}</span> : null}
      </button>
      {open ? (
        <div id="more-menu" className="more-sheet" role="menu" aria-label="More">
          {extra.map((n) => (
            <NavLink key={n.to} to={n.to} role="menuitem" aria-label={n.label} onClick={() => setOpenAt(null)}>
              <Icon name={n.icon} size={22} />
              <span>{n.label}</span>
              {n.to === '/challenges' && tokens > 0 ? <span className="more-tokens">{tokens} tokens</span> : null}
            </NavLink>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const { tokens } = useStore();
  return (
    <div className="shell">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <nav className="nav" aria-label="Main">
        <Link to="/" className="brand nav-desktop-only" aria-label={`${BRAND.name} home`}>
          <Wordmark />
        </Link>
        <div className="nav-desktop-only nav-tokens">
          <TokenChip />
        </div>
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'} aria-label={n.label} className={n.phone ? undefined : 'nav-desktop-link'}>
            <Icon name={n.icon} size={22} />
            <span className="nav-label-short">{n.short}</span>
            <span className="nav-label-long">{n.label}</span>
            {n.to === '/challenges' && tokens.balance > 0 ? (
              <span className="nav-badge" aria-hidden="true">
                {tokens.balance}
              </span>
            ) : null}
          </NavLink>
        ))}
        <MoreMenu tokens={tokens.balance} />
        <div className="nav-foot nav-desktop-only stack-sm">
          <span className="row" style={{ gap: 6 }}>
            <Icon name="lock" size={14} /> Stored only on this device
          </span>
          <span>General fitness guidance, not medical care.</span>
        </div>
      </nav>
      <div>
        <header className="topbar">
          <Link to="/" className="brand" aria-label={`${BRAND.name} home`}>
            <LogoMark size={28} />
            <span>{BRAND.name}</span>
          </Link>
          <div className="row" style={{ gap: 8 }}>
            <TokenChip />
            <Link to="/profile#privacy" className="badge badge-brand" aria-label="Privacy: data stays on this device">
              <Icon name="lock" size={13} /> On-device
            </Link>
          </div>
        </header>
        <main id="main" className="main" tabIndex={-1}>
          <StatusBanners />
          {children}
        </main>
      </div>
    </div>
  );
}

/** Pages that are useful before and after set-up: app navigation once you have a profile, focused layout before. */
function Adaptive({ children }: { children: ReactNode }) {
  const { data } = useStore();
  return data.profile ? <Shell>{children}</Shell> : <FocusedLayout actions={<Link className="btn btn-secondary btn-sm" to="/onboarding">Get started</Link>}>{children}</FocusedLayout>;
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
        <Route path="/welcome" element={<WelcomePage />} />
        <Route path="/onboarding" element={<FocusedLayout homeTo="/"><OnboardingPage /></FocusedLayout>} />
        <Route path="/about" element={<Adaptive><AboutPage /></Adaptive>} />
        <Route path="/evidence" element={<Adaptive><EvidencePage /></Adaptive>} />
        <Route path="/" element={<Shell><RequireProfile><HomePage /></RequireProfile></Shell>} />
        <Route path="/plan" element={<Shell><RequireProfile><PlanPage /></RequireProfile></Shell>} />
        <Route path="/workout" element={<Shell><RequireProfile><WorkoutPage /></RequireProfile></Shell>} />
        <Route path="/workouts" element={<Shell><RequireProfile><LibraryPage /></RequireProfile></Shell>} />
        <Route path="/nutrition" element={<Shell><RequireProfile><NutritionPage /></RequireProfile></Shell>} />
        <Route path="/progress" element={<Shell><RequireProfile><ProgressPage /></RequireProfile></Shell>} />
        <Route path="/challenges" element={<Shell><RequireProfile><ChallengesPage /></RequireProfile></Shell>} />
        <Route path="/challenges/balance" element={<Shell><RequireProfile><BalanceGame /></RequireProfile></Shell>} />
        <Route path="/challenges/reaction" element={<Shell><RequireProfile><ReactionGame /></RequireProfile></Shell>} />
        <Route
          path="/challenges/memory"
          element={
            <Shell>
              <RequireProfile>
                <TokenGate game="memory" cost={GAME_COSTS.memory} title="Memory Match" blurb="Find the matching pairs of pictures. Calm, no timer.">
                  {(end) => <MemoryGame onEnd={end} />}
                </TokenGate>
              </RequireProfile>
            </Shell>
          }
        />
        <Route
          path="/challenges/puzzle"
          element={
            <Shell>
              <RequireProfile>
                <TokenGate game="puzzle" cost={GAME_COSTS.puzzle} title="Photo Puzzle" blurb="Slide the pieces back into the picture.">
                  {(end) => <PuzzleGame onEnd={end} />}
                </TokenGate>
              </RequireProfile>
            </Shell>
          }
        />
        <Route
          path="/challenges/echo"
          element={
            <Shell>
              <RequireProfile>
                <TokenGate game="simon" cost={GAME_COSTS.simon} title="Colour Echo" blurb="Watch the colours, then repeat the pattern.">
                  {(end) => <SimonGame onEnd={end} />}
                </TokenGate>
              </RequireProfile>
            </Shell>
          }
        />
        <Route path="/challenges/quiz" element={<Adaptive><QuizGame /></Adaptive>} />
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
        <Route path="*" element={<Adaptive><NotFound /></Adaptive>} />
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
