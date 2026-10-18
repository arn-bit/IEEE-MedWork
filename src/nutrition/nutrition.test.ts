import { describe, expect, it } from 'vitest';
import { ALL_FOODS, EXTRA_FOODS, FOODS, foodById, scaleFood, sumMeals, type MealEntry } from './foods';
import { WORLD_FOODS } from './world';
import { clipProbabilities, decodeExamples, decodeVector, encodeVector, exampleScores, mergeGuesses, normalize, planPlate, servingsFor, softmax, tileRects, topGuesses, toTensorData } from './recognize';

describe('food table', () => {
  it('has the 101 Food-101 classes, in the alphabetical order the model outputs', () => {
    expect(FOODS).toHaveLength(101);
    const ids = FOODS.map((f) => f.id);
    expect(new Set(ids).size).toBe(101);
    expect([...ids].sort()).toEqual(ids);
    expect(ids[0]).toBe('apple_pie');
    expect(ids[100]).toBe('waffles');
    expect(ids[76]).toBe('pizza');
    expect(ids.indexOf('hamburger')).toBe(53);
  });

  it('macros roughly add up to the calories (within 25%)', () => {
    for (const f of FOODS) {
      const est = f.protein * 4 + f.carbs * 4 + f.fat * 9;
      expect(Math.abs(est - f.kcal) / f.kcal, `${f.id}: ${est} vs ${f.kcal}`).toBeLessThan(0.25);
    }
  });

  it('values are sane', () => {
    for (const f of FOODS) {
      expect(f.kcal).toBeGreaterThan(30);
      expect(f.kcal).toBeLessThan(1000);
      expect(f.grams).toBeGreaterThan(30);
    }
  });

  it('scales by servings and never goes negative', () => {
    const pizza = foodById('pizza')!;
    expect(scaleFood(pizza, 2).kcal).toBe(pizza.kcal * 2);
    expect(scaleFood(pizza, -3).kcal).toBe(0);
    expect(scaleFood(pizza, 0.5).protein).toBeCloseTo(pizza.protein / 2, 1);
  });

  it('sums meals', () => {
    const e = (kcal: number): MealEntry => ({ id: String(kcal), at: '', meal: 'lunch', name: 'x', servings: 1, kcal, protein: 10, carbs: 20, fat: 5, source: 'search' });
    expect(sumMeals([e(100), e(250)])).toEqual({ kcal: 350, protein: 20, carbs: 40, fat: 10 });
    expect(sumMeals([])).toEqual({ kcal: 0, protein: 0, carbs: 0, fat: 0 });
  });
});

describe('recognition maths', () => {
  it('softmax sums to one and keeps order', () => {
    const p = softmax([1, 3, 2]);
    expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
    expect(p[1]!).toBeGreaterThan(p[2]!);
    expect(softmax([1000, 1000])[0]).toBeCloseTo(0.5, 6); // numerically stable
  });

  it('picks the top guesses in order with names', () => {
    const probs = new Array(101).fill(0.001);
    probs[76] = 0.8;
    probs[53] = 0.1;
    const g = topGuesses(probs, 3);
    expect(g.map((x) => x.id)).toEqual(['pizza', 'hamburger', g[2]!.id]);
    expect(g[0]!.p).toBe(0.8);
  });

  it('normalises RGBA pixels into NCHW floats', () => {
    const size = 2;
    const rgba = new Uint8ClampedArray(size * size * 4).fill(255);
    const t = toTensorData(rgba, size);
    expect(t).toHaveLength(3 * size * size);
    expect(t[0]).toBeCloseTo((1 - 0.485) / 0.229, 4);
    expect(t[size * size]).toBeCloseTo((1 - 0.456) / 0.224, 4);
  });
});

describe('world foods and merging the two models', () => {
  it('extra and world foods have unique ids and plausible macros', () => {
    const ids = ALL_FOODS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ALL_FOODS.length).toBeGreaterThan(250);
    for (const f of [...EXTRA_FOODS, ...WORLD_FOODS]) {
      const est = f.protein * 4 + f.carbs * 4 + f.fat * 9;
      expect(Math.abs(est - f.kcal), `${f.id}: ${est} vs ${f.kcal}`).toBeLessThanOrEqual(Math.max(f.kcal * 0.3, 15));
    }
  });

  it('covers nuts and a range of cuisines', () => {
    for (const id of ['almonds', 'cashews', 'walnuts', 'mixed_nuts', 'biryani', 'dosa', 'kimchi', 'tteokbokki', 'pad_see_ew', 'shawarma', 'jollof_rice', 'tacos', 'pierogi']) {
      expect(foodById(id), id).toBeDefined();
    }
  });

  it('CLIP probabilities pick the matching text vector', () => {
    const dim = 4;
    const text = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0]);
    const p = clipProbabilities([0, 5, 0.1, 0], text, dim, 100);
    expect(p[1]!).toBeGreaterThan(0.99);
    expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
  });

  const ids = ['banana', 'churros', 'almonds', 'lasagna'];
  const dishIdx = (id: string) => FOODS.findIndex((f) => f.id === id);

  it('a confident banana beats the dish model forced guess (churros)', () => {
    const dish = new Array(101).fill(0.001);
    dish[dishIdx('churros')] = 0.5;
    const clip = [0.9, 0.01, 0.05, 0.04];
    const g = mergeGuesses(ids, clip, dish);
    expect(g[0]!.id).toBe('banana');
    expect(g.find((x) => x.id === 'churros')!.p).toBeLessThan(0.1);
  });

  it('a dish both models agree on gets a strong score', () => {
    const dish = new Array(101).fill(0.001);
    dish[dishIdx('lasagna')] = 0.8;
    const clip = [0.02, 0.02, 0.02, 0.9];
    const g = mergeGuesses(ids, clip, dish);
    expect(g[0]!.id).toBe('lasagna');
    expect(g[0]!.p).toBeGreaterThan(0.7);
  });

  it('a non-dish food (almonds) is scored by CLIP alone', () => {
    const dish = new Array(101).fill(0.001);
    const g = mergeGuesses(ids, [0.05, 0.05, 0.8, 0.1], dish);
    expect(g[0]!.id).toBe('almonds');
    expect(g[0]!.p).toBeCloseTo(0.8, 5);
  });

  it('falls back to one model if the other is unavailable', () => {
    const dish = new Array(101).fill(0.001);
    dish[0] = 0.7;
    expect(mergeGuesses([], null, dish)[0]!.id).toBe('apple_pie');
    expect(mergeGuesses(ids, [0.1, 0.1, 0.7, 0.1], null)[0]!.id).toBe('almonds');
  });
});

describe('plates with several foods and learning from labels', () => {
  const ids = ['fried_rice', 'roast_chicken', 'grilled_vegetables', 'bg_plate', 'u_mom_curry'];
  const DIM = 512;
  const vec = (seed: number) => {
    const v = new Float32Array(DIM);
    for (let k = 0; k < DIM; k++) v[k] = Math.sin(seed * 31.7 + k * 0.37);
    return normalize(v);
  };
  /** probabilities over `ids` with the given mass on one label and the rest spread out */
  const probsOn = (id: string, p: number) => {
    const out = new Array(ids.length).fill((1 - p) / (ids.length - 1));
    out[ids.indexOf(id)] = p;
    return out;
  };

  it('a confident single dish is not split into pieces', () => {
    const items = planPlate({ ids, global: { probs: probsOn('fried_rice', 0.8), emb: vec(1), dish: null }, tiles: [{ probs: probsOn('roast_chicken', 0.9), emb: vec(2) }, { probs: probsOn('roast_chicken', 0.9), emb: vec(3) }] });
    expect(items).toHaveLength(1);
    expect(items[0]!.foodId).toBe('fried_rice');
    expect(items[0]!.servings).toBe(1);
  });

  it('an unsure photo is read in tiles: foods that win several tiles become items, with amounts from coverage', () => {
    const tiles = [
      { probs: probsOn('fried_rice', 0.5), emb: vec(10) },
      { probs: probsOn('fried_rice', 0.5), emb: vec(11) },
      { probs: probsOn('fried_rice', 0.5), emb: vec(12) },
      { probs: probsOn('roast_chicken', 0.5), emb: vec(13) },
      { probs: probsOn('roast_chicken', 0.5), emb: vec(14) },
      { probs: probsOn('bg_plate', 0.9), emb: vec(15) },
    ];
    const items = planPlate({ ids, global: { probs: probsOn('fried_rice', 0.3), emb: vec(1), dish: null }, tiles });
    expect(items.map((i) => i.foodId)).toEqual(['fried_rice', 'roast_chicken']);
    expect(items[0]!.share).toBeGreaterThan(items[1]!.share);
    expect(items[0]!.servings).toBeGreaterThan(items[1]!.servings);
    expect(items[0]!.servings).toBeLessThan(1.01);
    for (const i of items) expect(i.embedding).toHaveLength(DIM);
  });

  it('background-only tiles never become food', () => {
    const tiles = Array.from({ length: 6 }, (_, i) => ({ probs: probsOn('bg_plate', 0.9), emb: vec(20 + i) }));
    const items = planPlate({ ids, global: { probs: probsOn('grilled_vegetables', 0.4), emb: vec(1), dish: null }, tiles });
    expect(items.map((i) => i.foodId)).toEqual(['grilled_vegetables']);
  });

  it('lone amounts: one food is one serving, foods sharing a plate get less, never beyond sane bounds', () => {
    expect(servingsFor(1)).toBe(1);
    expect(servingsFor(0.5)).toBeCloseTo(0.65, 5);
    expect(servingsFor(0)).toBeGreaterThanOrEqual(0.3);
    expect(servingsFor(5)).toBeLessThanOrEqual(1.2);
  });

  it('fingerprints survive saving (quantised base64) with almost no loss', () => {
    const v = vec(7);
    const back = decodeVector(encodeVector(v));
    let cos = 0;
    for (let k = 0; k < DIM; k++) cos += v[k]! * back[k]!;
    expect(cos).toBeGreaterThan(0.995);
    expect(encodeVector(v).length).toBeLessThan(800);
  });

  it('a photo you labelled is recognised next time, even for a food the models do not know', () => {
    const emb = vec(40);
    const taught = decodeExamples([{ id: 'e1', foodId: 'u_mom_curry', v: encodeVector(emb) }]);
    expect(exampleScores(emb, taught).get('u_mom_curry')!).toBeGreaterThan(0.9);
    expect(exampleScores(vec(99), taught).get('u_mom_curry') ?? 0).toBeLessThan(0.2);
    const mine = { id: 'u_mom_curry', name: 'Mom’s curry', grams: 100, serving: '1 bowl', kcal: 450, protein: 20, carbs: 40, fat: 20 };
    const items = planPlate({ ids, global: { probs: probsOn('roast_chicken', 0.3), emb, dish: null }, tiles: [], examples: taught, userFoods: [mine] });
    expect(items[0]!.foodId).toBe('u_mom_curry');
    expect(items[0]!.name).toBe('Mom’s curry');
  });

  it('the tile grid covers the picture with at most 12 square tiles', () => {
    for (const [w, h] of [[720, 480], [1200, 1200], [4000, 3000], [480, 960]] as const) {
      const r = tileRects(w, h);
      expect(r.length).toBeGreaterThanOrEqual(4);
      expect(r.length).toBeLessThanOrEqual(12);
      for (const t of r) {
        expect(t.x).toBeGreaterThanOrEqual(0);
        expect(t.y).toBeGreaterThanOrEqual(0);
        expect(t.x + t.side).toBeLessThanOrEqual(w + 1);
        expect(t.y + t.side).toBeLessThanOrEqual(h + 1);
      }
    }
  });
});
