import { WORLD_FOODS } from './world';

/**
 * Typical nutrition for the 101 dishes the on-device classifier knows (the Food-101 classes).
 *
 * These are ROUGH, rounded averages for one typical serving, assembled from commonly published
 * restaurant and home-cooking values. They are not lab measurements and real plates vary a lot, which
 * is why the app always shows them as estimates and lets you change the portion.
 *
 * ORDER MATTERS: the model outputs a class index, and these rows are in the alphabetical order of the
 * Food-101 labels (a unit test checks the order and the count).
 */
export interface Food {
  id: string;
  name: string;
  /** Grams in the reference serving. */
  grams: number;
  /** Plain-language serving, e.g. "1 slice". */
  serving: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

type Row = [id: string, name: string, grams: number, serving: string, kcal: number, protein: number, carbs: number, fat: number];

const ROWS: Row[] = [
  ['apple_pie', 'Apple pie', 125, '1 slice', 300, 2.4, 43, 14],
  ['baby_back_ribs', 'Baby back ribs', 250, 'about 5 ribs', 560, 42, 10, 38],
  ['baklava', 'Baklava', 80, '1 piece', 330, 4, 36, 19],
  ['beef_carpaccio', 'Beef carpaccio', 100, '1 plate', 150, 20, 1, 7],
  ['beef_tartare', 'Beef tartare', 120, '1 plate', 230, 24, 2, 14],
  ['beet_salad', 'Beet salad', 200, '1 bowl', 150, 4, 18, 7],
  ['beignets', 'Beignets', 100, '3 pieces', 330, 5, 38, 18],
  ['bibimbap', 'Bibimbap', 400, '1 bowl', 560, 22, 85, 14],
  ['bread_pudding', 'Bread pudding', 150, '1 serving', 350, 8, 50, 14],
  ['breakfast_burrito', 'Breakfast burrito', 200, '1 burrito', 450, 20, 40, 23],
  ['bruschetta', 'Bruschetta', 100, '2 pieces', 180, 5, 24, 7],
  ['caesar_salad', 'Caesar salad', 200, '1 bowl', 330, 9, 14, 27],
  ['cannoli', 'Cannoli', 85, '1 piece', 270, 6, 28, 15],
  ['caprese_salad', 'Caprese salad', 170, '1 plate', 280, 15, 5, 22],
  ['carrot_cake', 'Carrot cake', 130, '1 slice', 480, 5, 60, 25],
  ['ceviche', 'Ceviche', 170, '1 cup', 140, 20, 8, 3],
  ['cheese_plate', 'Cheese plate', 100, '1 plate', 380, 22, 5, 31],
  ['cheesecake', 'Cheesecake', 125, '1 slice', 400, 7, 32, 28],
  ['chicken_curry', 'Chicken curry', 300, '1 bowl', 380, 28, 14, 22],
  ['chicken_quesadilla', 'Chicken quesadilla', 200, '1 quesadilla', 520, 30, 38, 28],
  ['chicken_wings', 'Chicken wings', 200, '6 wings', 580, 40, 4, 43],
  ['chocolate_cake', 'Chocolate cake', 110, '1 slice', 400, 5, 55, 19],
  ['chocolate_mousse', 'Chocolate mousse', 120, '1 cup', 270, 5, 22, 18],
  ['churros', 'Churros', 90, '3 churros', 330, 4, 38, 18],
  ['clam_chowder', 'Clam chowder', 250, '1 bowl', 250, 10, 22, 14],
  ['club_sandwich', 'Club sandwich', 250, '1 sandwich', 590, 32, 44, 30],
  ['crab_cakes', 'Crab cakes', 150, '2 cakes', 300, 20, 12, 18],
  ['creme_brulee', 'Crème brûlée', 130, '1 ramekin', 340, 5, 28, 24],
  ['croque_madame', 'Croque madame', 250, '1 sandwich', 620, 32, 38, 38],
  ['cup_cakes', 'Cupcake', 70, '1 cupcake', 260, 2.5, 38, 11],
  ['deviled_eggs', 'Deviled eggs', 100, '4 halves', 200, 11, 2, 16],
  ['donuts', 'Doughnut', 75, '1 doughnut', 300, 4, 34, 17],
  ['dumplings', 'Dumplings', 180, '6 dumplings', 330, 14, 42, 11],
  ['edamame', 'Edamame', 150, '1 cup in pods', 190, 17, 14, 8],
  ['eggs_benedict', 'Eggs benedict', 230, '1 serving', 550, 25, 28, 36],
  ['escargots', 'Escargots', 80, '6 snails', 200, 12, 3, 15],
  ['falafel', 'Falafel', 100, '4 pieces', 330, 13, 32, 18],
  ['filet_mignon', 'Filet mignon', 170, '6 oz', 380, 42, 0, 23],
  ['fish_and_chips', 'Fish and chips', 400, '1 plate', 800, 34, 78, 40],
  ['foie_gras', 'Foie gras', 60, '1 slice', 275, 5, 2, 27],
  ['french_fries', 'French fries', 115, '1 medium portion', 365, 4, 48, 17],
  ['french_onion_soup', 'French onion soup', 300, '1 bowl', 400, 18, 28, 22],
  ['french_toast', 'French toast', 150, '2 slices', 340, 11, 40, 15],
  ['fried_calamari', 'Fried calamari', 150, '1 plate', 400, 22, 28, 22],
  ['fried_rice', 'Fried rice', 250, '1 plate', 420, 11, 62, 14],
  ['frozen_yogurt', 'Frozen yogurt', 140, '1 cup', 220, 5, 38, 6],
  ['garlic_bread', 'Garlic bread', 70, '2 slices', 230, 5, 28, 11],
  ['gnocchi', 'Gnocchi', 250, '1 plate', 380, 10, 70, 7],
  ['greek_salad', 'Greek salad', 250, '1 bowl', 240, 6, 12, 19],
  ['grilled_cheese_sandwich', 'Grilled cheese sandwich', 130, '1 sandwich', 430, 16, 30, 27],
  ['grilled_salmon', 'Grilled salmon', 180, '1 fillet', 370, 40, 0, 22],
  ['guacamole', 'Guacamole', 120, '½ cup', 190, 3, 10, 17],
  ['gyoza', 'Gyoza', 150, '6 pieces', 300, 12, 33, 13],
  ['hamburger', 'Hamburger', 220, '1 burger', 560, 30, 40, 30],
  ['hot_and_sour_soup', 'Hot and sour soup', 300, '1 bowl', 160, 10, 14, 7],
  ['hot_dog', 'Hot dog', 150, '1 with bun', 320, 11, 24, 20],
  ['huevos_rancheros', 'Huevos rancheros', 300, '1 plate', 460, 20, 40, 25],
  ['hummus', 'Hummus', 100, '½ cup', 170, 8, 14, 10],
  ['ice_cream', 'Ice cream', 130, '1 cup', 270, 4, 31, 15],
  ['lasagna', 'Lasagna', 300, '1 piece', 520, 28, 44, 26],
  ['lobster_bisque', 'Lobster bisque', 250, '1 bowl', 300, 10, 15, 22],
  ['lobster_roll_sandwich', 'Lobster roll', 170, '1 roll', 440, 24, 36, 22],
  ['macaroni_and_cheese', 'Macaroni and cheese', 250, '1 cup', 500, 20, 52, 24],
  ['macarons', 'Macarons', 45, '3 macarons', 190, 3, 28, 8],
  ['miso_soup', 'Miso soup', 240, '1 bowl', 60, 4, 6, 2],
  ['mussels', 'Mussels', 250, '1 bowl in sauce', 230, 26, 9, 9],
  ['nachos', 'Nachos', 250, '1 plate', 650, 22, 60, 38],
  ['omelette', 'Omelette', 200, '3-egg omelette', 380, 24, 3, 30],
  ['onion_rings', 'Onion rings', 120, '1 portion', 410, 5, 42, 25],
  ['oysters', 'Oysters', 100, '6 oysters', 80, 9, 5, 2.5],
  ['pad_thai', 'Pad thai', 350, '1 plate', 650, 24, 85, 25],
  ['paella', 'Paella', 300, '1 plate', 480, 28, 55, 16],
  ['pancakes', 'Pancakes', 180, '3 pancakes', 420, 10, 62, 14],
  ['panna_cotta', 'Panna cotta', 140, '1 serving', 320, 4, 28, 22],
  ['peking_duck', 'Peking duck', 150, '1 serving', 420, 28, 8, 31],
  ['pho', 'Pho', 500, '1 bowl', 450, 30, 60, 9],
  ['pizza', 'Pizza', 200, '2 slices', 560, 24, 66, 22],
  ['pork_chop', 'Pork chop', 200, '1 chop', 410, 44, 0, 25],
  ['poutine', 'Poutine', 300, '1 regular', 700, 20, 66, 38],
  ['prime_rib', 'Prime rib', 225, '8 oz', 640, 50, 0, 48],
  ['pulled_pork_sandwich', 'Pulled pork sandwich', 230, '1 sandwich', 520, 30, 56, 18],
  ['ramen', 'Ramen', 550, '1 bowl', 560, 22, 74, 18],
  ['ravioli', 'Ravioli', 250, '1 plate', 460, 20, 55, 16],
  ['red_velvet_cake', 'Red velvet cake', 120, '1 slice', 420, 4, 55, 21],
  ['risotto', 'Risotto', 250, '1 plate', 420, 10, 66, 12],
  ['samosa', 'Samosa', 120, '2 samosas', 330, 6, 34, 19],
  ['sashimi', 'Sashimi', 120, '6 pieces', 160, 28, 0, 5],
  ['scallops', 'Scallops', 120, '5 scallops', 230, 30, 6, 9],
  ['seaweed_salad', 'Seaweed salad', 100, '1 small bowl', 100, 2, 14, 4],
  ['shrimp_and_grits', 'Shrimp and grits', 300, '1 bowl', 480, 28, 44, 20],
  ['spaghetti_bolognese', 'Spaghetti bolognese', 350, '1 plate', 600, 28, 74, 20],
  ['spaghetti_carbonara', 'Spaghetti carbonara', 300, '1 plate', 680, 25, 68, 33],
  ['spring_rolls', 'Spring rolls', 120, '2 rolls', 250, 6, 30, 11],
  ['steak', 'Steak', 225, '8 oz', 450, 54, 0, 25],
  ['strawberry_shortcake', 'Strawberry shortcake', 160, '1 serving', 380, 5, 50, 18],
  ['sushi', 'Sushi', 180, '6 pieces', 300, 14, 50, 4],
  ['tacos', 'Tacos', 200, '2 tacos', 420, 20, 36, 22],
  ['takoyaki', 'Takoyaki', 150, '6 balls', 320, 12, 38, 13],
  ['tiramisu', 'Tiramisu', 150, '1 slice', 400, 7, 40, 24],
  ['tuna_tartare', 'Tuna tartare', 120, '1 plate', 200, 24, 4, 9],
  ['waffles', 'Waffles', 150, '2 waffles', 430, 9, 55, 19],
];

export const FOODS: readonly Food[] = ROWS.map(([id, name, grams, serving, kcal, protein, carbs, fat]) => ({ id, name, grams, serving, kcal, protein, carbs, fat }));

/**
 * Whole foods and everyday basics. These are NOT classifier outputs from the dish model: the second
 * (ImageNet) model can recognise many of them, and the rest are here so you can log them by hand.
 */
const EXTRA_ROWS: Row[] = [
  ['apple', 'Apple', 180, '1 medium', 95, 0.5, 25, 0.3],
  ['artichoke', 'Artichoke', 120, '1 medium', 60, 4, 13, 0.2],
  ['avocado', 'Avocado', 100, '½ avocado', 160, 2, 9, 15],
  ['bagel', 'Bagel', 105, '1 bagel', 280, 11, 55, 1.7],
  ['baguette', 'Baguette', 60, '3 slices', 160, 6, 31, 1],
  ['banana', 'Banana', 118, '1 medium', 105, 1.3, 27, 0.4],
  ['bell_pepper', 'Bell pepper', 120, '1 medium', 31, 1, 7, 0.3],
  ['bread_slice', 'Bread', 30, '1 slice', 80, 3, 15, 1],
  ['broccoli', 'Broccoli', 90, '1 cup', 31, 2.6, 6, 0.3],
  ['cabbage', 'Cabbage', 70, '1 cup shredded', 18, 1, 4, 0.1],
  ['carrot', 'Carrot', 60, '1 medium', 25, 0.6, 6, 0.1],
  ['cauliflower', 'Cauliflower', 100, '1 cup', 25, 2, 5, 0.1],
  ['chicken_breast', 'Chicken breast', 120, '1 cooked breast', 200, 37, 0, 4.3],
  ['corn', 'Corn on the cob', 100, '1 ear', 90, 3.3, 19, 1.4],
  ['cucumber', 'Cucumber', 104, '1 cup sliced', 16, 0.7, 3.8, 0.1],
  ['egg', 'Egg', 50, '1 large', 72, 6.3, 0.4, 4.8],
  ['fig', 'Figs', 100, '2 medium', 74, 0.8, 19, 0.3],
  ['grapes', 'Grapes', 150, '1 cup', 104, 1.1, 27, 0.2],
  ['mashed_potato', 'Mashed potato', 210, '1 cup', 214, 4, 35, 7],
  ['milk', 'Milk', 244, '1 cup', 122, 8, 12, 4.8],
  ['mushroom', 'Mushrooms', 70, '1 cup sliced', 15, 2.2, 2.3, 0.2],
  ['oatmeal', 'Oatmeal', 240, '1 cup cooked', 160, 6, 27, 3],
  ['orange', 'Orange', 130, '1 medium', 62, 1.2, 15, 0.2],
  ['peanut_butter', 'Peanut butter', 32, '2 tablespoons', 190, 7, 7, 16],
  ['pineapple', 'Pineapple', 165, '1 cup chunks', 82, 0.9, 22, 0.2],
  ['pomegranate', 'Pomegranate', 87, '½ cup seeds', 72, 1.5, 16, 1],
  ['potato_baked', 'Baked potato', 170, '1 medium', 161, 4.3, 37, 0.2],
  ['pretzel', 'Soft pretzel', 115, '1 pretzel', 340, 9, 70, 3],
  ['rice', 'Rice', 160, '1 cup cooked', 205, 4.3, 45, 0.4],
  ['salad_greens', 'Green salad', 85, '2 cups', 20, 1.5, 3.5, 0.2],
  ['squash', 'Squash', 200, '1 cup cooked cubes', 82, 1.8, 22, 0.2],
  ['strawberries', 'Strawberries', 150, '1 cup', 49, 1, 12, 0.5],
  ['tomato', 'Tomato', 120, '1 medium', 22, 1.1, 4.8, 0.2],
  ['yogurt', 'Plain yogurt', 245, '1 cup', 154, 13, 17, 3.8],
  ['zucchini', 'Zucchini', 196, '1 medium', 33, 2.4, 6, 0.6],
];

export const EXTRA_FOODS: readonly Food[] = EXTRA_ROWS.map(([id, name, grams, serving, kcal, protein, carbs, fat]) => ({ id, name, grams, serving, kcal, protein, carbs, fat }));
export const ALL_FOODS: readonly Food[] = [...FOODS, ...EXTRA_FOODS, ...WORLD_FOODS];

export function foodByIndex(i: number): Food | undefined {
  return FOODS[i];
}
export function foodById(id: string, userFoods: readonly Food[] = []): Food | undefined {
  return userFoods.find((f) => f.id === id) ?? ALL_FOODS.find((f) => f.id === id);
}

/** A food the user added by labelling a photo. */
export type UserFood = Food;

/**
 * A labelled example: the CLIP "fingerprint" of a photo the user taught the app. Only this vector is kept
 * (quantised to one byte per number, base64), never the photo itself.
 */
export interface FoodExample {
  id: string;
  foodId: string;
  /** base64 of 512 signed bytes: the unit-length image vector times 127. */
  v: string;
}

export interface Nutrients {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

/** Scale a food's reference serving by a number of servings (0.25 to 4). */
export function scaleFood(f: Food, servings: number): Nutrients {
  const k = Math.max(0, servings);
  const r = (n: number) => Math.round(n * k * 10) / 10;
  return { kcal: Math.round(f.kcal * k), protein: r(f.protein), carbs: r(f.carbs), fat: r(f.fat) };
}

export const MEALS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
export type MealType = (typeof MEALS)[number];

export interface MealEntry {
  id: string;
  /** ISO timestamp the meal was logged. */
  at: string;
  meal: MealType;
  name: string;
  servings: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  /** Where the entry came from: photo recognition (checked by you), a manual pick, or typed in. */
  source: 'photo' | 'search' | 'custom';
  /** Model confidence (0-1) when from a photo. */
  confidence?: number;
}

export function sumMeals(entries: MealEntry[]): Nutrients {
  const t = entries.reduce((a, e) => ({ kcal: a.kcal + e.kcal, protein: a.protein + e.protein, carbs: a.carbs + e.carbs, fat: a.fat + e.fat }), { kcal: 0, protein: 0, carbs: 0, fat: 0 });
  return { kcal: Math.round(t.kcal), protein: Math.round(t.protein), carbs: Math.round(t.carbs), fat: Math.round(t.fat) };
}
