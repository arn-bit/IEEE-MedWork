import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useStore } from '../../state/store';
import { Callout, PageHead } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { TOKEN_RULES } from '../../domain/gamification/tokens';

/**
 * Games cost tokens, and tokens come from showing up for your workouts. Each play is paid for when
 * you press Play; the game calls `end()` when a round is over, which returns here.
 */
export function TokenGate({ game, cost, title, blurb, children }: { game: string; cost: number; title: string; blurb: string; children: (end: () => void) => ReactNode }) {
  const { tokens, spendTokens } = useStore();
  const [playing, setPlaying] = useState(false);
  const short = Math.max(0, cost - tokens.balance);

  if (playing) return <>{children(() => setPlaying(false))}</>;

  return (
    <div className="stack" style={{ maxWidth: 640 }}>
      <Link to="/challenges" className="small">
        ← Challenges
      </Link>
      <PageHead eyebrow="Minigame" title={title}>
        {blurb}
      </PageHead>
      <div className="card stack token-gate">
        <div className="row-between">
          <div className="row" style={{ gap: 10 }}>
            <span className="coin" aria-hidden="true">
              <Icon name="coin" size={22} />
            </span>
            <div className="stack-sm" style={{ gap: 0 }}>
              <strong className="num">{tokens.balance} tokens</strong>
              <span className="tiny muted">Your balance</span>
            </div>
          </div>
          <span className="badge badge-accent">
            Costs <span className="num">{cost}</span> tokens
          </span>
        </div>
        {short > 0 ? (
          <Callout tone="info" title={`${short} more token${short === 1 ? '' : 's'} needed`}>
            Finishing a workout earns {TOKEN_RULES.base}–{TOKEN_RULES.base + TOKEN_RULES.maxExerciseBonus} tokens, once you finish it. If anything feels uncomfortable, stop; that’s always the right call. Choosing to rest earns {TOKEN_RULES.perRestChoice}.
          </Callout>
        ) : (
          <p className="small muted">Ready when you are. Games are short, gentle, and always optional.</p>
        )}
        <div className="row">
          <button
            className="btn btn-primary btn-lg"
            disabled={short > 0}
            onClick={() => {
              if (spendTokens(game, cost)) setPlaying(true);
            }}
          >
            <Icon name="play" size={18} /> Play for {cost} tokens
          </button>
          {short > 0 ? (
            <Link to="/workout" className="btn btn-secondary">
              Go to a workout
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
