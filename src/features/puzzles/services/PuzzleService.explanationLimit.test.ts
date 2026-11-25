/**
 * The free plan's 3 puzzle explanations a day, as the trainer meets them (2026-11-21): a 402 for
 * an identified player opens the limit dialog and reads as `limited`; a 402 with no identity (a
 * signed-in player's token briefly unavailable) is a failed load, not their limit.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const headers = vi.hoisted(() => ({ value: { 'X-Anonymous-Id': 'anon-1' } as Record<string, string> }));
vi.mock('@/features/auth/utils/getAuthToken', () => ({ getRequestHeaders: async () => headers.value }));

import { fetchPuzzleExplanation } from './PuzzleService';
import { DAILY_LIMIT_EVENT } from '@/services/freePlanLimit';

const refusal = { success: false, error: 'daily_limit', feature: 'puzzle_explanation', limit: 3, resetsAt: '2026-11-21T22:00:00Z' };

function answer(status: number, body: unknown) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status })));
}

describe('fetchPuzzleExplanation and the daily limit', () => {
  let dialogs: unknown[];
  const onLimit = (event: Event) => dialogs.push((event as CustomEvent).detail);
  beforeEach(() => {
    dialogs = [];
    window.addEventListener(DAILY_LIMIT_EVENT, onLimit);
    headers.value = { 'X-Anonymous-Id': 'anon-1' };
  });
  afterEach(() => {
    window.removeEventListener(DAILY_LIMIT_EVENT, onLimit);
    vi.unstubAllGlobals();
  });

  it('an identified player at the limit gets `limited` and the dialog', async () => {
    answer(402, refusal);
    expect(await fetchPuzzleExplanation('abc')).toEqual({ status: 'limited' });
    expect(dialogs).toEqual([{ feature: 'puzzle_explanation', limit: 3, resetsAt: refusal.resetsAt }]);
  });

  it('no identity sent: a failed load, never the limit dialog', async () => {
    headers.value = {};
    answer(402, refusal);
    expect(await fetchPuzzleExplanation('abc')).toEqual({ status: 'unavailable' });
    expect(dialogs).toEqual([]);
  });

  it('a ready explanation is passed through', async () => {
    answer(200, { success: true, data: { status: 'ready', structured: {}, action: null } });
    expect(await fetchPuzzleExplanation('abc')).toEqual({ status: 'ready', structured: {}, action: null });
  });
});
