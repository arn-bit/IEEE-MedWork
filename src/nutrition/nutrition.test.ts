import { describe, expect, it } from 'vitest';
import { ALL_FOODS, EXTRA_FOODS, FOODS, foodById, scaleFood, sumMeals, type MealEntry } from './foods';
import { WORLD_FOODS } from './world';
import { clipProbabilities, mergeGuesses, softmax, topGuesses, toTensorData } from './recognize';

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
