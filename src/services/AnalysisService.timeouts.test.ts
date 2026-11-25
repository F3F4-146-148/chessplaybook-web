/**
 * #379 with the engine hold of the game-puzzles work (E1-E3): a search that times out never lends its late answer to
 * the next one, a timed-out report position is searched again on a fresh hash, and the panel waits while the report
 * holds the engine.
 *
 * The engine is a fake: commands are recorded, and the test feeds the engine's lines through the service's own
 * output handler, so the routing under test is the real one.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnalysisService } from './AnalysisService';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Internals = any;

let svc: Internals;
let sent: string[];
const emit = (line: string) => svc.handleEngineOutput(line);
const gos = () => sent.filter((c) => c.startsWith('go '));

beforeEach(() => {
  vi.useFakeTimers();
  svc = AnalysisService.getInstance() as Internals;
  sent = [];
  svc.worker = { postMessage: (c: string) => sent.push(c) };
  svc.isInitialized = true;
  svc.isAnalyzing = false;
  svc.batchSearchMode = false;
  svc.batchSearchResolve = null;
  svc.engineHeld = false;
  svc.engineTail = Promise.resolve();
  svc.engineWaiters = 0;
  svc.abandonedSearches = 0;
  svc.pendingAnalysis = null;
  svc.interruptedSearch = null;
});
afterEach(() => {
  vi.useRealTimers();
  svc.worker = null;
});

describe('the report batch', () => {
  it('starts on a fresh hash and sends the game\'s moves', async () => {
    const run = svc.analyzeFullGameClientSide(['e2e4']);
    await vi.advanceTimersByTimeAsync(0);
    expect(sent).toContain('ucinewgame');
    expect(sent).toContain('position startpos');
    emit('info depth 16 score cp 30 pv e2e4');
    emit('bestmove e2e4');
    await vi.advanceTimersByTimeAsync(0);
    expect(sent).toContain('position startpos moves e2e4');
    emit('info depth 16 score cp -30 pv e7e5');
    emit('bestmove e7e5');
    expect((await run).evals).toEqual([30, 30]);
  });

  it('a timed-out position is searched again on a fresh hash; its late answer is never used', async () => {
    const run = svc.analyzeFullGameClientSide(['e2e4']);
    await vi.advanceTimersByTimeAsync(0);
    expect(gos()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(10_000); // the first search never answers in time
    expect(sent).toContain('stop');
    expect(gos()).toHaveLength(2); // searched again at once
    expect(sent.lastIndexOf('ucinewgame')).toBeGreaterThan(sent.indexOf('stop'));
    // The first search's late answer arrives, with a score that must not be used anywhere.
    emit('info depth 9 score cp 777 pv e2e4');
    emit('bestmove e2e4');
    await vi.advanceTimersByTimeAsync(0);
    expect(gos()).toHaveLength(2);
    // The retry answers.
    emit('info depth 16 score cp 41 pv e2e4');
    emit('bestmove e2e4');
    await vi.advanceTimersByTimeAsync(0);
    expect(gos()).toHaveLength(3);
    emit('info depth 16 score cp -30 pv e7e5');
    emit('bestmove e7e5');
    const r = await run;
    expect(r.bestMoves).toEqual(['e2e4', 'e7e5']);
    expect(r.evals).toEqual([41, 30]); // Black to move: -30 for the side to move is +30 for White
  });

  it('a position that times out twice is marked by an empty best move, and the batch goes on', async () => {
    const run = svc.analyzeFullGameClientSide([]);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(gos()).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(20_000);
    const r = await run;
    expect(r.bestMoves).toEqual(['']);
    expect(r.evals).toEqual([0]);
  });
});

describe('an engine session', () => {
  it('takes a position as the game\'s moves', async () => {
    const run = svc.runEngineSession(async (search: (p: string, k: number, d: number) => Promise<string[] | null>) => {
      const lines = search('startpos moves e2e4 e7e5', 2, 16);
      await vi.advanceTimersByTimeAsync(0);
      emit('info depth 16 multipv 1 score cp 30 pv g1f3');
      emit('bestmove g1f3');
      return lines;
    }, 10_000);
    expect(await run).toEqual(['info depth 16 multipv 1 score cp 30 pv g1f3', 'bestmove g1f3']);
    expect(sent).toContain('position startpos moves e2e4 e7e5');
  });

  it('a search given up on answers null, and its late answer does not end the next search', async () => {
    const run = svc.runEngineSession(async (search: (p: string, k: number, d: number) => Promise<string[] | null>) => {
      const first = search('8/8/8/8/8/8/8/K6k w - - 0 1', 2, 16);
      await vi.advanceTimersByTimeAsync(11_500); // the timeout, then the grace with no bestmove
      const a = await first;
      const second = search('8/8/8/8/8/8/8/K6k w - - 0 1', 2, 16);
      await vi.advanceTimersByTimeAsync(0);
      emit('bestmove a1a2'); // the first search's late answer
      emit('info depth 16 multipv 1 score cp 0 pv a1b1');
      emit('bestmove a1b1');
      return { a, b: await second };
    }, 10_000);
    const r = await run;
    expect(r.a).toBeNull();
    expect(r.b).toEqual(['info depth 16 multipv 1 score cp 0 pv a1b1', 'bestmove a1b1']);
  });
});

describe('the engine is held while the report uses it', () => {
  it('a panel request during the batch waits, and starts when the batch ends', async () => {
    svc.isEnabled = true;
    const run = svc.analyzeFullGameClientSide([]);
    await vi.advanceTimersByTimeAsync(0);
    expect(gos()).toHaveLength(1);
    void svc.analyzePosition('8/8/8/8/8/8/8/K6k w - - 0 1');
    await vi.advanceTimersByTimeAsync(500); // the panel's debounce fires mid-search
    expect(gos()).toHaveLength(1);
    emit('info depth 16 score cp 30 pv e2e4');
    emit('bestmove e2e4');
    const r = await run;
    expect(r.bestMoves).toEqual(['e2e4']);
    expect(gos()).toEqual(['go depth 16', 'go depth 15']);
    expect(sent).toContain('position fen 8/8/8/8/8/8/8/K6k w - - 0 1');
    svc.isAnalyzing = false;
    clearTimeout(svc.analysisTimeoutTimer);
  });
});
