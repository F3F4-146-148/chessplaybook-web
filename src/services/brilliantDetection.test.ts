import { describe, expect, it } from 'vitest';
import { analyzeFullGame } from './GameAnalysisService';
import { detectBrilliantMoves, readTwoLines, type DetectionDeps, type DetectionInput } from './brilliantDetection';
import title from './__fixtures__/brilliant379-title.json';
import amateur from './__fixtures__/brilliant379-amateur.json';

interface FixtureGame {
  id: number; result: string; moves: string[]; evals: number[]; bestMoves: string[]; mates: (number | null)[];
  maia: (number | null)[]; second: ([number, number, number] | null)[];
  expected: Array<{ i: number; type: 1 | 2 }>; criticalMoves: number[]; critical: number | null;
}

function inputOf(g: FixtureGame): DetectionInput {
  const result = g.result === '1-0' ? 'white' : g.result === '0-1' ? 'black' : 'draw';
  const classified = analyzeFullGame(g.evals, g.bestMoves, g.mates, g.moves, result, null).classifiedMoves;
  return { moves: g.moves, evals: g.evals, bestMoves: g.bestMoves, classified };
}

/** Maia and the engine answering from the fixture, as the reference measured them; the engine's lines are real UCI. */
function fixtureDeps(g: FixtureGame, calls = { maia: 0, search: 0 }): DetectionDeps {
  const index = new Map<string, number>(g.moves.map((_, i) => [i === 0 ? 'startpos' : `startpos moves ${g.moves.slice(0, i).join(' ')}`, i]));
  return {
    async maia(moves) {
      calls.maia++;
      const i = moves.length;
      return [{ uci: '(other)', p: 0.5 }, { uci: g.moves[i], p: g.maia[i] ?? 0 }];
    },
    async search(position) {
      calls.search++;
      const i = index.get(position)!;
      const s = g.second[i];
      const flip = i % 2 === 0 ? 1 : -1;
      if (!s) return ['bestmove ' + g.moves[i]];
      const first = s[2] ? g.moves[i] : 'a1a1';
      return [
        `info depth 16 seldepth 20 multipv 1 score cp ${s[0] * flip} nodes 1 pv ${first} a2a3`,
        `info depth 16 seldepth 20 multipv 2 score cp ${s[1] * flip} nodes 1 pv h2h3 a2a3`,
        `bestmove ${first}`,
      ];
    },
  };
}

describe('detectBrilliantMoves', () => {
  it('gives the reference answer on every fixture game, through real UCI lines', async () => {
    let maiaCalls = 0, searches = 0;
    for (const g of [...title, ...amateur] as unknown as FixtureGame[]) {
      const calls = { maia: 0, search: 0 };
      const d = await detectBrilliantMoves(inputOf(g), fixtureDeps(g, calls), 60_000);
      expect(d.status).toBe('complete');
      if (d.status !== 'complete') continue;
      expect({ id: g.id, moves: d.moves.map((x) => [x.moveIndex, x.type]), critical: d.critical })
        .toEqual({ id: g.id, moves: g.expected.map((x) => [x.i, x.type]), critical: g.critical });
      maiaCalls += calls.maia;
      searches += calls.search;
    }
    // Maia and the search only where needed (analysis §8: 48 + 40 board candidates and 21 critical in the title games).
    expect(maiaCalls).toBeLessThan(300);
    expect(searches).toBeLessThan(150);
  }, 240_000);

  it('does not ask Maia anything in a game with no candidate', async () => {
    const quiet = (title as unknown as FixtureGame[]).find((g) => g.critical == null && g.expected.length === 0)!;
    const calls = { maia: 0, search: 0 };
    const g = { ...quiet, moves: quiet.moves.slice(0, 9), evals: quiet.evals.slice(0, 10), bestMoves: quiet.bestMoves.slice(0, 10), mates: quiet.mates.slice(0, 10) };
    const d = await detectBrilliantMoves(inputOf(g), fixtureDeps(g, calls));
    expect(d).toEqual({ status: 'complete', moves: [], critical: null });
    expect(calls).toEqual({ maia: 0, search: 0 });
  });
});

describe('a failed detection, never a guess', () => {
  const g = (title as unknown as FixtureGame[]).find((x) => x.critical != null)!;

  it('a timed-out position in the batch', async () => {
    const input = inputOf(g);
    input.bestMoves = [...input.bestMoves];
    input.bestMoves[5] = '';
    expect((await detectBrilliantMoves(input, fixtureDeps(g))).status).toBe('failed');
  });
  it('Maia fails', async () => {
    const deps = { ...fixtureDeps(g), maia: async () => { throw new Error('network'); } };
    expect(await detectBrilliantMoves(inputOf(g), deps)).toMatchObject({ status: 'failed', reason: 'network' });
  });
  it('the search does not finish, or stops short of depth 16', async () => {
    const real = fixtureDeps(g);
    const noBestmove = { ...real, search: async (fen: string) => (await real.search(fen)).filter((l) => !l.startsWith('bestmove')) };
    expect((await detectBrilliantMoves(inputOf(g), noBestmove)).status).toBe('failed');
    const shallow = { ...real, search: async (fen: string) => (await real.search(fen)).map((l) => l.replace('depth 16', 'depth 12')) };
    expect((await detectBrilliantMoves(inputOf(g), shallow)).status).toBe('failed');
  });
  it('the budget passes, and no search starts after it', async () => {
    let afterBudget = 0;
    let over = false;
    const real = fixtureDeps(g);
    const slow: DetectionDeps = {
      maia: async (m) => { await new Promise((r) => setTimeout(r, 30)); if (over) afterBudget++; return real.maia(m); },
      search: async (f) => { if (over) afterBudget++; return real.search(f); },
    };
    const d = await detectBrilliantMoves(inputOf(g), slow, 50);
    over = true;
    expect(d).toMatchObject({ status: 'failed', reason: 'over budget' });
    await new Promise((r) => setTimeout(r, 200));
    expect(afterBudget).toBeLessThanOrEqual(1); // at most the call already in flight
  });
});

describe('readTwoLines', () => {
  it('turns side-to-move scores into White\'s, mate as 10000', () => {
    const raw = [
      'info depth 16 multipv 1 score mate 3 pv e7e5',
      'info depth 16 multipv 2 score cp 40 pv d7d5',
      'bestmove e7e5',
    ];
    expect(readTwoLines(raw, false)).toEqual([{ move: 'e7e5', cp: -10000 }, { move: 'd7d5', cp: -40 }]);
  });
  it('one legal move is a complete answer; bound scores are skipped', () => {
    const raw = ['info depth 16 multipv 1 score cp 10 lowerbound pv a1a2', 'info depth 16 multipv 1 score cp 5 pv a1b1', 'bestmove a1b1'];
    expect(readTwoLines(raw, true)).toEqual([{ move: 'a1b1', cp: 5 }]);
  });
});
