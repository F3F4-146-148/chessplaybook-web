import { afterEach, describe, expect, it } from 'vitest';
import { fixRenderClock, renderNow } from './buildClock';

afterEach(() => fixRenderClock(null));

describe('the render clock (prerender plan E1)', () => {
  it('reads the real time when nothing fixed it', () => {
    const before = Date.now();
    const t = renderNow().getTime();
    expect(t).toBeGreaterThanOrEqual(before);
    expect(t).toBeLessThanOrEqual(Date.now());
  });

  it('reads the build time while fixed, and the real time once released', () => {
    fixRenderClock('2026-11-20T03:00:00.000Z');
    expect(renderNow().toISOString()).toBe('2026-11-20T03:00:00.000Z');
    fixRenderClock(null);
    expect(renderNow().getFullYear()).toBe(new Date().getFullYear());
    expect(renderNow().toISOString()).not.toBe('2026-11-20T03:00:00.000Z');
  });

  it('ignores a missing or broken build time (a page built before E1 reads the real time)', () => {
    fixRenderClock('not a date');
    expect(Math.abs(renderNow().getTime() - Date.now())).toBeLessThan(1000);
  });
});
