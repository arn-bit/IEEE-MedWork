import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { useStore } from '../../state/store';
import { exportJson } from '../../state/storage';
import { speechAvailable } from '../../hooks/speech';
import { CheckCard, Callout, Modal, PageHead } from '../../components/ui';
import { Icon } from '../../components/Icon';
import type { Pause } from '../../domain/gamification/rules';

export function ProfilePage() {
  const store = useStore();
  const { data, paused, pause, resume, updateSettings, deleteEverything } = store;
  const navigate = useNavigate();
  const location = useLocation();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteText, setDeleteText] = useState('');
  const [deleted, setDeleted] = useState(false);
  const [pauseReason, setPauseReason] = useState<Pause['reason']>('unwell');
  const profile = data.profile;
  const s = data.settings;

  useEffect(() => {
    if (location.hash === '#privacy') document.getElementById('privacy')?.scrollIntoView();
  }, [location.hash]);

  const doExport = () => {
    const blob = new Blob([exportJson(data)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `medical-workout-export-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  if (deleted) {
    return (
      <div className="stack" style={{ maxWidth: 640 }}>
        <Callout tone="ok" title="All data deleted">
          Your profile, plan, health answers, workout history, settings and game progress were removed from this browser.
        </Callout>
        <div>
          <Link className="btn btn-primary" to="/welcome">
            Start over
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="stack-lg fade-in">
      <PageHead eyebrow="Profile & Health" title={profile?.displayName ? profile.displayName : 'Your profile'}>
        Your answers, settings and privacy controls. Everything here is stored only in this browser.
      </PageHead>

      {profile ? (
        <section className="card stack" aria-labelledby="ans-h">
          <div className="row-between">
            <h2 id="ans-h">Your answers</h2>
            <button className="btn btn-secondary btn-sm" onClick={() => navigate('/onboarding')}>
              Edit answers
            </button>
          </div>
          <dl className="grid-2 small" style={{ margin: 0 }}>
            <div>
              <dt className="muted">Age</dt>
              <dd style={{ margin: 0 }}>{profile.ageYears}</dd>
            </div>
            <div>
              <dt className="muted">Goals</dt>
              <dd style={{ margin: 0 }}>{profile.goals.map((g) => g.replace('_', ' ')).join(', ')}</dd>
            </div>
            <div>
              <dt className="muted">Schedule</dt>
              <dd style={{ margin: 0 }}>
                {profile.daysPerWeek} days × {profile.minutesPerSession} min
              </dd>
            </div>
            <div>
              <dt className="muted">Equipment</dt>
              <dd style={{ margin: 0 }}>{profile.equipment.length ? profile.equipment.join(', ').replace(/_/g, ' ') : 'Bodyweight only'}</dd>
            </div>
          </dl>
          {profile.healthMinimized ? (
            <Callout tone="info" title="Health details minimized">
              Your individual health answers were discarded after your plan was made. Only the restrictions your plan needs are kept.
            </Callout>
          ) : null}
        </section>
      ) : (
        <Callout tone="info" title="No profile yet">
          <Link to="/onboarding">Set up your plan</Link> to see your answers here.
        </Callout>
      )}

      {profile ? (
        <section className="card stack" aria-labelledby="pause-h">
          <h2 id="pause-h">Pause my plan</h2>
          <p className="small muted">Unwell, injured, or life got busy? Pausing protects your streak. Don’t exercise through illness or injury to keep a streak.</p>
          {paused ? (
            <div className="row">
              <span className="badge badge-warn">Paused since {new Date(paused.start).toLocaleDateString()}</span>
              <button className="btn btn-primary btn-sm" onClick={resume}>
                Resume plan
              </button>
            </div>
          ) : (
            <div className="row">
              <select className="input" style={{ maxWidth: 240 }} value={pauseReason} onChange={(e) => setPauseReason(e.target.value as Pause['reason'])} aria-label="Reason for pausing">
                <option value="unwell">I’m unwell</option>
                <option value="injury">I’m injured</option>
                <option value="other">Something else</option>
              </select>
              <button className="btn btn-secondary btn-sm" onClick={() => pause(pauseReason)}>
                <Icon name="pause" size={14} /> Pause
              </button>
            </div>
          )}
        </section>
      ) : null}

      <section className="card stack" aria-labelledby="set-h">
        <h2 id="set-h">Settings & accessibility</h2>
        <div className="grid-2">
          <CheckCard checked={s.textSize === 'large'} onChange={(v) => updateSettings({ textSize: v ? 'large' : 'normal' })} title="Larger text" />
          <CheckCard checked={s.highContrast} onChange={(v) => updateSettings({ highContrast: v })} title="Higher contrast" />
          <CheckCard checked={s.motion === 'reduce'} onChange={(v) => updateSettings({ motion: v ? 'reduce' : 'system' })} title="Reduce motion" hint="Also follows your device setting." />
          <CheckCard
            checked={s.voiceCues}
            onChange={(v) => updateSettings({ voiceCues: v })}
            title="Spoken cues during workouts"
            hint={speechAvailable() ? 'Uses an on-device voice only.' : 'No on-device voice found in this browser, so cues will stay silent. Visual cues still work.'}
          />
          <CheckCard checked={s.privateMode} onChange={(v) => updateSettings({ privateMode: v })} title="Private mode" hint="Removes all competitive features." />
        </div>
      </section>

      <section className="card stack" id="privacy" aria-labelledby="priv-h">
        <div className="row" style={{ gap: 8 }}>
          <Icon name="shield" />
          <h2 id="priv-h">Privacy center</h2>
        </div>
        <div className="grid-2">
          <div className="stack-sm">
            <h3>Stored on this device</h3>
            <ul className="bullets small">
              <li>Your answers (age, goals, schedule, equipment, preferences){profile?.healthMinimized ? '' : ', including health answers'}</li>
              <li>Your plan and the rules applied to it</li>
              <li>Workout history, effort ratings and notes</li>
              <li>Settings, achievements, game progress, friend codes, other activity you log</li>
              <li>App files and the pose model, cached so the app works offline (no personal data)</li>
            </ul>
            <p className="tiny muted">Stored in this browser’s localStorage. Anyone with access to this device profile could read it, so use a device lock.</p>
          </div>
          <div className="stack-sm">
            <h3>Sent anywhere</h3>
            <ul className="bullets small">
              <li>
                <strong>Nothing.</strong> There is no account, server, analytics or advertising.
              </li>
              <li>Camera video is processed in memory in this tab and never recorded, saved, or uploaded.</li>
              <li>The pose model and its runtime load from this app, not a CDN.</li>
              <li>The MediaPipe library tries to send usage metrics (not images) to Google; this app’s security policy blocks all third-party connections, so they are not sent.</li>
              <li>Leaderboard codes leave the device only if you copy and share them yourself.</li>
            </ul>
          </div>
        </div>
        <CheckCard
          checked={s.minimizeHealthData}
          onChange={(v) => updateSettings({ minimizeHealthData: v })}
          title="Keep fewer health details"
          hint="After your next plan update, individual health answers are discarded and only plan restrictions are kept."
        />
        <div className="row">
          <button className="btn btn-secondary" onClick={doExport}>
            <Icon name="download" size={16} /> Export my data (JSON)
          </button>
          <button className="btn btn-danger" onClick={() => setConfirmDelete(true)}>
            <Icon name="trash" size={16} /> Delete all my data
          </button>
        </div>
      </section>

      <section className="grid-2">
        <Link to="/evidence" className="card card-tight stack-sm" style={{ textDecoration: 'none', color: 'inherit' }}>
          <Icon name="book" />
          <strong>Evidence library</strong>
          <span className="small muted">Every source the app relies on, what it supports, and its limits.</span>
        </Link>
        {profile ? (
          <Link to="/summary" className="card card-tight stack-sm" style={{ textDecoration: 'none', color: 'inherit' }}>
            <Icon name="download" />
            <strong>Summary for a health professional</strong>
            <span className="small muted">A printable overview of your answers, safety rules and recent workouts. Made on this device; you decide who sees it.</span>
          </Link>
        ) : null}
        <Link to="/about" className="card card-tight stack-sm" style={{ textDecoration: 'none', color: 'inherit' }}>
          <Icon name="info" />
          <strong>About, scope & limitations</strong>
          <span className="small muted">What this app is and isn’t, how tracking works, and what hasn’t been validated.</span>
        </Link>
      </section>

      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete all data?">
        <p>This permanently removes your profile, health answers, plan, history, settings and game progress from this browser. It cannot be undone. Consider exporting first.</p>
        <div className="field">
          <label htmlFor="del">
            Type <strong>DELETE</strong> to confirm
          </label>
          <input id="del" className="input" value={deleteText} onChange={(e) => setDeleteText(e.target.value)} autoComplete="off" />
        </div>
        <div className="row">
          <button
            className="btn btn-danger"
            disabled={deleteText.trim().toUpperCase() !== 'DELETE'}
            onClick={async () => {
              await deleteEverything();
              setConfirmDelete(false);
              setDeleted(true);
            }}
          >
            Delete everything
          </button>
          <button className="btn btn-ghost" onClick={() => setConfirmDelete(false)}>
            Cancel
          </button>
        </div>
      </Modal>
    </div>
  );
}
