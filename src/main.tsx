import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, useLocation } from 'react-router';
import { App } from './App';
import { AppGate } from './state/Gate';
import { applyLayoutNow } from './hooks/useLayout';
import '@fontsource-variable/inter/wght.css';
import '@fontsource-variable/fraunces/wght.css';
import './styles/app.css';

const DemoPage = lazy(() => import('./features/demo/DemoPage').then((m) => ({ default: m.DemoPage })));

/** The presentation demo is self-contained: it runs on sample data and never touches the app's own data, even if it is locked. */
function Root() {
  const { pathname } = useLocation();
  if (pathname === '/demo' || pathname.startsWith('/demo/')) {
    return (
      <Suspense fallback={<p style={{ padding: 24 }}>Loading the demo…</p>}>
        <DemoPage />
      </Suspense>
    );
  }
  return (
    <AppGate>
      <App />
    </AppGate>
  );
}

// Pick phone or desktop layout before the first paint (avoids a flash of the wrong layout).
applyLayoutNow();

// Offline support (production only). The worker caches this app's own files; never personal data.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Root />
    </BrowserRouter>
  </StrictMode>,
);
