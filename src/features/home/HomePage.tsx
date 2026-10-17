import { Link, useNavigate } from 'react-router';
import { useStore } from '../../state/store';
import { DAY_NAMES } from '../../domain/plan/engine';
import { consistencyStreak, weekSummaries, ACHIEVEMENTS } from '../../domain/gamification/rules';
import { getExercise } from '../../domain/exercises/library';
import { Callout, ProgressRing, formatDuration } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { FigureDemo } from '../../components/demo/FigureDemo';
import { EmergencyPanel, ReferralPanel } from '../safety/SafetyPanels';
import { todayIndex } from '../../domain/dates';
import { analyzeAnswers } from '../../domain/safety/summary';

export function HomePage() {
  const { data, planResult, paused, resume, achievements } = useStore();
  const navigate = useNavigate();
  const profile = data.profile!;
  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const name = profile.displayName ? `, ${profile.displayName}` : '';

  if (!planResult || !planResult.ok) {
    return (
      <div className="stack">
        <h1>
          {greeting}
          {name}
        </h1>
        {planResult && !planResult.ok && planResult.reason === 'emergency' ? (
          <EmergencyPanel onDismiss={() => navigate('/onboarding')} dismissLabel="Review my answers" />
        ) : planResult && !planResult.ok && planResult.reason !== 'invalid_input' ? (
          <ReferralPanel screening={planResult.screening} onEdit={() => navigate('/onboarding')} onCleared={() => navigate('/onboarding')} />
        ) : (
          <Callout tone="info" title="Your plan needs your health answers again">
            You chose to keep fewer health details, so your plan must be rebuilt from fresh answers. <Link to="/onboarding">Answer the questions</Link>
          </Callout>
        )}
      </div>
    );
  }

  const plan = planResult.plan;
  const ti = todayIndex(now);
  const today = plan.schedule[ti] ?? null;
  const nextIdx = [1, 2, 3, 4, 5, 6, 7].map((k) => (ti + k) % 7).find((i) => plan.schedule[i]);
  const next = nextIdx !== undefined ? plan.schedule[nextIdx] : null;
  const weeks = weekSummaries(data.sessions, profile.daysPerWeek, data.pauses, now, 1);
  const thisWeek = weeks[weeks.length - 1]!;
  const streak = consistencyStreak(data.sessions, profile.daysPerWeek, data.pauses, now);
  const doneToday = data.sessions.some((s) => new Date(s.startedAt).toDateString() === now.toDateString());
  const nextAchievement = ACHIEVEMENTS.find((a) => !achievements.has(a.id));
  const mainToday = today?.items.filter((i) => i.block === 'main') ?? [];
  const art = mainToday[0]?.exerciseId;
  const glance = profile.healthMinimized ? null : analyzeAnswers(profile, now);
  const adjustments = plan.screening.hits.filter((h) => h.outcome === 'proceed_with_modifications');

  return (
    <div className="stack-lg fade-in">
      <header className="page-head" style={{ marginBottom: 0 }}>
        <span className="eyebrow">{now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</span>
        <h1 className="home-title">
          {greeting}
          {name}
        </h1>
      </header>

      {paused ? (
        <Callout tone="warn" title="Your plan is paused" icon="pause">
          Rest is the right call when you are unwell or injured. Your streak is protected while paused.{' '}
          <button className="btn btn-secondary btn-sm" style={{ marginLeft: 8 }} onClick={resume}>
            I’m ready to resume
          </button>
        </Callout>
      ) : null}

      <div className="home-grid">
        <section className="card card-feature today" aria-labelledby="today-h">
          <div className="stack today-copy">
            <span className="eyebrow">Today · {DAY_NAMES[ti]}</span>
            {today && !paused ? (
              <>
                <h2 id="today-h" className="today-title">
                  {doneToday ? 'Nice work. Today’s workout is logged' : 'Today’s workout'}
                </h2>
                <p className="muted">
                  {mainToday.length} exercises · about {formatDuration(today.estSeconds)} (limit {profile.minutesPerSession} min) · {today.focus}
                </p>
                <div className="row" style={{ gap: 6 }}>
                  {mainToday.slice(0, 4).map((i) => (
                    <span key={i.exerciseId} className="badge today-chip">
                      {getExercise(i.exerciseId)?.name}
                    </span>
                  ))}
                </div>
                <div className="row">
                  <Link to={`/workout?session=${today.id}`} className="btn btn-on-feature btn-lg">
                    <Icon name="play" size={18} /> {doneToday ? 'Do it again' : 'Start workout'}
                  </Link>
                  <Link to="/plan" className="btn btn-ghost today-ghost">
                    See details
                  </Link>
                </div>
              </>
            ) : (
              <>
                <h2 id="today-h" className="today-title">
                  {paused ? 'Rest and recover' : 'Rest day'}
                </h2>
                <p className="muted">Recovery is part of training. Light everyday movement like a walk is still welcome if you feel like it.</p>
                {next && !paused ? (
                  <p>
                    Next workout: <strong>{DAY_NAMES[next.dayIndex]}</strong> · about {formatDuration(next.estSeconds)}
                  </p>
                ) : null}
                <div>
                  <Link to="/challenges" className="btn btn-on-feature">
                    Try a gentle minigame
                  </Link>
                </div>
              </>
            )}
          </div>
          {art && today && !paused ? (
            <div className="today-art" aria-hidden="true">
              <FigureDemo exerciseId={art} size="md" />
            </div>
          ) : null}
        </section>

        <section className="card stack" aria-labelledby="week-h">
          <div className="row-between">
            <h2 id="week-h">This week</h2>
            <Link to="/progress" className="small">
              Progress
            </Link>
          </div>
          <div className="row" style={{ gap: 20, flexWrap: 'nowrap' }}>
            <ProgressRing value={thisWeek.sessions} max={thisWeek.target} label={`${thisWeek.sessions}/${thisWeek.target}`} sub="target" />
            <div className="stack-sm">
              <div className="row" style={{ gap: 8 }}>
                <Icon name="flame" size={20} />
                <strong className="num">{streak}</strong>
                <span className="muted small">consistent week{streak === 1 ? '' : 's'} in a row</span>
              </div>
              <span className="small muted">
                Target: {thisWeek.target} of your {profile.daysPerWeek} planned workouts. Missing one is OK, and rest days never break a streak.
              </span>
            </div>
          </div>
          <div className="week-strip" aria-label="Your weekly schedule">
            {plan.schedule.map((s, i) => (
              <div key={i} className="day-pill" data-rest={!s} data-today={i === ti} style={{ cursor: 'default' }}>
                <span className="tiny">{DAY_NAMES[i]!.slice(0, 3)}</span>
                <span className={`dot ${s ? '' : 'dot-rest'}`} aria-hidden="true" />
                <span className="visually-hidden">{s ? 'workout' : 'rest'}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="card stack" aria-labelledby="glance-h">
        <div className="row-between">
          <h2 id="glance-h">Your plan, at a glance</h2>
          <Link to="/profile#analysis" className="small">
            How we read your answers
          </Link>
        </div>
        {adjustments.length === 0 ? (
          <p className="small muted">No safety adjustments were needed, so your plan follows general public-health guidance.</p>
        ) : (
          <ul className="glance-list">
            {adjustments.map((h) => (
              <li key={h.ruleId + h.title}>
                <Icon name="shield" size={16} /> {h.title}
              </li>
            ))}
          </ul>
        )}
        <div className="row small muted" style={{ gap: 16 }}>
          <span>{plan.excluded.length} exercises left out for safety or fit</span>
          {glance && glance.included.length > 0 ? <span>{glance.included.length} things used from your own words</span> : null}
          <span>Every one is explained under “Why this plan?”</span>
        </div>
      </section>

      <div className="grid-3">
        <Link to="/plan" className="card card-tight stack-sm link-card">
          <Icon name="book" />
          <strong>Why this plan?</strong>
          <span className="small muted">See the rules, sources and assumptions behind each exercise.</span>
        </Link>
        <Link to="/challenges" className="card card-tight stack-sm link-card">
          <Icon name="trophy" />
          <strong>{nextAchievement ? `Next: ${nextAchievement.title}` : 'All achievements earned'}</strong>
          <span className="small muted">{nextAchievement?.description ?? 'Nicely done.'}</span>
        </Link>
        <Link to="/profile#privacy" className="card card-tight stack-sm link-card">
          <Icon name="shield" />
          <strong>Your data stays here</strong>
          <span className="small muted">Stored only on this device. Lock it with a passcode, export it, or delete it any time.</span>
        </Link>
      </div>
      <div>
        <Link to="/workout" className="btn btn-secondary">
          Choose a different workout <Icon name="arrowRight" size={18} />
        </Link>
      </div>
    </div>
  );
}
