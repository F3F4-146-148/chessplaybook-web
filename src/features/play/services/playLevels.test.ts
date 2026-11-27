import { describe, expect, it } from 'vitest';

import { nearestMasterLevel, playLevels } from './playLevels';

describe('nearestMasterLevel (#428 D1)', () => {
  const levels = playLevels(true);
  const rating = (id: string) => levels.find((l) => l.id === id)!.approxRating;

  it('moves a weak Stockfish level to his lowest level', () => {
    expect(nearestMasterLevel(levels, rating('sf-1'))?.id).toBe('master-1100');
  });

  it('moves a strong Stockfish level to his highest level', () => {
    expect(nearestMasterLevel(levels, rating('sf-8'))?.id).toBe('master-1900');
  });

  it('keeps a Master level as it is', () => {
    expect(nearestMasterLevel(levels, 1400)?.id).toBe('master-1400');
  });

  it('only ever answers a Master level', () => {
    for (const l of levels) expect(nearestMasterLevel(levels, l.approxRating)?.kind).toBe('master');
  });

  it('answers null when he does not play (MAIA_LIVE off)', () => {
    expect(nearestMasterLevel(playLevels(false), 1400)).toBeNull();
  });
});
