import { Navigate } from 'react-router';
import { ButtonLink } from '../../components/ui';
import { FigureDemo } from '../../components/demo/FigureDemo';
import { Icon } from '../../components/Icon';
import { useStore } from '../../state/store';

export function WelcomePage() {
  const { data } = useStore();
  if (data.profile) return <Navigate to="/" replace />;
  return (
    <div className="stack-lg fade-in">
      <section className="hero">
        <div className="stack">
          <span className="eyebrow">Medical Workout</span>
          <h1>Exercise guidance that shows its work.</h1>
          <p style={{ fontSize: '1.1rem', color: 'var(--ink-2)', maxWidth: '52ch' }}>
            A plan built around your goals, time, equipment and limitations — with every recommendation linked to the public-health guidance behind it. Movement tracking runs privately on your device.
          </p>
          <div className="row">
            <ButtonLink to="/onboarding" size="lg" icon="arrowRight">
              Build my plan
            </ButtonLink>
            <ButtonLink to="/about" variant="ghost">
              How it works
            </ButtonLink>
          </div>
          <div className="row small muted" style={{ gap: 16 }}>
            <span className="row" style={{ gap: 6 }}>
              <Icon name="lock" size={16} /> No account, no upload
            </span>
            <span className="row" style={{ gap: 6 }}>
              <Icon name="book" size={16} /> Sources you can check
            </span>
            <span className="row" style={{ gap: 6 }}>
              <Icon name="timer" size={16} /> About 4 minutes to set up
            </span>
          </div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <FigureDemo exerciseId="sit_to_stand" label="Animated figure demonstrating a sit-to-stand exercise" />
        </div>
      </section>

      <section className="stack" aria-labelledby="scope-h">
        <h2 id="scope-h">What Medical Workout is — and isn’t</h2>
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
    </div>
  );
}
