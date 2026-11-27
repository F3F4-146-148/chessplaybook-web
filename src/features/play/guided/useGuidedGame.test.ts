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
/* E2: a search held until the test releases it (the check of a move still running while the player acts). */
const hold: { until: Promise<void> | null; release: () => void; prefix: string } = { until: null, release: () => {}, prefix: '' };

vi.mock('@/services/AnalysisService', () => ({
  analysisService: {
    searchScore: (fen: string, ms: number) => {
      searches.push({ fen, ms });
      const s = scoreFor(fen, ms);
      return hold.until && hold.prefix && fen.startsWith(hold.prefix) ? hold.until.then(() => s) : Promise.resolve(s);
    },
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
/* D2: the guided routes, answered by the test (no server). */
const api = vi.hoisted(() => ({
  start: { ok: true, id: 'srv' } as { ok: true; id: string } | { ok: false; limit: unknown } | null,
  warning: null as null | { kind: string; text: string; audioUrl: string },
  missed: null as null | { kind: string; text: string; audioUrl: string },
  calls: [] as string[],
  startHold: null as Promise<void> | null,
}));
vi.mock('./guidedApi', () => ({
  startGuidedGame: () => {
    api.calls.push('start');
    if (api.startHold) return api.startHold.then(() => api.start);
    return api.start === null ? new Promise(() => {}) : Promise.resolve(api.start);
  },
  fetchWarning: () => { api.calls.push('warning'); return Promise.resolve(api.warning); },
  fetchMissed: (_id: string, b: { pv: string[] }) => { api.calls.push(`missed ${b.pv.join(' ')}`); return Promise.resolve(api.missed); },
}));
vi.mock('@/services/freePlanLimit', async (orig) => ({ ...(await orig<object>()), reportDailyLimit: () => { api.calls.push('limit dialog'); } }));
vi.mock('../services/computerGameSave', () => ({ newClientGameId: () => 'g', savePendingGame: () => Promise.resolve(), saveFinishedGame: () => Promise.resolve({ ok: true, id: 'x' }) }));

const { useComputerGame } = await import('../hooks/useComputerGame');
const { useGuidedGame, WARNING_LINES, DRAW_LINES, TAKEBACKS, STORAGE_KEY, LIMIT_KEY } = await import('./useGuidedGame');
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
    api.start = { ok: true, id: 'srv' }; api.warning = null; api.missed = null; api.calls.length = 0; localStorage.clear();
    vi.useFakeTimers(); searches.length = 0; replies.length = 0; pending.length = 0; engineTaken.value = false; sessionStorage.clear();
    hold.until = null; hold.prefix = ''; api.startHold = null;
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

  /* D2: the server's game and words. */
  it("the server's words replace the fixed line, with their recording; the game is started first", async () => {
    scoreFor = blunderAfterE4;
    api.warning = { kind: 'piece_lost', text: 'Wait. I can win your pawn on e4.', audioUrl: '/audio/master-guided-v1/x.mp3' };
    replies.push('e7e5');
    const h = setup();
    await settle();
    move(h, 'e2e4');
    await release();
    expect(h.result.current.guided.warning?.text).toBe('Wait. I can win your pawn on e4.');
    expect(h.result.current.guided.warning?.audioUrl).toBe('/audio/master-guided-v1/x.mp3');
    expect(api.calls).toEqual(['start', 'warning']);
  });

  it('the server unreachable: the fixed line, no recording', async () => {
    scoreFor = blunderAfterE4;
    api.start = { ok: false, limit: null };
    replies.push('e7e5');
    const h = setup();
    await settle();
    move(h, 'e2e4');
    await release();
    expect(h.result.current.guided.warning?.text).toBe(WARNING_LINES.loss);
    expect(h.result.current.guided.warning?.audioUrl).toBeUndefined();
    expect(h.result.current.guided.refused).toBe(false);
  });

  it("a refused start (the day's game used): no warning, the dialog, and the game goes on unguided", async () => {
    scoreFor = blunderAfterE4;
    api.start = { ok: false, limit: { feature: 'guided_game', limit: 1, resetsAt: '2026-11-27T22:00:00.000Z' } };
    replies.push('e7e5');
    const h = setup();
    await settle();
    move(h, 'e2e4');
    await release();
    expect(h.result.current.guided.warning).toBeNull();
    expect(h.result.current.guided.refused).toBe(true);
    expect(usePlayGameStore.getState().moves).toEqual(['e2e4', 'e7e5']); // his own reply, not held
    expect(api.calls).toEqual(['start', 'limit dialog']);
    expect(localStorage.getItem(LIMIT_KEY)).toBe('2026-11-27T22:00:00.000Z');
  });

  it('a chance missed (18-20 win% lost, no warning) is said after his reply, and the next move drops it', async () => {
    // the start: level, best 1.d4; after 1.e4 Black is +2.2 (the player lost ~19%, under the gate of 20)
    scoreFor = (fen) => (fen.startsWith(AFTER_E4)
      ? { cp: 220, mate: null, best: 'd7d5', pv: ['d7d5'] }
      : { cp: 0, mate: null, best: 'd2d4', pv: ['d2d4', 'd7d5'] });
    api.missed = { kind: 'piece', text: 'You could have won my pawn on e5 last move.', audioUrl: '/audio/master-guided-v1/m.mp3' };
    replies.push('e7e5');
    const h = setup();
    await settle();
    move(h, 'e2e4');
    expect(h.result.current.guided.said).toBeNull();
    await release();
    expect(h.result.current.guided.warning).toBeNull();
    expect(usePlayGameStore.getState().moves).toEqual(['e2e4', 'e7e5']);
    expect(h.result.current.guided.said?.text).toBe('You could have won my pawn on e5 last move.');
    expect(api.calls).toContain('missed d2d4 d7d5');
    scoreFor = () => ({ cp: 0, mate: null, best: 'a7a6', pv: ['a7a6'] });
    replies.push('b8c6');
    move(h, 'g1f3');
    expect(h.result.current.guided.said).toBeNull();
  });

  /* E2: the fixes from Fable's and Codex's reviews. */
  it('E2: a warning whose move was taken back while he checked it is never shown', async () => {
    scoreFor = blunderAfterE4;
    replies.push('e7e5');
    hold.prefix = AFTER_E4;
    hold.until = new Promise<void>((r) => { hold.release = r; });
    const h = setup();
    await settle();
    move(h, 'e2e4');
    await act(async () => { await Promise.resolve(); });
    act(() => h.result.current.guided.takeBack()); // a counted takeback, during the check
    await act(async () => { hold.release(); await vi.runAllTimersAsync(); });
    expect(h.result.current.guided.warning).toBeNull();
    expect(h.result.current.guided.warningsGiven).toBe(0);
  });

  it("E2: once today's game is known to be used, a refusal opens no dialog again (the line says it)", async () => {
    const resetsAt = new Date(Date.now() + 6 * 3600e3).toISOString();
    localStorage.setItem(LIMIT_KEY, resetsAt);
    api.start = { ok: false, limit: { feature: 'guided_game', limit: 1, resetsAt } };
    replies.push('e7e5');
    const h = setup();
    await settle();
    move(h, 'e2e4');
    await release();
    expect(h.result.current.guided.refused).toBe(true);
    expect(api.calls).not.toContain('limit dialog');
  });

  it('E2: a game the server starts clears the stored limit (Premium bought, a grant, the next day)', async () => {
    localStorage.setItem(LIMIT_KEY, new Date(Date.now() + 6 * 3600e3).toISOString());
    replies.push('e7e5');
    const h = setup();
    await settle();
    move(h, 'e2e4');
    await release();
    expect(h.result.current.guided.gameId).toBe('srv');
    expect(localStorage.getItem(LIMIT_KEY)).toBeNull();
  });

  it('E2: a start that never answers does not hold his reply for ever', async () => {
    api.start = null; // the request hangs
    replies.push('e7e5');
    const h = setup();
    await settle();
    move(h, 'e2e4');
    await release();
    await settle();
    expect(usePlayGameStore.getState().moves).toEqual(['e2e4', 'e7e5']);
    expect(h.result.current.guided.gameId).toBeNull();
  });

  it('E2: the hint count is kept with the game, so a reload keeps it', async () => {
    replies.push('e7e5');
    const h = setup();
    await settle();
    act(() => { h.result.current.guided.noteHint(); h.result.current.guided.noteHint(); });
    move(h, 'e2e4');
    await release();
    await settle();
    expect(h.result.current.guided.hintsUsed).toBe(2);
    expect(JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? '{}').hintsUsed).toBe(2);
  });

  it('E2 round 2 (Codex): a refusal that arrives after the player resigned opens no dialog', async () => {
    let release: () => void = () => {};
    api.startHold = new Promise<void>((r) => { release = r; });
    api.start = { ok: false, limit: { feature: 'guided_game', limit: 1, resetsAt: new Date(Date.now() + 6 * 3600e3).toISOString() } };
    replies.push('e7e5');
    const h = setup();
    await settle();
    move(h, 'e2e4');
    await act(async () => { await Promise.resolve(); });
    act(() => h.result.current.actions.resign());
    await act(async () => { release(); await vi.runAllTimersAsync(); });
    expect(api.calls).not.toContain('limit dialog');
    expect(localStorage.getItem(LIMIT_KEY)).not.toBeNull(); // still known for the next game
  });
});
