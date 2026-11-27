/**
 * #428 D6: the stored reset time of today's free guided game, read back until it passes.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { readGuidedLimit } from './useGuidedLimit';
import { LIMIT_KEY } from './useGuidedGame';

describe('readGuidedLimit (#428 D6)', () => {
  afterEach(() => localStorage.removeItem(LIMIT_KEY));

  it('nothing stored: no limit', () => {
    expect(readGuidedLimit()).toBeNull();
  });

  it('a reset time still to come: the guided game limit, one a day', () => {
    localStorage.setItem(LIMIT_KEY, '2030-01-01T22:00:00.000Z');
    expect(readGuidedLimit(Date.parse('2030-01-01T10:00:00Z'))).toEqual({ feature: 'guided_game', limit: 1, resetsAt: '2030-01-01T22:00:00.000Z' });
  });

  it('a reset time passed: no limit', () => {
    localStorage.setItem(LIMIT_KEY, '2030-01-01T22:00:00.000Z');
    expect(readGuidedLimit(Date.parse('2030-01-01T22:00:01Z'))).toBeNull();
  });
});
