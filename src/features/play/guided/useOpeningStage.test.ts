/**
 * #428 D3c: the opening-principles tab is shown until the server (SF) says the opening is over, with the server stubbed.
 */
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  stage: 'opening' as 'opening' | 'middlegame' | 'endgame' | null,
  calls: [] as string[],
}));
vi.mock('./guidedApi', () => ({
  fetchStage: (id: string, moves: string[]) => { api.calls.push(`${id} ${moves.join(',')}`); return Promise.resolve(api.stage); },
}));

const { useOpeningStage } = await import('./useOpeningStage');

type P = { gameId: string | null; moves: string[]; newGame: unknown };
function setup(initial: P) {
  return renderHook((p: P) => useOpeningStage({ enabled: true, ...p }), { initialProps: initial });
}
const flush = () => act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); });

describe('useOpeningStage (#428 D3c)', () => {
  beforeEach(() => { api.stage = 'opening'; api.calls.length = 0; });

  it('is the opening before the server knows the game, and asks nothing', async () => {
    const h = setup({ gameId: null, moves: ['e2e4'], newGame: 'playing' });
    await flush();
    expect(h.result.current).toBe(true);
    expect(api.calls).toEqual([]);
  });

  it('asks after each move and stays in the opening while the server says so', async () => {
    const h = setup({ gameId: 'g', moves: ['e2e4'], newGame: 'playing' });
    await flush();
    h.rerender({ gameId: 'g', moves: ['e2e4', 'e7e5'], newGame: 'playing' });
    await flush();
    expect(api.calls).toEqual(['g e2e4', 'g e2e4,e7e5']);
    expect(h.result.current).toBe(true);
  });

  it('once the opening is over it stays over (a takeback does not bring it back) and asks no more', async () => {
    api.stage = 'middlegame';
    const h = setup({ gameId: 'g', moves: ['e2e4'], newGame: 'playing' });
    await flush();
    expect(h.result.current).toBe(false);
    api.stage = 'opening';
    h.rerender({ gameId: 'g', moves: [], newGame: 'playing' });
    h.rerender({ gameId: 'g', moves: ['d2d4'], newGame: 'playing' });
    await flush();
    expect(h.result.current).toBe(false);
    expect(api.calls).toEqual(['g e2e4']);
  });

  it('a failed answer changes nothing; a new game starts in the opening again', async () => {
    api.stage = 'endgame';
    const h = setup({ gameId: 'g', moves: ['e2e4'], newGame: 'playing' });
    await flush();
    expect(h.result.current).toBe(false);
    api.stage = null;
    h.rerender({ gameId: 'g', moves: ['e2e4'], newGame: 'ended' });
    h.rerender({ gameId: 'g2', moves: [], newGame: 'playing' });
    await flush();
    expect(h.result.current).toBe(true);
    h.rerender({ gameId: 'g2', moves: ['e2e4'], newGame: 'playing' });
    await flush();
    expect(h.result.current).toBe(true);
  });

  it("an answer still on its way from the last game never hides the new game's tab (E2: Codex, Fable)", async () => {
    let answer: (s: 'middlegame') => void = () => {};
    const slow = new Promise<'middlegame'>((r) => { answer = r; });
    const h = setup({ gameId: 'g', moves: ['e2e4'], newGame: 'playing' });
    api.stage = 'opening';
    await flush();
    // the last move of game 1 asks, and the answer is slow
    (api as unknown as { stage: unknown }).stage = slow;
    h.rerender({ gameId: 'g', moves: ['e2e4', 'e7e5'], newGame: 'playing' });
    h.rerender({ gameId: 'g', moves: ['e2e4', 'e7e5'], newGame: 'ended' });
    h.rerender({ gameId: 'g2', moves: [], newGame: 'playing' });
    answer('middlegame');
    await flush();
    expect(h.result.current).toBe(true);
  });
});
