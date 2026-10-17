import { useId, useRef, useState } from 'react';
import { useStore } from '../../state/store';
import { MAX_BACKUP_BYTES, parseBackup } from '../../state/storage';
import { Callout } from '../../components/ui';
import { Icon } from '../../components/Icon';

/** Restore a JSON backup made with "Export my data". The file is read in this tab and never uploaded. */
export function RestoreBackup({ onRestored, label = 'Restore from a backup file', variant = 'secondary' }: { onRestored?: () => void; label?: string; variant?: 'secondary' | 'ghost' }) {
  const { importData } = useStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const [msg, setMsg] = useState<{ tone: 'ok' | 'danger'; text: string } | null>(null);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_BACKUP_BYTES) {
      setMsg({ tone: 'danger', text: 'That file is too large to be a Verimove backup.' });
      return;
    }
    const result = parseBackup(await file.text());
    if (!result.ok) {
      setMsg({ tone: 'danger', text: result.error });
      return;
    }
    importData(result.data);
    setMsg({ tone: 'ok', text: 'Backup restored. Welcome back.' });
    onRestored?.();
  };

  return (
    <div className="stack-sm restore" id="restore">
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept="application/json,.json"
        className="visually-hidden"
        tabIndex={-1}
        aria-label="Choose a backup file"
        onChange={(e) => {
          void onFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      <div>
        <button type="button" className={`btn btn-${variant}`} onClick={() => inputRef.current?.click()}>
          <Icon name="download" size={16} /> {label}
        </button>
      </div>
      {msg ? msg.tone === 'danger' ? <Callout tone="danger">{msg.text}</Callout> : <div role="status"><Callout tone="ok">{msg.text}</Callout></div> : null}
    </div>
  );
}
