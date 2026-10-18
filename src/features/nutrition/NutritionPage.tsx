import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../state/store';
import { ageBandFor } from '../../domain/safety/screening';
import { Callout, PageHead } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { ALL_FOODS, FOODS, MEALS, foodById, scaleFood, sumMeals, type Food, type MealEntry, type MealType } from '../../nutrition/foods';
import { recognizeFood, type Guess } from '../../nutrition/recognize';

const PORTIONS = [
  { v: 0.5, label: 'Small' },
  { v: 1, label: 'Regular' },
  { v: 1.5, label: 'Large' },
  { v: 2, label: 'Extra large' },
];

type Phase = { name: 'idle' } | { name: 'loading'; note: string } | { name: 'result'; guesses: Guess[] } | { name: 'error'; message: string };

const mealNow = (): MealType => {
  const h = new Date().getHours();
  return h < 11 ? 'breakfast' : h < 15 ? 'lunch' : h < 21 ? 'dinner' : 'snack';
};
const confidenceLabel = (p: number) => (p >= 0.6 ? 'Confident' : p >= 0.3 ? 'Fairly sure' : 'Not sure');
const sameDay = (iso: string, d: Date) => new Date(iso).toDateString() === d.toDateString();

export function NutritionPage() {
  const { data, addMeal, removeMeal, updateSettings } = useStore();
  const profile = data.profile!;
  const young = ageBandFor(profile.ageYears) === 'child' || ageBandFor(profile.ageYears) === 'teen';
  const hideNumbers = data.settings.hideNutritionNumbers;
  const [phase, setPhase] = useState<Phase>({ name: 'idle' });
  const [preview, setPreview] = useState<string | null>(null);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [servings, setServings] = useState(1);
  const [meal, setMeal] = useState<MealType>(mealNow);
  const [confidence, setConfidence] = useState<number | undefined>(undefined);
  const [added, setAdded] = useState<string | null>(null);
  const [manualId, setManualId] = useState(FOODS[0]!.id);
  const sortedFoods = [...ALL_FOODS].sort((a, b) => a.name.localeCompare(b.name));
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
    setAdded(null);
    setPhase({ name: 'loading', note: 'Looking at your meal on this device…' });
    try {
      const guesses = await recognizeFood(file);
      const top = guesses[0]!;
      setPickedId(top.id);
      setConfidence(top.p);
      setServings(1);
      setMeal(mealNow());
      setPhase({ name: 'result', guesses });
    } catch (e) {
      setPhase({ name: 'error', message: e instanceof Error ? e.message : 'Something went wrong while analysing the photo.' });
    }
  };

  const picked: Food | undefined = pickedId ? foodById(pickedId) : undefined;
  const n = picked ? scaleFood(picked, servings) : null;

  const log = (entry: Omit<MealEntry, 'id' | 'at'>) => {
    addMeal({ ...entry, id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, at: new Date().toISOString() });
    setAdded(entry.name);
  };

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

  return (
    <div className="stack-lg fade-in">
      <PageHead photo="food" eyebrow="Nutrition" title="Snap a meal">
        Take a photo and get a quick estimate of what’s on your plate. The recognition runs on this device, and your photo is never uploaded or saved.
      </PageHead>

      <Callout tone="info" title="Estimates, not advice">
        Photo estimates are rough: portions and recipes vary a lot, so check and adjust every result. This is general information, not dietary or medical advice, and it isn’t meant for managing a
        health condition. If counting food ever feels stressful, or you have (or have had) an eating disorder, hide the numbers below and speak to a doctor or dietitian.
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
        <p className="tiny muted">The first scan loads two food models (about 80 MB in total, once) from this app, not the internet. It knows over 300 foods, including nuts, fruit, vegetables and dishes from many cuisines, so unusual meals may still need a manual pick.</p>

        {phase.name === 'loading' ? (
          <div className="nut-loading" role="status">
            <span className="nut-spinner" aria-hidden="true" /> {phase.note}
          </div>
        ) : null}
        {phase.name === 'error' ? (
          <Callout tone="danger" title="Couldn’t analyse that photo">
            {phase.message}
          </Callout>
        ) : null}

        {phase.name === 'result' && picked && n ? (
          <div className="nut-result" aria-live="polite">
            {preview ? <img className="nut-photo" src={preview} alt="Your meal (shown only on this device)" /> : null}
            <div className="stack">
              <div>
                <span className="eyebrow">{confidenceLabel(confidence ?? 0)}{confidence !== undefined ? ` · ${Math.round(confidence * 100)}%` : ''}</span>
                <h3 className="nut-name">{picked.name}</h3>
                <p className="small muted">
                  Reference serving: {picked.serving} (about {picked.grams} g)
                </p>
              </div>

              {confidence !== undefined && confidence < 0.3 ? (
                <Callout tone="warn" title="Not sure about this one">
                  Please pick the closest match below, or search all dishes.
                </Callout>
              ) : null}

              <fieldset className="field">
                <legend>Is it one of these?</legend>
                <div className="chip-group">
                  {phase.guesses.map((g) => (
                    <label key={g.id} className="chip">
                      <input type="radio" name="guess" checked={pickedId === g.id} onChange={() => { setPickedId(g.id); setConfidence(g.p); }} />
                      <span>
                        {g.name} <span className="muted">{Math.round(g.p * 100)}%</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="field">
                <label htmlFor="any-dish">Or pick any dish</label>
                <select id="any-dish" className="input" value={pickedId ?? ''} onChange={(e) => { setPickedId(e.target.value); setConfidence(undefined); }}>
                  {sortedFoods.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </div>

              <fieldset className="field">
                <legend>How much did you have?</legend>
                <div className="chip-group">
                  {PORTIONS.map((p) => (
                    <label key={p.v} className="chip">
                      <input type="radio" name="portion" checked={servings === p.v} onChange={() => setServings(p.v)} />
                      <span>
                        {p.label} <span className="muted">×{p.v}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>

              {hideNumbers ? (
                <p className="small muted">Numbers are hidden. You can still log meals to keep a simple food diary.</p>
              ) : (
                <div className="nut-facts" role="group" aria-label="Estimated nutrition">
                  <div className="nut-kcal">
                    <span className="num">{n.kcal}</span>
                    <span>kcal (estimate)</span>
                  </div>
                  <div className="nut-macros">
                    <Macro label="Protein" g={n.protein} color="var(--brand)" />
                    <Macro label="Carbs" g={n.carbs} color="var(--sun)" />
                    <Macro label="Fat" g={n.fat} color="var(--pop)" />
                  </div>
                </div>
              )}

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
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    log({ meal, name: picked.name, servings, ...n, source: confidence !== undefined ? 'photo' : 'search', confidence });
                    setPhase({ name: 'idle' });
                    setPreview(null);
                  }}
                >
                  <Icon name="plus" size={16} /> Add to today
                </button>
                <button className="btn btn-ghost" onClick={() => { setPhase({ name: 'idle' }); setPreview(null); }}>
                  Discard
                </button>
              </div>
            </div>
          </div>
        ) : null}
        {added ? (
          <Callout tone="ok" title="Added">
            {added} was added to today. Your photo was not saved.
          </Callout>
        ) : null}
      </section>

      <section className="card stack" aria-labelledby="manual-h">
        <h2 id="manual-h">Add without a photo</h2>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="manual-dish">Dish</label>
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
              const f = foodById(manualId)!;
              log({ meal, name: f.name, servings: 1, ...scaleFood(f, 1), source: 'search' });
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
              log({ meal, name: customName.trim(), servings: 1, kcal: Number(customKcal) || 0, protein: 0, carbs: 0, fat: 0, source: 'custom' });
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
          Dishes are recognised by an EfficientNet-B0 trained on the Food-101 dataset (MIT license, about 84% top-1 accuracy on its own test set, as reported by its author). Over 300 other foods (nuts, fruit, vegetables and dishes from many cuisines) are recognised by OpenAI’s CLIP image model (MIT). Both run with ONNX Runtime Web (MIT). It recognises over 300 foods, and can’t tell portion
          size, ingredients or hidden oils, so treat every number as a starting point.
        </p>
      </section>
    </div>
  );
}

function Macro({ label, g, color }: { label: string; g: number; color: string }) {
  return (
    <div className="nut-macro">
      <span className="nut-macro-dot" style={{ background: color }} aria-hidden="true" />
      <span className="small">{label}</span>
      <strong className="num">{g} g</strong>
    </div>
  );
}
