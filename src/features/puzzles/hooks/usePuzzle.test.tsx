/**
 * usePuzzle — stale-timer and funnel-event guards.
 *
 * Both behaviours here were found by a Codex review of the A2 instrumentation
 * (PUZZLES_PAGE_IMPLEMENTATION_PLAN), and the timer one is a real gameplay bug,
 * not just an analytics one: every delayed callback in this hook reads mutable
 * refs, and "New Puzzle" is enabled while a puzzle is `playing`, so a reply
 * scheduled for puzzle A could land on puzzle B and advance its move index
 * before the user had touched the board.
 *
 * These tests assert the guard by driving the timers directly. Each one is
 * written so that removing the guard makes it fail.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePuzzle, WRONG_MOVE_HOLD_MS, REFUTATION_WAIT_MS, REFUTATION_READ_MS } from './usePuzzle';
import * as analytics from '@/services/analytics';

// The engine's reply to a wrong move (#417). By default there is none, so a wrong move goes back after the usual
// hold; the refutation tests below give it an answer, a late one, or none at all.
const engine = vi.hoisted(() => ({ findBestReply: vi.fn<(fen: string) => Promise<string | null>>(() => Promise.resolve(null)) }));
vi.mock('@/services/AnalysisService', () => ({ analysisService: engine }));

/** Let the engine's answer (a resolved promise) reach the hook. */
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

// Two real Lichess-format puzzles. moves[0] is the opponent's setup move.
const PUZZLE_A = {
  id: 'AAAAA',
  fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR b KQkq - 3 4',
  moves: ['c6d4', 'f3f7'],
  rating: 1000,
  themes: ['mateIn1'],
};
const PUZZLE_B = {
  ...PUZZLE_A,
  id: 'BBBBB',
};

describe('usePuzzle — presentation generation guard', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    logSpy = vi.spyOn(analytics, 'logGA4Event').mockImplementation(() => {});
    engine.findBestReply.mockClear();
    engine.findBestReply.mockImplementation(() => Promise.resolve(null));
  });
  afterEach(() => {
    vi.useRealTimers();
    logSpy.mockRestore();
  });

  const events = (name: string) =>
    logSpy.mock.calls.map(c => c[0] as any).filter(e => e.name === name);

  it('emits exactly one puzzle_board_ready per presentation', () => {
    const { result } = renderHook(() => usePuzzle());

    act(() => {
      result.current[1].loadPuzzle(PUZZLE_A as any, {
        source: 'network', responseAt: performance.now(), index: 1, isDaily: false,
      });
      vi.advanceTimersByTime(1000);
    });

    const ready = events('puzzle_board_ready');
    expect(ready).toHaveLength(1);
    expect(ready[0].params.puzzle_id).toBe('AAAAA');
    expect(ready[0].params.puzzle_index).toBe(1);
    expect(ready[0].params.ready_source).toBe('network');
    expect(result.current[0].status).toBe('playing');
  });

  it('a retry does not emit a second board_ready — the presentation was already counted', () => {
    const { result } = renderHook(() => usePuzzle());

    act(() => {
      result.current[1].loadPuzzle(PUZZLE_A as any, {
        source: 'network', index: 1, isDaily: false,
      });
      vi.advanceTimersByTime(1000);
    });
    act(() => {
      result.current[1].retry();
      vi.advanceTimersByTime(1000);
    });

    // Two loads, one presentation. Counting the retry would inflate the
    // denominator of the first-move rate.
    expect(events('puzzle_board_ready')).toHaveLength(1);
  });

  it('a superseded setup timer neither starts the old puzzle nor emits its event', () => {
    const { result } = renderHook(() => usePuzzle());

    act(() => {
      // Puzzle A is loaded but interrupted before its setup timer fires. The
      // window is SETUP_MOVE_DELAY_MS (250ms since B3, was 800ms) — advance
      // less than that, or A legitimately becomes ready and this stops testing
      // the guard.
      result.current[1].loadPuzzle(PUZZLE_A as any, {
        source: 'network', index: 1, isDaily: false,
      });
      vi.advanceTimersByTime(100);
      // ...and replaced. Without the generation guard, A's pending callback
      // would still run and report itself as ready.
      result.current[1].loadPuzzle(PUZZLE_B as any, {
        source: 'queued', index: 2, isDaily: false,
      });
      vi.advanceTimersByTime(1000);
    });

    const ready = events('puzzle_board_ready');
    expect(ready).toHaveLength(1);
    expect(ready[0].params.puzzle_id).toBe('BBBBB');
    expect(ready[0].params.puzzle_index).toBe(2);
  });

  it('reports the first move whether it is right or wrong', () => {
    const { result } = renderHook(() => usePuzzle());

    act(() => {
      result.current[1].loadPuzzle(PUZZLE_A as any, {
        source: 'network', index: 1, isDaily: false,
      });
      vi.advanceTimersByTime(1000);
    });
    // A deliberately wrong move. It is engagement, and B1 is expected to
    // produce more of these, so the funnel must not treat it as silence.
    act(() => {
      result.current[1].onMove('a7' as any, 'a6' as any);
    });

    const moves = events('puzzle_first_move');
    expect(moves).toHaveLength(1);
    expect(moves[0].params.correct).toBe(false);
    expect(moves[0].params.puzzle_index).toBe(1);
    expect(moves[0].params.ms_from_ready).toBeGreaterThanOrEqual(0);
  });

  it('does not reveal the correct move after a wrong one (B1)', async () => {
    const { result } = renderHook(() => usePuzzle());

    act(() => {
      result.current[1].loadPuzzle(PUZZLE_A as any, {
        source: 'network', index: 1, isDaily: false,
      });
      vi.advanceTimersByTime(1000);
    });
    // After the setup move, lastMove is the SETUP move (c6d4) — that is
    // correct and must stay.
    expect(result.current[0].lastMove).toEqual(['c6', 'd4']);

    act(() => { result.current[1].onMove('a7' as any, 'a6' as any); });
    await flush();
    expect(result.current[0].status).toBe('failed');

    // The old behaviour lit f3->f7 (the solution) 300ms in and held it until
    // the 700ms revert. Step through that whole window: at no point may the
    // solution squares appear.
    for (const t of [100, 200, 300, 400, 500, 600, 700]) {
      act(() => { vi.advanceTimersByTime(100); });
      const lm = result.current[0].lastMove;
      expect(lm, `solution revealed at ${t}ms`).not.toEqual(['f3', 'f7']);
    }
    // And the retry really is a fresh board, not one wearing the answer.
    expect(result.current[0].status).toBe('playing');
    expect(result.current[0].lastMove).toBeUndefined();
  });

  it('takes the failure branch, and stays on it after the revert (B2)', async () => {
    const { result } = renderHook(() => usePuzzle());

    act(() => {
      result.current[1].loadPuzzle(PUZZLE_A as any, {
        source: 'network', index: 1, isDaily: false,
      });
      vi.advanceTimersByTime(1000);
    });
    act(() => { result.current[1].onMove('a7' as any, 'a6' as any); });
    await flush();
    /*
      THE BRANCH, NOT THE WORDS - the same rule the assertion below already
      states and this line did not follow. It pinned `/scored/i`, so it failed
      the day the owner asked for the sentence to stop naming the score
      (2026-08-16: *"remove 'that one is scored'"*) while a real regression - the
      failure branch not being taken at all - would still have passed it.
    */
    expect(result.current[0].status).toBe('failed');
    expect(result.current[0].firstFailure).toBe(true);

    /*
      THE WRONG MOVE IS ON THE BOARD WHILE IT IS HELD (2026-11-22): the board's fen is the position after it, its
      squares are named for the marks, and the board takes no move meanwhile. Until then the old fen came back in
      the same render and a first-time visitor took the bounce for a broken mouse.
    */
    const held = result.current[0];
    expect(held.wrongMove).toEqual(['a7', 'a6']);
    expect(held.fen).not.toBe(held.position?.fen);
    expect(held.dests).toBeUndefined();

    /*
      After the hold the move is taken back and the board takes moves at once, while the card keeps saying a
      wrong move was played until the next move. Asserted as "not the clean line", not as the exact wording: what
      must hold is that the failure branch is TAKEN, which is what stops "Correct so far" coming back over a failed
      attempt.
    */
    act(() => { vi.advanceTimersByTime(WRONG_MOVE_HOLD_MS); });
    expect(result.current[0].status).toBe('playing');
    expect(result.current[0].wrongMove).toBeUndefined();
    expect(result.current[0].fen).toBe(result.current[0].position?.fen);
    expect(result.current[0].dests).toBeDefined();
    expect(result.current[0].lastMoveWrong).toBe(true);
    expect(result.current[0].message).not.toBe('Black to move');
    expect(result.current[0].message).not.toBe('White to move');
  });

  it('emits puzzle_first_move once per presentation, not once per move', () => {
    const { result } = renderHook(() => usePuzzle());

    act(() => {
      result.current[1].loadPuzzle(PUZZLE_A as any, {
        source: 'network', index: 1, isDaily: false,
      });
      vi.advanceTimersByTime(1000);
    });
    act(() => { result.current[1].onMove('a7' as any, 'a6' as any); });
    act(() => { vi.advanceTimersByTime(1000); });
    act(() => { result.current[1].onMove('b7' as any, 'b6' as any); });

    expect(events('puzzle_first_move')).toHaveLength(1);
  });

  /*
    THE REFUTATION (#417): the engine's reply to a wrong move is drawn as an arrow while the move is held; the hold
    waits for it (up to REFUTATION_WAIT_MS) and then leaves it REFUTATION_READ_MS to be read. A press on the board
    ends the hold at once, and an answer that comes after the hold is dropped.
  */
  const loadAndMiss = async () => {
    const hook = renderHook(() => usePuzzle());
    act(() => {
      hook.result.current[1].loadPuzzle(PUZZLE_A as any, { source: 'network', index: 1, isDaily: false });
      vi.advanceTimersByTime(1000);
    });
    act(() => { hook.result.current[1].onMove('a7' as any, 'a6' as any); });
    return hook;
  };

  it('asks the engine about the position the wrong move made, not the one before it', async () => {
    const { result } = await loadAndMiss();
    expect(engine.findBestReply).toHaveBeenCalledTimes(1);
    const asked = engine.findBestReply.mock.calls[0][0];
    expect(asked).toBe(result.current[0].fen);
    expect(asked).not.toBe(result.current[0].position?.fen);
  });

  it('shows the reply as an arrow and holds the wrong move while it is read', async () => {
    engine.findBestReply.mockImplementation(() => Promise.resolve('e8e7'));
    const { result } = await loadAndMiss();
    await flush();
    expect(result.current[0].refutation).toEqual(['e8', 'e7']);
    expect(result.current[0].wrongMove).toEqual(['a7', 'a6']);

    act(() => { vi.advanceTimersByTime(REFUTATION_READ_MS - 1); });
    expect(result.current[0].status).toBe('failed');
    expect(result.current[0].refutation).toEqual(['e8', 'e7']);

    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current[0].status).toBe('playing');
    expect(result.current[0].refutation).toBeUndefined();
    expect(events('puzzle_refutation').map(e => e.params.reason)).toEqual(['shown']);
  });

  it('waits for a slow engine up to the cap, then takes the move back with no arrow', async () => {
    engine.findBestReply.mockImplementation(() => new Promise(() => {}));
    const { result } = await loadAndMiss();
    act(() => { vi.advanceTimersByTime(REFUTATION_WAIT_MS - 1); });
    expect(result.current[0].status).toBe('failed');
    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current[0].status).toBe('playing');
    expect(result.current[0].refutation).toBeUndefined();
    expect(events('puzzle_refutation').map(e => e.params.reason)).toEqual(['timeout']);
  });

  it('with no reply, takes the move back after the usual hold', async () => {
    const { result } = await loadAndMiss();
    await flush();
    act(() => { vi.advanceTimersByTime(WRONG_MOVE_HOLD_MS - 1); });
    expect(result.current[0].status).toBe('failed');
    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current[0].status).toBe('playing');
    expect(events('puzzle_refutation').map(e => e.params.reason)).toEqual(['no_reply']);
  });

  it('a press on the board ends the hold at once, and a late answer draws nothing', async () => {
    let answer!: (uci: string | null) => void;
    engine.findBestReply.mockImplementation(() => new Promise(r => { answer = r; }));
    const { result } = await loadAndMiss();
    act(() => { result.current[1].dismissWrongMove(); });
    expect(result.current[0].status).toBe('playing');
    expect(result.current[0].wrongMove).toBeUndefined();
    expect(result.current[0].dests).toBeDefined();

    answer('e8e7');
    await flush();
    expect(result.current[0].refutation).toBeUndefined();
    expect(result.current[0].status).toBe('playing');
  });

  it('a late answer for an earlier wrong move never draws on the next one', async () => {
    const answers: Array<(uci: string | null) => void> = [];
    engine.findBestReply.mockImplementation(() => new Promise(r => { answers.push(r); }));
    const { result } = await loadAndMiss();
    act(() => { result.current[1].dismissWrongMove(); });
    act(() => { result.current[1].onMove('b7' as any, 'b6' as any); });
    expect(result.current[0].wrongMove).toEqual(['b7', 'b6']);
    expect(answers).toHaveLength(2);

    answers[0]('e8e7');
    await flush();
    expect(result.current[0].refutation).toBeUndefined();
    // Nor does it shorten the second move's hold: still waiting for its own answer.
    act(() => { vi.advanceTimersByTime(REFUTATION_READ_MS); });
    expect(result.current[0].status).toBe('failed');

    answers[1]('d8d7');
    await flush();
    expect(result.current[0].refutation).toEqual(['d8', 'd7']);
  });

  it('a new puzzle drops a pending answer', async () => {
    let answer!: (uci: string | null) => void;
    engine.findBestReply.mockImplementation(() => new Promise(r => { answer = r; }));
    const { result } = await loadAndMiss();
    act(() => {
      result.current[1].loadPuzzle(PUZZLE_B as any, { source: 'network', index: 2, isDaily: false });
      vi.advanceTimersByTime(1000);
    });
    answer('e8e7');
    await flush();
    expect(result.current[0].refutation).toBeUndefined();
    expect(result.current[0].wrongMove).toBeUndefined();
  });
});

/**
 * Resuming after a refresh (2026-08-08).
 *
 * The owner's rule is that an accidental reload must not throw the puzzle away,
 * and that a player who continues is still rated. These tests pin the board
 * coming back to the RIGHT position, since restoring the puzzle but resetting it
 * to the start would be its own bug — and each is written so that removing the
 * behaviour makes it fail.
 */
describe('usePuzzle — resuming after a refresh', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    vi.useFakeTimers();
    logSpy = vi.spyOn(analytics, 'logGA4Event').mockImplementation(() => {});
    engine.findBestReply.mockClear();
    engine.findBestReply.mockImplementation(() => Promise.resolve(null));
  });
  afterEach(() => {
    vi.useRealTimers();
    logSpy.mockRestore();
  });

  const events = (name: string) =>
    logSpy.mock.calls.map(c => c[0] as any).filter(e => e.name === name);

  // Replay the same puzzle normally so the expected mid-solve position is derived
  // rather than hard-coded from the implementation under test.
  const positionAfterSetupMove = () => {
    const { result } = renderHook(() => usePuzzle());
    act(() => {
      result.current[1].loadPuzzle(PUZZLE_A as any, { source: 'network', index: 1, isDaily: false });
      vi.advanceTimersByTime(1000);
    });
    return result.current[0].fen;
  };

  it('puts the board back at the position the player left, playable immediately', () => {
    const expected = positionAfterSetupMove();

    const { result } = renderHook(() => usePuzzle());
    let ok = false;
    act(() => { ok = result.current[1].resumePuzzle(PUZZLE_A as any, 1); });

    expect(ok).toBe(true);
    expect(result.current[0].fen).toBe(expected);
    expect(result.current[0].moveIndex).toBe(1);
    // No setup pause: a refresh must not look like the puzzle restarting.
    expect(result.current[0].status).toBe('playing');
    expect(result.current[0].movableColor).toBe(result.current[0].playerColor);
  });

  it('is not a new presentation, so it emits no board_ready', () => {
    const { result } = renderHook(() => usePuzzle());
    act(() => { result.current[1].resumePuzzle(PUZZLE_A as any, 1); });

    // Counting a resume would inflate the denominator of the first-move rate.
    expect(events('puzzle_board_ready')).toHaveLength(0);
  });

  it('keeps a wrong move already made, so a reload is not a clean first try', () => {
    const { result } = renderHook(() => usePuzzle());
    act(() => { result.current[1].resumePuzzle(PUZZLE_A as any, 1, { hasFailed: true }); });

    expect(result.current[0].hasFailed).toBe(true);
    expect(result.current[0].firstFailure).toBe(false);
  });

  it('refuses a position that does not match the replay', () => {
    const { result } = renderHook(() => usePuzzle());
    let ok = true;
    act(() => {
      ok = result.current[1].resumePuzzle(PUZZLE_A as any, 1, { expectedFen: 'not/the/position w - - 0 1' });
    });

    // A stored FEN is a claim, not the source of truth. Trusting it would let a
    // tampered entry put an arbitrary position on the board.
    expect(ok).toBe(false);
    expect(result.current[0].puzzle).toBeNull();
  });

  it('refuses an index outside the solution', () => {
    const { result } = renderHook(() => usePuzzle());
    act(() => {
      expect(result.current[1].resumePuzzle(PUZZLE_A as any, 0)).toBe(false);
      expect(result.current[1].resumePuzzle(PUZZLE_A as any, PUZZLE_A.moves.length)).toBe(false);
    });
  });

  it('leaves the resumed puzzle solvable', () => {
    const expected = positionAfterSetupMove();
    const { result } = renderHook(() => usePuzzle());
    act(() => { result.current[1].resumePuzzle(PUZZLE_A as any, 1); });
    expect(result.current[0].fen).toBe(expected);

    // The solution's next move is moves[1]; playing it must be accepted.
    const move = PUZZLE_A.moves[1];
    act(() => { result.current[1].onMove(move.slice(0, 2) as any, move.slice(2, 4) as any); });
    act(() => { vi.advanceTimersByTime(1000); });

    expect(result.current[0].status).toBe('correct');
  });
});
