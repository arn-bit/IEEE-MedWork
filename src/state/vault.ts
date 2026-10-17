import { sanitize, type AppData } from './storage';

/**
 * Optional passcode lock: encrypts the app's data at rest in this browser.
 *
 *  - Key: PBKDF2-HMAC-SHA-256 (600,000 iterations, random 16-byte salt) → AES-GCM 256-bit key.
 *  - Data: AES-GCM with a fresh random 96-bit IV for every save, and the vault version as
 *    additional authenticated data.
 *  - The derived key lives only in memory (non-extractable) while the app is unlocked.
 *
 * Honest limits: this protects data at rest against someone who opens this browser profile without
 * the passcode. It does not protect against malware or an attacker who can watch you type, and a
 * short or guessable passcode can be brute-forced offline. There is no recovery: a forgotten
 * passcode means the data must be deleted.
 */

export const VAULT_KEY = 'mw:vault:v1';
export const PLAIN_KEY = 'mw:v1';
export const KDF_ITERATIONS = 600_000;
/** Mutable only so tests can use a cheap work factor; production always uses KDF_ITERATIONS. */
export const kdfConfig = { iterations: KDF_ITERATIONS };
export const MIN_PASSCODE_LENGTH = 6;
const AAD = new TextEncoder().encode('verimove-vault-v1');

export interface VaultFile {
  v: 1;
  kdf: 'PBKDF2-SHA256';
  iter: number;
  salt: string;
  iv: string;
  ct: string;
}

export interface VaultSession {
  key: CryptoKey;
  salt: string;
  iter: number;
}

export type UnlockResult = { ok: true; data: AppData; session: VaultSession } | { ok: false; error: 'wrong_passcode' | 'corrupt' | 'unsupported' };

const b64 = (bytes: Uint8Array): string => {
  let s = '';
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s);
};
const unb64 = (s: string): Uint8Array => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export function cryptoAvailable(): boolean {
  return typeof globalThis.crypto?.subtle?.importKey === 'function' && typeof globalThis.crypto.getRandomValues === 'function';
}

export function passcodeProblem(p: string): string | null {
  if (p.length < MIN_PASSCODE_LENGTH) return `Use at least ${MIN_PASSCODE_LENGTH} characters.`;
  if (/^(.)\1+$/.test(p)) return 'Choose something that isn’t one repeated character.';
  if (['123456', '1234567', '12345678', 'password', 'qwerty', '000000', '111111'].includes(p.toLowerCase())) return 'That passcode is too easy to guess.';
  return null;
}

async function deriveKey(passcode: string, salt: Uint8Array, iter: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(passcode.normalize('NFKC')), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: iter }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export function hasVault(store: Storage | null = safeStore()): boolean {
  try {
    return !!store?.getItem(VAULT_KEY);
  } catch {
    return false;
  }
}

function safeStore(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** Encrypt `data` with an existing session key (fresh IV each time). */
export async function seal(data: AppData, session: VaultSession): Promise<VaultFile> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource, additionalData: AAD as BufferSource }, session.key, new TextEncoder().encode(JSON.stringify(data)));
  return { v: 1, kdf: 'PBKDF2-SHA256', iter: session.iter, salt: session.salt, iv: b64(iv), ct: b64(new Uint8Array(ct)) };
}

export async function createVault(data: AppData, passcode: string, iter: number = kdfConfig.iterations): Promise<{ file: VaultFile; session: VaultSession }> {
  if (!cryptoAvailable()) throw new Error('This browser does not support the encryption this feature needs.');
  const problem = passcodeProblem(passcode);
  if (problem) throw new Error(problem);
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const session: VaultSession = { key: await deriveKey(passcode, saltBytes, iter), salt: b64(saltBytes), iter };
  return { file: await seal(data, session), session };
}

export function readVaultFile(store: Storage | null = safeStore()): VaultFile | null {
  try {
    const raw = store?.getItem(VAULT_KEY);
    if (!raw) return null;
    const f = JSON.parse(raw) as Partial<VaultFile>;
    if (f.v !== 1 || f.kdf !== 'PBKDF2-SHA256' || typeof f.iter !== 'number' || typeof f.salt !== 'string' || typeof f.iv !== 'string' || typeof f.ct !== 'string') return null;
    // Refuse absurd work factors from a tampered file.
    if (f.iter < 1 || f.iter > 5_000_000) return null;
    return f as VaultFile;
  } catch {
    return null;
  }
}

export async function openVault(file: VaultFile, passcode: string): Promise<UnlockResult> {
  if (!cryptoAvailable()) return { ok: false, error: 'unsupported' };
  try {
    const salt = unb64(file.salt);
    const key = await deriveKey(passcode, salt, file.iter);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(file.iv) as BufferSource, additionalData: AAD as BufferSource }, key, unb64(file.ct) as BufferSource);
    const data = sanitize(JSON.parse(new TextDecoder().decode(plain)));
    if (!data) return { ok: false, error: 'corrupt' };
    return { ok: true, data, session: { key, salt: file.salt, iter: file.iter } };
  } catch (e) {
    // AES-GCM authentication failure (wrong passcode or tampering) surfaces as OperationError.
    return { ok: false, error: (e as { name?: string })?.name === 'OperationError' ? 'wrong_passcode' : 'corrupt' };
  }
}

export function writeVaultFile(file: VaultFile, store: Storage | null = safeStore()): boolean {
  try {
    store?.setItem(VAULT_KEY, JSON.stringify(file));
    return !!store;
  } catch {
    return false;
  }
}

export function removeVaultFile(store: Storage | null = safeStore()) {
  try {
    store?.removeItem(VAULT_KEY);
  } catch {
    /* ignore */
  }
}

export function removePlainData(store: Storage | null = safeStore()) {
  try {
    store?.removeItem(PLAIN_KEY);
  } catch {
    /* ignore */
  }
}
