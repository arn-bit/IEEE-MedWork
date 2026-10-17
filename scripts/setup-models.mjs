#!/usr/bin/env node
/**
 * Downloads and verifies the on-device pose model and MediaPipe WASM runtime.
 *
 *   npm run setup:models    download (if missing) + copy WASM + write manifest
 *   npm run verify:models   verify files against the manifest, exit 1 on mismatch
 *
 * Sources (official only):
 *  - Model: Google MediaPipe model bucket, URL published on
 *    https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker
 *  - WASM: the @mediapipe/tasks-vision npm package already installed in node_modules
 *
 * Integrity: the download is checked against the MD5 that Google Cloud Storage
 * reports in the `x-goog-hash` response header and against Content-Length, then
 * a SHA-256 is recorded in public/models/MODEL_MANIFEST.json for later checks.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const modelsDir = join(root, 'public', 'models');
const wasmOutDir = join(root, 'public', 'mediapipe', 'wasm');
const manifestPath = join(modelsDir, 'MODEL_MANIFEST.json');
const pkgDir = join(root, 'node_modules', '@mediapipe', 'tasks-vision');

const MODEL = {
  file: 'pose_landmarker_lite.task',
  url: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task',
  name: 'MediaPipe Pose Landmarker (Lite, float16)',
  license: 'Apache-2.0 (per the BlazePose GHUM 3D model card)',
  modelCard: 'https://storage.googleapis.com/mediapipe-assets/Model%20Card%20BlazePose%20GHUM%203D.pdf',
  docs: 'https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker',
};

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const md5b64 = (buf) => createHash('md5').update(buf).digest('base64');

function fail(msg) {
  console.error(`\n[models] ERROR: ${msg}\n`);
  process.exit(1);
}

function verify() {
  if (!existsSync(manifestPath)) fail('MODEL_MANIFEST.json not found. Run `npm run setup:models` first.');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  let ok = true;
  for (const entry of manifest.files) {
    const p = join(root, entry.path);
    if (!existsSync(p)) { console.error(`[models] missing: ${entry.path}`); ok = false; continue; }
    const buf = readFileSync(p);
    if (buf.length !== entry.bytes || sha256(buf) !== entry.sha256) {
      console.error(`[models] checksum/size mismatch: ${entry.path}`); ok = false;
    } else {
      console.log(`[models] ok  ${entry.path}  ${entry.bytes} bytes  sha256=${entry.sha256.slice(0, 16)}…`);
    }
  }
  if (!ok) fail('Verification failed. Delete the listed files and run `npm run setup:models`.');
  console.log('[models] all files verified');
}

async function downloadModel() {
  const dest = join(modelsDir, MODEL.file);
  if (existsSync(dest)) {
    console.log(`[models] ${MODEL.file} already present; re-checking against server headers`);
  }
  const res = await fetch(MODEL.url);
  if (!res.ok) fail(`download failed: HTTP ${res.status} from ${MODEL.url}`);
  const expectedLen = Number(res.headers.get('content-length'));
  const goog = res.headers.get('x-goog-hash') ?? '';
  const expectedMd5 = /md5=([^,\s]+)/.exec(goog)?.[1];
  const buf = Buffer.from(await res.arrayBuffer());
  if (expectedLen && buf.length !== expectedLen) fail(`size mismatch: got ${buf.length}, expected ${expectedLen}`);
  if (!expectedMd5) fail('server did not provide an MD5 hash; refusing to trust the download');
  if (md5b64(buf) !== expectedMd5) fail('MD5 mismatch against x-goog-hash; download may be corrupt');
  // A .task bundle is a ZIP container holding the detector and landmarker TFLite models.
  const head = buf.subarray(0, 16);
  const hasZipHeader = head.includes(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  const hasModels = buf.includes(Buffer.from('pose_detector.tflite')) && buf.includes(Buffer.from('pose_landmarks_detector.tflite'));
  if (!hasZipHeader || !hasModels) fail('downloaded file is not a valid pose landmarker .task bundle');
  writeFileSync(dest, buf);
  console.log(`[models] downloaded ${MODEL.file} (${buf.length} bytes), MD5 verified`);
  return { buf, md5: expectedMd5, lastModified: res.headers.get('last-modified') };
}

function copyWasm() {
  const src = join(pkgDir, 'wasm');
  if (!existsSync(src)) fail('node_modules/@mediapipe/tasks-vision/wasm not found. Run `npm install` first.');
  mkdirSync(wasmOutDir, { recursive: true });
  const out = [];
  for (const f of readdirSync(src)) {
    copyFileSync(join(src, f), join(wasmOutDir, f));
    out.push(f);
  }
  console.log(`[models] copied ${out.length} WASM runtime files from @mediapipe/tasks-vision`);
  return out;
}

async function setup() {
  mkdirSync(modelsDir, { recursive: true });
  const pkgVersion = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8')).version;
  const { buf, md5, lastModified } = await downloadModel();
  const wasmFiles = copyWasm();
  const files = [
    { path: `public/models/${MODEL.file}`, bytes: buf.length, sha256: sha256(buf), md5Base64: md5 },
    ...wasmFiles.map((f) => {
      const b = readFileSync(join(wasmOutDir, f));
      return { path: `public/mediapipe/wasm/${f}`, bytes: statSync(join(wasmOutDir, f)).size, sha256: sha256(b) };
    }),
  ];
  const manifest = {
    generatedAt: new Date().toISOString(),
    model: { ...MODEL, serverLastModified: lastModified },
    runtime: { package: '@mediapipe/tasks-vision', version: pkgVersion, license: 'Apache-2.0' },
    files,
  };
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`[models] wrote ${manifestPath}`);
  verify();
}

if (process.argv.includes('--verify')) verify();
else setup().catch((e) => fail(e?.message ?? String(e)));
