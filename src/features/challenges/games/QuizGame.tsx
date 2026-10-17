import { useState } from 'react';
import { Link } from 'react-router';
import { useStore } from '../../../state/store';
import { getEvidence } from '../../../domain/evidence/registry';
import { Callout, PageHead } from '../../../components/ui';
import { Icon } from '../../../components/Icon';

export interface QuizQuestion {
  q: string;
  options: string[];
  answer: number;
  explain: string;
  source: string;
}

/** Every question is answered by the cited source's `supports` statement in the evidence registry. */
export const QUIZ: QuizQuestion[] = [
  {
    q: 'How much moderate-intensity aerobic activity does WHO recommend for adults each week?',
    options: ['30–60 minutes', '150–300 minutes', '600+ minutes'],
    answer: 1,
    explain: 'WHO recommends 150–300 minutes of moderate (or 75–150 of vigorous) activity a week — and some activity is better than none.',
    source: 'who-2020',
  },
  {
    q: 'On how many days a week should adults do muscle-strengthening activities, according to CDC?',
    options: ['At least 2', 'Only 1', 'Every day'],
    answer: 0,
    explain: 'CDC recommends muscle-strengthening that works all major muscle groups on at least 2 days a week.',
    source: 'cdc-adults',
  },
  {
    q: 'Using the “talk test”, moderate intensity means you can…',
    options: ['Sing comfortably', 'Talk, but not sing', 'Only say a word or two'],
    answer: 1,
    explain: 'At moderate intensity you can talk but not sing. If you can only say a few words, that is vigorous.',
    source: 'cdc-intensity',
  },
  {
    q: 'How much daily activity is recommended for children and teens aged 6–17?',
    options: ['15 minutes', '60 minutes', '3 hours'],
    answer: 1,
    explain: 'CDC recommends at least 60 minutes of moderate-to-vigorous activity a day for ages 6–17.',
    source: 'cdc-children',
  },
  {
    q: 'Besides aerobic and strengthening activity, what else do guidelines recommend for adults 65 and older?',
    options: ['Balance activities', 'Fasting', 'Only stretching'],
    answer: 0,
    explain: 'CDC recommends older adults also do activities that improve balance, like heel-to-toe walking.',
    source: 'cdc-older',
  },
  {
    q: 'In a large Cochrane review, exercise programs reduced the rate of falls in older people by about…',
    options: ['5%', '23%', '80%'],
    answer: 1,
    explain: 'Exercise reduced the rate of falls by about 23% (high-certainty evidence) in community-dwelling people aged 60+.',
    source: 'cochrane-falls-2019',
  },
  {
    q: 'NHS guidance suggests a warm-up of at least…',
    options: ['1 minute', '6 minutes', '30 minutes'],
    answer: 1,
    explain: 'The NHS suggests warming up for at least 6 minutes, for example by marching on the spot.',
    source: 'nhs-warmup',
  },
  {
    q: 'You get tight, squeezing chest pain while exercising. What should you do?',
    options: ['Push through to finish the set', 'Stop and call the emergency number', 'Stretch it out and continue tomorrow'],
    answer: 1,
    explain: 'Chest pain that feels tight or squeezing needs an emergency call. Don’t drive yourself to hospital.',
    source: 'nhs-heart-attack',
  },
];

export function QuizGame() {
  const { data, updateGames } = useStore();
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);
  const q = QUIZ[i]!;
  const src = getEvidence(q.source);
  const hasProfile = !!data.profile;

  const next = () => {
    if (i + 1 >= QUIZ.length) {
      setDone(true);
      if (hasProfile) updateGames({ quizCompleted: true, quizBest: Math.max(data.games.quizBest, score) });
      return;
    }
    setI(i + 1);
    setPicked(null);
  };

  return (
    <div className="stack" style={{ maxWidth: 720 }}>
      <Link to={hasProfile ? '/challenges' : '/'} className="small">
        ← Back
      </Link>
      <PageHead eyebrow="Minigame" title="Move Smart Quiz">
        Eight quick questions. Each answer shows the source it comes from.
      </PageHead>
      {!done ? (
        <div className="card stack">
          <span className="eyebrow">
            Question {i + 1} of {QUIZ.length}
          </span>
          <h2>{q.q}</h2>
          <div className="stack-sm" role="group" aria-label="Answers">
            {q.options.map((o, k) => {
              const state = picked === null ? '' : k === q.answer ? 'callout-ok' : k === picked ? 'callout-danger' : '';
              return (
                <button
                  key={o}
                  className={`check ${state}`}
                  style={{ textAlign: 'left' }}
                  disabled={picked !== null}
                  aria-pressed={picked === k}
                  onClick={() => {
                    setPicked(k);
                    if (k === q.answer) setScore((s) => s + 1);
                  }}
                >
                  <span className="row" style={{ gap: 8 }}>
                    {picked !== null && k === q.answer ? <Icon name="check" size={18} /> : null}
                    {picked === k && k !== q.answer ? <Icon name="x" size={18} /> : null}
                    <strong>{o}</strong>
                  </span>
                </button>
              );
            })}
          </div>
          {picked !== null ? (
            <div className="stack-sm fade-in" aria-live="polite">
              <Callout tone={picked === q.answer ? 'ok' : 'info'} title={picked === q.answer ? 'Correct' : 'Not quite'}>
                {q.explain}
              </Callout>
              {src ? (
                <span className="tiny muted">
                  Source:{' '}
                  <a href={src.url} target="_blank" rel="noopener noreferrer">
                    {src.organization} — {src.title}
                  </a>
                </span>
              ) : null}
              <div>
                <button className="btn btn-primary" onClick={next}>
                  {i + 1 >= QUIZ.length ? 'See result' : 'Next question'}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="card stack">
          <h2>
            {score} of {QUIZ.length}
          </h2>
          <p className="muted">Thanks for learning the evidence behind your plan. You can browse every source in the evidence library.</p>
          <div className="row">
            <button
              className="btn btn-primary"
              onClick={() => {
                setI(0);
                setPicked(null);
                setScore(0);
                setDone(false);
              }}
            >
              Try again
            </button>
            <Link className="btn btn-secondary" to="/evidence">
              Evidence library
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
