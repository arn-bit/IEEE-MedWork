import { describe, expect, it } from 'vitest';
import { posterFacts } from './PosterPage';
import { POSTER } from './content';
import { EXERCISES } from '../../domain/exercises/library';

describe('poster', () => {
  it('its numbers come from the app itself', () => {
    const f = posterFacts();
    expect(f.exercises).toBe(EXERCISES.length);
    expect(f.exercises).toBeGreaterThanOrEqual(48);
    expect(f.foods).toBeGreaterThanOrEqual(300);
    expect(f.sources).toBeGreaterThanOrEqual(20);
    expect(f.repCounters + f.holds + f.movement).toBeGreaterThanOrEqual(30);
  });

  it('prints on a standard landscape board and every text block has content', () => {
    expect(POSTER.widthIn).toBeGreaterThan(POSTER.heightIn);
    for (const k of ['pose', 'gamification', 'food', 'claudeFlow', 'engine', 'compare', 'models', 'evaluation', 'limits', 'references'] as const) expect(POSTER[k].length, k).toBeGreaterThan(0);
  });

  it('every model on the board says who made it and under which licence', () => {
    expect(POSTER.models.length).toBeGreaterThanOrEqual(4);
    for (const m of POSTER.models) expect(m.from, m.name).toMatch(/MIT|Apache/);
  });

  it('is honest about its limits', () => {
    const text = POSTER.limits.join(' ').toLowerCase();
    expect(text).toContain('not yet validated');
    expect(text).toContain('not medical advice');
  });
});
