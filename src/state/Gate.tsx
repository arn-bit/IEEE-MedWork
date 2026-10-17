import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { StoreProvider } from './store';
import { saveData, type AppData } from './storage';
import {
  cryptoAvailable,
  createVault,
  hasVault,
  openVault,
  readVaultFile,
  removePlainData,
  removeVaultFile,
  seal,
  writeVaultFile,
  type VaultSession,
} from './vault';
import { UnlockScreen } from '../features/unlock/UnlockScreen';

type Mode = { kind: 'locked' } | { kind: 'plain' } | { kind: 'vault'; session: VaultSession };

export interface VaultApi {
  /** True when the data on this device is passcode-encrypted. */
  enabled: boolean;
  /** Whether this browser can do the encryption. */
  supported: boolean;
  enable(data: AppData, passcode: string): Promise<void>;
  disable(data: AppData, passcode: string): Promise<{ ok: true } | { ok: false; error: string }>;
  /** Forget the key and return to the unlock screen. */
  lock(): void;
}

const VaultContext = createContext<VaultApi>({
  enabled: false,
  supported: false,
  enable: async () => undefined,
  disable: async () => ({ ok: true }),
  lock: () => undefined,
});

export function useVault(): VaultApi {
  return useContext(VaultContext);
}

/**
 * Sits above the store. Decides whether to show the unlock screen (data is encrypted) or the app,
 * and chooses how the store persists: plain localStorage, or encrypted with the in-memory key.
 */
export function AppGate({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Mode>(() => (hasVault() ? { kind: 'locked' } : { kind: 'plain' }));
  const [initial, setInitial] = useState<AppData | undefined>(undefined);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const navigate = useNavigate();

  const session = mode.kind === 'vault' ? mode.session : null;
  const persist = useMemo(() => {
    if (!session) return undefined;
    return (data: AppData) => {
      // Serialise writes so the newest state always lands last.
      queue.current = queue.current
        .then(async () => {
          writeVaultFile(await seal(data, session));
        })
        .catch(() => undefined);
    };
  }, [session]);

  const enable = useCallback(async (data: AppData, passcode: string) => {
    const { file, session: s } = await createVault(data, passcode);
    if (!writeVaultFile(file)) throw new Error('Could not save the encrypted data in this browser.');
    removePlainData();
    setMode({ kind: 'vault', session: s });
  }, []);

  const disable = useCallback(async (data: AppData, passcode: string) => {
    const file = readVaultFile();
    if (!file) return { ok: false as const, error: 'The encrypted data could not be read.' };
    const r = await openVault(file, passcode);
    if (!r.ok) return { ok: false as const, error: r.error === 'wrong_passcode' ? 'That passcode didn’t work.' : 'The encrypted data could not be read.' };
    // Write the plain copy BEFORE removing the vault so data is never lost.
    if (!saveData(data)) return { ok: false as const, error: 'Could not save in this browser.' };
    removeVaultFile();
    setMode({ kind: 'plain' });
    return { ok: true as const };
  }, []);

  const lock = useCallback(() => {
    setInitial(undefined);
    setMode({ kind: 'locked' });
  }, []);

  const api = useMemo<VaultApi>(() => ({ enabled: mode.kind === 'vault', supported: cryptoAvailable(), enable, disable, lock }), [mode.kind, enable, disable, lock]);

  if (mode.kind === 'locked') {
    return (
      <UnlockScreen
        file={readVaultFile()}
        onUnlock={async (passcode) => {
          const file = readVaultFile();
          if (!file) return 'corrupt';
          const r = await openVault(file, passcode);
          if (!r.ok) return r.error;
          setInitial(r.data);
          setMode({ kind: 'vault', session: r.session });
          return 'ok';
        }}
        onWiped={() => {
          removeVaultFile();
          setInitial(undefined);
          setMode({ kind: 'plain' });
          navigate('/welcome', { replace: true });
        }}
      />
    );
  }

  return (
    <VaultContext.Provider value={api}>
      <StoreProvider
        key="app"
        initial={initial}
        persist={persist}
        onDeleted={() => {
          setInitial(undefined);
          setMode({ kind: 'plain' });
        }}
      >
        {children}
      </StoreProvider>
    </VaultContext.Provider>
  );
}
