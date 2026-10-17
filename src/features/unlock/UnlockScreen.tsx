import { useEffect, useRef, useState } from 'react';
import { Wordmark, Icon } from '../../components/Icon';
import { Callout, Modal } from '../../components/ui';
import { deleteAllData } from '../../state/storage';
import type { VaultFile } from '../../state/vault';
import { BRAND } from '../../brand';

type UnlockOutcome = 'ok' | 'wrong_passcode' | 'corrupt' | 'unsupported';

/**
 * Shown when the data on this device is passcode-encrypted. Failed attempts add a growing delay.
 * The passcode can't be recovered; the only way forward without it is to delete the data.
 */
export function UnlockScreen({ file, onUnlock, onWiped }: { file: VaultFile | null; onUnlock: (passcode: string) => Promise<UnlockOutcome>; onWiped: () => void }) {
  const [passcode, setPasscode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(file ? null : 'The encrypted data on this device looks damaged. You can delete it and start fresh.');
  const [failures, setFailures] = useState(0);
  const [wait, setWait] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const [wiping, setWiping] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    input.current?.focus();
  }, []);
  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const submit = async () => {
    if (busy || wait > 0 || !passcode || !file) return;
    setBusy(true);
    setError(null);
    const r = await onUnlock(passcode);
    setBusy(false);
    if (r === 'ok') return;
    if (r === 'wrong_passcode') {
      const n = failures + 1;
      setFailures(n);
      setWait(Math.min(2 ** (n - 1), 10));
      setError('That passcode didn’t work. Check for typos and caps lock.');
    } else if (r === 'unsupported') setError('This browser can’t open the encrypted data. Try the browser you set it up in.');
    else setError('The encrypted data looks damaged. You can delete it and start fresh.');
    setPasscode('');
    input.current?.focus();
  };

  return (
    <div className="focus-shell unlock">
      <header className="focus-top">
        <Wordmark />
      </header>
      <main id="main" className="focus-main unlock-main" tabIndex={-1}>
        <div className="card unlock-card stack">
          <span className="unlock-icon" aria-hidden="true">
            <Icon name="lock" size={26} />
          </span>
          <div className="stack-sm" style={{ gap: 6 }}>
            <h1>Welcome back</h1>
            <p className="muted">Your {BRAND.name} data is encrypted on this device. Enter your passcode to open it.</p>
          </div>
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <div className="field">
              <label htmlFor="passcode">Passcode</label>
              <input
                id="passcode"
                ref={input}
                className="input"
                type="password"
                autoComplete="current-password"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                aria-invalid={!!error}
                aria-describedby={error ? 'unlock-error' : undefined}
                disabled={busy || !file}
              />
            </div>
            {error ? (
              <div id="unlock-error">
                <Callout tone="danger">{error}</Callout>
              </div>
            ) : null}
            <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={busy || wait > 0 || !passcode || !file}>
              {busy ? 'Unlocking…' : wait > 0 ? `Try again in ${wait}s` : 'Unlock'}
            </button>
          </form>
          <p className="tiny muted">Everything is decrypted in this tab only. Nothing is sent anywhere.</p>
          <button className="btn btn-ghost btn-sm" onClick={() => setConfirm(true)} style={{ alignSelf: 'flex-start' }}>
            Forgot your passcode?
          </button>
        </div>
      </main>

      <Modal open={confirm} onClose={() => setConfirm(false)} title="Forgot your passcode?">
        <p>
          Your passcode can’t be recovered. That’s what keeps your data private. If you have a backup file, you can delete the encrypted data here and then restore the backup. Otherwise,
          deleting means starting fresh.
        </p>
        <Callout tone="warn">This permanently deletes all {BRAND.name} data on this device.</Callout>
        <div className="row">
          <button
            className="btn btn-danger"
            disabled={wiping}
            onClick={async () => {
              setWiping(true);
              await deleteAllData();
              onWiped();
            }}
          >
            {wiping ? 'Deleting…' : 'Delete everything and start over'}
          </button>
          <button className="btn btn-ghost" onClick={() => setConfirm(false)}>
            Cancel
          </button>
        </div>
      </Modal>
    </div>
  );
}
