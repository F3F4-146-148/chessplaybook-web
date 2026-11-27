/**
 * #521: the daily puzzle allowance as the three puzzle fetchers meet it. A 402 for an identified player is a
 * `PuzzleDailyLimitError` carrying the limit; it is never answered with the sample puzzles, which every other
 * non-OK answer falls back to. A 402 with no identity sent (a signed-in player's token briefly unavailable) is a
 * failed load: nothing, and no samples either.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const headers = vi.hoisted(() => ({ value: { 'X-Anonymous-Id': 'anon-1' } as Record<string, string> }));
vi.mock('@/features/auth/utils/getAuthToken', () => ({ getRequestHeaders: async () => headers.value }));

import { fetchDailyPuzzle, fetchPuzzleById, fetchPuzzles, PuzzleDailyLimitError } from './PuzzleService';

const refusal = { success: false, error: 'daily_limit', feature: 'puzzle', limit: 5, resetsAt: '2026-11-26T22:00:00Z' };

/** The API is up (`/stats`); every puzzle route answers `status` with `body`. */
function answer(status: number, body: unknown) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => (String(url).includes('/api/puzzles/stats')
    ? new Response(JSON.stringify({ success: true }), { status: 200 })
    : new Response(JSON.stringify(body), { status }))));
}

const fetchers = {
  fetchPuzzles: () => fetchPuzzles({ count: 1 }),
  'fetchPuzzles in a run': () => fetchPuzzles({ count: 1, selection: 'failed_review' }),
  fetchDailyPuzzle: () => fetchDailyPuzzle(),
  fetchPuzzleById: () => fetchPuzzleById('fp1'),
};

describe('the puzzle fetchers and the daily puzzle allowance', () => {
  beforeEach(() => { headers.value = { 'X-Anonymous-Id': 'anon-1' }; });
  afterEach(() => vi.unstubAllGlobals());

  for (const [name, run] of Object.entries(fetchers)) {
    it(`${name}: an identified player at the limit gets the limit, never a sample puzzle`, async () => {
      answer(402, refusal);
      const error = await run().then(() => null, (e: unknown) => e);
      expect(error).toBeInstanceOf(PuzzleDailyLimitError);
      expect((error as PuzzleDailyLimitError).limit).toEqual({ feature: 'puzzle', limit: 5, resetsAt: refusal.resetsAt });
    });

    it(`${name}: no identity sent, a failed load with no sample puzzle`, async () => {
      headers.value = {};
      answer(402, refusal);
      const got = await run();
      expect(got === null || (Array.isArray(got) && got.length === 0)).toBe(true);
    });
  }

  it("another feature's 402 is not read as the puzzle limit", async () => {
    answer(402, { ...refusal, feature: 'game_report' });
    await expect(fetchPuzzleById('fp1')).resolves.not.toBeInstanceOf(PuzzleDailyLimitError);
  });
});
