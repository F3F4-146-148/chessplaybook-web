/**
 * #521: the server refuses a puzzle's first move (today's free puzzles are used up: two tabs at the 5th, or a daily
 * served by the preload to a player already at the limit). The attempt stops: the limit is reported, the puzzle goes
 * back to its start and the board takes no move until another puzzle is loaded.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const limit = { feature: 'puzzle' as const, limit: 5, resetsAt: '2026-11-26T22:00:00Z' };
const tried = vi.hoisted(() => ({ recordPuzzleTry: vi.fn() }));
const reported = vi.hoisted(() => ({ reportDailyLimit: vi.fn() }));
vi.mock('@/features/puzzles/services/puzzleTry', () => tried);
vi.mock('@/services/freePlanLimit', async (original) => ({ ...(await original<object>()), ...reported }));
vi.mock('@/services/analytics', () => ({ logGA4Event: vi.fn() }));

import { usePuzzle } from './usePuzzle';

/* Black's setup ...Nd4, then White: Qd1, ...Nxc2+, Qxc2. */
const FEN = 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR b KQkq - 3 4';
const PUZZLE = { id: 'P1', tryId: 't1', fen: FEN, moves: ['c6d4', 'f3d1', 'd4c2', 'd1c2'], rating: 1500, themes: [] };
const OTHER = { ...PUZZLE, id: 'P2', tryId: 't2' };

describe('usePuzzle: a refused first move (#521)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    tried.recordPuzzleTry.mockReset();
    reported.reportDailyLimit.mockReset();
  });
  afterEach(() => { vi.useRealTimers(); });

  const start = (puzzle: object) => {
    const hook = renderHook(() => usePuzzle());
    act(() => {
      hook.result.current[1].loadPuzzle(puzzle as never, { source: 'network', index: 1, isDaily: false });
      vi.advanceTimersByTime(1000);
    });
    return hook;
  };
  const play = async (hook: ReturnType<typeof start>, uci: string) => {
    await act(async () => { hook.result.current[1].onMove(uci.slice(0, 2) as never, uci.slice(2, 4) as never); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  };

  it('the puzzle goes back to its start, the board is locked, and the limit is reported', async () => {
    tried.recordPuzzleTry.mockResolvedValue(limit);
    const hook = start(PUZZLE);
    await play(hook, 'f3d1');
    const [state] = hook.result.current;
    expect(reported.reportDailyLimit).toHaveBeenCalledWith(limit);
    expect(state.attemptRefused).toBe(true);
    expect(state.moveIndex).toBe(1);
    expect(state.dests).toBeUndefined();
    expect(state.movableColor).toBeUndefined();
    await play(hook, 'f3d1');
    expect(hook.result.current[0].moveIndex, 'a locked board takes no move').toBe(1);
  });

  it('an accepted first move plays on as before', async () => {
    tried.recordPuzzleTry.mockResolvedValue(null);
    const hook = start(PUZZLE);
    await play(hook, 'f3d1');
    expect(hook.result.current[0].attemptRefused).toBe(false);
    expect(hook.result.current[0].moveIndex).toBe(3);
    expect(reported.reportDailyLimit).not.toHaveBeenCalled();
  });

  it('the lock ends when another puzzle is loaded', async () => {
    tried.recordPuzzleTry.mockResolvedValue(limit);
    const hook = start(PUZZLE);
    await play(hook, 'f3d1');
    act(() => {
      hook.result.current[1].loadPuzzle(OTHER as never, { source: 'network', index: 2, isDaily: false });
      vi.advanceTimersByTime(1000);
    });
    expect(hook.result.current[0].attemptRefused).toBe(false);
    expect(hook.result.current[0].dests).toBeDefined();
  });
});
