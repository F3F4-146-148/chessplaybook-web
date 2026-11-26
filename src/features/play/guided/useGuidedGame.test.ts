/**
 * #428 B4: the guided loop on the real game hook, with the engine's searches stubbed to chosen scores (so a warning
 * is certain) and a stand-in Master whose replies the test releases.
 */
import { act, renderHook } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Score = { cp: number | null; mate: number | null; best: string; pv: string[] } | null;
const searches: Array<{ fen: string; ms: number }> = [];
const engineTaken = { value: false };
const availableListeners = new Set<() => void>();
/** What the engine "finds" for a position, by FEN prefix; anything else is level. */
let scoreFor: (fen: string, ms: number) => Score = () => ({ cp: 0, mate: null, best: 'a7a6', pv: ['a7a6'] });

vi.mock('@/services/AnalysisService', () => ({
  analysisService: {
    searchScore: (fen: string, ms: number) => { searches.push({ fen, ms }); return Promise.resolve(scoreFor(fen, ms)); },
    isEngineTaken: () => engineTaken.value,
    subscribeEngineAvailable: (cb: () => void) => { availableListeners.add(cb); return () => availableListeners.delete(cb); },
  },
}));
vi.mock('@/design/designFlags', async (orig) => ({ ...(await orig<object>()), MAIA_LIVE: true }));
const replies: string[] = [];
const pending: Array<() => void> = [];
vi.mock('@/features/master/maia/MaiaOpponent', () => ({
  MaiaOpponent: class {
    setRating() {}
    ready() { return Promise.resolve(); }
    dispose() {}
    evaluate() { return Promise.resolve({ moves: [], wdl: [0.33, 0.34, 0.33] }); }
    getMove() {
      const uci = replies.shift() ?? '';
      return new Promise((resolve) => { pending.push(() => resolve({ uci, evaluation: { moves: [{ p: 0.9 }], wdl: [0.3, 0.4, 0.3] } })); });
    }
  },
}));
vi.mock('../services/StockfishOpponent', async (orig) => ({ ...(await orig<object>()), StockfishOpponent: class { init() { return Promise.resolve(); } destroy() {} } }));
vi.mock('@/features/master/narrationApi', () => ({ fetchNarration: () => Promise.resolve(null), MASTER_VOICE: '4' }));
vi.mock('@/features/master/reaction', () => ({ reactionTo: () => null }));
vi.mock('@/services/SoundService', () => ({ soundService: { move() {}, check() {}, castle() {}, capture() {}, gameEnd() {} } }));
vi.mock('../services/computerGameSave', () => ({ newClientGameId: () => 'g', savePendingGame: () => Promise.resolve(), saveFinishedGame: () => Promise.resolve({ ok: true, id: 'x' }) }));

const { useComputerGame } = await import('../hooks/useComputerGame');
const { useGuidedGame, WARNING_LINES, DRAW_LINES, TAKEBACKS, STORAGE_KEY } = await import('./useGuidedGame');
const { usePlayGameStore } = await import('../stores/gameStore');
const { playLevels } = await import('../services/playLevels');
const master = playLevels(true).find((l) => l.kind === 'master')!;

function render() {
  return renderHook(() => {
    const guideRef = useRef(null);
    const [game, actions] = useComputerGame({ guideRef });
    const guided = useGuidedGame({ enabled: true, guideRef, game, actions });
    return { game, actions, guided };
  });
}
function setup(startFen?: string) {
  const h = renderHook(() => {
    const guideRef = useRef(null);
    const [game, actions] = useComputerGame({ guideRef });
    const guided = useGuidedGame({ enabled: true, guideRef, game, actions });
    return { game, actions, guided };
  });
  act(() => h.result.current.actions.startGame('white', master, startFen));
  return h;
}
const move = (h: ReturnType<typeof setup>, u: string) => act(() => h.result.current.actions.onMove(u.slice(0, 2) as never, u.slice(2, 4) as never));
/** Let the searches, his reply and his pause (a real timer) run. */
const settle = async () => { await act(async () => { await vi.runAllTimersAsync(); }); };
const release = async () => { await act(async () => { pending.shift()?.(); await vi.runAllTimersAsync(); }); };

// After 1.e4 the position has Black to move; a "blunder" is staged by the score of the position after White's move.
const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b';
const blunderAfterE4 = (fen: string): Score => (fen.startsWith(AFTER_E4)
  ? { cp: 400, mate: null, best: 'd7d5', pv: ['d7d5'] } // good for Black: the player (White) lost ~30%
  : { cp: 50, mate: null, best: 'e2e4', pv: ['e2e4'] });

describe('the guided loop (#428 B4)', () => {
  beforeEach(() => {
    vi.useFakeTimers(); searches.length = 0; replies.length = 0; pending.length = 0; engineTaken.value = false; sessionStorage.clear();
    scoreFor = () => ({ cp: 0, mate: null, best: 'a7a6', pv: ['a7a6'] });
    usePlayGameStore.getState().reset();
  });
  afterEach(() => { vi.useRealTimers(); });

  it('a blunder holds his reply and shows the warning; his reply waits for the decision', async () => {
    scoreFor = blunderAfterE4;
    replies.push('e7e5');
    const h = setup();
    await settle(); // the search of the start position while the player thinks
    move(h, 'e2e4');
    await release();
    expect(h.result.current.guided.warning?.text).toBe(WARNING_LINES.loss);
    expect(usePlayGameStore.getState().moves).toEqual(['e2e4']); // his reply has not landed
    expect(h.result.current.game.isThinking).toBe(true); // the board is not the player's while he waits
  });

  it('Take back after a warning rewinds the move and is free', async () => {
    scoreFor = blunderAfterE4;
    replies.push('e7e5');
    const h = setup();
    await settle();
    move(h, 'e2e4');
    await release();
    act(() => h.result.current.guided.takeBack());
    await settle();
    expect(usePlayGameStore.getState().moves).toEqual([]);
    expect(h.result.current.guided.warning).toBeNull();
    expect(h.result.current.guided.takebacksLeft).toBe(TAKEBACKS);
    expect(h.result.current.game.isThinking).toBe(false);
  });

  it('Play on plays the reply he warned about, not Maia\'s', async () => {
    scoreFor = blunderAfterE4;
    replies.push('e7e5'); // Maia's choice
    const h = setup();
    await settle();
    move(h, 'e2e4');
    await release();
    act(() => h.result.current.guided.playOn());
    await settle();
    expect(usePlayGameStore.getState().moves).toEqual(['e2e4', 'd7d5']); // the engine's reply from the warning
  });

  it('a good move passes: no warning, his own reply lands, the counter is spent only by a plain takeback', async () => {
    replies.push('e7e5');
    const h = setup();
    await settle();
    move(h, 'e2e4');
    await release();
    expect(h.result.current.guided.warning).toBeNull();
    expect(usePlayGameStore.getState().moves).toEqual(['e2e4', 'e7e5']);
    act(() => h.result.current.guided.takeBack());
    expect(usePlayGameStore.getState().moves).toEqual([]);
    expect(h.result.current.guided.takebacksLeft).toBe(TAKEBACKS - 1);
  });

  it('a search that fails gives no warning (never a wrong one)', async () => {
    scoreFor = (fen) => (fen.startsWith(AFTER_E4) ? null : { cp: 50, mate: null, best: 'e2e4', pv: [] });
    replies.push('e7e5');
    const h = setup();
    await settle();
    move(h, 'e2e4');
    await release();
    expect(h.result.current.guided.warning).toBeNull();
    expect(usePlayGameStore.getState().moves).toEqual(['e2e4', 'e7e5']);
  });

  it('the position in front of the player is searched while they think, so the check reuses it', async () => {
    replies.push('e7e5');
    const h = setup();
    await settle();
    expect(searches[0]).toMatchObject({ ms: 1000 });
    move(h, 'e2e4');
    await release();
    // After the move only the new position is searched (300 ms); the start position is not searched again.
    expect(searches.filter((s) => s.fen.startsWith('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w'))).toHaveLength(1);
    expect(searches.some((s) => s.fen.startsWith(AFTER_E4) && s.ms === 300)).toBe(true);
  });

  // B5. A1, 1100 game 8: 74.Qg8, stalemate from a mate in one.
  const STALEMATE_FROM = '5Q2/8/8/8/3K4/7k/5Q2/8 w - - 13 74';
  it('a stalemate from a winning score is held and warned; Take back rewinds it, free (B5)', async () => {
    scoreFor = () => ({ cp: null, mate: 1, best: 'f8f5', pv: ['f8f5'] });
    const h = setup(STALEMATE_FROM);
    await settle();
    move(h, 'f8g8');
    await settle();
    expect(h.result.current.guided.warning?.text).toBe(DRAW_LINES.stalemate);
    expect(h.result.current.game.gameStatus).toBe('playing'); // the end is held
    act(() => h.result.current.guided.takeBack());
    await settle();
    expect(h.result.current.game.gameStatus).toBe('playing');
    expect(usePlayGameStore.getState().moves).toEqual([]);
    expect(h.result.current.guided.takebacksLeft).toBe(TAKEBACKS);
  });

  it('Play on after the draw warning ends the game as a draw (B5)', async () => {
    scoreFor = () => ({ cp: null, mate: 1, best: 'f8f5', pv: ['f8f5'] });
    const h = setup(STALEMATE_FROM);
    await settle();
    move(h, 'f8g8');
    await settle();
    act(() => h.result.current.guided.playOn());
    await settle();
    expect(h.result.current.game.gameStatus).toBe('ended');
    expect(h.result.current.game.gameResult).toBe('Draw by stalemate');
  });

  it('a draw from a level position ends at once, no warning (B5)', async () => {
    scoreFor = () => ({ cp: 0, mate: null, best: 'f8f5', pv: ['f8f5'] });
    const h = setup(STALEMATE_FROM);
    await settle();
    move(h, 'f8g8');
    await settle();
    expect(h.result.current.guided.warning).toBeNull();
    expect(h.result.current.game.gameStatus).toBe('ended');
  });

  it('while another tab holds the engine: no searches, no warning, the game goes on; checks resume when it is free (B6)', async () => {
    scoreFor = blunderAfterE4;
    engineTaken.value = true;
    replies.push('e7e5');
    const h = setup();
    await settle();
    move(h, 'e2e4');
    await release();
    expect(searches).toHaveLength(0); // asking would take the engine back from the other tab
    expect(h.result.current.guided.warning).toBeNull();
    expect(h.result.current.guided.enginePaused).toBe(true);
    expect(usePlayGameStore.getState().moves).toEqual(['e2e4', 'e7e5']);
    engineTaken.value = false;
    act(() => availableListeners.forEach((cb) => cb()));
    await settle();
    expect(h.result.current.guided.enginePaused).toBe(false);
    expect(searches.length).toBeGreaterThan(0); // the position in front of the player is searched again
  });

  it('a reload continues the guided game, with the takebacks left (B6)', async () => {
    replies.push('e7e5', 'b8c6', 'g8f6');
    const h = setup();
    await settle();
    move(h, 'e2e4'); await release();
    move(h, 'g1f3'); await release();
    act(() => h.result.current.guided.takeBack());
    expect(JSON.parse(sessionStorage.getItem(STORAGE_KEY)!)).toMatchObject({ moves: ['e2e4', 'e7e5'], takebacksLeft: TAKEBACKS - 1 });
    h.unmount();
    usePlayGameStore.getState().reset();
    const again = render();
    await settle();
    expect(again.result.current.game.gameStatus).toBe('playing');
    expect(usePlayGameStore.getState().moves).toEqual(['e2e4', 'e7e5']);
    expect(again.result.current.game.sanMoves).toEqual(['e4', 'e5']);
    expect(again.result.current.guided.takebacksLeft).toBe(TAKEBACKS - 1);
  });

  it('a finished game is not kept (B6)', async () => {
    replies.push('e7e5');
    const h = setup();
    await settle();
    move(h, 'e2e4'); await release();
    expect(sessionStorage.getItem(STORAGE_KEY)).not.toBeNull();
    act(() => h.result.current.actions.resign());
    await settle();
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
