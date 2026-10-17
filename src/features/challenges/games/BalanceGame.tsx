import { useState } from 'react';
import { Link } from 'react-router';
import { useStore } from '../../../state/store';
import { useInterval } from '../../../hooks/useInterval';
import { speak } from '../../../hooks/speech';
import { Callout, PageHead, formatClock } from '../../../components/ui';
import { Icon } from '../../../components/Icon';

interface Level {
  id: string;
  name: string;
  how: string;
  standing: boolean;
}

const LEVELS: Level[] = [
  { id: 'seated', name: 'Seated tall', how: 'Sit toward the front of a stable chair, feet flat, and sit tall without leaning on the backrest.', standing: false },
  { id: 'together', name: 'Feet together (with support)', how: 'Stand beside a counter or sturdy chair with one hand resting on it. Bring your feet together.', standing: true },
  { id: 'semi', name: 'Half step (with support)', how: 'Hand on support. Place the heel of one foot beside the big toe of the other.', standing: true },
  { id: 'tandem', name: 'Heel-to-toe (with support)', how: 'Hand on support. Place one heel directly in front of the other foot’s toes.', standing: true },
  { id: 'one_leg', name: 'One leg (fingertips on wall)', how: 'Face a wall with fingertips touching it. Lift one foot slightly, keeping your hips level.', standing: true },
];

type Phase = 'setup' | 'countdown' | 'hold' | 'done';

export function BalanceGame({ onEnd }: { onEnd?: () => void }) {
  const { data, updateGames } = useStore();
  const profile = data.profile!;
  const seatedOnly = profile.accessibility.seatedOnly || profile.health.clinicianRestrictions.includes('seated_only');
  const levels = LEVELS.filter((l) => !(seatedOnly && l.standing));
  const [level, setLevel] = useState<Level>(levels[seatedOnly ? 0 : 1] ?? levels[0]!);
  const [duration, setDuration] = useState(20);
  const [phase, setPhase] = useState<Phase>('setup');
  const [left, setLeft] = useState(0);
  const [touches, setTouches] = useState(0);
  const voice = data.settings.voiceCues;

  useInterval(
    () => {
      setLeft((l) => {
        const n = Math.max(0, l - 0.25);
        if (phase === 'countdown' && n <= 0) {
          setPhase('hold');
          speak('Hold', voice);
          return duration;
        }
        if (phase === 'hold' && n <= 0) {
          setPhase('done');
          speak('Done. Nice and steady.', voice);
          updateGames({ balanceCompletions: data.games.balanceCompletions + 1 });
        }
        return n;
      });
    },
    phase === 'countdown' || phase === 'hold' ? 250 : null,
  );

  return (
    <div className="stack" style={{ maxWidth: 720 }}>
      <Link to="/challenges" className="small">
        ← Challenges
      </Link>
      <PageHead eyebrow="Minigame" title="Steady Stance">
        A short, supported balance hold. There’s no score for “perfect” — touching your support is part of practising.
      </PageHead>
      <Callout tone="info" title="Safety first">
        Keep a sturdy support within reach for every standing level. Stop if you feel dizzy or unsteady, or if anything hurts.
      </Callout>

      {phase === 'setup' && (
        <div className="card stack">
          <fieldset className="field">
            <legend>Choose a level</legend>
            <div className="stack-sm" style={{ marginTop: 6 }}>
              {levels.map((l) => (
                <label key={l.id} className="check">
                  <input type="radio" name="level" checked={level.id === l.id} onChange={() => setLevel(l)} />
                  <span>
                    <strong>{l.name}</strong>
                    <span className="hint">{l.how}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="field">
            <legend>Hold time</legend>
            <div className="chip-group">
              {[10, 20, 30].map((d) => (
                <label key={d} className="chip">
                  <input type="radio" name="dur" checked={duration === d} onChange={() => setDuration(d)} />
                  <span>{d} seconds</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <button
              className="btn btn-primary btn-lg"
              onClick={() => {
                setTouches(0);
                setLeft(3);
                setPhase('countdown');
                speak('Get into position', voice);
              }}
            >
              <Icon name="play" size={18} /> Start
            </button>
          </div>
        </div>
      )}

      {(phase === 'countdown' || phase === 'hold') && (
        <div className="card stack" style={{ textAlign: 'center', alignItems: 'center' }}>
          <span className="eyebrow">{phase === 'countdown' ? 'Get into position' : level.name}</span>
          <div className="big-count" aria-live="polite">
            {phase === 'countdown' ? Math.ceil(left) : formatClock(left)}
          </div>
          <p className="small muted" style={{ maxWidth: '44ch' }}>
            {level.how}
          </p>
          {phase === 'hold' ? (
            <button className="btn btn-secondary" onClick={() => setTouches((t) => t + 1)}>
              I steadied myself ({touches})
            </button>
          ) : null}
          <button className="btn btn-ghost" onClick={() => setPhase('setup')}>
            Stop
          </button>
        </div>
      )}

      {phase === 'done' && (
        <div className="card stack">
          <Callout tone="ok" title="Hold complete">
            {touches === 0 ? 'You held steady the whole time.' : `You steadied yourself ${touches} time${touches > 1 ? 's' : ''} — that’s exactly what support is for.`} Practising balance
            regularly helps; for older adults, balance and functional exercise reduce falls.
          </Callout>
          <p className="small muted">Completed {data.games.balanceCompletions} time{data.games.balanceCompletions === 1 ? '' : 's'}. This is self-timed and self-reported; the app does not measure your balance.</p>
          <div className="row">
            <button className="btn btn-primary" onClick={() => (onEnd ? onEnd() : setPhase('setup'))}>
              Again
            </button>
            <Link to="/challenges" className="btn btn-secondary">
              Done
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
