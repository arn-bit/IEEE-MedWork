import { FOODS, foodById } from './foods';

/**
 * On-device food recognition, entirely in this browser with ONNX Runtime Web. The photo is read into
 * memory, resized and discarded; nothing is uploaded and the picture is never stored.
 *
 * Two models give two opinions:
 *  - CLIP (OpenAI, MIT) matches the photo against the names of 300+ foods from many cuisines, nuts,
 *    fruit and vegetables. The name vectors are precomputed (scripts/build-food-labels.mjs), so only
 *    CLIP's image half ships.
 *  - An EfficientNet-B0 trained on Food-101 is very good at 101 common dishes.
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

/** Cosine similarity of an image vector against each row of a [n x dim] matrix of unit vectors, as softmax probabilities. */
export function clipProbabilities(image: ArrayLike<number>, text: Float32Array, dim: number = FOOD_MODEL.clipDim, scale: number = FOOD_MODEL.clipScale): number[] {
  let nrm = 0;
  for (let k = 0; k < dim; k++) nrm += image[k]! * image[k]!;
  nrm = Math.sqrt(nrm) || 1;
  const n = text.length / dim;
  const logits = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    let d = 0;
    for (let k = 0; k < dim; k++) d += (image[k]! / nrm) * text[i * dim + k]!;
    logits[i] = d * scale;
  }
  return softmax(logits);
}

/**
 * Combine CLIP (all foods) with the Food-101 dish model.
 * The dish model always names SOME dish, even for a banana, so its vote is scaled by how much of CLIP's
 * probability sits on those 101 dishes. A food outside the 101 is scored by CLIP alone.
 */
export function mergeGuesses(clipIds: readonly string[], clipProbs: ArrayLike<number> | null, dishProbs: ArrayLike<number> | null, k = 5): Guess[] {
  const dishIndex = new Map(FOODS.map((f, i) => [f.id, i]));
  const score = new Map<string, number>();

  let dishMass = 0;
  if (clipProbs) for (let i = 0; i < clipIds.length; i++) if (dishIndex.has(clipIds[i]!)) dishMass += clipProbs[i]!;

  if (clipProbs) {
    for (let i = 0; i < clipIds.length; i++) {
      const id = clipIds[i]!;
      const c = clipProbs[i]!;
      const di = dishIndex.get(id);
      const d = di !== undefined && dishProbs ? dishProbs[di]! : 0;
      // With both opinions available, dishes are an even blend; otherwise whichever one exists.
      const s = di !== undefined && dishProbs ? 0.5 * c + 0.5 * dishMass * d : c;
      score.set(id, s);
    }
  } else if (dishProbs) {
    for (let i = 0; i < FOODS.length; i++) score.set(FOODS[i]!.id, dishProbs[i]!);
  }

  return [...score.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, k)
    .map(([id, p]) => ({ index: dishIndex.get(id) ?? -1, id, name: foodById(id)?.name ?? id, p }));
}

async function loadBitmap(file: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return await createImageBitmap(file);
  }
}

/** Centre-crop and scale a picture to size x size RGBA pixels. `crop` is the fraction of the shorter side kept. */
function pixelsFrom(bmp: ImageBitmap, crop: number): Uint8ClampedArray {
  const s = FOOD_MODEL.size;
  const canvas = document.createElement('canvas');
  canvas.width = s;
  canvas.height = s;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas is not available in this browser.');
  ctx.imageSmoothingQuality = 'high';
  const side = Math.min(bmp.width, bmp.height) * crop;
  const sx = (bmp.width - side) / 2;
  const sy = (bmp.height - side) / 2;
  ctx.drawImage(bmp, sx, sy, side, side, 0, 0, s, s);
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

async function run(url: string, pixels: Uint8ClampedArray, norm: Norm): Promise<Float32Array> {
  const [ort, session] = await Promise.all([loadOrt(), loadSession(url)]);
  const input = new ort.Tensor('float32', toTensorData(pixels, FOOD_MODEL.size, norm), [1, 3, FOOD_MODEL.size, FOOD_MODEL.size]);
  const out = await session.run({ [session.inputNames[0]!]: input });
  return out[session.outputNames[0]!]!.data as Float32Array;
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

export async function recognizeFood(file: Blob): Promise<Guess[]> {
  const bmp = await loadBitmap(file);
  try {
    const dishPx = pixelsFrom(bmp, FOOD_MODEL.dish.crop);
    const clipPx = pixelsFrom(bmp, FOOD_MODEL.clip.crop);

    // Each model is an extra opinion: if one fails to load, the other still works.
    let dish: number[] | null;
    try {
      dish = softmax(await run(FOOD_MODEL.dishUrl, dishPx, FOOD_MODEL.dish));
    } catch {
      dish = null;
    }
    let clip: number[] | null;
    let ids: string[] = [];
    try {
      const labels = await loadClipLabels();
      ids = labels.ids;
      clip = clipProbabilities(await run(FOOD_MODEL.clipUrl, clipPx, FOOD_MODEL.clip), labels.text);
    } catch {
      clip = null;
    }
    if (!dish && !clip) throw new Error('The food recognition models could not be loaded.');
    return mergeGuesses(ids, clip, dish, 5);
  } finally {
    bmp.close();
  }
}
