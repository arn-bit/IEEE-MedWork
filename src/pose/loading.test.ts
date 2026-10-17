import { describe, expect, it } from 'vitest';
import { fetchModelBytes, checkWasm, PoseModelError } from './poseModel';
import { startCamera, CameraError, classifyCameraError } from './camera';

const resp = (body: BodyInit | null, init: ResponseInit & { type?: string } = {}) =>
  new Response(body, { status: init.status ?? 200, headers: { 'content-type': init.type ?? 'application/octet-stream' } });

describe('pose model loading', () => {
  it('missing model (404) gives an actionable error', async () => {
    const err = await fetchModelBytes(async () => resp('nope', { status: 404, type: 'text/plain' })).catch((e) => e);
    expect(err).toBeInstanceOf(PoseModelError);
    expect(err.code).toBe('model_missing');
    expect(err.message).toMatch(/npm run setup:models/);
  });

  it('SPA fallback (200 text/html) is detected as missing, not loaded as a model', async () => {
    const err = await fetchModelBytes(async () => resp('<!doctype html>', { type: 'text/html' })).catch((e) => e);
    expect(err.code).toBe('model_missing');
  });

  it('network failure is reported as missing', async () => {
    const err = await fetchModelBytes(async () => {
      throw new TypeError('Failed to fetch');
    }).catch((e) => e);
    expect(err.code).toBe('model_missing');
  });

  it('a corrupt file is rejected', async () => {
    const err = await fetchModelBytes(async () => resp(new Uint8Array(2_000_000))).catch((e) => e);
    expect(err.code).toBe('model_invalid');
  });

  it('a valid zip-bundle header is accepted', async () => {
    const bytes = new Uint8Array(2_000_000);
    bytes.set([0, 0, 0x50, 0x4b, 0x03, 0x04]);
    const out = await fetchModelBytes(async () => resp(bytes));
    expect(out.length).toBe(2_000_000);
  });

  it('missing WASM runtime gives an actionable error', async () => {
    const err = await checkWasm(async () => resp('', { status: 404 })).catch((e) => e);
    expect(err.code).toBe('wasm_missing');
    expect(err.message).toMatch(/setup:models/);
  });
});

describe('camera access', () => {
  const navWith = (impl: () => Promise<MediaStream>) => ({ mediaDevices: { getUserMedia: impl } }) as unknown as Navigator;

  it('permission denial maps to a usable manual alternative', async () => {
    const err = await startCamera(
      navWith(() => Promise.reject(Object.assign(new Error('x'), { name: 'NotAllowedError' }))),
      true,
    ).catch((e) => e);
    expect(err).toBeInstanceOf(CameraError);
    expect(err.code).toBe('denied');
    expect(err.message).toMatch(/manual tracking/i);
  });

  it('no camera hardware', async () => {
    const err = await startCamera(navWith(() => Promise.reject(Object.assign(new Error('x'), { name: 'NotFoundError' }))), true).catch((e) => e);
    expect(err.code).toBe('no_camera');
  });

  it('insecure context and unsupported browsers', async () => {
    expect((await startCamera(navWith(() => Promise.reject(new Error())), false).catch((e) => e)).code).toBe('insecure');
    expect((await startCamera({} as Navigator, true).catch((e) => e)).code).toBe('unsupported');
  });

  it('classifies in-use errors', () => {
    expect(classifyCameraError({ name: 'NotReadableError' })).toBe('in_use');
    expect(classifyCameraError(null)).toBe('unknown');
  });
});
