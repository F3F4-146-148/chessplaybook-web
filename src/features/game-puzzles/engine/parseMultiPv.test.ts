import { describe, expect, it, vi } from 'vitest';
import { parseMultiPv } from './parseMultiPv';

vi.mock('@/services/AnalysisService', () => ({ analysisService: {} }));
const { evalsFromGameReport } = await import('./browserEngine');

describe('parseMultiPv', () => {
  it('keeps the last complete report per line, best first', () => {
    const out = parseMultiPv([
      'info depth 15 seldepth 18 multipv 1 score cp 40 nodes 1 pv e2e4 e7e5',
      'info depth 15 seldepth 18 multipv 2 score cp 20 nodes 1 pv d2d4 d7d5',
      'info depth 16 seldepth 19 multipv 2 score cp 25 nodes 2 pv d2d4 g8f6',
      'info depth 16 seldepth 19 multipv 1 score cp 35 nodes 2 pv e2e4 c7c5 g1f3',
      'bestmove e2e4 ponder c7c5',
    ]);
    expect(out).toEqual([
      { uci: 'e2e4', cp: 35, mate: null, pv: ['e2e4', 'c7c5', 'g1f3'] },
      { uci: 'd2d4', cp: 25, mate: null, pv: ['d2d4', 'g8f6'] },
    ]);
  });

  it('reads mates, skips bound scores and reports without a line', () => {
    const out = parseMultiPv([
      'info depth 9 multipv 1 score mate 2 nodes 1 pv d1h5 g7g6 h5f7',
      'info depth 10 multipv 1 score cp 900 lowerbound nodes 2 pv d1h5',
      'info depth 10 multipv 2 score mate -1 nodes 2 pv a2a3 d8h4',
      'info depth 10 currmove e2e4 currmovenumber 1',
      'info string NNUE evaluation using nn-xxxx.nnue enabled',
    ]);
    expect(out).toEqual([
      { uci: 'd1h5', cp: null, mate: 2, pv: ['d1h5', 'g7g6', 'h5f7'] },
      { uci: 'a2a3', cp: null, mate: -1, pv: ['a2a3', 'd8h4'] },
    ]);
  });

  it('a report without a multipv field is line 1; no legal move gives nothing', () => {
    expect(parseMultiPv(['info depth 5 score cp -12 nodes 9 pv g8f6'])[0].uci).toBe('g8f6');
    expect(parseMultiPv(['info depth 0 score mate 0', 'bestmove (none)'])).toEqual([]);
  });
});

describe('evalsFromGameReport', () => {
  it('converts the report arrays, White point of view', () => {
    expect(evalsFromGameReport({
      evals: [20, 0, -10000, 10000, 10000],
      bestMoves: ['e2e4', '', 'a7a6', '(none)', 'h5f7'],
      mateIn: [null, null, -3, 0, 1],
    })).toEqual([
      { cp: 20, mate: null },
      null, // timed out: eval 0, no best move
      { cp: null, mate: -3 },
      { cp: null, mate: 1 }, // mate 0: the sign comes from evalCp
      { cp: null, mate: 1 },
    ]);
  });

  it('a real level position with a best move stays level', () => {
    expect(evalsFromGameReport({ evals: [0], bestMoves: ['g1f3'], mateIn: [null] })).toEqual([{ cp: 0, mate: null }]);
  });
});
