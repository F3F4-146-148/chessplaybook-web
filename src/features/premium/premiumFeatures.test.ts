/**
 * #428 D6: guided games are on /premium and /membership only once they are live (GUIDED_LIVE), with the owner's
 * approved wording, "Guided games with the Master", 1 a day on the free plan.
 *
 * The list is a function of the switch (limitedList), tested directly: the first version mocked the flags module
 * and re-imported, which under a loaded full run sometimes got the real module (released) and failed (2026-11-27).
 */
import { describe, expect, it } from 'vitest';
import { LIMITED, limitedList } from './premiumFeatures';
import { GUIDED_LIVE } from '@/design/designFlags';

describe('the free plan list and guided games (#428 D6)', () => {
  it('names guided games, 1 a day, once they are live', () => {
    expect(limitedList(true)).toContainEqual(['Guided games with the Master', '1 a day']);
  });

  it('does not name them before (no feature nobody can reach)', () => {
    expect(limitedList(false).some(([f]) => /guided/i.test(f))).toBe(false);
  });

  it('the pages use the list for the current switch', () => {
    expect(LIMITED).toEqual(limitedList(GUIDED_LIVE));
  });
});
