/**
 * #521: the first move's report returns the limit when the server refuses it (today's free puzzles are used up),
 * so the page can stop the attempt. A refusal of a request with no identity is not the player's limit.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const headers = vi.hoisted(() => ({ value: { 'X-Anonymous-Id': 'anon-1' } as Record<string, string> }));
vi.mock('@/features/auth/utils/getAuthToken', () => ({ getRequestHeaders: async () => headers.value }));

import { recordPuzzleTry } from './puzzleTry';

const refusal = { success: false, error: 'daily_limit', feature: 'puzzle', limit: 5, resetsAt: '2026-11-26T22:00:00Z' };
const answer = (status: number, body: unknown) =>
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status })));

describe('recordPuzzleTry', () => {
  beforeEach(() => { headers.value = { 'X-Anonymous-Id': 'anon-1' }; });
  afterEach(() => vi.unstubAllGlobals());

  it('a refused first move returns the limit', async () => {
    answer(402, refusal);
    expect(await recordPuzzleTry('p1', 't1')).toEqual({ feature: 'puzzle', limit: 5, resetsAt: refusal.resetsAt });
  });
  it('an accepted first move returns nothing', async () => {
    answer(200, { success: true });
    expect(await recordPuzzleTry('p1', 't1')).toBeNull();
  });
  it('no identity sent: not the player\u2019s limit', async () => {
    headers.value = {};
    answer(402, refusal);
    expect(await recordPuzzleTry('p1', 't1')).toBeNull();
  });
  it('a network failure never breaks the board', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    expect(await recordPuzzleTry('p1', 't1')).toBeNull();
  });
});
