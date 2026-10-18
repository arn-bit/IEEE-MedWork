import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../../state/store';
import { ageBandFor } from '../../domain/safety/screening';
import { Callout, PageHead } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { ALL_FOODS, MEALS, foodById, scaleFood, sumMeals, type Food, type MealEntry, type MealType, type Nutrients } from '../../nutrition/foods';
import { analyzePhoto, encodeVector, type Guess, type PlateItem } from '../../nutrition/recognize';
import { DailyValueBars } from './DailyValueBars';

interface Entry {
  key: string;
  foodId: string;
  servings: number;
  p: number | null;
  share: number;
  alternatives: Guess[];
  /** Fingerprint of this part of the photo (null for items you added by hand). */
  embedding: Float32Array | null;
  taught?: boolean;
}

type Phase = { name: 'idle' } | { name: 'loading'; done: number; total: number } | { name: 'result' } | { name: 'error'; message: string };

const mealNow = (): MealType => {
  const h = new Date().getHours();
  return h < 11 ? 'breakfast' : h < 15 ? 'lunch' : h < 21 ? 'dinner' : 'snack';
};
const confidenceLabel = (p: number | null) => (p === null ? 'Added by you' : p >= 0.6 ? 'Confident' : p >= 0.3 ? 'Fairly sure' : 'Not sure');
const sameDay = (iso: string, d: Date) => new Date(iso).toDateString() === d.toDateString();
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30) || 'food';
const clampServings = (n: number) => Math.max(0.25, Math.min(4, Math.round(n * 4) / 4));
const ZERO: Nutrients = { kcal: 0, protein: 0, carbs: 0, fat: 0 };

export function NutritionPage() {
  const { data, addMeal, removeMeal, updateSettings, teachFood, forgetFood } = useStore();
  const profile = data.profile!;
  const young = ageBandFor(profile.ageYears) === 'child' || ageBandFor(profile.ageYears) === 'teen';
  const hideNumbers = data.settings.hideNutritionNumbers;
  const userFoods = data.userFoods;
  const lookup = (id: string): Food | undefined => foodById(id, userFoods);

  const [phase, setPhase] = useState<Phase>({ name: 'idle' });
  const [preview, setPreview] = useState<string | null>(null);
  const [items, setItems] = useState<Entry[]>([]);
  const [meal, setMeal] = useState<MealType>(mealNow);
  const [note, setNote] = useState<string | null>(null);
  const [scanId, setScanId] = useState(0);
  const [teaching, setTeaching] = useState<string | null>(null);
  const [teachPick, setTeachPick] = useState<string>('');
  const [teachMode, setTeachMode] = useState<'existing' | 'new'>('existing');
  const [newName, setNewName] = useState('');
  const [newServing, setNewServing] = useState('1 serving');
  const [newKcal, setNewKcal] = useState('');
  const [newProtein, setNewProtein] = useState('');
  const [newCarbs, setNewCarbs] = useState('');
  const [newFat, setNewFat] = useState('');
  const [addId, setAddId] = useState('');
  const [manualId, setManualId] = useState('pizza');
  const [customName, setCustomName] = useState('');
  const [customKcal, setCustomKcal] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [],
  );

  const sortedFoods = useMemo(() => [...ALL_FOODS, ...userFoods].sort((a, b) => a.name.localeCompare(b.name)), [userFoods]);

  const analyse = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setPhase({ name: 'error', message: 'That file is not a picture. Please choose a photo.' });
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setPhase({ name: 'error', message: 'That photo is very large. Please choose one under 25 MB.' });
      return;
    }
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = URL.createObjectURL(file);
    setPreview(urlRef.current);
    setNote(null);
    setTeaching(null);
    setPhase({ name: 'loading', done: 0, total: 1 });
    try {
      const found: PlateItem[] = await analyzePhoto(file, {
        examples: data.foodExamples,
        userFoods,
        onProgress: (done, total) => setPhase({ name: 'loading', done, total }),
      });
      setItems(found.map((f) => ({ key: f.key, foodId: f.foodId, servings: f.servings, p: f.p, share: f.share, alternatives: f.alternatives, embedding: f.embedding })));
      setMeal(mealNow());
      setScanId((n) => n + 1);
      setPhase({ name: 'result' });
    } catch (e) {
      setPhase({ name: 'error', message: e instanceof Error ? e.message : 'Something went wrong while analysing the photo.' });
    }
  };

  const nutrientsOf = (e: Entry): Nutrients => {
    const f = lookup(e.foodId);
    return f ? scaleFood(f, e.servings) : ZERO;
  };
  const plate: Nutrients = useMemo(
    () =>
      items.reduce<Nutrients>((a, e) => {
        const f = foodById(e.foodId, userFoods);
        const n = f ? scaleFood(f, e.servings) : ZERO;
        return { kcal: a.kcal + n.kcal, protein: Math.round((a.protein + n.protein) * 10) / 10, carbs: Math.round((a.carbs + n.carbs) * 10) / 10, fat: Math.round((a.fat + n.fat) * 10) / 10 };
      }, ZERO),
    [items, userFoods],
  );

  const today = new Date();
  const todays = data.meals.filter((m) => sameDay(m.at, today));
  const totals = sumMeals(todays);
  const earlier = (() => {
    const days = new Map<string, MealEntry[]>();
    for (const m of data.meals) {
      if (sameDay(m.at, today)) continue;
      const k = new Date(m.at).toDateString();
      days.set(k, [...(days.get(k) ?? []), m]);
    }
    return [...days.entries()].slice(-6).reverse();
  })();

  const update = (key: string, patch: Partial<Entry>) => setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  const logEntry = (source: MealEntry['source'], name: string, servings: number, n: Nutrients, confidence?: number) =>
    addMeal({ id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, at: new Date().toISOString(), meal, name, servings, ...n, source, confidence });

  const addPlate = () => {
    for (const e of items) {
      const f = lookup(e.foodId);
      if (!f) continue;
      logEntry(e.p === null ? 'search' : 'photo', f.name, e.servings, scaleFood(f, e.servings), e.p ?? undefined);
    }
    setNote(`Added ${items.length} item${items.length === 1 ? '' : 's'} to today. Your photo was not saved.`);
    setItems([]);
    setPhase({ name: 'idle' });
    setPreview(null);
  };

  const openTeach = (e: Entry) => {
    setTeaching(e.key);
    setTeachMode('existing');
    setTeachPick(e.foodId);
    setNewName('');
    setNewServing('1 serving');
    setNewKcal('');
    setNewProtein('');
    setNewCarbs('');
    setNewFat('');
  };

  const saveTeach = (e: Entry) => {
    if (!e.embedding) return;
    const exId = `ex-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    if (teachMode === 'existing') {
      const f = lookup(teachPick);
      if (!f) return;
      teachFood(null, { id: exId, foodId: f.id, v: encodeVector(e.embedding) });
      update(e.key, { foodId: f.id, taught: true, p: 1 });
      setNote(`Thanks. Photos that look like this will now suggest “${f.name}”. Only a small fingerprint was saved, not your picture.`);
    } else {
      const kcal = Number(newKcal);
      if (!newName.trim() || !Number.isFinite(kcal) || kcal <= 0) return;
      const food: Food = {
        id: `u_${slug(newName)}_${Date.now().toString(36)}`,
        name: newName.trim().slice(0, 60),
        grams: 100,
        serving: newServing.trim().slice(0, 40) || '1 serving',
        kcal: Math.round(kcal),
        protein: Number(newProtein) || 0,
        carbs: Number(newCarbs) || 0,
        fat: Number(newFat) || 0,
      };
      teachFood(food, { id: exId, foodId: food.id, v: encodeVector(e.embedding) });
      update(e.key, { foodId: food.id, taught: true, p: 1 });
      setNote(`Added “${food.name}” to your foods. Photos that look like this will now suggest it. Only a small fingerprint was saved, not your picture.`);
    }
    setTeaching(null);
  };

  const taughtFoods = useMemo(() => {
    const counts = new Map<string, number>();
    for (const x of data.foodExamples) counts.set(x.foodId, (counts.get(x.foodId) ?? 0) + 1);
    return [...counts.entries()].map(([id, n]) => ({ id, n, name: foodById(id, userFoods)?.name ?? id, custom: userFoods.some((f) => f.id === id) }));
  }, [data.foodExamples, userFoods]);

  return (
    <div className="stack-lg fade-in">
      <PageHead photo="food" eyebrow="Nutrition" title="Snap a meal">
        Take a photo of your plate. The app finds each food on it, estimates how much there is from the picture, and adds it all up. It runs on this device, and your photo is never uploaded or saved.
      </PageHead>

      <Callout tone="info" title="Estimates, not advice">
        Photo estimates are rough: portions and recipes vary a lot, so check every result and fix anything that looks wrong. This is general information, not dietary or medical advice, and it isn’t meant for
        managing a health condition. If counting food ever feels stressful, or you have (or have had) an eating disorder, hide the numbers below and speak to a doctor or dietitian.
      </Callout>

      {young ? (
        <Callout tone="warn" title="For under-18s: a note on calorie numbers">
          Young people are still growing and need plenty of food. Calorie numbers here are rough estimates and are not a target. Please don’t use them to cut back on eating or to “earn” meals with exercise. If you
          feel worried about food or your body, talk to a parent or guardian, a doctor or school nurse, or contact an eating-disorder support service. You can hide the numbers at any time below.
        </Callout>
      ) : null}

      <section className="card stack" aria-labelledby="scan-h">
        <h2 id="scan-h">Scan a meal</h2>
        <div className="row">
          <button className="btn btn-primary btn-lg" onClick={() => camRef.current?.click()} disabled={phase.name === 'loading'}>
            <Icon name="camera" size={18} /> Take a photo
          </button>
          <button className="btn btn-secondary btn-lg" onClick={() => fileRef.current?.click()} disabled={phase.name === 'loading'}>
            <Icon name="photo" size={18} /> Choose a photo
          </button>
        </div>
        <input ref={camRef} type="file" accept="image/*" capture="environment" className="visually-hidden" aria-label="Take a photo of your meal" onChange={(e) => { void analyse(e.target.files?.[0]); e.target.value = ''; }} />
        <input ref={fileRef} type="file" accept="image/*" className="visually-hidden" aria-label="Choose a photo of your meal" onChange={(e) => { void analyse(e.target.files?.[0]); e.target.value = ''; }} />
        <p className="tiny muted">
          The first scan loads two food models (about 80 MB, once). It knows over 300 foods and can read plates with several foods on them. Photos with the whole plate in view work best.
        </p>

        {phase.name === 'loading' ? (
          <div className="nut-loading" role="status">
            <span className="nut-spinner" aria-hidden="true" />
            <span>
              Reading your plate… {phase.done} of {phase.total}
            </span>
            <progress className="nut-progress" max={phase.total} value={phase.done} aria-label="Analysing your photo" />
          </div>
        ) : null}
        {phase.name === 'error' ? (
          <Callout tone="danger" title="Couldn’t analyse that photo">
            {phase.message}
          </Callout>
        ) : null}
        {note ? (
          <Callout tone="ok" title="Done">
            {note}
          </Callout>
        ) : null}
      </section>

      {phase.name === 'result' ? (
        <section className="card stack" aria-labelledby="plate-h" aria-live="polite">
          <div className="nut-result">
            {preview ? <img className="nut-photo" src={preview} alt="Your meal (shown only on this device)" /> : null}
            <div className="stack">
              <div>
                <span className="eyebrow">{items.length > 1 ? 'On your plate' : 'We found'}</span>
                <h2 id="plate-h" className="nut-name">
                  {items.length === 0 ? 'Nothing recognised' : items.length === 1 ? lookup(items[0]!.foodId)?.name : `${items.length} foods`}
                </h2>
                <p className="small muted">Amounts are estimated from how much of the plate each food covers. Adjust anything that looks off.</p>
              </div>

              {items.length === 0 ? (
                <Callout tone="warn" title="I couldn’t tell what this is">
                  Try a clearer photo from above, or add the food yourself below.
                </Callout>
              ) : null}

              <ul className="nut-items">
                {items.map((e) => {
                  const f = lookup(e.foodId);
                  if (!f) return null;
                  const n = nutrientsOf(e);
                  return (
                    <li key={e.key} className="nut-item" data-taught={e.taught ? 'true' : undefined}>
                      <div className="row-between">
                        <div>
                          <strong className="nut-item-name">{f.name}</strong>
                          <span className="tiny muted" style={{ display: 'block' }}>
                            {confidenceLabel(e.p)}
                            {e.p !== null && !e.taught ? ` · ${Math.round(e.p * 100)}%` : ''}
                            {e.taught ? ' · learned from you' : ''} · about {Math.round(f.grams * e.servings)} g
                          </span>
                        </div>
                        {!hideNumbers ? <span className="badge badge-brand">{n.kcal} kcal</span> : null}
                      </div>

                      {e.alternatives.length > 0 ? (
                        <div className="chip-group" role="group" aria-label={`Other options for ${f.name}`}>
                          {e.alternatives.slice(0, 3).map((a) => (
                            <button key={a.id} className="chip-btn" onClick={() => update(e.key, { foodId: a.id, p: a.p })}>
                              {a.name}
                            </button>
                          ))}
                        </div>
                      ) : null}

                      <div className="row nut-item-actions">
                        <div className="stepper-mini" role="group" aria-label={`Amount of ${f.name}`}>
                          <button className="btn btn-secondary btn-sm" onClick={() => update(e.key, { servings: clampServings(e.servings - 0.25) })} aria-label="Less">
                            <Icon name="minus" size={14} />
                          </button>
                          <span className="num small">×{e.servings}</span>
                          <button className="btn btn-secondary btn-sm" onClick={() => update(e.key, { servings: clampServings(e.servings + 0.25) })} aria-label="More">
                            <Icon name="plus" size={14} />
                          </button>
                        </div>
                        {e.embedding ? (
                          <button className="btn btn-ghost btn-sm" onClick={() => (teaching === e.key ? setTeaching(null) : openTeach(e))} aria-expanded={teaching === e.key}>
                            Not right? Label it
                          </button>
                        ) : null}
                        <button className="btn btn-ghost btn-sm" onClick={() => setItems((xs) => xs.filter((x) => x.key !== e.key))} aria-label={`Remove ${f.name}`}>
                          <Icon name="x" size={14} /> Remove
                        </button>
                      </div>

                      {teaching === e.key ? (
                        <div className="nut-teach stack-sm">
                          <strong className="small">Teach the app what this is</strong>
                          <div className="chip-group" role="radiogroup" aria-label="How to label it">
                            <label className="chip">
                              <input type="radio" name={`tm-${e.key}`} checked={teachMode === 'existing'} onChange={() => setTeachMode('existing')} />
                              <span>It’s a food on the list</span>
                            </label>
                            <label className="chip">
                              <input type="radio" name={`tm-${e.key}`} checked={teachMode === 'new'} onChange={() => setTeachMode('new')} />
                              <span>It’s something else</span>
                            </label>
                          </div>
                          {teachMode === 'existing' ? (
                            <div className="field">
                              <label htmlFor={`tp-${e.key}`}>What is it?</label>
                              <select id={`tp-${e.key}`} className="input" value={teachPick} onChange={(ev) => setTeachPick(ev.target.value)}>
                                {sortedFoods.map((x) => (
                                  <option key={x.id} value={x.id}>
                                    {x.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          ) : (
                            <div className="grid-2">
                              <div className="field">
                                <label htmlFor={`tn-${e.key}`}>Name</label>
                                <input id={`tn-${e.key}`} className="input" maxLength={60} value={newName} onChange={(ev) => setNewName(ev.target.value)} />
                              </div>
                              <div className="field">
                                <label htmlFor={`ts-${e.key}`}>One serving is…</label>
                                <input id={`ts-${e.key}`} className="input" maxLength={40} value={newServing} onChange={(ev) => setNewServing(ev.target.value)} />
                              </div>
                              <div className="field">
                                <label htmlFor={`tk-${e.key}`}>Calories per serving</label>
                                <input id={`tk-${e.key}`} className="input" inputMode="numeric" value={newKcal} onChange={(ev) => setNewKcal(ev.target.value.replace(/\D/g, '').slice(0, 4))} />
                              </div>
                              <div className="field">
                                <label htmlFor={`tpr-${e.key}`}>Protein (g, optional)</label>
                                <input id={`tpr-${e.key}`} className="input" inputMode="decimal" value={newProtein} onChange={(ev) => setNewProtein(ev.target.value.replace(/[^\d.]/g, '').slice(0, 5))} />
                              </div>
                              <div className="field">
                                <label htmlFor={`tc-${e.key}`}>Carbs (g, optional)</label>
                                <input id={`tc-${e.key}`} className="input" inputMode="decimal" value={newCarbs} onChange={(ev) => setNewCarbs(ev.target.value.replace(/[^\d.]/g, '').slice(0, 5))} />
                              </div>
                              <div className="field">
                                <label htmlFor={`tf-${e.key}`}>Fat (g, optional)</label>
                                <input id={`tf-${e.key}`} className="input" inputMode="decimal" value={newFat} onChange={(ev) => setNewFat(ev.target.value.replace(/[^\d.]/g, '').slice(0, 5))} />
                              </div>
                            </div>
                          )}
                          <p className="tiny muted">Only a small fingerprint of this part of the photo is saved on this device so similar photos are recognised next time. The photo itself is never stored.</p>
                          <div className="row">
                            <button className="btn btn-primary btn-sm" onClick={() => saveTeach(e)} disabled={teachMode === 'new' && (!newName.trim() || !Number(newKcal))}>
                              Save label
                            </button>
                            <button className="btn btn-ghost btn-sm" onClick={() => setTeaching(null)}>
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>

              <div className="row">
                <div className="field" style={{ flex: '1 1 220px', margin: 0 }}>
                  <label htmlFor="add-missing">Something missing from the plate?</label>
                  <select id="add-missing" className="input" value={addId} onChange={(ev) => setAddId(ev.target.value)}>
                    <option value="">Choose a food to add…</option>
                    {sortedFoods.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  className="btn btn-secondary"
                  disabled={!addId}
                  onClick={() => {
                    setItems((xs) => [...xs, { key: `manual-${addId}-${xs.length}`, foodId: addId, servings: 1, p: null, share: 0, alternatives: [], embedding: null }]);
                    setAddId('');
                  }}
                >
                  <Icon name="plus" size={16} /> Add
                </button>
              </div>

              {items.length > 0 ? (
                <>
                  <div className="nut-total">
                    <div className="row-between">
                      <h3 style={{ margin: 0 }}>Whole plate</h3>
                      {!hideNumbers ? (
                        <span className="nut-kcal">
                          <span className="num">{plate.kcal}</span>
                          <span>kcal (estimate)</span>
                        </span>
                      ) : null}
                    </div>
                    {hideNumbers ? (
                      <p className="small muted">Numbers are hidden. You can still log meals to keep a simple food diary.</p>
                    ) : (
                      <DailyValueBars plate={plate} before={totals} animateKey={`${scanId}-${items.map((i) => `${i.foodId}${i.servings}`).join('|')}`} />
                    )}
                  </div>

                  <fieldset className="field">
                    <legend>Which meal?</legend>
                    <div className="chip-group">
                      {MEALS.map((m) => (
                        <label key={m} className="chip">
                          <input type="radio" name="meal" checked={meal === m} onChange={() => setMeal(m)} />
                          <span style={{ textTransform: 'capitalize' }}>{m}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <div className="row">
                    <button className="btn btn-primary btn-lg" onClick={addPlate}>
                      <Icon name="plus" size={16} /> Add whole plate to today
                    </button>
                    <button className="btn btn-ghost" onClick={() => { setItems([]); setPhase({ name: 'idle' }); setPreview(null); }}>
                      Discard
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      <section className="card stack" aria-labelledby="manual-h">
        <h2 id="manual-h">Add without a photo</h2>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="manual-dish">Food</label>
            <select id="manual-dish" className="input" value={manualId} onChange={(e) => setManualId(e.target.value)}>
              {sortedFoods.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="manual-meal">Meal</label>
            <select id="manual-meal" className="input" value={meal} onChange={(e) => setMeal(e.target.value as MealType)}>
              {MEALS.map((m) => (
                <option key={m} value={m}>
                  {m[0]!.toUpperCase() + m.slice(1)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="row">
          <button
            className="btn btn-secondary"
            onClick={() => {
              const f = lookup(manualId);
              if (!f) return;
              logEntry('search', f.name, 1, scaleFood(f, 1));
              setNote(`Added ${f.name} to today.`);
            }}
          >
            <Icon name="plus" size={16} /> Add one serving
          </button>
        </div>
        <details className="lib-how">
          <summary>Something not on the list? Add your own</summary>
          <div className="grid-2" style={{ marginTop: 10 }}>
            <div className="field">
              <label htmlFor="c-name">Name</label>
              <input id="c-name" className="input" maxLength={60} value={customName} onChange={(e) => setCustomName(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="c-kcal">Calories (optional)</label>
              <input id="c-kcal" className="input" inputMode="numeric" value={customKcal} onChange={(e) => setCustomKcal(e.target.value.replace(/\D/g, '').slice(0, 4))} />
            </div>
          </div>
          <button
            className="btn btn-secondary"
            disabled={!customName.trim()}
            onClick={() => {
              logEntry('custom', customName.trim(), 1, { kcal: Number(customKcal) || 0, protein: 0, carbs: 0, fat: 0 });
              setCustomName('');
              setCustomKcal('');
            }}
          >
            Add to today
          </button>
        </details>
      </section>

      <section className="card stack" aria-labelledby="log-h">
        <div className="row-between">
          <h2 id="log-h">Today</h2>
          {!hideNumbers && todays.length > 0 ? (
            <span className="badge badge-brand">
              {totals.kcal} kcal · P {totals.protein} g · C {totals.carbs} g · F {totals.fat} g
            </span>
          ) : null}
        </div>
        {!hideNumbers && todays.length > 0 ? <DailyValueBars plate={totals} animateKey={`today-${todays.length}`} title="Today" /> : null}
        {todays.length === 0 ? (
          <p className="muted small">Nothing logged yet today.</p>
        ) : (
          <ul className="nut-log">
            {todays.map((m) => (
              <li key={m.id}>
                <span>
                  <strong>{m.name}</strong>
                  <span className="tiny muted" style={{ display: 'block' }}>
                    {m.meal}
                    {m.servings !== 1 ? ` · ×${m.servings}` : ''}
                    {!hideNumbers && m.kcal ? ` · ${m.kcal} kcal` : ''}
                  </span>
                </span>
                <button className="btn btn-ghost btn-sm" onClick={() => removeMeal(m.id)} aria-label={`Remove ${m.name}`}>
                  <Icon name="x" size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
        {earlier.length > 0 ? (
          <details className="lib-how">
            <summary>Earlier days</summary>
            <ul className="nut-log">
              {earlier.map(([day, entries]) => (
                <li key={day}>
                  <span>
                    <strong>{new Date(day).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</strong>
                    <span className="tiny muted" style={{ display: 'block' }}>
                      {entries.map((e) => e.name).join(', ')}
                      {!hideNumbers ? ` · ${sumMeals(entries).kcal} kcal` : ''}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </section>

      <section className="card stack-sm" aria-labelledby="taught-h">
        <h2 id="taught-h">What you’ve taught the app</h2>
        {taughtFoods.length === 0 ? (
          <p className="small muted">
            When a photo is recognised wrongly, choose “Not right? Label it”. The app remembers a small fingerprint of what you showed it and gets better at your food. Nothing leaves this device.
          </p>
        ) : (
          <ul className="nut-log">
            {taughtFoods.map((t) => (
              <li key={t.id}>
                <span>
                  <strong>{t.name}</strong>
                  <span className="tiny muted" style={{ display: 'block' }}>
                    {t.n} example{t.n === 1 ? '' : 's'}
                    {t.custom ? ' · your own food' : ''}
                  </span>
                </span>
                <button className="btn btn-ghost btn-sm" onClick={() => forgetFood(t.id)} aria-label={`Forget ${t.name}`}>
                  Forget
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card stack-sm" aria-labelledby="priv-h2">
        <h2 id="priv-h2">Your numbers, your choice</h2>
        <label className="check">
          <input type="checkbox" checked={data.settings.hideNutritionNumbers} onChange={(e) => updateSettings({ hideNutritionNumbers: e.target.checked })} />
          <span>
            <strong className="small">Hide calories and nutrients</strong>
            <span className="hint">Keep a simple food diary with no numbers. You can switch this back any time.</span>
          </span>
        </label>
        <p className="tiny muted">
          Dishes are recognised by an EfficientNet-B0 trained on the Food-101 dataset (MIT license, about 84% top-1 accuracy on its own test set, as reported by its author). Over 300 other foods (nuts, fruit,
          vegetables and dishes from many cuisines) are recognised by OpenAI’s CLIP image model (MIT). Both run with ONNX Runtime Web (MIT). For a plate with several foods, the photo is read in pieces, and each
          food’s amount is a guess from how much of the plate it covers, so it can’t see hidden ingredients, oils or the true size of the plate. Treat every number as a starting point.
        </p>
      </section>
    </div>
  );
}
