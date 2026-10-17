import { describe, expect, it } from 'vitest';
import { ALL_FOODS, EXTRA_FOODS, FOODS, foodById, scaleFood, sumMeals, type MealEntry } from './foods';
import { IMAGENET_FOODS, mergeGuesses, softmax, topGuesses, toTensorData } from './recognize';

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

describe('whole foods and merging the two models', () => {
  it('extra foods have unique ids that do not clash with dishes, and plausible macros', () => {
    const ids = ALL_FOODS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const f of EXTRA_FOODS) {
      const est = f.protein * 4 + f.carbs * 4 + f.fat * 9;
      expect(Math.abs(est - f.kcal), `${f.id}: ${est} vs ${f.kcal}`).toBeLessThanOrEqual(Math.max(f.kcal * 0.3, 15));
    }
  });

  it('every ImageNet food mapping points at a real food', () => {
    for (const target of Object.values(IMAGENET_FOODS)) {
      for (const id of Array.isArray(target) ? target : [target]) expect(foodById(id), id).toBeDefined();
    }
  });

  it('a confident banana beats the dish model forced guess (churros)', () => {
    const dish = new Array(101).fill(0.001);
    dish[FOODS.findIndex((f) => f.id === 'churros')] = 0.5;
    const net = new Array(1000).fill(0);
    net[954] = 0.99; // banana
    const g = mergeGuesses(dish, net);
    expect(g[0]!.id).toBe('banana');
    expect(g.find((x) => x.id === 'churros')!.p).toBeLessThan(0.05);
  });

  it('a confident dish is kept when the whole-food model sees nothing', () => {
    const dish = new Array(101).fill(0.001);
    dish[FOODS.findIndex((f) => f.id === 'lasagna')] = 0.8;
    const net = new Array(1000).fill(0.0001);
    expect(mergeGuesses(dish, net)[0]!.id).toBe('lasagna');
  });

  it('pizza from both models is one entry, not two', () => {
    const dish = new Array(101).fill(0.001);
    dish[FOODS.findIndex((f) => f.id === 'pizza')] = 0.6;
    const net = new Array(1000).fill(0);
    net[963] = 0.8;
    const g = mergeGuesses(dish, net);
    expect(g.filter((x) => x.id === 'pizza')).toHaveLength(1);
    expect(g[0]!.p).toBeCloseTo(0.8, 5);
  });

  it('pomegranate also suggests apple (ImageNet has no plain red apple)', () => {
    const dish = new Array(101).fill(0.001);
    const net = new Array(1000).fill(0);
    net[957] = 0.6;
    const ids = mergeGuesses(dish, net).map((x) => x.id);
    expect(ids).toContain('apple');
    expect(ids[0]).toBe('pomegranate');
  });

  it('works if the whole-food model is unavailable', () => {
    const dish = new Array(101).fill(0.001);
    dish[0] = 0.7;
    expect(mergeGuesses(dish, null)[0]!.id).toBe('apple_pie');
  });
});
