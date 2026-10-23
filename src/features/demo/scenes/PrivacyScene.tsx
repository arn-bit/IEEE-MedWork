import { useEffect, useState } from 'react';
import { EXERCISES } from '../../../domain/exercises/library';
import { EVIDENCE } from '../../../domain/evidence/registry';
import { ALL_FOODS } from '../../../nutrition/foods';
import type { SceneProps } from '../DemoPage';

/** Requests this page has made to any other site. The app's security policy blocks them, so this stays at zero. */
function externalRequests(): number {
  try {
    return performance.getEntriesByType('resource').filter((e) => {
      try {
        return new URL(e.name).origin !== location.origin && !e.name.startsWith('data:') && !e.name.startsWith('blob:');
      } catch {
        return false;
      }
    }).length;
  } catch {
    return 0;
  }
}

export function PrivacyScene({ elapsed, onReplay }: SceneProps & { onReplay: () => void }) {
  const [external, setExternal] = useState(0);
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const id = window.setInterval(() => setExternal(externalRequests()), 500);
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  const tiles = [
    { n: '0', l: 'accounts needed' },
    { n: '0', l: 'photos or videos uploaded' },
    { n: String(external), l: 'requests to other sites (live)' },
    { n: online ? 'Yes' : 'Offline now', l: 'works with no connection' },
  ];
  return (
    <div className="demo-privacy">
      <ul className="demo-tiles" aria-label="Privacy facts">
        {tiles.map((t, i) => (
          <li key={t.l} className="demo-tile" style={{ opacity: elapsed > 300 + i * 450 ? 1 : 0, transform: elapsed > 300 + i * 450 ? 'none' : 'translateY(14px)' }}>
            <strong className="num">{t.n}</strong>
            <span>{t.l}</span>
          </li>
        ))}
      </ul>
      <p className="demo-facts" style={{ opacity: elapsed > 2300 ? 1 : 0 }}>
        {EXERCISES.length} exercises with camera counting · {ALL_FOODS.length} foods recognised · {EVIDENCE.length} evidence sources · open-source models
      </p>
      <div className="demo-end" style={{ opacity: elapsed > 3800 ? 1 : 0 }}>
        <strong>Thank you</strong>
        <span className="demo-url">github.com/arn-bit/IEEE-MedWork</span>
        <button className="demo-go demo-go-small" onClick={onReplay}>
          Replay the demo
        </button>
      </div>
    </div>
  );
}
