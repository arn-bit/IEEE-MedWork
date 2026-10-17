import { useState } from 'react';
import { useStore } from '../../state/store';
import { useVault } from '../../state/Gate';
import { MIN_PASSCODE_LENGTH, passcodeProblem } from '../../state/vault';
import { Callout, CheckCard } from '../../components/ui';
import { Icon } from '../../components/Icon';

/** Optional passcode that encrypts the data stored in this browser. */
export function PasscodeCard() {
  const vault = useVault();
  const { data } = useStore();
  const [pass, setPass] = useState('');
  const [again, setAgain] = useState('');
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const [current, setCurrent] = useState('');

  if (!vault.supported) {
    return (
      <div className="stack-sm">
        <h3>Passcode lock</h3>
        <p className="small muted">This browser doesn’t provide the encryption tools this feature needs, so the passcode lock isn’t available here.</p>
      </div>
    );
  }

  if (vault.enabled) {
    return (
      <div className="stack-sm passcode-on">
        <div className="row" style={{ gap: 8 }}>
          <Icon name="lock" />
          <h3>Passcode lock is on</h3>
          <span className="badge badge-ok">Encrypted</span>
        </div>
        <p className="small muted">Your data is encrypted (AES-256) in this browser and opens with your passcode. There’s no way to recover a forgotten passcode.</p>
        <div className="row">
          <button className="btn btn-secondary btn-sm" onClick={() => vault.lock()}>
            <Icon name="lock" size={14} /> Lock now
          </button>
          {!removing ? (
            <button className="btn btn-ghost btn-sm" onClick={() => setRemoving(true)}>
              Remove passcode
            </button>
          ) : null}
        </div>
        {removing ? (
          <form
            className="stack-sm"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError(null);
              const r = await vault.disable(data, current);
              setBusy(false);
              if (!r.ok) setError(r.error);
              else {
                setRemoving(false);
                setCurrent('');
              }
            }}
          >
            <div className="field">
              <label htmlFor="cur-pass">Enter your passcode to remove it</label>
              <input id="cur-pass" className="input" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} style={{ maxWidth: 320 }} />
            </div>
            {error ? <Callout tone="danger">{error}</Callout> : null}
            <div className="row">
              <button className="btn btn-danger btn-sm" type="submit" disabled={busy || !current}>
                {busy ? 'Decrypting…' : 'Remove passcode'}
              </button>
              <button className="btn btn-ghost btn-sm" type="button" onClick={() => setRemoving(false)}>
                Cancel
              </button>
            </div>
          </form>
        ) : null}
      </div>
    );
  }

  const problem = pass ? passcodeProblem(pass) : null;
  const mismatch = again.length > 0 && again !== pass;
  const ready = !!pass && !problem && pass === again && ack;

  return (
    <form
      className="stack-sm"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!ready) return;
        setBusy(true);
        setError(null);
        try {
          await vault.enable(data, pass);
          setPass('');
          setAgain('');
          setAck(false);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Could not turn on encryption.');
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="row" style={{ gap: 8 }}>
        <Icon name="lock" />
        <h3>Passcode lock (optional)</h3>
      </div>
      <p className="small muted">
        Encrypts your data in this browser so it can’t be read without your passcode. Good for a shared computer. It doesn’t protect against malware, and a weak passcode can be guessed.
      </p>
      <div className="grid-2">
        <div className="field">
          <label htmlFor="new-pass">New passcode</label>
          <input id="new-pass" className="input" type="password" autoComplete="new-password" value={pass} onChange={(e) => setPass(e.target.value)} aria-invalid={!!problem} />
          <span className={problem ? 'error' : 'hint'}>{problem ?? `At least ${MIN_PASSCODE_LENGTH} characters. A few random words works well.`}</span>
        </div>
        <div className="field">
          <label htmlFor="again-pass">Repeat passcode</label>
          <input id="again-pass" className="input" type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} aria-invalid={mismatch} />
          {mismatch ? <span className="error">Those don’t match yet.</span> : null}
        </div>
      </div>
      <CheckCard checked={ack} onChange={setAck} title="I understand a forgotten passcode can’t be recovered" hint="If that happens, the data on this device has to be deleted. Keep a backup file." />
      {error ? <Callout tone="danger">{error}</Callout> : null}
      <div>
        <button className="btn btn-primary" type="submit" disabled={!ready || busy}>
          {busy ? 'Encrypting…' : 'Turn on encryption'}
        </button>
      </div>
    </form>
  );
}
