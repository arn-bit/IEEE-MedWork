import { Link, useNavigate } from 'react-router';
import { useStore } from '../../state/store';
import { DAY_NAMES } from '../../domain/plan/engine';
import { consistencyStreak, weekSummaries, ACHIEVEMENTS } from '../../domain/gamification/rules';
import { getExercise } from '../../domain/exercises/library';
import { ButtonLink, Callout, ProgressRing, formatDuration } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { ReferralPanel } from '../safety/SafetyPanels';
import { todayIndex } from '../../domain/dates';

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
        {planResult && !planResult.ok && planResult.reason !== 'invalid_input' ? (
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

  return (
    <div className="stack-lg fade-in">
      <header className="page-head" style={{ marginBottom: 0 }}>
        <span className="eyebrow">{now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</span>
        <h1>
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

      <div className="grid-2">
        <section className="card card-feature stack" aria-labelledby="today-h">
          <span className="eyebrow">Today · {DAY_NAMES[ti]}</span>
          {today && !paused ? (
            <>
              <h2 id="today-h" style={{ fontSize: '1.5rem' }}>
                {doneToday ? 'Nice work — today’s workout is logged' : 'Today’s workout'}
              </h2>
              <p className="muted">
                {today.items.filter((i) => i.block === 'main').length} exercises · about {formatDuration(today.estSeconds)} (limit {profile.minutesPerSession} min) · {today.focus}
              </p>
              <div className="row" style={{ gap: 6 }}>
                {today.items
                  .filter((i) => i.block === 'main')
                  .slice(0, 4)
                  .map((i) => (
                    <span key={i.exerciseId} className="badge" style={{ background: 'rgb(255 255 255 / 0.16)', color: 'inherit' }}>
                      {getExercise(i.exerciseId)?.name}
                    </span>
                  ))}
              </div>
              <div className="row">
                <Link to={`/workout?session=${today.id}`} className="btn btn-on-feature btn-lg">
                  <Icon name="play" size={18} /> {doneToday ? 'Do it again' : 'Start workout'}
                </Link>
                <Link to="/plan" className="btn btn-ghost" style={{ color: 'inherit' }}>
                  See details
                </Link>
              </div>
            </>
          ) : (
            <>
              <h2 id="today-h" style={{ fontSize: '1.5rem' }}>
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

      <div className="grid-3">
        <Link to="/plan" className="card card-tight stack-sm" style={{ textDecoration: 'none', color: 'inherit' }}>
          <Icon name="book" />
          <strong>Why this plan?</strong>
          <span className="small muted">See the rules, sources and assumptions behind each exercise.</span>
        </Link>
        <Link to="/challenges" className="card card-tight stack-sm" style={{ textDecoration: 'none', color: 'inherit' }}>
          <Icon name="trophy" />
          <strong>{nextAchievement ? `Next: ${nextAchievement.title}` : 'All achievements earned'}</strong>
          <span className="small muted">{nextAchievement?.description ?? 'Nicely done.'}</span>
        </Link>
        <Link to="/profile" className="card card-tight stack-sm" style={{ textDecoration: 'none', color: 'inherit' }}>
          <Icon name="shield" />
          <strong>Your data stays here</strong>
          <span className="small muted">Stored only on this device. Export or delete it any time.</span>
        </Link>
      </div>
      <div>
        <ButtonLink to="/workout" variant="secondary" icon="arrowRight">
          Choose a different workout
        </ButtonLink>
      </div>
    </div>
  );
}
