import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react';
import { generatePlan } from '../domain/plan/engine';
import { emptyHealth } from '../domain/profile';
import { earnedAchievements, type Pause, type PersonalGoal, type ScoreCard } from '../domain/gamification/rules';
import type { PlanResult, Profile, SessionLog } from '../domain/types';
import type { ActivityEntry } from '../domain/plan/progression';
import { defaultData, deleteAllData, loadData, saveData, type AppData, type LoadResult, type Settings } from './storage';

type Action =
  | { type: 'setProfileAndPlan'; profile: Profile; result: PlanResult }
  | { type: 'logSession'; log: SessionLog }
  | { type: 'pause'; reason: Pause['reason']; now: string }
  | { type: 'resume'; now: string }
  | { type: 'restChoice' }
  | { type: 'settings'; patch: Partial<Settings> }
  | { type: 'games'; patch: Partial<AppData['games']> }
  | { type: 'addFriend'; card: ScoreCard }
  | { type: 'removeFriend'; name: string }
  | { type: 'personalGoal'; goal: PersonalGoal | null }
  | { type: 'seenAchievements'; ids: string[] }
  | { type: 'addActivity'; entry: ActivityEntry }
  | { type: 'removeActivity'; id: string }
  | { type: 'replaceAll'; data: AppData }
  | { type: 'reset' };

function reducer(state: AppData, a: Action): AppData {
  switch (a.type) {
    case 'setProfileAndPlan': {
      let profile = a.profile;
      if (state.settings.minimizeHealthData && a.result.ok) {
        // Keep only what the plan needs (it already stores derived constraints); drop raw answers.
        profile = { ...profile, health: emptyHealth(), healthMinimized: true };
      }
      return { ...state, profile, plan: a.result.ok ? a.result.plan : null };
    }
    case 'logSession':
      return { ...state, sessions: [...state.sessions, a.log] };
    case 'pause':
      if (state.pauses.some((p) => p.end === null)) return state;
      return { ...state, pauses: [...state.pauses, { start: a.now, end: null, reason: a.reason }] };
    case 'resume':
      return { ...state, pauses: state.pauses.map((p) => (p.end === null ? { ...p, end: a.now } : p)) };
    case 'restChoice':
      return { ...state, restChoices: state.restChoices + 1 };
    case 'settings':
      return { ...state, settings: { ...state.settings, ...a.patch } };
    case 'games':
      return { ...state, games: { ...state.games, ...a.patch } };
    case 'addFriend':
      return { ...state, friends: [...state.friends.filter((f) => f.name !== a.card.name), a.card] };
    case 'removeFriend':
      return { ...state, friends: state.friends.filter((f) => f.name !== a.name) };
    case 'personalGoal':
      return { ...state, personalGoal: a.goal };
    case 'seenAchievements':
      return { ...state, seenAchievements: [...new Set([...state.seenAchievements, ...a.ids])] };
    case 'addActivity':
      return { ...state, activities: [...state.activities, a.entry] };
    case 'removeActivity':
      return { ...state, activities: state.activities.filter((x) => x.id !== a.id) };
    case 'replaceAll':
      return a.data;
    case 'reset':
      return defaultData();
  }
}

interface StoreValue {
  data: AppData;
  loadStatus: LoadResult['status'];
  /** Current plan result, recomputed from the profile when no plan is stored (e.g. referral). */
  planResult: PlanResult | null;
  paused: Pause | null;
  achievements: Set<string>;
  submitProfile(profile: Profile): PlanResult;
  logSession(log: SessionLog): void;
  pause(reason: Pause['reason']): void;
  resume(): void;
  recordRestChoice(): void;
  updateSettings(patch: Partial<Settings>): void;
  updateGames(patch: Partial<AppData['games']>): void;
  addFriend(card: ScoreCard): void;
  removeFriend(name: string): void;
  setPersonalGoal(goal: PersonalGoal | null): void;
  markAchievementsSeen(ids: string[]): void;
  importData(data: AppData): void;
  addActivity(entry: ActivityEntry): void;
  removeActivity(id: string): void;
  deleteEverything(): Promise<void>;
}

const Ctx = createContext<StoreValue | null>(null);

export function StoreProvider({
  children,
  initial,
  persist,
  onDeleted,
}: {
  children: ReactNode;
  initial?: AppData;
  /** Custom persistence (the encrypted vault). Defaults to plain localStorage. */
  persist?: (data: AppData) => void;
  /** Called after "delete everything" has wiped storage. */
  onDeleted?: () => void;
}) {
  const loaded = useMemo<LoadResult>(() => (initial ? { data: initial, status: 'loaded' } : loadData()), [initial]);
  const [data, dispatch] = useReducer(reducer, loaded.data);
  const skipSave = useRef(false);

  useEffect(() => {
    if (skipSave.current) {
      skipSave.current = false;
      return;
    }
    if (persist) persist(data);
    else saveData(data);
  }, [data, persist]);

  const planResult = useMemo<PlanResult | null>(() => {
    if (!data.profile) return null;
    if (data.plan) return { ok: true, plan: data.plan };
    if (data.profile.healthMinimized) return null;
    return generatePlan(data.profile);
  }, [data.profile, data.plan]);

  const paused = data.pauses.find((p) => p.end === null) ?? null;

  const achievements = useMemo(
    () =>
      earnedAchievements({
        sessions: data.sessions,
        plannedDays: data.profile?.daysPerWeek ?? 3,
        pauses: data.pauses,
        restChoices: data.restChoices,
        quizCompleted: data.games.quizCompleted,
        balanceCompletions: data.games.balanceCompletions,
        personalGoal: data.personalGoal,
        now: new Date(),
      }),
    [data.sessions, data.profile?.daysPerWeek, data.pauses, data.restChoices, data.games, data.personalGoal],
  );

  const submitProfile = useCallback((profile: Profile) => {
    const result = generatePlan(profile);
    dispatch({ type: 'setProfileAndPlan', profile, result });
    return result;
  }, []);

  const value: StoreValue = {
    data,
    loadStatus: loaded.status,
    planResult,
    paused,
    achievements,
    submitProfile,
    logSession: (log) => dispatch({ type: 'logSession', log }),
    pause: (reason) => dispatch({ type: 'pause', reason, now: new Date().toISOString() }),
    resume: () => dispatch({ type: 'resume', now: new Date().toISOString() }),
    recordRestChoice: () => dispatch({ type: 'restChoice' }),
    updateSettings: (patch) => dispatch({ type: 'settings', patch }),
    updateGames: (patch) => dispatch({ type: 'games', patch }),
    addFriend: (card) => dispatch({ type: 'addFriend', card }),
    removeFriend: (name) => dispatch({ type: 'removeFriend', name }),
    setPersonalGoal: (goal) => dispatch({ type: 'personalGoal', goal }),
    markAchievementsSeen: (ids) => dispatch({ type: 'seenAchievements', ids }),
    importData: (data) => dispatch({ type: 'replaceAll', data }),
    addActivity: (entry) => dispatch({ type: 'addActivity', entry }),
    removeActivity: (id) => dispatch({ type: 'removeActivity', id }),
    deleteEverything: async () => {
      await deleteAllData();
      skipSave.current = true; // don't immediately re-write defaults
      dispatch({ type: 'reset' });
      onDeleted?.();
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): StoreValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStore must be used inside <StoreProvider>');
  return v;
}
