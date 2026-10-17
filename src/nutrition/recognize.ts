import { FOODS } from './foods';

/**
 * On-device food recognition. A small image classifier (EfficientNet-B0 trained on Food-101) runs in
 * this browser with ONNX Runtime Web. The photo is read into memory, resized to 224x224 and
 * discarded; nothing is uploaded and the picture is never stored.
 */

export const FOOD_MODEL = {
  url: '/models/food/efficientnet_b0_food101.onnx',
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

type Ort = typeof import('onnxruntime-web/wasm');
let sessionPromise: Promise<{ ort: Ort; session: import('onnxruntime-web/wasm').InferenceSession }> | null = null;

/** Loads the runtime and model once, on first use (so the app itself stays small). */
export function loadFoodModel(): Promise<{ ort: Ort; session: import('onnxruntime-web/wasm').InferenceSession }> {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      const ort = await import('onnxruntime-web/wasm');
      ort.env.wasm.wasmPaths = { mjs: '/ort/ort-wasm-simd-threaded.mjs', wasm: '/ort/ort-wasm-simd-threaded.wasm' };
      ort.env.wasm.numThreads = 1; // no worker threads: keeps it simple and within the CSP
      const res = await fetch(FOOD_MODEL.url);
      if (!res.ok) throw new Error('The food recognition model file is missing from this app build.');
      const buf = new Uint8Array(await res.arrayBuffer());
      const session = await ort.InferenceSession.create(buf, { executionProviders: ['wasm'] });
      return { ort, session };
    })().catch((e) => {
      sessionPromise = null;
      throw e;
    });
  }
  return sessionPromise;
}

export async function recognizeFood(file: Blob): Promise<Guess[]> {
  const [{ ort, session }, pixels] = await Promise.all([loadFoodModel(), pixelsFrom(file)]);
  const input = new ort.Tensor('float32', toTensorData(pixels), [1, 3, FOOD_MODEL.size, FOOD_MODEL.size]);
  const out = await session.run({ [session.inputNames[0]!]: input });
  const logits = out[session.outputNames[0]!]!.data as Float32Array;
  return topGuesses(softmax(logits), 5);
}
