import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Callout } from './ui';
import { Wordmark } from './Icon';
import { useOnline } from '../hooks/useOnline';
import { useStore } from '../state/store';

/** Offline / storage status shown at the top of any page. */
export function StatusBanners() {
  const { loadStatus } = useStore();
  const online = useOnline();
  return (
    <>
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
    </>
  );
}

/** Distraction-free layout for first-run screens: brand on top, no app navigation. */
export function FocusedLayout({ children, actions, homeTo = '/welcome' }: { children: ReactNode; actions?: ReactNode; homeTo?: string }) {
  return (
    <div className="focus-shell">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <header className="focus-top">
        <Link to={homeTo} aria-label="Verimove home">
          <Wordmark />
        </Link>
        <div className="row">{actions}</div>
      </header>
      <main id="main" className="focus-main" tabIndex={-1}>
        <StatusBanners />
        {children}
      </main>
    </div>
  );
}
