/**
 * #428 D4: the end summary's rules: which mistakes, how they are written, what to work on.
 */
import { describe, expect, it } from 'vitest';

import { biggestMistakes, MISTAKE_LOSS, type MoveGrade } from './useGuidedGame';
import { workOnFor, writeMistakes } from './useGuidedSummary';

const g = (ply: number, uci: string, before: number, after: number, best: string | null = null): MoveGrade => ({ ply, uci, before, after, best });

describe('biggestMistakes (#428 D4)', () => {
  const moves = ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'g8f6', 'f3g5'];

  it('the two biggest losses among the moves that stand, the biggest first', () => {
    const grades = [g(1, 'e2e4', 50, 49), g(3, 'g1f3', 52, 30), g(5, 'f1c4', 55, 40), g(7, 'f3g5', 60, 45)];
    expect(biggestMistakes(grades, moves).map((m) => m.ply)).toEqual([3, 5]);
  });

  it('a move under the line is not a mistake; equal losses keep the earlier first', () => {
    expect(biggestMistakes([g(1, 'e2e4', 50, 50 - MISTAKE_LOSS + 1)], moves)).toEqual([]);
    expect(biggestMistakes([g(5, 'f1c4', 50, 35), g(3, 'g1f3', 50, 35)], moves).map((m) => m.ply)).toEqual([3, 5]);
  });

  it('a move taken back is not counted: gone from the line, or replaced by another move at its ply', () => {
    const grades = [g(9, 'd2d4', 60, 10), g(5, 'c2c3', 60, 10), g(3, 'g1f3', 50, 38)];
    expect(biggestMistakes(grades, moves).map((m) => m.ply)).toEqual([3]);
  });
});

describe('writeMistakes (#428 D4)', () => {
  it("writes the move played and SF's better one, numbered for White and Black", () => {
    const moves = ['e2e4', 'e7e5', 'g1f3', 'f7f6'];
    const out = writeMistakes([g(3, 'g1f3', 55, 40, 'd2d4'), g(4, 'f7f6', 50, 30, 'b8c6')], moves);
    expect(out).toEqual([
      { ply: 3, played: '2. Nf3', better: '2. d4', loss: 15 },
      { ply: 4, played: '2... f6', better: '2... Nc6', loss: 20 },
    ]);
  });

  it('no better move when SF had none or it is the move played', () => {
    expect(writeMistakes([g(1, 'e2e4', 50, 30, null), g(1, 'e2e4', 50, 30, 'e2e4')], ['e2e4']).map((m) => m.better)).toEqual([null, null]);
  });
});

describe('workOnFor (#428 D4)', () => {
  it('the opening principles in the opening, else the puzzles of the stage', () => {
    expect(workOnFor('opening').href).toBe('/openings?welcome=1');
    expect(workOnFor('middlegame').href).toBe('/puzzles?area=middlegame');
    expect(workOnFor('endgame').href).toBe('/puzzles?area=endgame');
  });
});
