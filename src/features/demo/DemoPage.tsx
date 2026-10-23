import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Icon, Wordmark } from '../../components/Icon';
import { SCENES, TOTAL_MS, formatClock, sceneAt, sceneStart, type SceneId } from './script';
import { buildDemo } from './data';
import { analyzePhoto, warmFoodModels, type PlateItem } from '../../nutrition/recognize';
import { TitleScene } from './scenes/TitleScene';
import { WordsScene } from './scenes/WordsScene';
import { PlanScene } from './scenes/PlanScene';
import { CameraScene } from './scenes/CameraScene';
import { RewardsScene } from './scenes/RewardsScene';
import { FoodScene } from './scenes/FoodScene';
import { PrivacyScene } from './scenes/PrivacyScene';
import './demo.css';

const nowMs = () => performance.now();
export type ModelState = 'loading' | 'ready' | 'failed';

export interface SceneProps {
  /** Milliseconds into this scene. */
  elapsed: number;
  playing: boolean;
  demo: ReturnType<typeof buildDemo>;
}

/**
 * A scripted, one-minute tour of Verimove for presentations. It is self-contained: it uses the app's real
 * engines (health-text analysis, plan generation, rep counting, food recognition) on a sample person, and
 * never reads or writes the visitor's own data.
 */
export function DemoPage() {
  const demo = useMemo(() => buildDemo(), []);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const auto = params.get('autostart') === '1';
  const [started, setStarted] = useState(auto);
  const [playing, setPlaying] = useState(auto);
  const [t, setT] = useState(0);
  const tRef = useRef(0);
  const [notes, setNotes] = useState(false);
  const [slow, setSlow] = useState(false);
  const [models, setModels] = useState<ModelState>('loading');
  const [plate, setPlate] = useState<PlateItem[] | null>(null);
  const [plateTried, setPlateTried] = useState(false);
  const analysing = useRef(false);
  const last = useRef(0);
  const stage = useRef<HTMLDivElement>(null);

  // Starting waits for the on-device AI to finish preparing (with a time limit), so nothing stutters on stage.
  const [waited, setWaited] = useState(false);
  const ready = plateTried || waited;
  const { index, elapsed, done } = sceneAt(t);
  const scene = SCENES[index]!;

  // Warm the food models while the title is up, so the nutrition scene is instant.
  useEffect(() => {
    let live = true;
    warmFoodModels().then(
      () => live && setModels('ready'),
      () => live && setModels('failed'),
    );
    return () => {
      live = false;
    };
  }, []);

  // Clock: advances only while playing, so pausing really pauses.
  useEffect(() => {
    if (!started || !playing) return;
    last.current = nowMs();
    let raf = 0;
    const tick = () => {
      const n = nowMs();
      const dt = n - last.current;
      last.current = n;
      tRef.current = Math.min(TOTAL_MS, tRef.current + dt * (slow ? 0.66 : 1));
      setT(tRef.current);
      if (tRef.current >= TOTAL_MS) {
        setPlaying(false); // stop at the end instead of looping forever
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [started, playing, slow]);

  useEffect(() => {
    const id = window.setTimeout(() => setWaited(true), 45_000);
    return () => window.clearTimeout(id);
  }, []);

  // Read the sample plate as soon as the models are ready, BEFORE the show starts: inference briefly
  // occupies the page, so doing it up front keeps every animation smooth while presenting.
  useEffect(() => {
    if (analysing.current) return;
    if (models === 'loading') return;
    analysing.current = true;
    (async () => {
      try {
        if (models === 'failed') throw new Error('models unavailable');
        const res = await fetch('/img/demo-plate.jpg');
        setPlate(await analyzePhoto(await res.blob()));
      } catch {
        setPlate(null); // the scene falls back to a prepared result, so the timeline never stalls
      }
      setPlateTried(true);
    })();
  }, [models]);

  const start = useCallback(() => {
    tRef.current = 0;
    setT(0);
    setStarted(true);
    setPlaying(true);
  }, []);

  const seek = useCallback((i: number) => {
    tRef.current = sceneStart(Math.max(0, Math.min(SCENES.length - 1, i)));
    setT(tRef.current);
    setStarted(true);
    setPlaying(true);
  }, []);

  const toggleFullscreen = useCallback(() => {
    try {
      if (document.fullscreenElement) void document.exitFullscreen();
      else void (stage.current ?? document.documentElement).requestFullscreen?.();
    } catch {
      /* not available */
    }
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === ' ' || k === 'k') {
        e.preventDefault();
        if (!started) {
          if (ready) start();
        } else if (done) start();
        else setPlaying((p) => !p);
      } else if (k === 'arrowright' || k === 'l') seek(index + 1);
      else if (k === 'arrowleft' || k === 'j') seek(elapsed > 1500 ? index : index - 1);
      else if (k === 'r') start();
      else if (k === 'n') setNotes((n) => !n);
      else if (k === 'f') toggleFullscreen();
      else if (k === 's') setSlow((x) => !x);
      else if (k === 'escape' && !document.fullscreenElement) navigate('/');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [started, done, ready, index, elapsed, seek, start, toggleFullscreen, navigate]);

  const props: SceneProps = { elapsed, playing, demo };
  const body: Record<SceneId, ReactNode> = {
    title: <TitleScene {...props} models={models} />,
    words: <WordsScene {...props} />,
    plan: <PlanScene {...props} />,
    camera: <CameraScene {...props} />,
    rewards: <RewardsScene {...props} />,
    food: <FoodScene {...props} plate={plate} models={models} />,
    privacy: <PrivacyScene {...props} onReplay={start} />,
  };

  return (
    <div className="showtime" ref={stage} data-scene={scene.id} data-playing={playing}>
      <header className="demo-top">
        <Link to="/" className="demo-brand" aria-label="Exit demo mode">
          <Wordmark size={30} />
        </Link>
        <div className="demo-clock" aria-live="off">
          <span className="num">{formatClock(t)}</span> / 1:00{slow ? ' · relaxed pace' : ''}
        </div>
        <div className="demo-actions">
          <button className="demo-btn" onClick={() => setNotes((n) => !n)} aria-pressed={notes} title="Speaker notes (N)">
            Notes
          </button>
          <button className="demo-btn" onClick={() => setSlow((s) => !s)} aria-pressed={slow} title="Relaxed pace, about 90 seconds (S)">
            Slower
          </button>
          <button className="demo-btn" onClick={toggleFullscreen} title="Full screen (F)">
            Full screen
          </button>
          <Link to="/" className="demo-btn" title="Back to the app (Esc)">
            Exit demo
          </Link>
        </div>
      </header>

      <main className="demo-stage" id="main" tabIndex={-1} aria-label={`Scene ${index + 1} of ${SCENES.length}: ${scene.headline}`}>
        {!started ? (
          <section className="demo-start" aria-labelledby="demo-start-h">
            <span className="demo-eyebrow">Live demo</span>
            <h1 id="demo-start-h">Verimove in one minute</h1>
            <p>Seven scenes, 60 seconds. It uses the app’s real engines on a sample person, so nothing here touches your own data.</p>
            <button className="demo-go" onClick={start} disabled={!ready} aria-describedby="demo-ready-note">
              <Icon name="play" size={22} /> {ready ? 'Start the demo' : 'Preparing on-device AI…'}
            </button>
            <span id="demo-ready-note" className="visually-hidden">
              The demo starts when the on-device AI is ready, so it never stutters while you present.
            </span>
            <ul className="demo-checks" aria-label="Before you present">
              <li data-ok={models === 'ready'}>{models === 'ready' ? '✓ On-device AI ready' : models === 'failed' ? '! AI models not loaded (the demo will use prepared results)' : '… Warming up on-device AI'}</li>
              <li data-ok={plateTried && !!plate}>{plateTried ? (plate ? '✓ Sample plate already read on this device' : '! Sample plate will use a prepared result') : '… Reading the sample plate'}</li>
              <li data-ok="true">✓ No network needed once loaded</li>
              <li data-ok="true">✓ Space pauses · ← → switch scenes · N notes · F full screen · Esc exits demo mode</li>
            </ul>
          </section>
        ) : (
          <section className="demo-scene" key={scene.id} aria-live="off">
            <div className="demo-caption">
              <h1>{scene.headline}</h1>
              <p>{scene.sub}</p>
            </div>
            <div className="demo-body">{body[scene.id]}</div>
          </section>
        )}
      </main>

      {notes && started ? (
        <aside className="demo-notes" aria-label="Speaker notes">
          <span className="demo-eyebrow">
            Scene {index + 1} · {scene.label}
          </span>
          <p>{scene.notes}</p>
        </aside>
      ) : null}

      <nav className="demo-bar" aria-label="Demo scenes">
        <button className="demo-btn demo-btn-icon" onClick={() => (!started || done ? (ready || started) && start() : setPlaying((p) => !p))} aria-label={!started ? 'Start' : done ? 'Replay' : playing ? 'Pause' : 'Play'}>
          <Icon name={!started || done ? 'restart' : playing ? 'pause' : 'play'} size={18} />
        </button>
        <ol className="demo-steps">
          {SCENES.map((s, i) => (
            <li key={s.id} style={{ flexGrow: s.ms }}>
              <button className="demo-step" data-state={i < index ? 'done' : i === index ? 'now' : 'next'} onClick={() => seek(i)} aria-current={i === index && started ? 'step' : undefined}>
                <span className="demo-step-fill" style={{ transform: `scaleX(${!started ? 0 : i < index ? 1 : i === index ? elapsed / s.ms : 0})` }} />
                <span className="demo-step-label">{s.label}</span>
              </button>
            </li>
          ))}
        </ol>
      </nav>
    </div>
  );
}
