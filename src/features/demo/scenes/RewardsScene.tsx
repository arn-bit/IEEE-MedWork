import { Icon } from '../../../components/Icon';
import { GAME_COSTS, sessionTokens, tokenSummary, type Plot } from '../../../domain/gamification/tokens';
import type { SessionLog } from '../../../domain/types';
import { Garden } from '../../challenges/Garden';
import type { SceneProps } from '../DemoPage';

const log = (day: string): SessionLog => ({ id: day, plannedSessionId: day, startedAt: `${day}T09:00:00.000Z`, endedAt: `${day}T09:20:00.000Z`, activeSeconds: 1100, sets: [], completedExerciseIds: ['squat', 'sit_to_stand', 'arm_raise', 'march'], rpe: 5, note: '', endedReason: 'completed' });

/** Real token maths on a few sample finished workouts. Nothing is stored. */
const SAMPLE = ['2026-10-05', '2026-10-07', '2026-10-09'].map(log);
export const SAMPLE_TOKENS = tokenSummary(SAMPLE, 3, 0, 0);
export const PER_WORKOUT = sessionTokens(SAMPLE[0]!);

const PLOTS: Plot[] = [0, 1, 2, 3, 3, 4, 4, 3].map((stage, i) => ({
  key: `w${i}`,
  start: new Date(2026, 8, 7 + i * 7),
  sessions: stage === 0 ? 0 : Math.min(3, stage),
  target: 3,
  stage: stage as Plot['stage'],
  paused: false,
  current: i === 7,
}));

const GAMES = [
  { name: 'Photo Puzzle', cost: GAME_COSTS.puzzle, icon: 'photo' },
  { name: 'Memory Match', cost: GAME_COSTS.memory, icon: 'spark' },
  { name: 'Colour Echo', cost: GAME_COSTS.simon, icon: 'game' },
] as const;

export function RewardsScene({ elapsed }: SceneProps) {
  const target = SAMPLE_TOKENS.balance;
  const shown = Math.round(target * Math.min(1, elapsed / 2600));
  const visible = Math.floor(Math.max(0, elapsed - 3000) / 330);
  return (
    <div className="demo-rewards">
      <div className="demo-wallet">
        <span className="coin coin-lg" aria-hidden="true">
          <Icon name="coin" size={30} />
        </span>
        <div>
          <strong className="num demo-wallet-n">{shown}</strong>
          <span className="demo-wallet-l"> tokens</span>
          <span className="demo-wallet-s">
            {PER_WORKOUT} for each finished workout · none for stopping early · only your plan’s workouts count
          </span>
        </div>
      </div>
      <ul className="demo-games" aria-label="Reward games">
        {GAMES.map((g, i) => (
          <li key={g.name} className="demo-game" style={{ opacity: elapsed > 1500 + i * 400 ? 1 : 0, transform: elapsed > 1500 + i * 400 ? 'none' : 'translateY(16px)' }}>
            <span className="reward-icon" aria-hidden="true">
              <Icon name={g.icon} />
            </span>
            <strong>{g.name}</strong>
            <span className="badge badge-token">
              <Icon name="coin" size={13} /> {g.cost}
            </span>
          </li>
        ))}
      </ul>
      <div className="demo-garden">
        <span className="demo-garden-title">Your garden grows with weekly consistency</span>
        <Garden plots={PLOTS.map((p, i) => (i < visible ? p : { ...p, stage: 0, sessions: 0 }))} />
      </div>
    </div>
  );
}
