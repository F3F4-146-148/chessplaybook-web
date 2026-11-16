import { describe, expect, it } from 'vitest';

import { applyMove, initialPosition, positionFromFen } from '@/components/chess/chessLogic';
import { drawByRule, repetitionKey } from './drawRules';
import { defaultLevelId, playLevels, stockfishFallback } from './playLevels';

describe('draws by rule', () => {
  it('declares threefold repetition when a position occurs the third time', () => {
    let pos = initialPosition();
    const keys = [repetitionKey(pos.chess)];
    const shuffle = ['g1f3', 'g8f6', 'f3g1', 'f6g8'];
    const results: Array<string | null> = [];
    for (const m of [...shuffle, ...shuffle]) {
      pos = applyMove(pos, m)!;
      keys.push(repetitionKey(pos.chess));
      results.push(drawByRule(pos.chess, keys));
    }
    // the start position recurs after move 4 (second time) and after move 8 (third time)
    expect(results.slice(0, 7).every((r) => r === null)).toBe(true);
    expect(results[7]).toBe('threefold');
  });

  it('declares the 50-move rule at 100 plies without a capture or a pawn move', () => {
    const pos = positionFromFen('8/5k2/8/3R4/8/2K5/8/7r w - - 99 120')!;
    const next = applyMove(pos, 'c3c4')!;
    expect(drawByRule(next.chess, [repetitionKey(next.chess)])).toBe('fifty-moves');
    expect(drawByRule(pos.chess, [repetitionKey(pos.chess)])).toBe(null);
  });
});

describe('/play levels', () => {
  it('with MAIA_LIVE off, the list is today\'s eight Stockfish levels, names unchanged', () => {
    const off = playLevels(false);
    expect(off.map((l) => l.name)).toEqual(['Beginner', 'Casual', 'Club Player', 'Intermediate', 'Advanced', 'Expert', 'Master', 'Grandmaster']);
    expect(defaultLevelId(false)).toBe('sf-4');
  });

  it('with MAIA_LIVE on: Stockfish 800 and 1000, the Master 1100-1900, Expert 2000, Grandmaster', () => {
    const on = playLevels(true);
    expect(on.map((l) => `${l.name} ${l.approxRating}`)).toEqual([
      'Beginner 800', 'Casual 1000',
      ...[1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900].map((r) => `The Master ${r}`),
      'Expert 2000', 'Grandmaster 2500',
    ]);
    // "Expert" appears once only: today's 1800 "Expert" is not in this list
    expect(on.filter((l) => l.name === 'Expert')).toHaveLength(1);
    expect(defaultLevelId(true)).toBe('master-1400');
  });

  it('falls back to the Stockfish level nearest in rating when Maia cannot load', () => {
    expect(stockfishFallback(1400).name).toBe('Intermediate');
    expect(stockfishFallback(1100).approxRating).toBe(1000);
    expect(stockfishFallback(1900).approxRating).toBe(1800);
  });
});
