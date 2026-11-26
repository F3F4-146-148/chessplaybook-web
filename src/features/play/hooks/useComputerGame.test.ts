/**
 * #428 B1/B2: the per-ply revision and the atomic takeback, on the real hook with a stand-in Master whose replies
 * the test releases. Each test names the defect it guards.
 */
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Deferred = { uci: string; release: () => void };
const pending: Deferred[] = [];
const saved: Array<{ moves: string[]; claim: unknown }> = [];

vi.mock('@/design/designFlags', async (orig) => ({ ...(await orig<object>()), MAIA_LIVE: true }));
vi.mock('@/features/master/maia/MaiaOpponent', () => ({
  MaiaOpponent: class {
    setRating() {}
    ready() { return Promise.resolve(); }
    dispose() {}
    evaluate() { return Promise.resolve({ moves: [], wdl: [0.33, 0.34, 0.33] }); }
    /** His reply waits until the test releases it: the "pause" is under the test's control. */
    getMove() {
      return new Promise((resolve) => {
        const d: Deferred = { uci: replies.shift() ?? '', release: () => resolve({ uci: d.uci, evaluation: { moves: [{ p: 0.9 }], wdl: [0.3, 0.4, 0.3] } }) };
        pending.push(d);
      });
    }
  },
}));
vi.mock('../services/StockfishOpponent', async (orig) => ({ ...(await orig<object>()), StockfishOpponent: class { init() { return Promise.resolve(); } destroy() {} } }));
vi.mock('@/features/master/narrationApi', () => ({ fetchNarration: () => Promise.resolve(null), MASTER_VOICE: '4' }));
vi.mock('@/features/master/reaction', () => ({ reactionTo: () => null }));
vi.mock('@/services/SoundService', () => ({ soundService: { move() {}, check() {}, castle() {}, capture() {}, gameEnd() {} } }));
vi.mock('../services/computerGameSave', () => ({
  newClientGameId: () => 'test-game',
  savePendingGame: () => Promise.resolve(),
  saveFinishedGame: (draft: { moves: string[]; claim: unknown }) => { saved.push({ moves: draft.moves, claim: draft.claim }); return Promise.resolve({ ok: true, id: 'x' }); },
}));

const replies: string[] = [];
const { useComputerGame } = await import('./useComputerGame');
const { usePlayGameStore } = await import('../stores/gameStore');
const { playLevels } = await import('../services/playLevels');
const master = playLevels(true).find((l) => l.kind === 'master')!;

/** Release his reply and let the hook's pause (a real timer, up to 2.64 s) run out. */
async function letHimMove() {
  await act(async () => { pending.shift()!.release(); await vi.runAllTimersAsync(); });
}
const sq = (u: string) => [u.slice(0, 2), u.slice(2, 4)] as const;

describe('useComputerGame (#428 B1, B2)', () => {
  beforeEach(() => { vi.useFakeTimers(); pending.length = 0; replies.length = 0; saved.length = 0; usePlayGameStore.getState().reset(); });
  afterEach(() => { vi.useRealTimers(); });

  function start() {
    const h = renderHook(() => useComputerGame());
    act(() => h.result.current[1].startGame('white', master));
    return h;
  }
  const play = (h: ReturnType<typeof start>, u: string) => act(() => h.result.current[1].onMove(...(sq(u) as [never, never])));

  it('a takeback during his pause drops his reply (it never lands on the position taken back)', async () => {
    replies.push('e7e5');
    const h = start();
    play(h, 'e2e4');
    expect(h.result.current[0].isThinking).toBe(true);
    let plies = 0;
    act(() => { plies = h.result.current[1].takeBack(); });
    expect(plies).toBe(1);
    await letHimMove();
    expect(usePlayGameStore.getState().moves).toEqual([]);
    expect(h.result.current[0].sanMoves).toEqual([]);
    expect(h.result.current[0].isThinking).toBe(false);
    expect(h.result.current[0].lastMasterEvaluation).toBeNull();
  });

  it('after his reply a takeback removes his reply and your move together', async () => {
    replies.push('e7e5', 'b8c6');
    const h = start();
    play(h, 'e2e4');
    await letHimMove();
    play(h, 'g1f3');
    await letHimMove();
    let plies = 0;
    act(() => { plies = h.result.current[1].takeBack(); });
    expect(plies).toBe(2);
    expect(usePlayGameStore.getState().moves).toEqual(['e2e4', 'e7e5']);
    expect(h.result.current[0].sanMoves).toEqual(['e4', 'e5']);
    expect(h.result.current[0].lastMove).toEqual(['e7', 'e5']);
    expect(h.result.current[0].turnColor).toBe('white');
  });

  it('resigning during his pause: his move does not land on the finished game', async () => {
    replies.push('e7e5');
    const h = start();
    play(h, 'e2e4');
    act(() => h.result.current[1].resign());
    await letHimMove();
    expect(usePlayGameStore.getState().moves).toEqual(['e2e4']);
    expect(h.result.current[0].sanMoves).toEqual(['e4']);
  });

  it('no false threefold after a takeback: the repetition keys are taken back too', async () => {
    replies.push('g8f6', 'f6g8', 'f6g8');
    const h = start();
    play(h, 'g1f3'); await letHimMove();
    play(h, 'f3g1'); await letHimMove(); // the start position, a second time
    act(() => { h.result.current[1].takeBack(); });
    play(h, 'f3g1'); await letHimMove(); // the start position again: still the second time, not the third
    expect(h.result.current[0].gameStatus).toBe('playing');
    expect(h.result.current[0].gameResult).toBeNull();
  });

  it('the game saved at the end is the final line, without the moves taken back', async () => {
    replies.push('e7e5', 'd7d5');
    const h = start();
    play(h, 'e2e4'); await letHimMove();
    play(h, 'f1c4'); await letHimMove();
    act(() => { h.result.current[1].takeBack(); });
    act(() => h.result.current[1].resign());
    expect(saved).toHaveLength(1);
    expect(saved[0].moves).toEqual(['e2e4', 'e7e5']);
  });

  it('nothing to take back before your first move', () => {
    const h = start();
    let plies = -1;
    act(() => { plies = h.result.current[1].takeBack(); });
    expect(plies).toBe(0);
  });
});
