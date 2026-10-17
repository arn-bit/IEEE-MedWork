import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useStore } from '../../state/store';
import { DAY_NAMES } from '../../domain/plan/engine';
import { getExercise } from '../../domain/exercises/library';
import type { Exercise, PlannedItem, Prescription } from '../../domain/types';
import { Bar, Callout, EmptyState, Modal, PageHead, formatDuration } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { FigureDemo } from '../../components/demo/FigureDemo';
import { WhyExercise, WhyPlan } from './WhyPanels';
import { todayIndex } from '../../domain/dates';
import { progressionSuggestion } from '../../domain/plan/progression';

export function describePrescription(p: Prescription): string {
  const side = p.perSide ? ' each side' : '';
  if (p.kind === 'reps') return `${p.sets} × ${p.amount} reps${side}${p.sets > 1 ? ` · rest ${p.restSeconds}s` : ''}`;
  if (p.kind === 'hold') return `${p.sets} × ${p.amount}s hold${side}`;
  return `${formatDuration(p.amount * p.sets)}`;
}

const BLOCK_LABEL: Record<PlannedItem['block'], string> = { warmup: 'Warm-up', main: 'Main exercises', cooldown: 'Cool-down' };

export function ExerciseDetail({ exercise }: { exercise: Exercise }) {
  return (
    <div className="stack">
      <FigureDemo exerciseId={exercise.id} />
      <p className="small">{exercise.purpose}</p>
      <div className="stack-sm">
        <h3>Starting position</h3>
        <p className="small">{exercise.startPosition}</p>
      </div>
      <div className="stack-sm">
        <h3>Steps</h3>
        <ol className="steps small">
          {exercise.steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      </div>
      <div className="grid-2">
        <div className="stack-sm">
          <h3>Common mistakes</h3>
          <ul className="bullets small">
            {exercise.commonErrors.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
        <div className="stack-sm">
          <h3>Safety notes</h3>
          <ul className="bullets small">
            {exercise.cautions.map((s) => (
              <li key={s}>{s}</li>
            ))}
            <li>Stop if you feel pain, dizziness, or unusually short of breath.</li>
          </ul>
        </div>
      </div>
      {exercise.alternatives.length ? (
        <p className="small">
          <strong>Alternatives:</strong> {exercise.alternatives.map((a) => getExercise(a)?.name).filter(Boolean).join(', ')}
          {exercise.easier ? ` · Easier: ${getExercise(exercise.easier)?.name}` : ''}
          {exercise.harder ? ` · Harder: ${getExercise(exercise.harder)?.name}` : ''}
        </p>
      ) : null}
    </div>
  );
}

export function PlanPage() {
  const { data, planResult, submitProfile } = useStore();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const plan = planResult?.ok ? planResult.plan : null;
  const firstDay = plan ? (plan.schedule[todayIndex()] ? todayIndex() : plan.schedule.findIndex(Boolean)) : 0;
  const [day, setDay] = useState(firstDay < 0 ? 0 : firstDay);
  const [howTo, setHowTo] = useState<Exercise | null>(null);
  const [why, setWhy] = useState<{ item: PlannedItem; ex: Exercise } | null>(null);
  const [whyPlan, setWhyPlan] = useState(false);
  const [swapNote, setSwapNote] = useState<string | null>(null);

  if (!plan) {
    return (
      <EmptyState icon="plan" title="No plan yet" action={<Link className="btn btn-primary" to={data.profile ? '/' : '/onboarding'}>{data.profile ? 'See why' : 'Build my plan'}</Link>}>
        {data.profile ? 'Your answers mean a plan should come from a professional first, or your plan needs fresh answers.' : 'Answer a few questions and we will build a plan that fits your time, equipment and needs.'}
      </EmptyState>
    );
  }
  const session = plan.schedule[day] ?? null;
  const profile = data.profile!;

  const swap = (ex: Exercise) => {
    if (profile.healthMinimized) {
      setSwapNote('Because you chose to keep fewer health details, update your answers in Profile to change exercises.');
      return;
    }
    const r = submitProfile({ ...profile, dislikedExerciseIds: [...new Set([...profile.dislikedExerciseIds, ex.id])] });
    setSwapNote(r.ok ? `${ex.name} removed. Your plan was rebuilt.` : 'Could not rebuild the plan.');
  };

  return (
    <div className="stack fade-in">
      <PageHead
        photo="home"
        eyebrow="My plan"
        title={`${profile.daysPerWeek} days a week · ${profile.minutesPerSession} min`}
        actions={
          <button className="btn btn-secondary" onClick={() => setWhyPlan(true)}>
            <Icon name="book" size={18} /> Why this plan?
          </button>
        }
      >
        Built {new Date(plan.createdAt).toLocaleDateString()} from your answers using transparent rules. Tap “Why?” on any exercise to see its sources.
      </PageHead>

      {params.get('new') ? (
        <Callout tone="ok" title="Your plan is ready">
          It uses general public-health guidance{plan.screening.hits.length ? ` with ${plan.screening.hits.length} safety adjustment${plan.screening.hits.length > 1 ? 's' : ''}` : ''}. Start whenever you like — and stop if anything feels wrong.
        </Callout>
      ) : null}
      {swapNote ? <Callout tone="info">{swapNote}</Callout> : null}

      <div className="week-strip" role="group" aria-label="Choose a day">
        {plan.schedule.map((s, i) => (
          <button key={i} className="day-pill" data-rest={!s} data-today={i === todayIndex()} aria-pressed={i === day} onClick={() => setDay(i)}>
            <span className="tiny">{DAY_NAMES[i]!.slice(0, 3)}</span>
            <strong>{s ? Math.round(s.estSeconds / 60) : '–'}</strong>
            <span className="tiny">{s ? 'min' : 'rest'}</span>
          </button>
        ))}
      </div>

      {!session ? (
        <div className="card stack-sm">
          <h2>{DAY_NAMES[day]}: rest day</h2>
          <p className="muted">Rest days are planned on purpose. Muscles adapt between sessions, and guidelines spread activity across the week.</p>
        </div>
      ) : (
        <section className="card stack" aria-labelledby="sess-h">
          <div className="row-between">
            <div className="stack-sm" style={{ gap: 2 }}>
              <h2 id="sess-h">{session.title}</h2>
              <span className="small muted">Focus: {session.focus}</span>
            </div>
            <button className="btn btn-primary" onClick={() => navigate(`/workout?session=${session.id}`)}>
              <Icon name="play" size={18} /> Start
            </button>
          </div>
          <div className="stack-sm">
            <div className="row-between small">
              <span>Estimated {formatDuration(session.estSeconds)}</span>
              <span className="muted">Your limit: {profile.minutesPerSession} min</span>
            </div>
            <Bar value={session.estSeconds} max={session.limitSeconds} label="Estimated time compared with your limit" />
          </div>
          {session.notes.map((n) => (
            <Callout key={n} tone="info">
              {n}
            </Callout>
          ))}
          {(['warmup', 'main', 'cooldown'] as const).map((block) => {
            const items = session.items.filter((i) => i.block === block);
            if (!items.length) return null;
            return (
              <div key={block}>
                <div className="block-label">
                  <span className="eyebrow">{BLOCK_LABEL[block]}</span>
                  <span className="tiny muted">· {formatDuration(items.reduce((a, i) => a + i.estSeconds, 0))}</span>
                </div>
                <ul className="list">
                  {items.map((item) => {
                    const ex = getExercise(item.exerciseId)!;
                    const prog = block === 'main' ? progressionSuggestion(item.exerciseId, item.prescription, plan, data.sessions, new Date()) : null;
                    return (
                      <li key={item.exerciseId} className="ex-card">
                        <div className="ex-thumb">
                          <FigureDemo exerciseId={ex.id} size="sm" />
                        </div>
                        <div className="stack-sm" style={{ gap: 6 }}>
                          <div className="row" style={{ gap: 8 }}>
                            <strong>{ex.name}</strong>
                            {ex.camera.supported ? (
                              <span className="badge badge-info">
                                <Icon name="camera" size={12} /> Camera counting
                              </span>
                            ) : null}
                          </div>
                          <span className="small num">{describePrescription(item.prescription)}</span>
                          <span className="tiny muted">{item.prescription.intensity}</span>
                          {prog ? (
                            <span className={`small badge ${prog.kind === 'progress' ? 'badge-ok' : 'badge-warn'}`} style={{ whiteSpace: 'normal', fontWeight: 560, padding: '6px 10px' }}>
                              {prog.kind === 'progress' ? 'Ready to progress? ' : 'Hold steady: '}
                              {prog.message}
                            </span>
                          ) : null}
                          <div className="row" style={{ gap: 4 }}>
                            <button className="btn btn-ghost btn-sm" onClick={() => setHowTo(ex)}>
                              How to
                            </button>
                            <button className="btn btn-ghost btn-sm" onClick={() => setWhy({ item, ex })}>
                              Why?
                            </button>
                            {block === 'main' ? (
                              <button className="btn btn-ghost btn-sm" onClick={() => swap(ex)} aria-label={`I'd rather not do ${ex.name}`}>
                                <Icon name="swap" size={14} /> Swap
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </section>
      )}

      <Modal open={!!howTo} onClose={() => setHowTo(null)} title={howTo?.name ?? ''}>
        {howTo ? <ExerciseDetail exercise={howTo} /> : null}
      </Modal>
      <Modal open={!!why} onClose={() => setWhy(null)} title={why ? `Why ${why.ex.name}?` : ''}>
        {why ? <WhyExercise item={why.item} exercise={why.ex} /> : null}
      </Modal>
      <Modal open={whyPlan} onClose={() => setWhyPlan(false)} title="Why this plan?">
        <WhyPlan plan={plan} />
      </Modal>
    </div>
  );
}
