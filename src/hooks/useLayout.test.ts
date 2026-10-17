import { describe, expect, it } from 'vitest';
import { resolveLayout, type LayoutEnv } from './useLayout';

const env = (o: Partial<LayoutEnv>): LayoutEnv => ({ width: 1280, height: 800, coarsePointer: false, touchPoints: 0, ...o });

describe('resolveLayout', () => {
  it('honours an explicit preference', () => {
    expect(resolveLayout('phone', env({}))).toBe('phone');
    expect(resolveLayout('desktop', env({ width: 360, height: 780, coarsePointer: true }))).toBe('desktop');
  });
  it('uses desktop for a mouse-driven wide window', () => {
    expect(resolveLayout('auto', env({}))).toBe('desktop');
  });
  it('uses phone for a phone, in portrait or landscape', () => {
    expect(resolveLayout('auto', env({ width: 390, height: 844, coarsePointer: true, touchPoints: 5 }))).toBe('phone');
    expect(resolveLayout('auto', env({ width: 844, height: 390, coarsePointer: true, touchPoints: 5 }))).toBe('phone');
  });
  it('keeps a touchscreen laptop (mouse + touch points) on desktop', () => {
    expect(resolveLayout('auto', env({ width: 1366, height: 800, coarsePointer: false, touchPoints: 10 }))).toBe('desktop');
  });
  it('uses phone for a narrow desktop window', () => {
    expect(resolveLayout('auto', env({ width: 600, height: 900 }))).toBe('phone');
  });
  it('uses desktop for a large tablet', () => {
    expect(resolveLayout('auto', env({ width: 1180, height: 820, coarsePointer: true, touchPoints: 5 }))).toBe('desktop');
  });
});
