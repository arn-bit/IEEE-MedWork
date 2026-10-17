import type { PoseLandmarker } from '@mediapipe/tasks-vision';

/**
 * Loads MediaPipe Pose Landmarker (Lite) entirely from this app's own origin:
 *   /models/pose_landmarker_lite.task   (downloaded by `npm run setup:models`)
 *   /mediapipe/wasm/*                   (copied from the @mediapipe/tasks-vision package)
 * No CDN is used. If a file is missing we fail with an actionable error and never substitute
 * a different model. GPU is tried first; on failure the SAME model runs on the CPU delegate.
 */

export const MODEL_URL = '/models/pose_landmarker_lite.task';
export const WASM_BASE = '/mediapipe/wasm';
export const MODEL_INFO = {
  name: 'MediaPipe Pose Landmarker (Lite, float16)',
  source: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task',
  license: 'Apache-2.0',
  runtime: '@mediapipe/tasks-vision 1.0.1',
};

export type ModelErrorCode = 'model_missing' | 'model_invalid' | 'wasm_missing' | 'init_failed' | 'unsupported';

export class PoseModelError extends Error {
  constructor(
    readonly code: ModelErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'PoseModelError';
  }
}

export const MODEL_ERROR_HELP: Record<ModelErrorCode, string> = {
  model_missing: 'The pose model file is missing. In the project folder run `npm run setup:models`, then reload. Manual tracking still works.',
  model_invalid: 'The pose model file is damaged or not a valid .task bundle. Run `npm run setup:models` to download it again, then reload.',
  wasm_missing: 'The MediaPipe runtime files are missing. Run `npm run setup:models` (it copies them from node_modules), then reload.',
  init_failed: 'The pose model could not start on this device or browser. Try an up-to-date Chrome, Edge, Safari or Firefox, or use manual tracking.',
  unsupported: 'This browser does not support WebAssembly, which on-device tracking needs. Use manual tracking instead.',
};

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

/** Fetches and validates the model bytes. Exported for tests. */
export async function fetchModelBytes(fetcher: Fetcher = fetch, url = MODEL_URL): Promise<Uint8Array> {
  let res: Response;
  try {
    res = await fetcher(url);
  } catch {
    throw new PoseModelError('model_missing', MODEL_ERROR_HELP.model_missing);
  }
  const type = res.headers.get('content-type') ?? '';
  // Dev servers return index.html (200, text/html) for missing static files.
  if (!res.ok || type.includes('text/html')) throw new PoseModelError('model_missing', MODEL_ERROR_HELP.model_missing);
  const buf = new Uint8Array(await res.arrayBuffer());
  const head = buf.subarray(0, 16);
  let zip = false;
  for (let i = 0; i + 3 < head.length; i++) if (head[i] === 0x50 && head[i + 1] === 0x4b && head[i + 2] === 0x03 && head[i + 3] === 0x04) zip = true;
  if (buf.length < 1_000_000 || !zip) throw new PoseModelError('model_invalid', MODEL_ERROR_HELP.model_invalid);
  return buf;
}

export async function checkWasm(fetcher: Fetcher = fetch, base = WASM_BASE): Promise<void> {
  try {
    const res = await fetcher(`${base}/vision_wasm_internal.js`, { method: 'HEAD' });
    const type = res.headers.get('content-type') ?? '';
    if (!res.ok || type.includes('text/html')) throw new Error('missing');
  } catch {
    throw new PoseModelError('wasm_missing', MODEL_ERROR_HELP.wasm_missing);
  }
}

export interface LoadedModel {
  landmarker: PoseLandmarker;
  delegate: 'GPU' | 'CPU';
}

let cached: Promise<LoadedModel> | null = null;

export function loadPoseModel(): Promise<LoadedModel> {
  if (!cached) {
    cached = doLoad().catch((e) => {
      cached = null; // allow retry
      throw e;
    });
  }
  return cached;
}

async function doLoad(): Promise<LoadedModel> {
  if (typeof WebAssembly === 'undefined') throw new PoseModelError('unsupported', MODEL_ERROR_HELP.unsupported);
  const [bytes] = await Promise.all([fetchModelBytes(), checkWasm()]);
  const { FilesetResolver, PoseLandmarker } = await import('@mediapipe/tasks-vision');
  let fileset;
  try {
    fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
  } catch {
    throw new PoseModelError('wasm_missing', MODEL_ERROR_HELP.wasm_missing);
  }
  const make = (delegate: 'GPU' | 'CPU') =>
    PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetBuffer: bytes, delegate },
      runningMode: 'VIDEO',
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
      outputSegmentationMasks: false,
    });
  try {
    return { landmarker: await make('GPU'), delegate: 'GPU' };
  } catch {
    try {
      return { landmarker: await make('CPU'), delegate: 'CPU' };
    } catch {
      throw new PoseModelError('init_failed', MODEL_ERROR_HELP.init_failed);
    }
  }
}
