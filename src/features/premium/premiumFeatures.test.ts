/**
 * #428 D6: guided games are on /premium and /membership only once they are live (GUIDED_LIVE), with the owner's
 * approved wording, "Guided games with the Master", 1 a day on the free plan.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => { vi.resetModules(); vi.doUnmock('@/design/designFlags'); });

async function limitedWith(live: boolean) {
  vi.resetModules();
  vi.doMock('@/design/designFlags', async (orig) => ({ ...(await orig<object>()), GUIDED_LIVE: live }));
  return (await import('./premiumFeatures')).LIMITED;
}

describe('the free plan list and guided games (#428 D6)', () => {
  it('names guided games, 1 a day, once they are live', async () => {
    expect(await limitedWith(true)).toContainEqual(['Guided games with the Master', '1 a day']);
  });

  it('does not name them before (no feature nobody can reach)', async () => {
    expect((await limitedWith(false)).some(([f]) => /guided/i.test(f))).toBe(false);
  });
});
