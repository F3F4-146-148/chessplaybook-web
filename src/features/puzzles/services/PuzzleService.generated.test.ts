/**
 * A puzzle made from a game has no hints and no explanation (#245 B2): nothing is requested for a
 * `g_` id. A corpus id still asks the server as before.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchPuzzleExplanation, fetchPuzzleHints, isGeneratedPuzzleId } from './PuzzleService';

afterEach(() => { vi.unstubAllGlobals(); });

describe('puzzles made from games (#245 B2)', () => {
  it('recognises the generated id form only', () => {
    expect(isGeneratedPuzzleId('g_1')).toBe(true);
    expect(isGeneratedPuzzleId('g_12345')).toBe(true);
    for (const id of ['g_0', 'g_01', 'g_', 'G_1', 'pz001', '3H6vB', 'xg_1', '', null, undefined]) {
      expect(isGeneratedPuzzleId(id), String(id)).toBe(false);
    }
  });

  it('asks nothing for a generated puzzle', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    expect(await fetchPuzzleExplanation('g_7')).toEqual({ status: 'unavailable' });
    expect(await fetchPuzzleHints('g_7')).toEqual({ status: 'unavailable' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('still asks the server for a corpus puzzle', async () => {
    const fetchSpy = vi.fn(async (_url: string) => ({
      ok: true, json: async () => ({ data: { status: 'pending' } }),
    }) as unknown as Response);
    vi.stubGlobal('fetch', fetchSpy);
    expect(await fetchPuzzleExplanation('3H6vB')).toEqual({ status: 'pending' });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0][0])).toContain('/api/puzzles/3H6vB/explanation');
  });
});
