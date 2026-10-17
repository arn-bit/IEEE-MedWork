import { Link } from 'react-router';
import { PageHead, Callout } from '../../components/ui';
import { MODEL_INFO } from '../../pose/poseModel';
import { COUNTERS } from '../../pose/counters';

export function AboutPage() {
  return (
    <div className="stack-lg fade-in" style={{ maxWidth: 860 }}>
      <PageHead eyebrow="About" title="Scope, methods & limitations" />

      <section className="card stack-sm">
        <h2>Three kinds of guidance</h2>
        <ul className="list small">
          <li>
            <strong>General fitness (what this app does).</strong> Public-health activity guidance from WHO, CDC, NHS and ACSM, applied to your goals, time and equipment.
          </li>
          <li>
            <strong>Medically informed guidance (limited).</strong> Transparent rules that leave out exercises for areas you flag, follow restrictions a clinician gave you, cap intensity,
            and refer you to a professional when your answers suggest you need one.
          </li>
          <li>
            <strong>Individualized rehabilitation or treatment (not this app).</strong> A program designed by a licensed professional after assessing you. Verimove does not
            diagnose, treat, or replace that care.
          </li>
        </ul>
      </section>

      <section className="card stack-sm">
        <h2>How plans are made</h2>
        <ol className="steps small">
          <li>Your answers are validated.</li>
          <li>Deterministic safety rules run first (emergency → professional assessment → modifications). They cannot be overridden.</li>
          <li>The exercise library is filtered by equipment, location, preferences and restrictions.</li>
          <li>Exercises are matched to your goals; sets, reps, holds and rest come from cited guidance or clearly labelled product choices.</li>
          <li>Each session is time-budgeted (warm-up, main, cool-down) and never exceeds your limit.</li>
          <li>The full decision trace is shown in “Why this plan?”. No AI model is involved.</li>
        </ol>
      </section>

      <section className="card stack-sm">
        <h2>Camera tracking</h2>
        <p className="small">
          Uses <strong>{MODEL_INFO.name}</strong> ({MODEL_INFO.license}) via {MODEL_INFO.runtime}, running in your browser. The model file was downloaded from Google’s official model
          bucket and is served by this app. Video frames are processed in memory and discarded.
        </p>
        <p className="small">
          Rep counting is supported for: {Object.values(COUNTERS).map((c) => c.label).join(', ')}. Each uses its own joint-angle state machine with smoothing, hysteresis, minimum hold
          frames and a minimum rep duration, and pauses when tracking confidence is low.
        </p>
        <Callout tone="warn" title="Not medically validated">
          Counting thresholds were tuned on simulated landmark data and typical joint angles, not validated against clinical motion capture. 2D camera estimates are affected by
          camera angle, clothing, lighting, occlusion, mobility differences and body proportions. Technique cues are limited suggestions, not assessments of injury risk.
          The model card lists multiple people, distances beyond about 4 m, and a hidden head as out of scope.
        </Callout>
      </section>

      <section className="card stack-sm">
        <h2>Content review status</h2>
        <p className="small">
          Exercise instructions are written in our own words, informed by NHS exercise pages, and were checked against that public guidance on 2026-10-16. They have <strong>not</strong>{' '}
          been reviewed by a licensed clinician. Some rep, set and rest numbers are product choices informed by ACSM guidance; these are labelled in each “Why?” panel.
        </p>
        <p className="small">
          No HIPAA compliance, clinical certification or regulatory approval is claimed. See the <Link to="/evidence">evidence library</Link> for every source.
        </p>
      </section>
    </div>
  );
}
