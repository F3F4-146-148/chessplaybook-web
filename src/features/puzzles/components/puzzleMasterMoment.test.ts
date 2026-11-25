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

  // #401 B1: chosen once per puzzle and kept (the rotation itself is tested in puzzleCardVoice.test.ts)
  it('reads the same for the same puzzle', () => {
    expect(puzzleMasterMoment(base).line).toBe(puzzleMasterMoment(base).line);
    expect(puzzleMasterMoment({ ...base, status: 'correct' }).line).toBe(puzzleMasterMoment({ ...base, status: 'correct' }).line);
  });

  /*
    Puzzles rule B2: nothing before or during the solve names the motif, the move, the move count or the
    outcome. His lines only encourage, so none may carry a chess word or a number.
  */
  it('never names a motif, a move, a count or an outcome', () => {
    // #401 C1: the lines heard BEFORE the solve (the start, a correct move, a wrong move); the ones after it may
    // say "Good idea to check." or "Three in a row."
    // whole words: "Keep looking" is not about a king
    const banned = /\d|—|\b(mate|checkmate|check|fork|pin|skewer|sacrific\w*|win|wins|draw|queen|rook|bishop|knight|pawn|king|move|moves|piece|pieces)\b/i;
    const L = PUZZLE_MASTER_LINES;
    for (const line of [...L.start, ...L.going, ...L.welcome, ...L.missed]) expect(line).not.toMatch(banned);
  });

  it('no line of his uses an em dash, and no text is in two pools', () => {
    const all = Object.values(PUZZLE_MASTER_LINES).flat();
    for (const line of all) expect(line).not.toMatch(/—/);
    expect(new Set(all).size).toBe(all.length);
  });
});
