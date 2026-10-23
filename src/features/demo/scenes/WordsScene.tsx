import { DEMO_ALERT_TEXT, DEMO_INJURY_TEXT } from '../data';
import type { Finding } from '../../../domain/safety/analyze';
import type { SceneProps } from '../DemoPage';

const typed = (text: string, elapsed: number, from: number, to: number) => text.slice(0, Math.max(0, Math.min(text.length, Math.floor(((elapsed - from) / (to - from)) * text.length))));
const KIND: Record<Finding['kind'], string> = { urgent: 'Stop', refer: 'See a professional', adjust: 'Plan adjusted', info: 'Note', goal: 'Goal', warning: 'Careful' };

/** The sample person types their situation; the app's real analyser shows what it understood, then what it does with an alarming answer. */
export function WordsScene({ elapsed, demo }: SceneProps) {
  const alarm = elapsed >= 6200;
  const text = alarm ? typed(DEMO_ALERT_TEXT, elapsed, 6300, 7300) : typed(DEMO_INJURY_TEXT, elapsed, 300, 3700);
  const findings = alarm ? demo.alert : demo.findings;
  const shown = alarm ? (elapsed > 7500 ? findings.length : 0) : Math.max(0, Math.min(findings.length, Math.floor((elapsed - 3900) / 650) + 1));
  const first = findings[0];
  return (
    <div className="demo-words">
      <div className="demo-field" data-alarm={alarm}>
        <span className="demo-field-label">{alarm ? 'What if the answer is not fine?' : 'In your own words'}</span>
        <div className="demo-typed" aria-label="Typed health note">
          {text}
          <span className="demo-caret" aria-hidden="true" />
        </div>
      </div>
      <ul className="demo-findings" aria-label="What the app understood">
        {findings.slice(0, shown).map((f) => (
          <li key={f.id} className="demo-finding" data-kind={f.kind}>
            <span className="demo-finding-kind">{KIND[f.kind]}</span>
            <strong>{f.title}</strong>
            <span>{f.detail}</span>
            <span className="demo-finding-quote">“{f.quote}”</span>
          </li>
        ))}
      </ul>
      {alarm && elapsed > 7800 ? (
        <div className="demo-stop" role="status">
          <strong>No plan is made.</strong> {first ? first.detail : 'The rules send you to a professional first.'} This is decided by fixed, tested rules, not by an AI’s guess.
        </div>
      ) : null}
    </div>
  );
}
