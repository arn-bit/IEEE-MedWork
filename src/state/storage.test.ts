import { describe, expect, it } from 'vitest';
import { defaultData, deleteAllData, exportJson, loadData, saveData, STORAGE_KEY } from './storage';
import { makeProfile } from '../domain/profile';

describe('storage', () => {
  it('round-trips data across a reload', () => {
    const d = defaultData();
    d.profile = makeProfile({ displayName: 'Sam' });
    d.restChoices = 2;
    expect(saveData(d)).toBe(true);
    const r = loadData();
    expect(r.status).toBe('loaded');
    expect(r.data.profile?.displayName).toBe('Sam');
    expect(r.data.restChoices).toBe(2);
  });

  it('empty storage → defaults', () => {
    expect(loadData().status).toBe('empty');
  });

  it('corrupt JSON never crashes and is reported', () => {
    localStorage.setItem(STORAGE_KEY, '{not json');
    expect(loadData().status).toBe('corrupt');
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 99 }));
    expect(loadData().status).toBe('corrupt');
  });

  it('malformed fields are dropped, defaults filled', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, sessions: [1, { startedAt: '2026-01-01' }], settings: { privateMode: true } }));
    const r = loadData();
    expect(r.data.sessions).toHaveLength(1);
    expect(r.data.settings.privateMode).toBe(true);
    expect(r.data.settings.textSize).toBe('normal');
  });

  it('delete removes every app key from localStorage and sessionStorage but not other apps’ keys', async () => {
    saveData(defaultData());
    localStorage.setItem('mw:other', 'x');
    sessionStorage.setItem('mw:session-draft', 'x');
    localStorage.setItem('unrelated', 'keep');
    const report = await deleteAllData();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem('mw:other')).toBeNull();
    expect(sessionStorage.getItem('mw:session-draft')).toBeNull();
    expect(localStorage.getItem('unrelated')).toBe('keep');
    expect(report.localStorageKeys).toBe(2);
    expect(report.sessionStorageKeys).toBe(1);
    expect(loadData().status).toBe('empty');
  });

  it('export includes a privacy note and the data', () => {
    const d = defaultData();
    d.profile = makeProfile();
    const parsed = JSON.parse(exportJson(d));
    expect(parsed.note).toMatch(/private/);
    expect(parsed.data.profile.ageYears).toBe(30);
  });
});
