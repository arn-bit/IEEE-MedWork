import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createVault, hasVault, kdfConfig, openVault, passcodeProblem, PLAIN_KEY, readVaultFile, removeVaultFile, seal, VAULT_KEY, writeVaultFile } from './vault';
import { defaultData, parseBackup, exportJson } from './storage';
import { makeProfile } from '../domain/profile';

const FAST = 1000;
beforeEach(() => {
  kdfConfig.iterations = FAST;
});
afterEach(() => {
  kdfConfig.iterations = 600_000;
});

function sample() {
  const d = defaultData();
  d.profile = makeProfile({ displayName: 'Zebediah' }, { freeText: { injuries: 'my knee hurts', conditions: 'type 2 diabetes', clinician: '', other: '' } });
  return d;
}

describe('passcode vault', () => {
  it('round-trips data with the right passcode', async () => {
    const { file } = await createVault(sample(), 'correct horse battery');
    const r = await openVault(file, 'correct horse battery');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.profile?.displayName).toBe('Zebediah');
  });

  it('rejects a wrong passcode without revealing anything', async () => {
    const { file } = await createVault(sample(), 'correct horse battery');
    const r = await openVault(file, 'wrong passcode');
    expect(r).toEqual({ ok: false, error: 'wrong_passcode' });
  });

  it('the stored file contains no readable health data', async () => {
    const { file } = await createVault(sample(), 'correct horse battery');
    const raw = JSON.stringify(file);
    for (const secret of ['Zebediah', 'diabetes', 'knee', 'freeText', 'profile']) expect(raw).not.toContain(secret);
    expect(file.kdf).toBe('PBKDF2-SHA256');
  });

  it('uses a fresh IV for every save (no nonce reuse)', async () => {
    const { file, session } = await createVault(sample(), 'correct horse battery');
    const ivs = new Set([file.iv]);
    for (let i = 0; i < 20; i++) ivs.add((await seal(sample(), session)).iv);
    expect(ivs.size).toBe(21);
  });

  it('detects tampering with the ciphertext, IV or salt', async () => {
    const { file } = await createVault(sample(), 'correct horse battery');
    const flip = (b64: string) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      bytes[0] = bytes[0]! ^ 0xff;
      return btoa(String.fromCharCode(...bytes));
    };
    expect((await openVault({ ...file, ct: flip(file.ct) }, 'correct horse battery')).ok).toBe(false);
    expect((await openVault({ ...file, iv: flip(file.iv) }, 'correct horse battery')).ok).toBe(false);
    expect((await openVault({ ...file, salt: flip(file.salt) }, 'correct horse battery')).ok).toBe(false);
  });

  it('a new save with the session key opens with the same passcode', async () => {
    const { session } = await createVault(sample(), 'correct horse battery');
    const d = sample();
    d.restChoices = 7;
    const file = await seal(d, session);
    const r = await openVault(file, 'correct horse battery');
    expect(r.ok && r.data.restChoices).toBe(7);
  });

  it('refuses weak passcodes', async () => {
    expect(passcodeProblem('abc')).toMatch(/at least/i);
    expect(passcodeProblem('aaaaaaaa')).toMatch(/repeated/);
    expect(passcodeProblem('password')).toMatch(/easy/);
    expect(passcodeProblem('correct horse battery')).toBeNull();
    await expect(createVault(sample(), '123')).rejects.toThrow();
  });

  it('storage helpers validate the file and refuse absurd work factors', async () => {
    expect(hasVault()).toBe(false);
    const { file } = await createVault(sample(), 'correct horse battery');
    expect(writeVaultFile(file)).toBe(true);
    expect(hasVault()).toBe(true);
    expect(readVaultFile()?.salt).toBe(file.salt);
    localStorage.setItem(VAULT_KEY, JSON.stringify({ ...file, iter: 999_999_999 }));
    expect(readVaultFile()).toBeNull();
    localStorage.setItem(VAULT_KEY, '{nope');
    expect(readVaultFile()).toBeNull();
    removeVaultFile();
    expect(hasVault()).toBe(false);
    expect(PLAIN_KEY).toBe('mw:v1');
  });
});

describe('backup parsing', () => {
  it('round-trips an export', () => {
    const d = sample();
    const r = parseBackup(exportJson(d));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.profile?.health.freeText.conditions).toBe('type 2 diabetes');
  });

  it('rejects things that are not backups, with a clear message', () => {
    expect(parseBackup('not json')).toMatchObject({ ok: false });
    expect(parseBackup('{"hello":1}')).toMatchObject({ ok: false });
    expect(parseBackup(JSON.stringify({ app: 'Other App', data: defaultData() }))).toEqual({ ok: false, error: 'That backup is from a different app.' });
    expect(parseBackup('x'.repeat(5_000_001))).toMatchObject({ ok: false });
  });

  it('accepts backups from before the rename', () => {
    expect(parseBackup(JSON.stringify({ app: 'Medical Workout', data: defaultData() })).ok).toBe(true);
  });

  it('upgrades an older backup that lacks the newer health fields', () => {
    const d = JSON.parse(JSON.stringify(sample()));
    delete d.profile.health.freeText;
    delete d.profile.health.unsure;
    delete d.profile.goalText;
    const r = parseBackup(JSON.stringify({ app: 'Verimove', data: d }));
    expect(r.ok && r.data.profile?.health.unsure).toEqual([]);
  });

  it('drops unknown or malformed fields rather than trusting them', () => {
    const d = JSON.parse(JSON.stringify(sample()));
    d.profile.health.painAreas = 'knees'; // wrong type
    d.profile.__proto__ = { evil: true };
    const r = parseBackup(JSON.stringify({ app: 'Verimove', data: d }));
    expect(r.ok && r.data.profile?.health.painAreas).toEqual([]);
  });
});
