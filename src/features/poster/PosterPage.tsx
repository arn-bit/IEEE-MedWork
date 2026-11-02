import { useEffect, useRef, useState } from 'react';
import { EXERCISES } from '../../domain/exercises/library';
import { EVIDENCE } from '../../domain/evidence/registry';
import { ALL_FOODS } from '../../nutrition/foods';
import { COUNTERS } from '../../pose/counters';
import { ACTIVITIES, HOLDS } from '../../pose/detectors';
import { LogoMark } from '../../components/Icon';
import { POSTER } from './content';
import './poster.css';

const PX_PER_IN = 96;
const W = POSTER.widthIn * PX_PER_IN;
const H = POSTER.heightIn * PX_PER_IN;

/** Live numbers from the app itself, so the poster can never disagree with the software. */
export function posterFacts() {
  return {
    exercises: EXERCISES.length,
    foods: ALL_FOODS.length,
    sources: EVIDENCE.length,
    repCounters: Object.keys(COUNTERS).length,
    holds: Object.keys(HOLDS).length,
    movement: Object.keys(ACTIVITIES).length,
  };
}

/** Inputs on the left, everything inside the dashed box runs on the device, results on the right. */
function Architecture() {
  const box = (x: number, y: number, w: number, title: string, sub: string) => (
    <g>
      <rect x={x} y={y} width={w} height={100} rx={20} fill="#ffffff" stroke="#0b3d31" strokeWidth={3} />
      <text x={x + w / 2} y={y + 42} textAnchor="middle" className="pz-svg-t">
        {title}
      </text>
      <text x={x + w / 2} y={y + 80} textAnchor="middle" className="pz-svg-s">
        {sub}
      </text>
    </g>
  );
  const arrow = (x1: number, y: number, x2: number) => <line x1={x1} y1={y} x2={x2} y2={y} stroke="#0b3d31" strokeWidth={5} markerEnd="url(#pz-arrow)" />;
  const ys = [70, 210, 350];
  return (
    <svg viewBox="0 0 1060 480" className="pz-arch" role="img" aria-label="Architecture: typed notes, camera and meal photos go through safety rules, the plan engine, a pose tracker and food recognisers, all on the device, to a safe plan with sources, live counts and meal totals.">
      <defs>
        <marker id="pz-arrow" markerWidth="12" markerHeight="12" refX="9" refY="6" orient="auto">
          <path d="M0 0 L10 6 L0 12z" fill="#0b3d31" />
        </marker>
      </defs>
      <rect x={200} y={14} width={600} height={452} rx={30} fill="#e8f6f0" stroke="#0a8463" strokeWidth={5} strokeDasharray="18 12" />
      <text x={500} y={52} textAnchor="middle" className="pz-svg-h">
        On the device: no network
      </text>
      {box(214, ys[0]!, 262, 'Safety rules', 'fixed, testable')}
      {box(524, ys[0]!, 262, 'Plan engine', 'with sources')}
      {arrow(476, ys[0]! + 50, 520)}
      {box(220, ys[1]!, 560, 'Pose tracker', 'BlazePose, 33 body points')}
      {box(220, ys[2]!, 560, 'Food recognisers', 'EfficientNet-B0 + CLIP')}
      {['your notes', 'camera', 'meal photo'].map((t, i) => (
        <text key={t} x={4} y={ys[i]! + 44} className="pz-svg-s" textAnchor="start">
          {t}
        </text>
      ))}
      {['safe plan', 'live counts', 'meal totals'].map((t, i) => (
        <text key={t} x={862} y={ys[i]! + 44} className="pz-svg-s" textAnchor="start">
          {t}
        </text>
      ))}
      {ys.map((y) => (
        <g key={y}>
          {arrow(172, y + 50 - 4, 216)}
          {arrow(782, y + 50 - 4, 858)}
        </g>
      ))}
    </svg>
  );
}

function Fig({ src, alt, caption, className }: { src: string; alt: string; caption: string; className?: string }) {
  return (
    <figure className={`pz-fig${className ? ` ${className}` : ''}`}>
      <img src={src} alt={alt} />
      <figcaption>{caption}</figcaption>
    </figure>
  );
}

/** Short statements in big type; the presenter supplies the rest. */
function Big({ items }: { items: readonly string[] }) {
  return (
    <ul className="pz-big">
      {items.map((t) => (
        <li key={t}>{t}</li>
      ))}
    </ul>
  );
}

/** Boxes joined by arrows. */
function Chain({ items, className }: { items: readonly string[]; className?: string }) {
  return (
    <ol className={`pz-chain${className ? ` ${className}` : ''}`}>
      {items.map((t, i) => (
        <li key={t}>
          <span>{t}</span>
          {i < items.length - 1 ? <b aria-hidden="true">→</b> : null}
        </li>
      ))}
    </ol>
  );
}

/** A garden that grows with weekly consistency, drawn as five pots. */
function Garden() {
  return (
    <svg viewBox="0 0 500 120" className="pz-garden" role="img" aria-label="A garden growing from a seed to a flower as weekly consistency rises">
      {[0, 1, 2, 3, 4].map((i) => {
        const x = 50 + i * 100;
        const h = 14 + i * 16;
        return (
          <g key={i}>
            <rect x={x - 26} y={92} width={52} height={22} rx={6} fill="#a4481f" />
            <line x1={x} y1={92} x2={x} y2={92 - h} stroke="#0a8463" strokeWidth={6} strokeLinecap="round" />
            <ellipse cx={x - 12} cy={92 - h * 0.6} rx={11} ry={6} fill="#12b58c" />
            <ellipse cx={x + 12} cy={92 - h * 0.8} rx={11} ry={6} fill="#12b58c" />
            {i >= 3 ? <circle cx={x} cy={92 - h - 8} r={9 + (i - 3) * 3} fill={i === 4 ? '#ff7a45' : '#ffd166'} /> : null}
          </g>
        );
      })}
    </svg>
  );
}

/** Which model does which job, in one picture. */
function ModelMap() {
  const node = (x: number, y: number, w: number, t: string) => (
    <g>
      <rect x={x} y={y} width={w} height={80} rx={18} fill="#fff" stroke="#0b3d31" strokeWidth={3} />
      <text x={x + w / 2} y={y + 51} textAnchor="middle" className="pz-svg-t">
        {t}
      </text>
    </g>
  );
  const arrow = (x1: number, y: number, x2: number) => <line x1={x1} y1={y} x2={x2} y2={y} stroke="#0b3d31" strokeWidth={5} markerEnd="url(#pz-arrow2)" />;
  return (
    <svg viewBox="0 0 1000 380" className="pz-arch pz-map" role="img" aria-label="Camera frames go through MediaPipe Pose to body points and rep counts. Meal photos go through EfficientNet and CLIP to plate totals. ONNX Runtime runs the food models.">
      <defs>
        <marker id="pz-arrow2" markerWidth="12" markerHeight="12" refX="9" refY="6" orient="auto">
          <path d="M0 0 L10 6 L0 12z" fill="#0b3d31" />
        </marker>
      </defs>
      {node(10, 30, 190, 'Camera')}
      {arrow(204, 70, 276)}
      {node(280, 30, 270, 'MediaPipe Pose')}
      {arrow(554, 70, 626)}
      {node(630, 30, 360, '33 points → reps')}
      {node(10, 160, 190, 'Meal photo')}
      {arrow(204, 200, 276)}
      {node(280, 135, 270, 'EfficientNet-B0')}
      {node(280, 225, 270, 'CLIP ViT-B/32')}
      {arrow(554, 175, 626)}
      {arrow(554, 265, 626)}
      {node(630, 160, 360, 'Plate totals')}
      <rect x={280} y={310} width={710} height={56} rx={14} fill="#e8f6f0" stroke="#0a8463" strokeWidth={3} strokeDasharray="12 8" />
      <text x={635} y={348} textAnchor="middle" className="pz-svg-s">
        ONNX Runtime Web runs the food models
      </text>
    </svg>
  );
}

/**
 * A print-ready conference poster, drawn at its full size and scaled to fit the screen.
 * Press Print (or "Save as PDF") for the real thing: the page size is set to the poster size.
 * Three flaps: LEFT explains the features, CENTER shows the workflows and why it is better, RIGHT lists the models.
 * Mostly pictures: the presenter does the talking.
 */
export function PosterPage() {
  const f = posterFacts();
  const wrap = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(() => (typeof window === 'undefined' ? 0.25 : Math.min(window.innerWidth / W, (window.innerHeight - 64) / H)));

  useEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / W, (window.innerHeight - 64) / H));
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  return (
    <div className="pz-page">
      <div className="pz-bar">
        <strong>Poster view</strong>
        <span>
          {POSTER.widthIn} × {POSTER.heightIn} in, landscape
        </span>
        <button onClick={() => window.print()}>Print or save as PDF</button>
        <a href="/">Back to the app</a>
      </div>
      <div className="pz-stage" ref={wrap} style={{ width: W * scale, height: H * scale }} data-scale={scale.toFixed(4)}>
        <article className="pz" style={{ width: W, height: H, transform: `scale(${scale})` }} aria-label="Conference poster">
          <header className="pz-head">
            <div className="pz-logo">
              <LogoMark size={300} />
            </div>
            <div className="pz-titles">
              <h1>{POSTER.title}</h1>
              <p className="pz-sub">{POSTER.subtitle}</p>
              <p className="pz-authors">{POSTER.authors}</p>
              <p className="pz-event">{POSTER.event}</p>
            </div>
            <div className="pz-try">
              <span className="pz-try-label">Try it now, no sign-up</span>
              <strong className="pz-url">{POSTER.siteHost}</strong>
              <span className="pz-try-sub">
                then tap <b>Demo mode</b> for the 90-second tour
              </span>
            </div>
          </header>

          <div className="pz-body">
            {/* LEFT flap: how the three features work */}
            <section className="pz-flap pz-flap-left" aria-label="How the features work">
              <h2 className="pz-flap-title">How it works</h2>
              <div className="pz-block">
                <h3>Pose tracking</h3>
                <Fig src="/img/poster/camera.jpg" alt="Full-screen workout view with a timer in one corner, a rep counter in the other and a status line saying the app is counting" caption="Timer left, rep counter right, status line says if it is counting (simulated body points)." className="pz-fig-wide" />
                <div className="pz-tiles" aria-label="Detectors">
                  <div>
                    <b>{f.repCounters}</b>
                    <span>rep counters</span>
                  </div>
                  <div>
                    <b>{f.holds}</b>
                    <span>hold timers</span>
                  </div>
                  <div>
                    <b>{f.movement}</b>
                    <span>movement timers</span>
                  </div>
                </div>
                <Big items={POSTER.pose} />
              </div>
              <div className="pz-block">
                <h3>Gamification</h3>
                <div className="pz-earn">
                  <div className="pz-coin">
                    <b>5+1</b>
                    <span>tokens per exercise, up to 8</span>
                  </div>
                  <b className="pz-plus" aria-hidden="true">
                    →
                  </b>
                  <ul className="pz-games" aria-label="Reward games and their token cost">
                    {POSTER.games.map(([g, c]) => (
                      <li key={g}>
                        <span>{g}</span>
                        <b>{c}</b>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="pz-zeros">
                  <span>Stop early: 0</span>
                  <span>Extra sessions: 0</span>
                  <span>Rest day: 2</span>
                </div>
                <Garden />
                <Big items={POSTER.gamification} />
              </div>
              <div className="pz-block">
                <h3>Nutrition</h3>
                <div className="pz-split">
                  <Fig src="/img/poster/nutrition.jpg" alt="A burger and chips photo read as two foods, with amounts, calories and daily-value bars for the whole plate" caption="Burger and chips: two foods, whole-plate bars." />
                  <div className="pz-vert">
                    <Chain items={POSTER.foodSteps} className="pz-chain-v" />
                    <Big items={POSTER.food} />
                  </div>
                </div>
              </div>
            </section>

            {/* CENTER flap: built with Claude, the in-app workflow, and why it is better */}
            <section className="pz-flap pz-flap-center" aria-label="Workflows and comparison">
              <h2 className="pz-flap-title">How it was built and how it runs</h2>
              <div className="pz-block">
                <h3>Built with Claude: the development workflow</h3>
                <ol className="pz-flow">
                  {POSTER.claudeFlow.map((s, i) => (
                    <li key={s.t}>
                      <span className="pz-n">{i + 1}</span>
                      <strong>{s.t}</strong>
                      <span>{s.d}</span>
                    </li>
                  ))}
                </ol>
                <Chain items={POSTER.claudeChecks} className="pz-chain-s" />
              </div>
              <div className="pz-block">
                <h3>Inside the app: how a plan is made</h3>
                <Architecture />
                <Chain items={POSTER.engine} className="pz-chain-s" />
              </div>
              <div className="pz-block pz-block-why">
                <h3>Why it beats a general exercise app</h3>
                <table className="pz-compare">
                  <thead>
                    <tr>
                      <th scope="col"></th>
                      <th scope="col">Typical apps</th>
                      <th scope="col">Verimove</th>
                    </tr>
                  </thead>
                  <tbody>
                    {POSTER.compare.map(([what, them, us]) => (
                      <tr key={what}>
                        <th scope="row">{what}</th>
                        <td>
                          <i aria-hidden="true">✕</i> {them}
                        </td>
                        <td>
                          <i aria-hidden="true">✓</i> {us}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="pz-note">{POSTER.compareNote}</p>
                <div className="pz-stats" aria-label="Key numbers">
                  <div>
                    <b>{f.exercises}</b>
                    <span>exercises, all with camera counting</span>
                  </div>
                  <div>
                    <b>{f.foods}+</b>
                    <span>foods recognised</span>
                  </div>
                  <div>
                    <b>{f.sources}</b>
                    <span>evidence sources</span>
                  </div>
                  <div>
                    <b>0</b>
                    <span>accounts or uploads</span>
                  </div>
                </div>
              </div>
            </section>

            {/* RIGHT flap: the models and where they came from */}
            <section className="pz-flap pz-flap-right" aria-label="Models used">
              <h2 className="pz-flap-title">The models inside</h2>
              <ul className="pz-models">
                {POSTER.models.map((m) => (
                  <li key={m.name}>
                    <span className="pz-badge" aria-hidden="true">
                      {m.badge}
                    </span>
                    <div>
                      <strong>{m.name}</strong>
                      <em>
                        {m.maker} · {m.job}
                      </em>
                      <span className="pz-model-note">{m.from}</span>
                      <span className="pz-facts">
                        {m.facts.map((x) => (
                          <i key={x}>{x}</i>
                        ))}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
              <ModelMap />
              <p className="pz-callout">{POSTER.modelsNote}</p>
              <div className="pz-block">
                <h3>Limits</h3>
                <div className="pz-tags">
                  {POSTER.limits.map((t) => (
                    <span key={t}>{t}</span>
                  ))}
                </div>
              </div>
              <div className="pz-block">
                <h3>References</h3>
                <ol className="pz-refs">
                  {POSTER.references.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ol>
                <p className="pz-contact">
                  Code and contact: <b>{POSTER.repo}</b> · <b>{POSTER.contact}</b>
                </p>
              </div>
            </section>
          </div>
        </article>
      </div>
    </div>
  );
}
