import { describe, expect, it } from 'vitest';
import { analyzeFullGame } from './GameAnalysisService';
import title from './__fixtures__/brilliant379-title.json';

// #379 B1: the report's brilliant moves are exactly those a complete detection lists.
const g = (title as unknown as Array<{ moves: string[]; evals: number[]; bestMoves: string[]; mates: (number | null)[]; result: string; expected: Array<{ i: number; type: 1 | 2 }> }>)
  .find((x) => x.expected.length >= 2)!;
const result = g.result === '1-0' ? 'white' : g.result === '0-1' ? 'black' : 'draw';
const run = (d: Parameters<typeof analyzeFullGame>[5]) => analyzeFullGame(g.evals, g.bestMoves, g.mates, g.moves, result, d);
const brilliant = (a: ReturnType<typeof run>) => a.classifiedMoves.filter((m) => m.classification === 'brilliant');

describe('analyzeFullGame and the detection', () => {
  it('no detection, or a failed one: no brilliant move (the old detectors are gone)', () => {
    expect(brilliant(run(null))).toEqual([]);
    expect(brilliant(run({ status: 'failed', moves: [], critical: null, reason: 'x' }))).toEqual([]);
  });

  it('a complete detection marks its moves, with their type, and the counts follow', () => {
    const moves = g.expected.map((x) => ({ moveIndex: x.i, type: x.type }));
    const a = run({ status: 'complete', moves, critical: null });
    expect(brilliant(a).map((m) => [m.moveIndex, m.brilliantType])).toEqual(moves.map((m) => [m.moveIndex, m.type]));
    const white = moves.filter((m) => m.moveIndex % 2 === 0).length;
    expect(a.whiteCounts.brilliant).toBe(white);
    expect(a.blackCounts.brilliant).toBe(moves.length - white);
  });
});
