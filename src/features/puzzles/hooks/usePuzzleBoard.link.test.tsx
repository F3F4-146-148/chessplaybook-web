/**
 * `/puzzles?id=<id>` opens that puzzle first (#245 B3), before the saved puzzle and the daily.
 * A saved attempt at the SAME puzzle is resumed instead, so it is not scored twice.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const FEN = 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR b KQkq - 3 4';
const linked = { id: 'g_1', tryId: 't1', fen: FEN, moves: ['c6d4', 'f3f7'], acceptedMoves: [['f3f7']], themes: [] };
const other = { id: 'OTHER', tryId: 't2', fen: FEN, moves: ['c6d4', 'f3f7'], rating: 1500, themes: [] };

const service = vi.hoisted(() => ({
  fetchPuzzleById: vi.fn(),
  fetchPuzzles: vi.fn(),
  fetchDailyPuzzle: vi.fn(),
  isApiReachable: vi.fn(() => true),
}));
const resume = vi.hoisted(() => ({
  loadResumeState: vi.fn(),
  saveResumeState: vi.fn(),
  clearResumeState: vi.fn(),
}));
vi.mock('../services/PuzzleService', () => service);
vi.mock('../services/puzzleResume', () => resume);
vi.mock('@/features/puzzles/services/puzzleTry', () => ({ recordPuzzleTry: vi.fn() }));
vi.mock('@/services/analytics', () => ({ logGA4Event: vi.fn() }));

import { usePuzzleBoard } from './usePuzzleBoard';

const saved = (puzzle: object) => ({
  version: 1, puzzle, moveIndex: 1, resolvedAs: null, fen: undefined,
  attemptRecorded: true, hasFailed: false, rungsShown: 0, sessionId: null, isDaily: false,
});

async function mount(linkedPuzzleId: string | null) {
  const opened = vi.fn();
  const hook = renderHook(() => usePuzzleBoard({ linkedPuzzleId, onLinkedPuzzleOpened: opened }));
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  return { hook, opened };
}

describe('a puzzle by link (#245 B3)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    for (const f of [...Object.values(service), ...Object.values(resume)]) f.mockReset();
    service.isApiReachable.mockReturnValue(true);
    service.fetchPuzzleById.mockImplementation(async (id: string) => (id === 'g_1' ? linked : null));
    service.fetchPuzzles.mockResolvedValue([other]);
    service.fetchDailyPuzzle.mockResolvedValue(other);
    resume.loadResumeState.mockReturnValue(null);
  });
  afterEach(() => { vi.useRealTimers(); });

  it('opens the linked puzzle, not the daily', async () => {
    const { hook, opened } = await mount('g_1');
    expect(service.fetchPuzzleById).toHaveBeenCalledWith('g_1');
    expect(service.fetchDailyPuzzle).not.toHaveBeenCalled();
    expect(hook.result.current.puzzleState.puzzle?.id).toBe('g_1');
    expect(hook.result.current.isDaily).toBe(false);
    expect(opened).toHaveBeenCalledTimes(1);
  });

  it('beats a saved attempt at another puzzle', async () => {
    resume.loadResumeState.mockReturnValue(saved(other));
    const { hook } = await mount('g_1');
    expect(hook.result.current.puzzleState.puzzle?.id).toBe('g_1');
  });

  it('resumes a saved attempt at the same puzzle instead of opening it fresh', async () => {
    resume.loadResumeState.mockReturnValue(saved(linked));
    const { hook, opened } = await mount('g_1');
    expect(service.fetchPuzzleById).not.toHaveBeenCalled();
    expect(hook.result.current.puzzleState.puzzle?.id).toBe('g_1');
    expect(hook.result.current.puzzleState.moveIndex).toBe(1);
    expect(opened).toHaveBeenCalledTimes(1);
  });

  it('falls back to an ordinary draw when the link finds nothing', async () => {
    const { hook, opened } = await mount('g_999');
    expect(service.fetchPuzzles).toHaveBeenCalled();
    expect(hook.result.current.puzzleState.puzzle?.id).toBe('OTHER');
    expect(opened).toHaveBeenCalledTimes(1);
  });

  it('without a link, the page opens as before', async () => {
    const { opened } = await mount(null);
    expect(service.fetchPuzzleById).not.toHaveBeenCalled();
    expect(opened).not.toHaveBeenCalled();
  });
});
