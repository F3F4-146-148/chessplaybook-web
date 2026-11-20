/**
 * usePuzzle: accepted moves on a puzzle made from a game (#245 B1, D4).
 *
 * A generated puzzle lists every accepted move per solver move. The stored replies follow the main
 * move only, so an accepted alternative before the last step ends the puzzle there, solved. A corpus
 * puzzle has no list and keeps its one-move check.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePuzzle } from './usePuzzle';
import * as analytics from '@/services/analytics';

/*
  Black's setup ...Nd4, then White. The line: Qd1 (or Qe3, accepted), ...Nxc2+, Qxc2.
  Qe3 is a real legal move here; the list is test data, as the server's would be.
*/
const FEN = 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR b KQkq - 3 4';
const TWO_STEP = {
  id: 'g_1',
  fen: FEN,
  moves: ['c6d4', 'f3d1', 'd4c2', 'd1c2'],
  acceptedMoves: [['f3d1', 'f3e3'], ['d1c2']],
  themes: [],
};
const ONE_STEP = {
  id: 'g_2',
  fen: FEN,
  moves: ['c6d4', 'f3f7'],
  acceptedMoves: [['f3f7', 'f3d1']],
  themes: [],
};
const CORPUS = { id: 'AAAAA', fen: FEN, moves: ['c6d4', 'f3f7'], rating: 1000, themes: ['mateIn1'] };

describe('usePuzzle: accepted moves (#245 B1)', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    vi.useFakeTimers();
    logSpy = vi.spyOn(analytics, 'logGA4Event').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    logSpy.mockRestore();
  });

  const start = (puzzle: object) => {
    const hook = renderHook(() => usePuzzle());
    act(() => {
      hook.result.current[1].loadPuzzle(puzzle as any, { source: 'network', index: 1, isDaily: false });
      vi.advanceTimersByTime(1000);
    });
    return hook;
  };
  const play = (hook: ReturnType<typeof start>, uci: string) => {
    act(() => { hook.result.current[1].onMove(uci.slice(0, 2) as any, uci.slice(2, 4) as any); });
    act(() => { vi.advanceTimersByTime(1000); });
  };

  it('the main move still continues the line', () => {
    const hook = start(TWO_STEP);
    play(hook, 'f3d1');
    expect(hook.result.current[0].status).toBe('playing');
    expect(hook.result.current[0].moveIndex).toBe(3);
    play(hook, 'd1c2');
    expect(hook.result.current[0].status).toBe('correct');
  });

  it('an accepted alternative before the last step ends the puzzle there, solved (D4)', () => {
    const hook = start(TWO_STEP);
    play(hook, 'f3e3');
    expect(hook.result.current[0].status).toBe('correct');
    expect(hook.result.current[0].lastMove, 'the move played, not the main one').toEqual(['f3', 'e3']);
    expect(hook.result.current[0].firstFailure).toBe(false);
  });

  it('an accepted alternative at the last step solves it', () => {
    const hook = start(ONE_STEP);
    play(hook, 'f3d1');
    expect(hook.result.current[0].status).toBe('correct');
    expect(hook.result.current[0].lastMove).toEqual(['f3', 'd1']);
  });

  it('a move outside the list is wrong', () => {
    const hook = start(TWO_STEP);
    act(() => { hook.result.current[1].onMove('a2' as any, 'a3' as any); });
    expect(hook.result.current[0].status).toBe('failed');
  });

  it('a corpus puzzle is unchanged: only its move (or a mate) is accepted', () => {
    const hook = start(CORPUS);
    act(() => { hook.result.current[1].onMove('f3' as any, 'd1' as any); });
    expect(hook.result.current[0].status).toBe('failed');
  });
});
