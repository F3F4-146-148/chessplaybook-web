/**
 * #521: the board when today's free puzzles are used up. A refused draw keeps the board as it is, reports the limit
 * (the site's dialog), and never falls back to another draw or the sample puzzles; the next draw the server answers
 * clears it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const FEN = 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR b KQkq - 3 4';
const first = { id: 'P1', tryId: 't1', fen: FEN, moves: ['c6d4', 'f3f7'], rating: 1500, themes: [] };
const second = { id: 'P2', tryId: 't2', fen: FEN, moves: ['c6d4', 'f3f7'], rating: 1500, themes: [] };
const limit = { feature: 'puzzle' as const, limit: 5, resetsAt: '2026-11-26T22:00:00Z' };

const service = vi.hoisted(() => {
  class PuzzleDailyLimitError extends Error {
    constructor(readonly limit: unknown) { super('daily_limit'); }
  }
  return {
    PuzzleDailyLimitError,
    fetchPuzzleById: vi.fn(),
    fetchPuzzles: vi.fn(),
    fetchDailyPuzzle: vi.fn(),
    isApiReachable: vi.fn(() => true),
  };
});
const reported = vi.hoisted(() => ({ recordDailyLimit: vi.fn() }));
vi.mock('../services/PuzzleService', () => service);
const resume = vi.hoisted(() => ({ loadResumeState: vi.fn((): unknown => null), saveResumeState: vi.fn(), clearResumeState: vi.fn() }));
vi.mock('../services/puzzleResume', () => resume);
vi.mock('@/features/puzzles/services/puzzleTry', () => ({ recordPuzzleTry: vi.fn() }));
vi.mock('@/services/analytics', () => ({ logGA4Event: vi.fn() }));
vi.mock('@/services/freePlanLimit', async (original) => ({ ...(await original<object>()), ...reported }));

import { usePuzzleBoard } from './usePuzzleBoard';

const refuse = () => Promise.reject(new service.PuzzleDailyLimitError(limit));

async function mount() {
  const hook = renderHook(() => usePuzzleBoard({}));
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  return hook;
}

describe('the board at the daily puzzle limit (#521)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    for (const f of [service.fetchPuzzleById, service.fetchPuzzles, service.fetchDailyPuzzle, reported.recordDailyLimit]) f.mockReset();
    service.isApiReachable.mockReturnValue(true);
    try { localStorage.clear(); } catch { /* none */ }
    /* A player who has played before: a browser that never has skips the daily (#559, tested below). */
    localStorage.setItem('chessplaybook_puzzle_progress', JSON.stringify({ totalSolved: 3, totalFailed: 1, bestStreak: 2, sessions: 1, estimatedRating: 1200, lastPlayed: '' }));
  });
  afterEach(() => { vi.useRealTimers(); });

  it("#559: a browser that has never played skips the daily: its first puzzle is the server's first-puzzle draw", async () => {
    localStorage.removeItem('chessplaybook_puzzle_progress');
    service.fetchDailyPuzzle.mockResolvedValue(first);
    service.fetchPuzzles.mockResolvedValue([second]);
    const hook = await mount();
    expect(service.fetchDailyPuzzle).not.toHaveBeenCalled();
    expect(hook.result.current.puzzleState.puzzle?.id).toBe('P2');
  });

  it('a refused daily on the first visit reports the limit and draws nothing else', async () => {
    service.fetchDailyPuzzle.mockImplementation(refuse);
    service.fetchPuzzles.mockResolvedValue([second]);
    const hook = await mount();
    expect(service.fetchPuzzles).not.toHaveBeenCalled();
    expect(hook.result.current.puzzleState.puzzle).toBeNull();
    expect(hook.result.current.dailyLimit).toEqual(limit);
    expect(reported.recordDailyLimit).toHaveBeenCalledWith(limit);
  });

  it('a refused next puzzle keeps the last one on the board', async () => {
    service.fetchDailyPuzzle.mockResolvedValue(first);
    const hook = await mount();
    expect(hook.result.current.puzzleState.puzzle?.id).toBe('P1');
    service.fetchPuzzles.mockImplementation(refuse);
    await act(async () => { await hook.result.current.nextPuzzle(); });
    expect(hook.result.current.puzzleState.puzzle?.id).toBe('P1');
    expect(hook.result.current.dailyLimit).toEqual(limit);
    expect(hook.result.current.filterFoundNothing).toBe(false);
    expect(reported.recordDailyLimit).toHaveBeenCalledTimes(1);
  });

  it('a refused draw keeps the saved puzzle, so a reload restores what the board shows', async () => {
    service.fetchDailyPuzzle.mockResolvedValue(first);
    const hook = await mount();
    const saved = { version: 1, puzzle: first, moveIndex: 1 };
    resume.loadResumeState.mockReturnValue(saved);
    resume.saveResumeState.mockClear();
    service.fetchPuzzles.mockImplementation(refuse);
    await act(async () => { await hook.result.current.nextPuzzle(); });
    expect(resume.saveResumeState).toHaveBeenCalledWith(saved);
    resume.loadResumeState.mockReturnValue(null);
  });

  it('the next draw the server answers clears the limit', async () => {
    service.fetchDailyPuzzle.mockImplementation(refuse);
    const hook = await mount();
    service.fetchPuzzles.mockResolvedValue([second]);
    await act(async () => { await hook.result.current.nextPuzzle(); });
    expect(hook.result.current.puzzleState.puzzle?.id).toBe('P2');
    expect(hook.result.current.dailyLimit).toBeNull();
  });
});
