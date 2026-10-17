import type { Plan, Profile, SessionLog } from '../domain/types';
import type { Pause, PersonalGoal, ScoreCard } from '../domain/gamification/rules';
import type { ActivityEntry } from '../domain/plan/progression';
import { normalizeProfile } from '../domain/profile';
import type { MealEntry } from '../nutrition/foods';

/**
 * Local-first persistence. Everything lives in this browser's localStorage under the `mw:` prefix.
 * Nothing is sent to a server. `deleteAllData` wipes every storage location this app can use.
 */

export const STORAGE_KEY = 'mw:v1';
export const PREFIX = 'mw:';

export interface Settings {
  privateMode: boolean; // removes all competitive features
  leaderboardOptIn: boolean;
  pseudonym: string;
  textSize: 'normal' | 'large';
  highContrast: boolean;
  motion: 'system' | 'reduce';
  voiceCues: boolean;
  minimizeHealthData: boolean;
  cameraPrivacyAck: boolean;
  /** 'auto' picks phone or desktop layout from the device; the others force one. */
  layout: 'auto' | 'phone' | 'desktop';
  /** Short tone and vibration when a rep is counted, so you can tell it's counting. */
  repSound: boolean;
  repHaptics: boolean;
  /** Hide calorie and macro numbers on the Nutrition page (always on for under-18s). */
  hideNutritionNumbers: boolean;
}

export interface AppData {
  version: 1;
  profile: Profile | null;
  plan: Plan | null;
  sessions: SessionLog[];
  pauses: Pause[];
  restChoices: number;
  settings: Settings;
  games: { quizCompleted: boolean; quizBest: number; balanceCompletions: number; reactionBest: number | null; tokensSpent: number; plays: { game: string; at: string }[]; memoryBest: number | null; puzzleBest: number | null; simonBest: number };
  friends: ScoreCard[];
  personalGoal: PersonalGoal | null;
  seenAchievements: string[];
  /** Other activity the user logged (walks, cycling…), counted toward weekly minutes. */
  activities: ActivityEntry[];
  /** Meals the user logged on the Nutrition page. Photos are never stored, only the confirmed result. */
  meals: MealEntry[];
}

export function defaultSettings(): Settings {
  return {
    privateMode: false,
    leaderboardOptIn: false,
    pseudonym: '',
    textSize: 'normal',
    highContrast: false,
    motion: 'system',
    voiceCues: false,
    minimizeHealthData: false,
    cameraPrivacyAck: false,
    layout: 'auto',
    repSound: true,
    repHaptics: true,
    hideNutritionNumbers: false,
  };
}

export function defaultData(): AppData {
  return {
    version: 1,
    profile: null,
    plan: null,
    sessions: [],
    pauses: [],
    restChoices: 0,
    settings: defaultSettings(),
    games: { quizCompleted: false, quizBest: 0, balanceCompletions: 0, reactionBest: null, tokensSpent: 0, plays: [], memoryBest: null, puzzleBest: null, simonBest: 0 },
    friends: [],
    personalGoal: null,
    seenAchievements: [],
    activities: [],
    meals: [],
  };
}

export type LoadResult = { data: AppData; status: 'empty' | 'loaded' | 'corrupt' | 'unavailable' };

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Shape-check and fill defaults. Unknown or malformed data never crashes the app. */
export function sanitize(raw: unknown): AppData | null {
  if (!isObj(raw) || raw.version !== 1) return null;
  const d = defaultData();
  return {
    version: 1,
    profile: normalizeProfile(raw.profile),
    plan: isObj(raw.plan) && Array.isArray((raw.plan as Record<string, unknown>).schedule) ? (raw.plan as unknown as Plan) : null,
    sessions: Array.isArray(raw.sessions) ? (raw.sessions.filter((s) => isObj(s) && typeof s.startedAt === 'string') as SessionLog[]) : [],
    pauses: Array.isArray(raw.pauses) ? (raw.pauses.filter((p) => isObj(p) && typeof p.start === 'string') as Pause[]) : [],
    restChoices: typeof raw.restChoices === 'number' ? raw.restChoices : 0,
    settings: { ...d.settings, ...(isObj(raw.settings) ? (raw.settings as Partial<Settings>) : {}) },
    games: { ...d.games, ...(isObj(raw.games) ? (raw.games as Partial<AppData['games']>) : {}) },
    friends: Array.isArray(raw.friends) ? (raw.friends as ScoreCard[]) : [],
    personalGoal: isObj(raw.personalGoal) ? (raw.personalGoal as unknown as PersonalGoal) : null,
    seenAchievements: Array.isArray(raw.seenAchievements) ? raw.seenAchievements.filter((x): x is string => typeof x === 'string') : [],
    activities: Array.isArray(raw.activities)
      ? (raw.activities.filter((a) => isObj(a) && typeof a.date === 'string' && typeof a.minutes === 'number') as unknown as ActivityEntry[])
      : [],
    meals: Array.isArray(raw.meals)
      ? (raw.meals.filter((m) => isObj(m) && typeof m.id === 'string' && typeof m.name === 'string' && typeof m.kcal === 'number' && typeof m.at === 'string').slice(-2000) as unknown as MealEntry[])
      : [],
  };
}

export function loadData(store: Storage | null = safeLocalStorage()): LoadResult {
  if (!store) return { data: defaultData(), status: 'unavailable' };
  let text: string | null;
  try {
    text = store.getItem(STORAGE_KEY);
  } catch {
    return { data: defaultData(), status: 'unavailable' };
  }
  if (!text) return { data: defaultData(), status: 'empty' };
  try {
    const data = sanitize(JSON.parse(text));
    return data ? { data, status: 'loaded' } : { data: defaultData(), status: 'corrupt' };
  } catch {
    return { data: defaultData(), status: 'corrupt' };
  }
}

export function saveData(data: AppData, store: Storage | null = safeLocalStorage()): boolean {
  if (!store) return false;
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function safeLocalStorage(): Storage | null {
  try {
    const s = globalThis.localStorage;
    const k = `${PREFIX}__probe`;
    s.setItem(k, '1');
    s.removeItem(k);
    return s;
  } catch {
    return null;
  }
}

export const MAX_BACKUP_BYTES = 5_000_000;

export type BackupResult = { ok: true; data: AppData } | { ok: false; error: string };

/**
 * Parse a file produced by `exportJson`. Strictly validated: only known fields survive, nothing is
 * executed, and a bad file never touches the data already on this device.
 */
export function parseBackup(text: string): BackupResult {
  if (text.length > MAX_BACKUP_BYTES) return { ok: false, error: 'That file is too large to be a Verimove backup.' };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'That file isn’t a valid backup (it couldn’t be read as JSON).' };
  }
  const payload = isObj(raw) && isObj(raw.data) ? raw.data : raw;
  const app = isObj(raw) ? raw.app : undefined;
  if (app !== undefined && app !== 'Verimove' && app !== 'Medical Workout') return { ok: false, error: 'That backup is from a different app.' };
  const data = sanitize(payload);
  if (!data) return { ok: false, error: 'That doesn’t look like a Verimove backup, or it’s from an incompatible version.' };
  return { ok: true, data };
}

export function exportJson(data: AppData): string {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      app: 'Verimove',
      note: 'This file contains your health-related answers and workout history. Store it somewhere private.',
      data,
    },
    null,
    2,
  );
}

export interface DeletionReport {
  localStorageKeys: number;
  sessionStorageKeys: number;
  caches: number;
  indexedDbs: number;
}

/** Remove everything this app stores, across every browser storage mechanism it could use. */
export async function deleteAllData(): Promise<DeletionReport> {
  const report: DeletionReport = { localStorageKeys: 0, sessionStorageKeys: 0, caches: 0, indexedDbs: 0 };
  for (const [store, field] of [
    [globalThis.localStorage, 'localStorageKeys'],
    [globalThis.sessionStorage, 'sessionStorageKeys'],
  ] as const) {
    try {
      const keys: string[] = [];
      for (let i = 0; i < store.length; i++) {
        const k = store.key(i);
        if (k && k.startsWith(PREFIX)) keys.push(k);
      }
      keys.forEach((k) => store.removeItem(k));
      report[field] = keys.length;
    } catch {
      /* storage unavailable */
    }
  }
  try {
    if ('caches' in globalThis) {
      const names = await caches.keys();
      await Promise.all(names.map((n) => caches.delete(n)));
      report.caches = names.length;
    }
  } catch {
    /* ignore */
  }
  try {
    const idb = globalThis.indexedDB as IDBFactory & { databases?: () => Promise<{ name?: string }[]> };
    if (idb?.databases) {
      const dbs = await idb.databases();
      for (const db of dbs) if (db.name) idb.deleteDatabase(db.name);
      report.indexedDbs = dbs.length;
    }
  } catch {
    /* ignore */
  }
  return report;
}
