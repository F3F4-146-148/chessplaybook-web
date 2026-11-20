import { describe, expect, it } from 'vitest';
import { median, summarizeBench } from './benchSummary';
import type { GameReport } from '../generator/types';

function report(over: Partial<GameReport>): GameReport {
  return {
    index: 0, hash: 'h', white: 'W', black: 'B', status: 'used', candidates: 0, puzzles: 0,
    dropped: {}, positionsSearched: 0, positionsFromEvals: 0, ms: 0, ...over,
  };
}

describe('median', () => {
  it('is null for no values, the middle for odd, the mean of the two middles for even', () => {
    expect(median([])).toBeNull();
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
});

describe('summarizeBench', () => {
  it('counts per used game and leaves skipped games out of the per-game figures', () => {
    const s = summarizeBench([
      report({ index: 0, ms: 4000, puzzles: 2, positionsSearched: 60 }),
      report({ index: 1, ms: 10000, puzzles: 1, positionsSearched: 90 }),
      report({ index: 2, status: 'skipped', skipReason: 'too-short', ms: 5 }),
      report({ index: 3, ms: 6000, puzzles: 0, positionsSearched: 30 }),
    ]);
    expect(s).toEqual({
      games: 4, used: 3, skipped: 1, puzzles: 3, puzzlesPerUsedGame: 1,
      medianSeconds: 6, maxSeconds: 10, totalSeconds: 20, positionsPerUsedGame: 60,
    });
  });

  it('has no time figures before a game is done', () => {
    const s = summarizeBench([report({ status: 'skipped', skipReason: 'no-result' })]);
    expect(s.medianSeconds).toBeNull();
    expect(s.maxSeconds).toBeNull();
    expect(s.puzzlesPerUsedGame).toBe(0);
  });
});
