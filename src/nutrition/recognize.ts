import { FOODS, foodById, type Food, type FoodExample } from './foods';

/**
 * On-device food recognition, entirely in this browser with ONNX Runtime Web. The photo is read into
 * memory, resized and discarded; nothing is uploaded and the picture is never stored.
 *
 * Two models give two opinions:
 *  - CLIP (OpenAI, MIT) matches the photo against the names of 300+ foods from many cuisines, nuts,
 *    fruit and vegetables. The name vectors are precomputed (scripts/build-food-labels.mjs), so only
 *    CLIP's image half ships.
 *  - An EfficientNet-B0 trained on Food-101 is very good at 101 common dishes.
 *
 * A plate with several foods is looked at in pieces: CLIP also reads a grid of tiles, and the foods
 * that win several tiles become the items on the plate, each with an amount estimated from how much of
 * the plate it covers. Photos you have labelled before are matched by their CLIP fingerprint.
 */

export const FOOD_MODEL = {
  dishUrl: '/models/food/efficientnet_b0_food101.onnx',
  clipUrl: '/models/food/clip_vit_b32_vision_q4.onnx',
  clipLabelsUrl: '/models/food/clip_labels.json',
  clipTextUrl: '/models/food/clip_text.bin',
  size: 224,
  dish: { mean: [0.485, 0.456, 0.406], std: [0.229, 0.224, 0.225], crop: 224 / 256 },
  clip: { mean: [0.48145466, 0.4578275, 0.40821073], std: [0.26862954, 0.26130258, 0.27577711], crop: 1 },
  clipDim: 512,
  /** CLIP's learned temperature: similarity x 100 before softmax. */
  clipScale: 100,
} as const;

type Norm = { mean: readonly number[]; std: readonly number[]; crop: number };

export interface Guess {
  index: number;
  id: string;
  name: string;
  /** Probability 0 to 1 */
  p: number;
}

export function softmax(logits: ArrayLike<number>): number[] {
  let max = -Infinity;
  for (let i = 0; i < logits.length; i++) max = Math.max(max, logits[i]!);
  const ex = Array.from({ length: logits.length }, (_, i) => Math.exp(logits[i]! - max));
  const sum = ex.reduce((a, b) => a + b, 0);
  return ex.map((x) => x / sum);
}

export function topGuesses(probs: ArrayLike<number>, k = 5): Guess[] {
  return Array.from({ length: probs.length }, (_, i) => i)
    .sort((a, b) => probs[b]! - probs[a]!)
    .slice(0, k)
    .map((i) => ({ index: i, id: FOODS[i]?.id ?? `class_${i}`, name: FOODS[i]?.name ?? `Class ${i}`, p: probs[i]! }));
}

/** RGBA pixels -> normalised NCHW floats. */
export function toTensorData(rgba: Uint8ClampedArray, size: number = FOOD_MODEL.size, norm: Pick<Norm, 'mean' | 'std'> = FOOD_MODEL.dish): Float32Array {
  const out = new Float32Array(3 * size * size);
  const plane = size * size;
  for (let i = 0; i < plane; i++) {
    for (let c = 0; c < 3; c++) {
      out[c * plane + i] = (rgba[i * 4 + c]! / 255 - norm.mean[c]!) / norm.std[c]!;
    }
  }
  return out;
}

export function normalize(v: ArrayLike<number>): Float32Array {
  let n = 0;
  for (let k = 0; k < v.length; k++) n += v[k]! * v[k]!;
  n = Math.sqrt(n) || 1;
  const out = new Float32Array(v.length);
  for (let k = 0; k < v.length; k++) out[k] = v[k]! / n;
  return out;
}

/** Cosine similarity of an image vector against each row of a [n x dim] matrix of unit vectors, as softmax probabilities. */
export function clipProbabilities(image: ArrayLike<number>, text: Float32Array, dim: number = FOOD_MODEL.clipDim, scale: number = FOOD_MODEL.clipScale): number[] {
  const img = normalize(image);
  const n = text.length / dim;
  const logits = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    let d = 0;
    for (let k = 0; k < dim; k++) d += img[k]! * text[i * dim + k]!;
    logits[i] = d * scale;
  }
  return softmax(logits);
}

// ───────────────────────────── labelled examples (on-device learning) ─────────────────────────────

export function encodeVector(v: ArrayLike<number>): string {
  const u = normalize(v);
  const bytes = new Int8Array(u.length);
  for (let k = 0; k < u.length; k++) bytes[k] = Math.max(-127, Math.min(127, Math.round(u[k]! * 127)));
  let bin = '';
  const view = new Uint8Array(bytes.buffer);
  for (let k = 0; k < view.length; k++) bin += String.fromCharCode(view[k]!);
  return btoa(bin);
}

export function decodeVector(b64: string): Float32Array {
  const bin = atob(b64);
  const out = new Float32Array(bin.length);
  for (let k = 0; k < bin.length; k++) out[k] = ((bin.charCodeAt(k) << 24) >> 24) / 127;
  return normalize(out);
}

export interface DecodedExample {
  foodId: string;
  v: Float32Array;
}

export function decodeExamples(examples: readonly FoodExample[]): DecodedExample[] {
  const out: DecodedExample[] = [];
  for (const e of examples) {
    try {
      const v = decodeVector(e.v);
      if (v.length === FOOD_MODEL.clipDim) out.push({ foodId: e.foodId, v });
    } catch {
      /* a damaged example is skipped */
    }
  }
  return out;
}

/** Below this similarity a labelled example says nothing; at/above 0.95 it is near-certain. */
export const EXAMPLE_FLOOR = 0.8;
export const EXAMPLE_SPAN = 0.15;

/** For each food you have labelled, how strongly does this region match one of your examples (0 to 0.95)? */
export function exampleScores(emb: Float32Array, examples: readonly DecodedExample[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const ex of examples) {
    let sim = 0;
    for (let k = 0; k < emb.length; k++) sim += emb[k]! * ex.v[k]!;
    const s = Math.max(0, Math.min(1, (sim - EXAMPLE_FLOOR) / EXAMPLE_SPAN)) * 0.95;
    if (s > (out.get(ex.foodId) ?? 0)) out.set(ex.foodId, s);
  }
  return out;
}

// ───────────────────────────── scoring ─────────────────────────────

const isBackground = (id: string) => id.startsWith('bg_');

/**
 * Combine CLIP (all foods) with the Food-101 dish model, and with the user's own examples.
 * The dish model always names SOME dish, even for a banana, so its vote is scaled by how much of CLIP's
 * probability sits on those 101 dishes. A food outside the 101 is scored by CLIP alone.
 * Returns a score per food id (background labels are dropped).
 */
export function scoreRegion(clipIds: readonly string[], clipProbs: ArrayLike<number> | null, dishProbs: ArrayLike<number> | null, taught?: ReadonlyMap<string, number>): Map<string, number> {
  const dishIndex = new Map(FOODS.map((f, i) => [f.id, i]));
  const score = new Map<string, number>();

  let dishMass = 0;
  if (clipProbs) for (let i = 0; i < clipIds.length; i++) if (dishIndex.has(clipIds[i]!)) dishMass += clipProbs[i]!;

  if (clipProbs) {
    for (let i = 0; i < clipIds.length; i++) {
      const id = clipIds[i]!;
      if (isBackground(id)) continue;
      const c = clipProbs[i]!;
      const di = dishIndex.get(id);
      const d = di !== undefined && dishProbs ? dishProbs[di]! : 0;
      // With both opinions available, dishes are an even blend; otherwise whichever one exists.
      score.set(id, di !== undefined && dishProbs ? 0.5 * c + 0.5 * dishMass * d : c);
    }
  } else if (dishProbs) {
    for (let i = 0; i < FOODS.length; i++) score.set(FOODS[i]!.id, dishProbs[i]!);
  }
  if (taught) for (const [id, s] of taught) score.set(id, Math.max(score.get(id) ?? 0, s));
  return score;
}

const ranked = (m: ReadonlyMap<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]);

export function toGuesses(m: ReadonlyMap<string, number>, k: number, userFoods: readonly Food[] = []): Guess[] {
  const dishIndex = new Map(FOODS.map((f, i) => [f.id, i]));
  return ranked(m)
    .slice(0, k)
    .map(([id, p]) => ({ index: dishIndex.get(id) ?? -1, id, name: foodById(id, userFoods)?.name ?? id, p }));
}

/** Kept for the single-photo case: the best guesses from CLIP and the dish model. */
export function mergeGuesses(clipIds: readonly string[], clipProbs: ArrayLike<number> | null, dishProbs: ArrayLike<number> | null, k = 5): Guess[] {
  return toGuesses(scoreRegion(clipIds, clipProbs, dishProbs), k);
}

// ───────────────────────────── plates with several foods ─────────────────────────────

export interface Region {
  /** Probabilities over the CLIP labels (foods and background). */
  probs: ArrayLike<number>;
  /** Unit-length CLIP image vector for this region. */
  emb: Float32Array;
}

export interface PlateItem {
  key: string;
  foodId: string;
  name: string;
  /** How sure the model is about this item, 0 to 1. */
  p: number;
  /** Fraction of the plate's food this item covers, 0 to 1. */
  share: number;
  /** Estimated amount in reference servings, from how much of the plate it covers. */
  servings: number;
  /** Other likely foods for this part of the plate. */
  alternatives: Guess[];
  /** Fingerprint of this part of the photo, used if you teach the app what it is. */
  embedding: Float32Array;
}

/** A confident single dish isn't split into ingredients. */
export const SINGLE_DISH_P = 0.55;
export const MAX_ITEMS = 4;

/** The amount for an item: a lone food is one serving; foods sharing a plate each get less. */
export function servingsFor(share: number): number {
  const s = 0.25 + 0.75 * Math.max(0, Math.min(1, share));
  return Math.round(Math.max(0.3, Math.min(1.2, s)) * 20) / 20;
}

function meanVector(vs: readonly Float32Array[]): Float32Array {
  const out = new Float32Array(FOOD_MODEL.clipDim);
  for (const v of vs) for (let k = 0; k < out.length; k++) out[k]! += v[k]! / vs.length;
  return normalize(out);
}

/**
 * Turn what the models saw into the items on the plate. `global` is the whole photo (dish model included);
 * `tiles` are CLIP reads of pieces of it. Pure, so it can be tested without a camera or a model.
 */
export function planPlate(args: {
  ids: readonly string[];
  global: { probs: ArrayLike<number>; emb: Float32Array; dish: ArrayLike<number> | null };
  tiles: readonly Region[];
  examples?: readonly DecodedExample[];
  userFoods?: readonly Food[];
}): PlateItem[] {
  const { ids, global, tiles, examples = [], userFoods = [] } = args;
  const gScores = scoreRegion(ids, global.probs, global.dish, exampleScores(global.emb, examples));
  const gRank = ranked(gScores);
  const top = gRank[0];
  if (!top) return [];

  const alts = (m: ReadonlyMap<string, number>, skip: string) => toGuesses(new Map([...m].filter(([id]) => id !== skip)), 4, userFoods);
  const item = (id: string, p: number, share: number, emb: Float32Array, m: ReadonlyMap<string, number>): PlateItem => ({
    key: `${id}-${Math.round(share * 100)}`,
    foodId: id,
    name: foodById(id, userFoods)?.name ?? id,
    p,
    share,
    servings: servingsFor(share),
    alternatives: alts(m, id),
    embedding: emb,
  });

  // A confident single dish (or something you have taught the app) stays whole.
  if (top[1] >= SINGLE_DISH_P || tiles.length < 2) return [item(top[0], top[1], 1, global.emb, gScores)];

  // Otherwise read each tile and let the foods that win several tiles become items.
  type Tally = { n: number; psum: number; embs: Float32Array[]; scores: Map<string, number> };
  const tally = new Map<string, Tally>();
  for (const t of tiles) {
    const sc = scoreRegion(ids, t.probs, null, exampleScores(t.emb, examples));
    // A tile that is mostly plate, table or cutlery is not food.
    let bg = 0;
    for (let i = 0; i < ids.length; i++) if (isBackground(ids[i]!)) bg += t.probs[i]!;
    const best = ranked(sc)[0];
    if (!best || bg > 0.5 || best[1] < 0.08) continue;
    const e: Tally = tally.get(best[0]) ?? { n: 0, psum: 0, embs: [], scores: new Map() };
    e.n++;
    e.psum += best[1];
    e.embs.push(t.emb);
    for (const [id, s] of sc) e.scores.set(id, (e.scores.get(id) ?? 0) + s / 1);
    tally.set(best[0], e);
  }

  // The whole-photo winner counts as one vote so a dominant food is never lost.
  if (top[1] >= 0.2) {
    const e: Tally = tally.get(top[0]) ?? { n: 0, psum: 0, embs: [], scores: new Map() };
    e.n += 1;
    e.psum += top[1];
    e.embs.push(global.emb);
    tally.set(top[0], e);
  }

  const chosen = [...tally.entries()]
    .filter(([, e]) => e.n >= 2 || e.psum / e.n >= 0.25)
    .sort((a, b) => b[1].n - a[1].n || b[1].psum - a[1].psum)
    .slice(0, MAX_ITEMS);
  if (chosen.length === 0) return [item(top[0], top[1], 1, global.emb, gScores)];

  const total = chosen.reduce((a, [, e]) => a + e.n, 0) || 1;
  return chosen.map(([id, e]) => {
    const avg = new Map([...e.scores].map(([k, v]) => [k, v / Math.max(1, e.n)] as [string, number]));
    const p = id === top[0] ? Math.max(top[1], e.psum / e.n) : e.psum / e.n;
    return item(id, Math.min(1, p), e.n / total, meanVector(e.embs), avg.size ? avg : gScores);
  });
}

// ───────────────────────────── running the models in the browser ─────────────────────────────

async function loadBitmap(file: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return await createImageBitmap(file);
  }
}

interface Rect {
  x: number;
  y: number;
  side: number;
}

/** Scale a square piece of the picture to size x size RGBA pixels. */
function pixelsFrom(bmp: ImageBitmap, r: Rect): Uint8ClampedArray {
  const s = FOOD_MODEL.size;
  const canvas = document.createElement('canvas');
  canvas.width = s;
  canvas.height = s;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas is not available in this browser.');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, r.x, r.y, r.side, r.side, 0, 0, s, s);
  return ctx.getImageData(0, 0, s, s).data;
}

function centreRect(bmp: ImageBitmap, crop: number): Rect {
  const side = Math.min(bmp.width, bmp.height) * crop;
  return { x: (bmp.width - side) / 2, y: (bmp.height - side) / 2, side };
}

/** A grid of square tiles covering the picture (at most 12). */
export function tileRects(width: number, height: number, maxTiles = 12): Rect[] {
  const m = Math.min(width, height);
  let side = Math.max(1, Math.round(m / 2.2));
  let nx = Math.ceil(width / side - 0.01);
  let ny = Math.ceil(height / side - 0.01);
  while (nx * ny > maxTiles) {
    side = Math.round(side * 1.15);
    nx = Math.ceil(width / side - 0.01);
    ny = Math.ceil(height / side - 0.01);
  }
  side = Math.min(side, m);
  const x0 = (width - nx * side) / 2;
  const y0 = (height - ny * side) / 2;
  const rects: Rect[] = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) rects.push({ x: Math.max(0, Math.min(width - side, x0 + i * side)), y: Math.max(0, Math.min(height - side, y0 + j * side)), side });
  return rects;
}

type OrtModule = typeof import('onnxruntime-web/wasm');
type Session = import('onnxruntime-web/wasm').InferenceSession;
let ortPromise: Promise<OrtModule> | null = null;
const sessions = new Map<string, Promise<Session>>();

async function loadOrt(): Promise<OrtModule> {
  if (!ortPromise) {
    ortPromise = import('onnxruntime-web/wasm').then((ort) => {
      ort.env.wasm.wasmPaths = { mjs: '/ort/ort-wasm-simd-threaded.mjs', wasm: '/ort/ort-wasm-simd-threaded.wasm' };
      ort.env.wasm.numThreads = 1; // no worker threads: keeps it simple and within the CSP
      return ort;
    });
  }
  return ortPromise;
}

/** Loads the runtime and a model once, on first use (so the app itself stays small). */
function loadSession(url: string): Promise<Session> {
  let p = sessions.get(url);
  if (!p) {
    p = (async () => {
      const ort = await loadOrt();
      const res = await fetch(url);
      if (!res.ok) throw new Error('A food recognition model file is missing from this app build.');
      return ort.InferenceSession.create(new Uint8Array(await res.arrayBuffer()), { executionProviders: ['wasm'] });
    })().catch((e) => {
      sessions.delete(url);
      throw e;
    });
    sessions.set(url, p);
  }
  return p;
}

async function run(url: string, pixels: Uint8ClampedArray, norm: Norm): Promise<Float32Array> {
  const [ort, session] = await Promise.all([loadOrt(), loadSession(url)]);
  const input = new ort.Tensor('float32', toTensorData(pixels, FOOD_MODEL.size, norm), [1, 3, FOOD_MODEL.size, FOOD_MODEL.size]);
  const out = await session.run({ [session.inputNames[0]!]: input });
  return Float32Array.from(out[session.outputNames[0]!]!.data as Float32Array);
}

interface ClipLabels {
  ids: string[];
  text: Float32Array;
}
let clipLabels: Promise<ClipLabels> | null = null;
function loadClipLabels(): Promise<ClipLabels> {
  if (!clipLabels) {
    clipLabels = (async () => {
      const [idsRes, textRes] = await Promise.all([fetch(FOOD_MODEL.clipLabelsUrl), fetch(FOOD_MODEL.clipTextUrl)]);
      if (!idsRes.ok || !textRes.ok) throw new Error('The food label data is missing from this app build.');
      const ids = (await idsRes.json()) as string[];
      const text = new Float32Array(await textRes.arrayBuffer());
      if (text.length !== ids.length * FOOD_MODEL.clipDim) throw new Error('The food label data does not match.');
      return { ids, text };
    })().catch((e) => {
      clipLabels = null;
      throw e;
    });
  }
  return clipLabels;
}

export interface AnalyzeOptions {
  examples?: readonly FoodExample[];
  userFoods?: readonly Food[];
  onProgress?: (done: number, total: number) => void;
}

/** Look at a photo of a meal and return the foods on the plate. */
export async function analyzePhoto(file: Blob, opts: AnalyzeOptions = {}): Promise<PlateItem[]> {
  const bmp = await loadBitmap(file);
  try {
    const examples = decodeExamples(opts.examples ?? []);
    const labels = await loadClipLabels();
    const tilesR = tileRects(bmp.width, bmp.height);
    const total = tilesR.length + 2;
    let done = 0;
    const tick = () => opts.onProgress?.(++done, total);

    // Dish model on the centre of the photo (optional: if it fails, CLIP still works).
    let dish: number[] | null;
    try {
      dish = softmax(await run(FOOD_MODEL.dishUrl, pixelsFrom(bmp, centreRect(bmp, FOOD_MODEL.dish.crop)), FOOD_MODEL.dish));
    } catch {
      dish = null;
    }
    tick();

    const clipRegion = async (r: Rect): Promise<Region> => {
      const emb = normalize(await run(FOOD_MODEL.clipUrl, pixelsFrom(bmp, r), FOOD_MODEL.clip));
      return { emb, probs: clipProbabilities(emb, labels.text) };
    };

    const g = await clipRegion(centreRect(bmp, 1));
    tick();
    // A confident single dish needs no tiles.
    const single = scoreRegion(labels.ids, g.probs, dish, exampleScores(g.emb, examples));
    const best = ranked(single)[0];
    let tiles: Region[] = [];
    if (!best || best[1] < SINGLE_DISH_P) {
      for (const r of tilesR) {
        tiles.push(await clipRegion(r));
        tick();
      }
    } else tiles = [];
    return planPlate({ ids: labels.ids, global: { probs: g.probs, emb: g.emb, dish }, tiles, examples, userFoods: opts.userFoods });
  } finally {
    bmp.close();
  }
}

/** Just the CLIP fingerprint of a photo, e.g. to teach the app a food you add by hand. */
export async function fingerprint(file: Blob): Promise<Float32Array> {
  const bmp = await loadBitmap(file);
  try {
    return normalize(await run(FOOD_MODEL.clipUrl, pixelsFrom(bmp, centreRect(bmp, 1)), FOOD_MODEL.clip));
  } finally {
    bmp.close();
  }
}
