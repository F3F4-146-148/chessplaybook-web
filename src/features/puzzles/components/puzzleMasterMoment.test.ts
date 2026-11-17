import { describe, expect, it } from 'vitest';

import { PUZZLE_MASTER_LINES, puzzleMasterMoment } from './puzzleMasterMoment';

const base = { status: 'playing', isMidSolve: false, exploring: false, missed: false, quiet: false, puzzleId: 'abc12' };

describe('puzzleMasterMoment (#186 B1)', () => {
  it('gives each state its face', () => {
    expect(puzzleMasterMoment(base).expression).toBe('presenting');
    expect(puzzleMasterMoment({ ...base, isMidSolve: true }).expression).toBe('thinking');
    expect(puzzleMasterMoment({ ...base, status: 'failed' }).expression).toBe('serious');
    // A mistake is a face, never words.
    expect(puzzleMasterMoment({ ...base, status: 'failed' }).line).toBeNull();
    expect(puzzleMasterMoment({ ...base, status: 'correct' }).expression).toBe('pleased');
    expect(puzzleMasterMoment({ ...base, status: 'solution' }).expression).toBe('presenting');
    expect(puzzleMasterMoment({ ...base, exploring: true, status: 'correct' }).expression).toBe('thinking');
  });

  it('stays serious after the 700 ms failure flash returns the puzzle to playing', () => {
    expect(puzzleMasterMoment({ ...base, missed: true }).expression).toBe('serious');
    expect(puzzleMasterMoment({ ...base, missed: true, isMidSolve: true }).expression).toBe('serious');
    // ...and a solve after a miss is still a solve.
    expect(puzzleMasterMoment({ ...base, missed: true, status: 'correct' }).expression).toBe('pleased');
  });

  it('says nothing when the card is saying something else', () => {
    expect(puzzleMasterMoment({ ...base, quiet: true }).line).toBeNull();
    expect(puzzleMasterMoment({ ...base, status: 'loading' }).line).toBeNull();
  });

  it('reads the same for the same puzzle', () => {
    expect(puzzleMasterMoment(base).line).toBe(puzzleMasterMoment(base).line);
  });

  /*
    Puzzles rule B2: nothing before or during the solve names the motif, the move, the move count or the
    outcome. His lines only encourage, so none may carry a chess word or a number.
  */
  it('never names a motif, a move, a count or an outcome', () => {
    const banned = /\d|mate|check|fork|pin|skewer|sacrific|win|draw|queen|rook|bishop|knight|pawn|king|move|piece|—/i;
    for (const line of Object.values(PUZZLE_MASTER_LINES).flat()) expect(line).not.toMatch(banned);
  });
});
