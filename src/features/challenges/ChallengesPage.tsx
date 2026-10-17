import { useState } from 'react';
import { Link } from 'react-router';
import { useStore } from '../../state/store';
import {
  ACHIEVEMENTS,
  canCompare,
  decodeScoreCard,
  encodeScoreCard,
  personalGoalProgress,
  validPseudonym,
  weekKey,
  weeklyPoints,
  type CompetitionBand,
} from '../../domain/gamification/rules';
import { ageBandFor } from '../../domain/safety/screening';
import { countsAsSession } from '../../domain/gamification/rules';
import { Bar, Callout, PageHead, Stepper } from '../../components/ui';
import { Icon } from '../../components/Icon';

const GAMES = [
  { to: '/challenges/balance', icon: 'balance', title: 'Steady Stance', desc: 'A supported balance hold with levels from seated to single-leg. Self-timed, no camera.' },
  { to: '/challenges/reaction', icon: 'game', title: 'Reaction Reach', desc: 'Tap or press keys as targets appear. Gentle coordination practice; works seated.' },
  { to: '/challenges/quiz', icon: 'quiz', title: 'Move Smart Quiz', desc: 'Short questions on activity guidance. Every answer links to its source.' },
] as const;

export function ChallengesPage() {
  const { data, achievements, updateSettings, addFriend, removeFriend, setPersonalGoal } = useStore();
  const profile = data.profile!;
  const s = data.settings;
  const band = ageBandFor(profile.ageYears);
  const competitionBand: CompetitionBand = band === 'child' || band === 'teen' ? 'youth' : 'adult';
  const competitionAllowed = band !== 'child';
  const [code, setCode] = useState('');
  const [codeMsg, setCodeMsg] = useState<{ tone: 'ok' | 'danger'; text: string } | null>(null);
  const [nameDraft, setNameDraft] = useState(s.pseudonym);
  const [goalSessions, setGoalSessions] = useState(profile.daysPerWeek * 4);
  const [goalWeeks, setGoalWeeks] = useState(4);
  const now = new Date();
  const wk = weekKey(now);
  const mySessions = data.sessions.filter((x) => countsAsSession(x) && weekKey(new Date(x.startedAt)) === wk).length;
  const myPoints = weeklyPoints(mySessions, profile.daysPerWeek);
  const myCode = s.pseudonym ? encodeScoreCard({ v: 1, name: s.pseudonym, week: wk, points: myPoints, plannedDays: profile.daysPerWeek, band: competitionBand }) : '';
  const board = [
    ...(s.pseudonym ? [{ name: `${s.pseudonym} (you)`, points: myPoints, me: true }] : []),
    ...data.friends.filter((f) => f.week === wk && canCompare(competitionBand, f.band)).map((f) => ({ name: f.name, points: f.points, me: false })),
  ].sort((a, b) => b.points - a.points);
  const goal = data.personalGoal ? personalGoalProgress(data.personalGoal, data.sessions) : null;

  return (
    <div className="stack-lg fade-in">
      <PageHead eyebrow="Challenges" title="Challenges & games">
        Rewards here are for consistency, learning and looking after yourself — never for doing more than your plan.
      </PageHead>

      <section className="stack" aria-labelledby="games-h">
        <h2 id="games-h">Minigames</h2>
        <div className="grid-3">
          {GAMES.map((g) => (
            <Link key={g.to} to={g.to} className="card card-tight stack-sm" style={{ textDecoration: 'none', color: 'inherit' }}>
              <span className="icon-wrap" style={{ width: 44, height: 44, borderRadius: 14, background: 'var(--brand-soft)', color: 'var(--brand)', display: 'grid', placeItems: 'center' }}>
                <Icon name={g.icon} />
              </span>
              <strong>{g.title}</strong>
              <span className="small muted">{g.desc}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="card stack" aria-labelledby="goal-h">
        <h2 id="goal-h">Personal goal</h2>
        {goal && data.personalGoal ? (
          <div className="stack-sm">
            <div className="row-between small">
              <span>
                {goal.done} of {goal.target} workouts by {goal.deadline.toLocaleDateString()}
              </span>
              {goal.complete ? <span className="badge badge-ok">Done!</span> : goal.expired ? <span className="badge">Ended</span> : null}
            </div>
            <Bar value={goal.done} max={goal.target} label="Personal goal progress" />
            <div>
              <button className="btn btn-ghost btn-sm" onClick={() => setPersonalGoal(null)}>
                {goal.complete || goal.expired ? 'Set a new goal' : 'Remove goal'}
              </button>
            </div>
          </div>
        ) : (
          <div className="stack-sm">
            <p className="small muted">Choose a realistic goal. We cap it at your plan, so it never asks for extra sessions.</p>
            <div className="grid-2">
              <Stepper label="Workouts" value={goalSessions} min={1} max={profile.daysPerWeek * goalWeeks} onChange={setGoalSessions} />
              <Stepper label="Within (weeks)" value={goalWeeks} min={1} max={12} onChange={(v) => { setGoalWeeks(v); setGoalSessions((g) => Math.min(g, profile.daysPerWeek * v)); }} />
            </div>
            <div>
              <button
                className="btn btn-primary"
                disabled={!Number.isInteger(goalSessions) || goalSessions < 1}
                onClick={() => setPersonalGoal({ targetSessions: Math.min(goalSessions, profile.daysPerWeek * goalWeeks), weeks: goalWeeks, createdAt: new Date().toISOString() })}
              >
                Set goal
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="stack" aria-labelledby="ach-h">
        <div className="row-between">
          <h2 id="ach-h">Achievements</h2>
          <span className="small muted">
            {achievements.size} of {ACHIEVEMENTS.length}
          </span>
        </div>
        <div className="grid-2">
          {ACHIEVEMENTS.map((a) => (
            <div key={a.id} className="achv" data-earned={achievements.has(a.id)}>
              <span className="medal">
                <Icon name={achievements.has(a.id) ? a.icon : 'lock'} />
              </span>
              <span>
                <strong>{a.title}</strong>
                <span className="small muted" style={{ display: 'block' }}>
                  {a.description}
                </span>
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="card stack" aria-labelledby="lb-h">
        <div className="row-between">
          <h2 id="lb-h">Friends leaderboard</h2>
          <span className="badge">Optional</span>
        </div>
        {!competitionAllowed ? (
          <Callout tone="info" title="Not available for ages 5–12">
            Competitive features are turned off for children. Achievements and games are still here.
          </Callout>
        ) : s.privateMode ? (
          <div className="stack-sm">
            <p className="small muted">Private mode is on: all competitive features are hidden.</p>
            <div>
              <button className="btn btn-secondary btn-sm" onClick={() => updateSettings({ privateMode: false })}>
                Turn off private mode
              </button>
            </div>
          </div>
        ) : !s.leaderboardOptIn ? (
          <div className="stack-sm">
            <p className="small">
              Compare weekly consistency points with friends you choose. There’s no server: you swap short codes by message. A code contains only a nickname, the week, your points
              and whether it’s an adult or youth board — never health data, age, diagnoses or workout details.
            </p>
            <ul className="bullets small muted">
              <li>Points: 10 per workout up to your plan, +5 for meeting your weekly target. Extra workouts earn nothing extra.</li>
              <li>Codes are checked for tampering and impossible scores, but this is an honour system without a server.</li>
              {competitionBand === 'youth' ? <li>Youth boards only show other youth codes.</li> : <li>Youth codes never appear on adult boards.</li>}
            </ul>
            <div className="row">
              <button className="btn btn-primary btn-sm" onClick={() => updateSettings({ leaderboardOptIn: true })}>
                Turn on leaderboard
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => updateSettings({ privateMode: true })}>
                Use private mode instead
              </button>
            </div>
          </div>
        ) : (
          <div className="stack">
            <div className="field">
              <label htmlFor="pseudo">Your nickname (not your real name)</label>
              <span className="hint">2–20 letters, numbers, spaces, - or _</span>
              <div className="row">
                <input id="pseudo" className="input" style={{ maxWidth: 260 }} value={nameDraft} maxLength={20} onChange={(e) => setNameDraft(e.target.value)} aria-invalid={nameDraft !== '' && !validPseudonym(nameDraft)} />
                <button className="btn btn-secondary btn-sm" disabled={!validPseudonym(nameDraft)} onClick={() => updateSettings({ pseudonym: nameDraft.trim() })}>
                  Save
                </button>
              </div>
            </div>
            {myCode ? (
              <div className="stack-sm">
                <span className="label">Your code for {wk}</span>
                <div className="code-box" aria-label="Your share code">
                  {myCode}
                </div>
                <div>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      void navigator.clipboard?.writeText(myCode).then(
                        () => setCodeMsg({ tone: 'ok', text: 'Copied. Send it to a friend however you like.' }),
                        () => setCodeMsg({ tone: 'danger', text: 'Could not copy automatically; select the code and copy it.' }),
                      );
                    }}
                  >
                    Copy code
                  </button>
                </div>
              </div>
            ) : null}
            <div className="field">
              <label htmlFor="friendcode">Add a friend’s code</label>
              <div className="row">
                <input id="friendcode" className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="MW1.…" autoComplete="off" />
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => {
                    const r = decodeScoreCard(code, now);
                    if (!r.ok) return setCodeMsg({ tone: 'danger', text: r.error });
                    if (!canCompare(competitionBand, r.card.band))
                      return setCodeMsg({ tone: 'danger', text: competitionBand === 'adult' ? 'That is a youth code. Adults and youth are never compared.' : 'That is an adult code. Youth boards only include other youth.' });
                    if (r.card.name === s.pseudonym) return setCodeMsg({ tone: 'danger', text: 'That is your own code.' });
                    addFriend(r.card);
                    setCode('');
                    setCodeMsg({ tone: 'ok', text: `Added ${r.card.name}.` });
                  }}
                >
                  Add
                </button>
              </div>
            </div>
            {codeMsg ? <Callout tone={codeMsg.tone}>{codeMsg.text}</Callout> : null}
            {board.length ? (
              <table className="table">
                <caption className="visually-hidden">This week’s leaderboard</caption>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Nickname</th>
                    <th>Points this week</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {board.map((b, i) => (
                    <tr key={b.name} style={b.me ? { fontWeight: 700 } : undefined}>
                      <td className="num">{i + 1}</td>
                      <td>{b.name}</td>
                      <td className="num">{b.points}</td>
                      <td>
                        {!b.me ? (
                          <button className="btn btn-ghost btn-sm" onClick={() => removeFriend(b.name)} aria-label={`Remove ${b.name}`}>
                            <Icon name="x" size={14} />
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="small muted">Set a nickname and add a friend’s code to see this week’s board.</p>
            )}
            <div className="row">
              <button className="btn btn-ghost btn-sm" onClick={() => updateSettings({ leaderboardOptIn: false })}>
                Turn off leaderboard
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
