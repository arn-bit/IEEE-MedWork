import { useMemo, useState, type ReactNode } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { useStore } from '../../state/store';
import { BRAND } from '../../brand';
import { generatePlan, DAY_NAMES } from '../../domain/plan/engine';
import { getExercise } from '../../domain/exercises/library';
import { makeProfile } from '../../domain/profile';
import type { PlannedItem, PlannedSession } from '../../domain/types';
import { EvidenceKindBadge, EvidenceRefs, formatDuration } from '../../components/ui';
import { Icon, Wordmark, type IconName } from '../../components/Icon';
import { FigureDemo } from '../../components/demo/FigureDemo';
import { StatusBanners } from '../../components/Layouts';
import { Scene } from '../../components/Illustrations';
import { Photo, type PhotoName } from '../../components/Photo';
import { describePrescription } from '../plan/PlanPage';
import { RestoreBackup } from './RestoreBackup';

/** A real plan from the real engine for a sample person, so the example is never mocked up. */
function useSample(): PlannedSession | null {
  return useMemo(() => {
    const r = generatePlan(
      makeProfile({ ageYears: 52, goals: ['strength', 'balance'], minutesPerSession: 20, daysPerWeek: 3, activityLevel: 'some', experience: 'new', equipment: ['chair', 'wall'] }),
      new Date('2026-10-16T09:00:00Z'),
    );
    return r.ok ? (r.plan.schedule.find(Boolean) ?? null) : null;
  }, []);
}

const FEATURES: { icon: IconName; title: string; text: string }[] = [
  { icon: 'shield', title: 'Safety first, in plain rules', text: 'Emergency signs, symptoms and conditions are checked by fixed, testable rules before any plan exists. No AI deciding what’s safe.' },
  { icon: 'book', title: 'Tell it your way', text: 'Tap quick answers or type in your own words. We show exactly what we understood and let you correct it.' },
  { icon: 'camera', title: 'Camera counting that stays put', text: 'On-device pose tracking counts reps, times holds and spots movement for every exercise. Video never leaves your device, and you can switch it off any time.' },
  { icon: 'calendar', title: 'Streaks that forgive', text: 'Consistency is weekly, against your own plan. Rest and sick days never break it, and you’re never nudged to push through symptoms.' },
  { icon: 'apple', title: 'Snap-a-meal nutrition', text: 'Photograph your plate for a quick, private estimate. The food recognition runs on your device and your photos are never uploaded.' },
  { icon: 'eye', title: 'Built for every body', text: 'Seated plans, supported balance, large text, high contrast, reduced motion and keyboard-friendly everything.' },
  { icon: 'lock', title: 'Yours alone', text: 'No account. Optional passcode encryption, one-tap export and delete-everything. Works offline once loaded.' },
];

const FAQ: { q: string; a: ReactNode }[] = [
  { q: `Is ${BRAND.name} medical advice?`, a: 'No. It’s general fitness guidance with medically informed safeguards. It doesn’t diagnose or treat anything, and it won’t pretend to replace a doctor or physiotherapist. When your answers suggest you need one, it says so instead of making a plan.' },
  { q: 'Do I need an account?', a: 'No. There’s no sign-up and no server. Your profile lives in this browser on this device. If you share the device, you can lock it with a passcode that encrypts your data.' },
  { q: 'Where does my data go?', a: 'Nowhere. Everything is stored locally, camera video is processed in memory and discarded, and the app’s security policy blocks all third-party connections. You can export a backup file or delete everything whenever you like.' },
  { q: 'How accurate is camera counting?', a: 'It’s an estimate. The counters were tuned on simulated movement and have not been validated on real people yet, so you can correct any count. Camera angle, lighting, clothing and body differences all matter. It’s a convenience, not a measurement.' },
  { q: 'Where do the recommendations come from?', a: 'From public-health and professional guidance (WHO, CDC, NHS, ACSM, AAP, Cochrane and more). Every recommendation links to its source, and our own cautious choices are labelled “product heuristic” so they’re never passed off as evidence. The exercise content hasn’t been reviewed by a clinician yet.' },
  { q: 'I have a health condition. Can I still use it?', a: 'Often, yes. Tell us in your own words and we’ll leave out exercises that load the areas you flag, follow any limits your clinician gave you, and cap intensity where needed. Some answers will point you to a professional first.' },
];

function HeroVisual({ items }: { items: PlannedItem[] }) {
  const top = items.slice(0, 3);
  return (
    <div className="hv" aria-hidden="true">
      <span className="hv-blob hv-blob-a" />
      <span className="hv-blob hv-blob-b" />
      <div className="hv-card hv-main">
        <div className="row-between">
          <span className="eyebrow">Example · Friday</span>
          <span className="badge badge-brand">20 min</span>
        </div>
        <ul className="hv-list">
          {top.map((it) => {
            const ex = getExercise(it.exerciseId)!;
            return (
              <li key={it.exerciseId}>
                <span className="hv-thumb">
                  <FigureDemo exerciseId={ex.id} size="sm" />
                </span>
                <span className="hv-text">
                  <strong>{ex.name}</strong>
                  <span className="tiny muted">{describePrescription(it.prescription)}</span>
                </span>
                <EvidenceKindBadge kind={it.prescription.evidenceKind} />
              </li>
            );
          })}
        </ul>
        <div className="hv-bar">
          <span style={{ width: '88%' }} />
        </div>
        <span className="tiny muted">19 of 20 minutes used. Warm-up and cool-down included.</span>
      </div>
      <div className="hv-card hv-why">
        <span className="eyebrow">Why this?</span>
        <span className="small">Start with about 5 slow reps and build up gradually.</span>
        <span className="badge badge-brand">NHS · guideline</span>
      </div>
      <div className="hv-chip hv-chip-a">
        <Icon name="lock" size={16} /> Camera stays on your device
      </div>
      <div className="hv-chip hv-chip-b">
        <Icon name="check" size={16} /> Rules, not guesses
      </div>
    </div>
  );
}

export function WelcomePage() {
  const { data } = useStore();
  const navigate = useNavigate();
  const sample = useSample();
  const mainItems = sample?.items.filter((i) => i.block === 'main') ?? [];
  const [picked, setPicked] = useState(0);
  if (data.profile) return <Navigate to="/" replace />;
  const current = mainItems[Math.min(picked, Math.max(0, mainItems.length - 1))];
  const currentEx = current ? getExercise(current.exerciseId) : null;

  return (
    <div className="landing">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <header className="land-top">
        <Link to="/welcome" aria-label={`${BRAND.name} home`}>
          <Wordmark size={34} />
        </Link>
        <nav className="land-nav" aria-label="On this page">
          <a href="#how">How it works</a>
          <a href="#example">Example</a>
          <a href="#privacy">Privacy</a>
          <Link to="/evidence">Evidence</Link>
        </nav>
        <Link to="/onboarding" className="btn btn-primary btn-sm">
          Get started
        </Link>
      </header>

      <main id="main" tabIndex={-1}>
        <div className="land-wrap">
          <StatusBanners />
        </div>
        <section className="land-hero land-wrap hero-photo" aria-labelledby="hero-h">
          <div className="stack hero-copy">
            <span className="badge badge-brand hero-badge">
              <Icon name="spark" size={14} /> Free · No account · Works offline
            </span>
            <h1 id="hero-h" className="hero-title">
              Movement you can <em>verify.</em>
            </h1>
            <p className="hero-lead">
              A personal exercise plan built around your goals, time and limits, with every recommendation linked to the public-health guidance behind it. Movement tracking runs privately on
              your device.
            </p>
            <div className="row hero-cta">
              <button className="btn btn-primary btn-lg" onClick={() => navigate('/onboarding')}>
                Create my private profile <Icon name="arrowRight" size={18} />
              </button>
              <a className="btn btn-ghost btn-lg" href="#example">
                See an example plan
              </a>
            </div>
            <ul className="hero-trust" aria-label="Highlights">
              <li>
                <Icon name="timer" size={16} /> About 4 minutes to set up
              </li>
              <li>
                <Icon name="lock" size={16} /> Stays on your device
              </li>
              <li>
                <Icon name="book" size={16} /> Sources you can check
              </li>
            </ul>
            <div className="hero-restore">
              <span className="small muted">Been here before?</span>
              <RestoreBackup variant="ghost" label="Restore from a backup file" onRestored={() => navigate('/')} />
            </div>
          </div>
          {mainItems.length > 0 ? <HeroVisual items={mainItems} /> : null}
        </section>

        <section className="land-wrap mosaic-wrap" aria-labelledby="mosaic-h">
          <div className="section-head">
            <span className="eyebrow">For every body</span>
            <h2 id="mosaic-h">Short, gentle sessions for every age, ability and day</h2>
          </div>
          <ul className="mosaic">
            {([
              ['seniors', 'Chair-based strength', 'Seated and supported plans'],
              ['home', 'Home in 15 minutes', 'No gym, no kit needed'],
              ['family', 'Move together', 'Gentle sessions for all ages'],
              ['walk', 'Easy outdoor days', 'Walking counts too'],
            ] as [PhotoName, string, string][]).map(([p, t, d]) => (
              <li key={p} className={`tile tile-${p}`}>
                <Photo name={p} />
                <div className="tile-cap">
                  <strong>{t}</strong>
                  <span>{d}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="land-strip" aria-label="Built on public guidance">
          <div className="land-wrap strip-inner">
            <span className="strip-label">Built on public guidance published by</span>
            <ul className="strip-list">
              {['WHO', 'CDC', 'NHS', 'ACSM', 'AAP', 'Cochrane'].map((o) => (
                <li key={o}>{o}</li>
              ))}
            </ul>
            <span className="tiny muted">{BRAND.name} is independent and isn’t affiliated with or endorsed by these organizations.</span>
          </div>
        </section>

        <section id="how" className="land-section land-wrap" aria-labelledby="how-h">
          <div className="section-head">
            <span className="eyebrow">How it works</span>
            <h2 id="how-h">Three steps, and no guesswork</h2>
          </div>
          <ol className="how-grid">
            {[
              { n: '1', icon: 'user' as IconName, t: 'Tell us about you', d: 'Goals, time, equipment and anything that limits you. Tap quick answers or just type it, and we’ll show you what we understood.' },
              { n: '2', icon: 'shield' as IconName, t: 'We check safety first', d: 'Fixed rules look for emergency signs, symptoms and conditions. If you need a professional first, we’ll say so, kindly and clearly.' },
              { n: '3', icon: 'book' as IconName, t: 'Get a plan that explains itself', d: 'Every exercise comes with the reason it’s there and the sources behind its numbers. Nothing is a black box.' },
            ].map((s) => (
              <li key={s.n} className="how-card">
                <span className="how-n" aria-hidden="true">
                  {s.n}
                </span>
                <span className="how-icon" aria-hidden="true">
                  <Icon name={s.icon} size={22} />
                </span>
                <h3>{s.t}</h3>
                <p className="small muted">{s.d}</p>
              </li>
            ))}
          </ol>
        </section>

        {sample && currentEx && current ? (
          <section id="example" className="land-section land-wrap" aria-labelledby="ex-h">
            <div className="section-head">
              <span className="eyebrow">A real example</span>
              <h2 id="ex-h">A plan that shows its work</h2>
              <p className="muted" style={{ maxWidth: '60ch' }}>
                This is an actual plan from our engine for a sample person: 52 years old, new to strength training, aiming for strength and balance, with a chair and a wall, 20 minutes a
                session. Pick an exercise to see why it’s there.
              </p>
            </div>
            <div className="example-grid">
              <div className="card example-list">
                <div className="row-between">
                  <strong>{DAY_NAMES[sample.dayIndex]} workout</strong>
                  <span className="badge">about {formatDuration(sample.estSeconds)}</span>
                </div>
                <div
                  role="tablist"
                  aria-label="Exercises in the example plan"
                  aria-orientation="vertical"
                  className="example-tabs"
                  onKeyDown={(e) => {
                    const last = mainItems.length - 1;
                    const move: Record<string, number> = { ArrowDown: Math.min(last, picked + 1), ArrowRight: Math.min(last, picked + 1), ArrowUp: Math.max(0, picked - 1), ArrowLeft: Math.max(0, picked - 1), Home: 0, End: last };
                    const to = move[e.key];
                    if (to === undefined) return;
                    e.preventDefault();
                    setPicked(to);
                    document.getElementById(`ex-tab-${to}`)?.focus();
                  }}
                >
                  {mainItems.map((it, i) => {
                    const ex = getExercise(it.exerciseId)!;
                    return (
                      <button
                        key={it.exerciseId}
                        role="tab"
                        aria-selected={i === picked}
                        className="example-row"
                        onClick={() => setPicked(i)}
                        id={`ex-tab-${i}`}
                        aria-controls="ex-panel"
                        tabIndex={i === picked ? 0 : -1}
                      >
                        <span className="hv-thumb">
                          <FigureDemo exerciseId={ex.id} size="sm" />
                        </span>
                        <span className="hv-text">
                          <strong>{ex.name}</strong>
                          <span className="tiny muted">{describePrescription(it.prescription)}</span>
                        </span>
                        <Icon name="arrowRight" size={16} />
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="card example-why stack" role="tabpanel" id="ex-panel" aria-labelledby={`ex-tab-${picked}`} tabIndex={0}>
                <div className="row-between">
                  <h3>Why {currentEx.name}?</h3>
                  <EvidenceKindBadge kind={current.prescription.evidenceKind} />
                </div>
                <ul className="bullets small">
                  {current.reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                  <li>{currentEx.purpose}</li>
                </ul>
                <div className="stack-sm">
                  <h3>Why these numbers</h3>
                  <p className="small">{current.prescription.rationale}</p>
                </div>
                <div className="stack-sm">
                  <h3>Sources</h3>
                  <EvidenceRefs ids={current.prescription.evidenceIds} compact />
                </div>
              </div>
            </div>
          </section>
        ) : null}

        <section className="land-section land-wrap" aria-labelledby="feat-h">
          <div className="section-head">
            <span className="eyebrow">What you get</span>
            <h2 id="feat-h">Careful where it counts, easy everywhere else</h2>
          </div>
          <ul className="feature-grid">
            {FEATURES.map((f) => (
              <li key={f.title} className="feature">
                <span className="feature-icon" aria-hidden="true">
                  <Icon name={f.icon} size={22} />
                </span>
                <h3>{f.title}</h3>
                <p className="small muted">{f.text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section id="privacy" className="band-dark" aria-labelledby="priv-h">
          <div className="land-wrap band-inner">
            <div className="stack">
              <span className="eyebrow band-eyebrow">Privacy by design</span>
              <h2 id="priv-h">Your health data never has to leave your device</h2>
              <p className="band-lead">Not a promise in a policy: it’s how the app is built, and the tests prove it.</p>
              <Scene name="privacy" className="scene-privacy" />
            </div>
            <ul className="band-list">
              <li>
                <Icon name="check" size={18} />
                <span>
                  <strong>No account, no server.</strong> Nothing to sign up for, nothing to breach.
                </span>
              </li>
              <li>
                <Icon name="check" size={18} />
                <span>
                  <strong>Camera frames stay in memory</strong> and are discarded. No recording, no uploads.
                </span>
              </li>
              <li>
                <Icon name="check" size={18} />
                <span>
                  <strong>Third-party connections are blocked</strong> by the app’s security policy, including the pose library’s usage metrics.
                </span>
              </li>
              <li>
                <Icon name="check" size={18} />
                <span>
                  <strong>Optional passcode</strong> encrypts what’s stored. <strong>Export or delete</strong> everything in one tap.
                </span>
              </li>
            </ul>
          </div>
        </section>

        <section className="land-section land-wrap" aria-labelledby="scope-h">
          <div className="scope-art">
            <Scene name="together" />
          </div>
          <div className="section-head">
            <span className="eyebrow">Honest scope</span>
            <h2 id="scope-h">What {BRAND.name} is, and isn’t</h2>
          </div>
          <div className="scope-grid">
            <div className="scope-item stack-sm" data-in="yes">
              <span className="badge badge-brand">Yes</span>
              <strong>General fitness</strong>
              <span className="small muted">Plans based on WHO, CDC, NHS and ACSM guidance for everyday strength, balance, mobility and endurance.</span>
            </div>
            <div className="scope-item stack-sm" data-in="yes">
              <span className="badge badge-info">Yes, with limits</span>
              <strong>Medically informed safeguards</strong>
              <span className="small muted">Transparent rules that leave out exercises for areas you flag, follow clinician restrictions, and refer you on when needed.</span>
            </div>
            <div className="scope-item stack-sm" data-in="no">
              <span className="badge">No</span>
              <strong>Rehabilitation or treatment</strong>
              <span className="small muted">It does not diagnose, treat or replace a doctor or physiotherapist. If you need individualized care, it will say so.</span>
            </div>
          </div>
        </section>

        <section className="land-section land-wrap faq" aria-labelledby="faq-h">
          <div className="section-head">
            <span className="eyebrow">Questions</span>
            <h2 id="faq-h">Good things to ask</h2>
          </div>
          <div className="stack-sm">
            {FAQ.map((f) => (
              <details key={f.q} className="disclosure">
                <summary>{f.q}</summary>
                <div>
                  <p className="small">{f.a}</p>
                </div>
              </details>
            ))}
          </div>
        </section>

        <section className="land-wrap final-cta" aria-labelledby="cta-h">
          <div className="final-card">
            <div className="stack">
              <h2 id="cta-h">Ready when you are</h2>
              <p className="band-lead">Four minutes to a plan you can check. Nothing leaves your device.</p>
            </div>
            <div className="row">
              <button className="btn btn-on-feature btn-lg" onClick={() => navigate('/onboarding')}>
                Create my private profile <Icon name="arrowRight" size={18} />
              </button>
            </div>
          </div>
        </section>
      </main>

      <footer className="land-foot">
        <div className="land-wrap foot-inner">
          <div className="stack-sm">
            <Wordmark size={28} />
            <p className="small muted" style={{ maxWidth: '52ch' }}>
              {BRAND.tagline} General fitness guidance, not medical care. Exercise content is checked against public guidance but hasn’t been reviewed by a clinician.
            </p>
          </div>
          <nav className="foot-links" aria-label="Footer">
            <Link to="/about">Scope &amp; limitations</Link>
            <Link to="/evidence">Evidence library</Link>
            <Link to="/challenges/quiz">Move Smart quiz</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
