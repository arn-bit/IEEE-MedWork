import { FOODS, foodById } from './foods';

/**
 * On-device food recognition. A small image classifier (EfficientNet-B0 trained on Food-101) runs in
 * this browser with ONNX Runtime Web. The photo is read into memory, resized to 224x224 and
 * discarded; nothing is uploaded and the picture is never stored.
 */

export const FOOD_MODEL = {
  url: '/models/food/efficientnet_b0_food101.onnx',
  /** A general ImageNet classifier, used for whole foods (banana, apple, broccoli...) that Food-101 doesn't cover. */
  wholeUrl: '/models/food/mobilenet_v2_imagenet.onnx',
  size: 224,
  mean: [0.485, 0.456, 0.406],
  std: [0.229, 0.224, 0.225],
} as const;

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

/**
 * ImageNet class index -> food id. Only foods are listed. Entries marked with an array also suggest
 * a second, commonly confused food (ImageNet has no plain red apple, so it often says pomegranate).
 */
export const IMAGENET_FOODS: Record<number, string | [string, string]> = {
  924: 'guacamole',
  928: 'ice_cream',
  930: 'baguette',
  931: 'bagel',
  932: 'pretzel',
  933: 'hamburger', // "cheeseburger"
  935: 'mashed_potato',
  936: 'cabbage',
  937: 'broccoli',
  938: 'cauliflower',
  939: 'zucchini',
  940: 'squash',
  941: 'squash',
  942: 'squash',
  943: 'cucumber',
  944: 'artichoke',
  945: 'bell_pepper',
  947: 'mushroom',
  948: 'apple', // "Granny Smith"
  949: 'strawberries',
  950: 'orange',
  952: 'fig',
  953: 'pineapple',
  954: 'banana',
  957: ['pomegranate', 'apple'],
  959: 'spaghetti_carbonara',
  963: 'pizza',
  987: 'corn',
};

/** Food ids that are plain whole foods (not Food-101 dishes). */
const WHOLE_IDS = new Set(['guacamole', 'ice_cream', 'hamburger', 'spaghetti_carbonara', 'pizza']);

/**
 * Combine the dish model (Food-101) with the whole-food model (ImageNet).
 * A dish model always names SOME dish, even for a banana, so when the whole-food model is sure it's
 * a whole food, the dish model's guess is scaled down by how sure that is.
 */
export function mergeGuesses(dishProbs: ArrayLike<number>, imageNetProbs: ArrayLike<number> | null, k = 5): Guess[] {
  const score = new Map<string, number>();
  let wholeMass = 0;
  if (imageNetProbs) {
    for (const [idx, target] of Object.entries(IMAGENET_FOODS)) {
      const q = imageNetProbs[Number(idx)] ?? 0;
      const [main, alt] = Array.isArray(target) ? target : [target, null];
      if (!WHOLE_IDS.has(main)) wholeMass += q;
      score.set(main, Math.max(score.get(main) ?? 0, q));
      if (alt) score.set(alt, Math.max(score.get(alt) ?? 0, q * 0.6));
    }
  }
  const damp = 1 - Math.min(1, wholeMass);
  for (let i = 0; i < dishProbs.length; i++) {
    const id = FOODS[i]?.id;
    if (!id) continue;
    const p = dishProbs[i]! * (wholeMass > 0.5 ? damp : 1);
    score.set(id, Math.max(score.get(id) ?? 0, p));
  }
  return [...score.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, k)
    .map(([id, p]) => ({ index: FOODS.findIndex((f) => f.id === id), id, name: foodById(id)?.name ?? id, p }));
}

export function topGuesses(probs: ArrayLike<number>, k = 5): Guess[] {
  return Array.from({ length: probs.length }, (_, i) => i)
    .sort((a, b) => probs[b]! - probs[a]!)
    .slice(0, k)
    .map((i) => ({ index: i, id: FOODS[i]?.id ?? `class_${i}`, name: FOODS[i]?.name ?? `Class ${i}`, p: probs[i]! }));
}

/** Resize the shorter side to 256 and centre-crop 224 (the standard evaluation transform), then normalise to NCHW floats. */
export function toTensorData(rgba: Uint8ClampedArray, size: number = FOOD_MODEL.size): Float32Array {
  const out = new Float32Array(3 * size * size);
  const plane = size * size;
  for (let i = 0; i < plane; i++) {
    for (let c = 0; c < 3; c++) {
      out[c * plane + i] = (rgba[i * 4 + c]! / 255 - FOOD_MODEL.mean[c]!) / FOOD_MODEL.std[c]!;
    }
  }
  return out;
}

async function loadBitmap(file: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return await createImageBitmap(file);
  }
}

async function pixelsFrom(file: Blob): Promise<Uint8ClampedArray> {
  const bmp = await loadBitmap(file);
  const s = FOOD_MODEL.size;
  const canvas = document.createElement('canvas');
  canvas.width = s;
  canvas.height = s;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas is not available in this browser.');
  const side = Math.min(bmp.width, bmp.height) * (s / 256); // centre crop of the 256-resized image
  const sx = (bmp.width - side) / 2;
  const sy = (bmp.height - side) / 2;
  ctx.drawImage(bmp, sx, sy, side, side, 0, 0, s, s);
  bmp.close();
  return ctx.getImageData(0, 0, s, s).data;
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

async function logitsFor(url: string, pixels: Uint8ClampedArray): Promise<Float32Array> {
  const [ort, session] = await Promise.all([loadOrt(), loadSession(url)]);
  const input = new ort.Tensor('float32', toTensorData(pixels), [1, 3, FOOD_MODEL.size, FOOD_MODEL.size]);
  const out = await session.run({ [session.inputNames[0]!]: input });
  return out[session.outputNames[0]!]!.data as Float32Array;
}

export async function recognizeFood(file: Blob): Promise<Guess[]> {
  const pixels = await pixelsFrom(file);
  const dish = softmax(await logitsFor(FOOD_MODEL.url, pixels));
  // The whole-food model is an extra: if it fails to load, dishes still work.
  let whole: number[] | null;
  try {
    whole = softmax(await logitsFor(FOOD_MODEL.wholeUrl, pixels));
  } catch {
    whole = null;
  }
  return mergeGuesses(dish, whole, 5);
}
