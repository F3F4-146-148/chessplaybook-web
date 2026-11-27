/**
 * #521 A6: the page's read of today's free puzzle allowances.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('@/features/auth/utils/getAuthToken', () => ({ getRequestHeaders: async () => ({ 'X-Anonymous-Id': 'anon-1' }) }));

import { fetchPuzzleAllowance, usePuzzleAllowance } from './puzzleAllowance';

const answer = (status: number, body: unknown) => {
  const fn = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fn);
  return fn;
};
const left = (n: number) => ({ limit: 5, left: n, resetsAt: '2026-11-26T22:00:00Z' });

describe('the puzzle allowance', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads both allowances and the run pass', async () => {
    answer(200, { success: true, data: { puzzle: left(2), puzzleExplanation: null, runPass: true } });
    expect(await fetchPuzzleAllowance()).toEqual({ puzzle: left(2), puzzleExplanation: null, runPass: true });
  });

  it('an unreadable answer is null, never a made-up allowance', async () => {
    answer(500, {});
    expect(await fetchPuzzleAllowance()).toBeNull();
    answer(200, { success: true, data: { puzzle: { left: 'x' }, runPass: 'yes' } });
    expect(await fetchPuzzleAllowance()).toEqual({ puzzle: null, puzzleExplanation: null, runPass: false });
  });

  it('the hook reads again when its key changes', async () => {
    const fn = answer(200, { success: true, data: { puzzle: left(5), puzzleExplanation: null, runPass: false } });
    const hook = renderHook(({ key }) => usePuzzleAllowance(key), { initialProps: { key: 0 } });
    await waitFor(() => expect(hook.result.current?.puzzle?.left).toBe(5));
    answer(200, { success: true, data: { puzzle: left(4), puzzleExplanation: null, runPass: false } });
    hook.rerender({ key: 1 });
    await waitFor(() => expect(hook.result.current?.puzzle?.left).toBe(4));
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
