/**
 * #521: a result the server refuses because today's free puzzles are used up (402) scored nothing, so the page
 * counts nothing either: the sitting's counts are taken back, the puzzle is not marked as scored, and the limit is
 * reported. An accepted result still counts exactly as before.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const limit = { feature: 'puzzle' as const, limit: 5, resetsAt: '2026-11-26T22:00:00Z' };
const postPuzzleResult = vi.fn();
const reportDailyLimit = vi.fn();

vi.mock('../services/postPuzzleResult', () => ({
  postPuzzleResult: (headers: unknown, body: unknown) => postPuzzleResult(headers, body),
}));
vi.mock('@/services/analytics', () => ({ logGA4Event: () => {} }));
vi.mock('@/services/freePlanLimit', async (original) => ({
  ...(await original<object>()), reportDailyLimit: (l: unknown) => reportDailyLimit(l),
}));
vi.mock('@/features/auth/utils/getAuthToken', () => ({ getRequestHeaders: async () => ({}) }));
vi.mock('@/services/UserPreferencesService', () => ({
  userPreferencesService: { loadFromServer: async () => null, save: async () => {}, saveProgress: async () => {} },
}));

const { usePuzzleRecord } = await import('./usePuzzleRecord');

const PUZZLE = { id: 'server-1', rating: 1500, moves: ['e2e4', 'e7e5'], tryId: 'try-1' };

function renderFailed() {
  return renderHook(() => usePuzzleRecord(
    { status: 'failed', hasFailed: true, firstFailure: true, moveIndex: 1, puzzle: PUZZLE as never },
    { rated: true },
  ));
}

beforeEach(() => { postPuzzleResult.mockReset(); reportDailyLimit.mockReset(); localStorage.clear(); });
afterEach(() => vi.clearAllMocks());

describe('a refused result (#521)', () => {
  it('takes the miss back out of the sitting and reports the limit', async () => {
    postPuzzleResult.mockResolvedValue({ ok: false, unrecorded: false, limited: limit });
    const hook = renderFailed();
    await waitFor(() => expect(reportDailyLimit).toHaveBeenCalledWith(limit));
    await waitFor(() => expect(hook.result.current.stats).toEqual({ solved: 0, failed: 0, streak: 0 }));
    expect(hook.result.current.attemptRecordedFor).toBeNull();
  });

  it('an accepted result still counts', async () => {
    postPuzzleResult.mockResolvedValue({ ok: true, unrecorded: false, data: { newRating: 1490, ratingChange: -10 } });
    const hook = renderFailed();
    await waitFor(() => expect(postPuzzleResult).toHaveBeenCalled());
    await new Promise(r => setTimeout(r, 20));
    expect(hook.result.current.stats.failed).toBe(1);
    expect(hook.result.current.attemptRecordedFor).toBe('server-1');
    expect(reportDailyLimit).not.toHaveBeenCalled();
  });
});
