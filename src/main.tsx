import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { App } from './App';
import { AppGate } from './state/Gate';
import { applyLayoutNow } from './hooks/useLayout';
import '@fontsource-variable/inter/wght.css';
import '@fontsource-variable/fraunces/wght.css';
import './styles/app.css';

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
      <AppGate>
        <App />
      </AppGate>
    </BrowserRouter>
  </StrictMode>,
);
