/**
 * #428 D3/D3b: Hint and Why? in a guided game, with the server's answers stubbed.
 */
import { createHash } from 'node:crypto';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  action: null as null | { action: string; marks: string },
  reasons: null as null | Array<{ text: string; marks: string }>,
  hints: null as null | { stage: 'opening' | 'middlegame' | 'endgame'; hints: Array<{ key: string; text: string }> },
  calls: [] as string[],
}));
vi.mock('./guidedApi', () => ({
  fetchGuidedAction: (id: string, fen: string, moves: string[]) => { api.calls.push(`action ${id} ${moves.join(',')}`); return Promise.resolve(api.action); },
  fetchWhy: (id: string, moves: string[]) => { api.calls.push(`why ${id} ${moves.join(',')}`); return Promise.resolve(api.reasons); },
  fetchHints: (id: string, moves: string[], best: string) => { api.calls.push(`hints ${id} ${moves.join(',')} ${best}`); return Promise.resolve(api.hints); },
}));

const { useGuidedHelp, HELP_LINES, WEAK_GIFT } = await import('./useGuidedHelp');

const FEN = 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2';
function setup(over: { gameId?: string | null; gift?: number | null; best?: string } = {}) {
  const guided = {
    gameId: over.gameId === undefined ? 'srv' : over.gameId,
    warning: null,
    searchHere: vi.fn(() => Promise.resolve({ cp: 0, mate: null, best: over.best ?? 'e4d5', pv: [over.best ?? 'e4d5'] })),
    hisMoveGift: vi.fn(() => Promise.resolve(over.gift ?? 0)),
    hintsUsed: 0,
    noteHint: vi.fn(),
  };
  const h = renderHook((p: { fen: string; moves: string[] }) => useGuidedHelp({
    guided, enabled: true, fen: p.fen, moves: p.moves, playerColor: 'white', playersTurn: true, newGame: 'playing',
  }), { initialProps: { fen: FEN, moves: ['e2e4', 'd7d5'] } });
  return { h, guided };
}
const flush = () => act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); });
const press = async (h: ReturnType<typeof setup>['h']) => { act(() => h.result.current.hint()); await flush(); };

describe('Hint and Why? (#428 D3, D3b)', () => {
  beforeEach(() => { api.action = null; api.reasons = null; api.hints = null; api.calls.length = 0; });

  it("the fixed lines' recordings are the server's keys for their words (sha1, 16)", () => {
    for (const l of Object.values(HELP_LINES)) expect(createHash('sha1').update(l.text).digest('hex').slice(0, 16)).toBe(l.key);
  });

  it("Hint gives all the trainer's hints for the best move at once, then the piece; never the move", async () => {
    api.hints = { stage: 'opening', hints: [{ key: 'control', text: 'Take control of important squares.' }, { key: 'capture', text: 'Look for a capture.' }] };
    const { h, guided } = setup({ best: 'e4d5' });
    await press(h);
    expect(api.calls).toEqual(['hints srv e2e4,d7d5 e4d5']);
    expect(h.result.current.answer).toMatchObject({ kind: 'hint', lines: ['Take control of important squares.', 'Look for a capture.'], marks: '' });
    expect(h.result.current.answer?.items?.map((x) => x.key)).toEqual(['control', 'capture']); // for the kind markers
    await press(h);
    expect(h.result.current.answer).toMatchObject({ lines: ['Take control of important squares.', 'Look for a capture.'], marks: '*e4' });
    expect(h.result.current.moreHints).toBe(false);
    await press(h); // nothing more outside an endgame: the move is never shown
    expect(h.result.current.answer?.marks).toBe('*e4');
    expect(guided.noteHint).toHaveBeenCalledTimes(2); // counted with the game (E2: a reload keeps it)
    expect(api.calls.length).toBe(1); // one request for the position
  });

  it("in an endgame: the piece, then SF's move as an arrow (owner: until the endgame explainer, #545)", async () => {
    api.hints = { stage: 'endgame', hints: [] };
    const { h } = setup({ best: 'a3a4' });
    await press(h);
    expect(h.result.current.answer).toMatchObject({ lines: [], marks: '*a3' });
    expect(h.result.current.moreHints).toBe(true); // the move is still to come
    await press(h);
    expect(h.result.current.answer?.marks).toBe('a3a4');
  });

  it('before the server knows the game: the piece first, no request', async () => {
    const { h } = setup({ gameId: null, best: 'e2e4' });
    await press(h);
    expect(h.result.current.answer?.marks).toBe('*e2');
    expect(api.calls).toEqual([]);
  });

  it('a new position starts the ladder again and clears the answer', async () => {
    api.hints = { stage: 'opening', hints: [{ key: 'development', text: 'Develop a piece.' }] };
    const { h } = setup();
    await press(h);
    h.rerender({ fen: 'other', moves: ['e2e4', 'd7d5', 'e4d5', 'd8d5'] });
    expect(h.result.current.answer).toBeNull();
    await press(h);
    expect(api.calls.filter((c) => c.startsWith('hints')).length).toBe(2);
    expect(h.result.current.answer?.lines).toEqual(['Develop a piece.']);
  });

  it('Why? in the opening: his reasons, one marked at a time (the first, then the one pressed), in his colour', async () => {
    api.reasons = [{ text: 'Fights for the centre.', marks: 'e5 !d4' }, { text: 'Frees the bishop.', marks: 'f8c5' }];
    const { h } = setup();
    act(() => h.result.current.why()); await flush();
    expect(h.result.current.answer).toMatchObject({ kind: 'why', lines: ['Fights for the centre.', 'Frees the bishop.'], selected: 0, marks: 'e5 !d4', mover: 'black' });
    act(() => h.result.current.select(1));
    expect(h.result.current.answer).toMatchObject({ selected: 1, marks: 'f8c5' });
  });

  it('Why? on a weak move of his: the natural-move line, before any reason (they would praise it)', async () => {
    api.reasons = [{ text: 'Attacks the knight on f6.', marks: 'f6' }];
    const { h } = setup({ gift: WEAK_GIFT + 1 });
    act(() => h.result.current.why()); await flush();
    expect(h.result.current.answer?.lines).toEqual([HELP_LINES.weak.text]);
    expect(h.result.current.voice?.text).toBe(HELP_LINES.weak.text);
    expect(api.calls.some((c) => c.startsWith('action') || c.startsWith('why'))).toBe(false);
  });

  it('Why? past the opening: "what the position asks of you now" and the action line, in the player\'s colour', async () => {
    api.reasons = [];
    api.action = { action: 'Double the rooks on the c-file.', marks: 'c1' };
    const { h } = setup({ gift: 2 });
    act(() => h.result.current.why()); await flush(); await flush();
    expect(h.result.current.answer).toMatchObject({ kind: 'why', lines: [HELP_LINES.asks.text, 'Double the rooks on the c-file.'], marks: 'c1', mover: 'white' });
    expect(h.result.current.voice?.text).toBe(HELP_LINES.asks.text);
  });

  it("E2 round 2 (Fable): a failed hint answer leaves Hint pressable, to ask again", async () => {
    api.hints = null; // the server unreachable, or the game's calls used
    const { h } = setup({ best: 'e4d5' });
    await press(h);
    expect(h.result.current.moreHints).toBe(true);
    api.hints = { stage: 'opening', hints: [{ key: 'control', text: 'Take control of important squares.' }] };
    await press(h);
    expect(h.result.current.answer?.lines).toEqual(['Take control of important squares.']);
  });
});
