/**
 * Tests for the game-puzzle generator, with a scripted engine.
 *
 * The game: 1.e4 e5 2.Bc4 Nc6 3.Qh5 Nf6?? 4.Qxf7#. Black's 3...Nf6 lets White
 * mate, so the generator must find two moments: White to punish it (mate in 1),
 * and Black missing the defence.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { Chess } from 'chessops/chess';
import { parseSan } from 'chessops/san';
import { makeFen } from 'chessops/fen';
import { generatePuzzles, isBulletTimeControl, cpToWin, phaseOf, gameHash } from './generatePuzzles';
import type { EngineLine, PositionEval, PuzzleEngine } from './types';

const SANS = ['e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6', 'Qxf7#'];

function fensBefore(sans: string[]): string[] {
  const pos = Chess.default();
  const out: string[] = [];
  for (const s of sans) {
    out.push(makeFen(pos.toSetup()));
    pos.play(parseSan(pos, s)!);
  }
  return out;
}
const FENS = fensBefore(SANS);

const pgn = (moves: string, tags: Record<string, string> = {}) => {
  const all = { Event: 'Test', White: 'Alice', Black: 'Bob', Result: '1-0', TimeControl: '600+0', ...tags };
  return Object.entries(all).map(([k, v]) => `[${k} "${v}"]`).join('\n') + '\n\n' + moves + '\n';
};
const GAME = pgn('1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0');

const line = (uci: string, cp: number | null, mate: number | null = null, rest: string[] = []): EngineLine =>
  ({ uci, cp, mate, pv: [uci, ...rest] });

/** Equal lines everywhere, except the two positions the test is about. */
function scriptedEngine(overrides: Record<string, EngineLine[]> = {}): PuzzleEngine & { calls: number; passCalls: number } {
  const table: Record<string, EngineLine[]> = {
    // After 3...Nf6: White mates in 1.
    [FENS[6]]: [line('h5f7', null, 1), line('c4f7', 300), line('h5e5', 100), line('d2d3', 0), line('g1f3', 0)],
    // Before 3...Nf6: Black can defend with g6 or Qe7.
    [FENS[5]]: [
      line('g7g6', 0, null, ['h5f3']), line('d8e7', -10), line('d8f6', -300), line('g8h6', -350), line('a7a6', -400),
    ],
    ...overrides,
  };
  const eng = {
    calls: 0,
    passCalls: 0,
    async analyse(fen: string, multiPv: number): Promise<EngineLine[]> {
      eng.calls++;
      if (multiPv === 1) eng.passCalls++;
      const lines = table[fen] ?? Array.from({ length: 5 }, (_, k) => line(`a${k}a${k}`, 0));
      return lines.slice(0, multiPv);
    },
  };
  return eng;
}

test('finds the punish (mate in 1) and the missed defence', async () => {
  const { puzzles, report } = await generatePuzzles([{ pgn: GAME }], {}, scriptedEngine());
  assert.equal(report[0].status, 'used');
  const punish = puzzles.find((p) => p.kind === 'punish')!;
  assert.ok(punish, 'punish puzzle');
  assert.equal(punish.solver, 'white');
  assert.equal(punish.goal, 'mate');
  assert.equal(punish.mateIn, 1);
  assert.deepEqual(punish.moves, ['g8f6', 'h5f7']);
  assert.deepEqual(punish.acceptedMoves, [['h5f7']]);
  assert.equal(punish.fen, FENS[5]);
  assert.equal(punish.piece, 'queen');
  assert.equal(punish.foundInGame, true);

  const missed = puzzles.find((p) => p.kind === 'missed')!;
  assert.ok(missed, 'missed puzzle');
  assert.equal(missed.solver, 'black');
  assert.equal(missed.goal, 'save');
  assert.deepEqual(missed.moves, ['d1h5', 'g7g6']);
  assert.deepEqual(missed.acceptedMoves, [['g7g6', 'd8e7']]);
  assert.equal(missed.playedMove, 'g8f6');
  assert.equal(missed.piece, 'pawn');
  assert.equal(puzzles.length, 2);
});

test('color and players filters keep only the solver asked for', async () => {
  const white = await generatePuzzles([{ pgn: GAME }], { color: 'white' }, scriptedEngine());
  assert.deepEqual(white.puzzles.map((p) => p.solver), ['white']);
  const bob = await generatePuzzles([{ pgn: GAME }], { players: ['bob'] }, scriptedEngine());
  assert.deepEqual(bob.puzzles.map((p) => p.solver), ['black']);
  const nobody = await generatePuzzles([{ pgn: GAME }], { players: ['carol'] }, scriptedEngine());
  assert.equal(nobody.puzzles.length, 0);
});

test('piece filter', async () => {
  const r = await generatePuzzles([{ pgn: GAME }], { piece: 'queen' }, scriptedEngine());
  assert.deepEqual(r.puzzles.map((p) => p.piece), ['queen']);
  assert.equal(r.report[0].dropped['piece-filter'], 1);
});

test('a position with too many good answers is not a puzzle', async () => {
  const many = [line('g7g6', 0), line('d8e7', -5), line('d8f6', -8), line('g8h6', -10), line('a7a6', -12)];
  const r = await generatePuzzles([{ pgn: GAME }], {}, scriptedEngine({ [FENS[5]]: many }));
  assert.equal(r.puzzles.filter((p) => p.kind === 'missed').length, 0);
  assert.equal(r.report[0].dropped['too-many-answers'], 1);
});

test('per-game cap keeps the best puzzle (the mate over the save)', async () => {
  const r = await generatePuzzles([{ pgn: GAME }], { thresholds: { maxPuzzlesPerGame: 1 } }, scriptedEngine());
  assert.deepEqual(r.puzzles.map((p) => p.goal), ['mate']);
  assert.equal(r.report[0].dropped['per-game-cap'], 1);
});

test('a material blunder in a decided position is a candidate, and a material puzzle', async () => {
  // White already winning (+8) before 3...Nf6; after it +17. Win% hardly moves (5 -> 2.5 for
  // Black), so only the centipawn test makes it a candidate.
  const decided = {
    [FENS[5]]: [line('g7g6', -800), line('d8e7', -820), line('d8f6', -850), line('g8h6', -870), line('a7a6', -900)],
    [FENS[6]]: [line('h5f7', 1700), line('c4f7', 1300), line('h5e5', 1200), line('d2d3', 1100), line('g1f3', 1000)],
  };
  const r = await generatePuzzles([{ pgn: GAME }], {}, scriptedEngine(decided));
  const punish = r.puzzles.find((p) => p.kind === 'punish');
  assert.ok(punish, 'material punish puzzle');
  assert.equal(punish.goal, 'material');
  assert.deepEqual(punish.moves, ['g8f6', 'h5f7']);
  assert.deepEqual(punish.acceptedMoves, [['h5f7']]);
  // Black's five moves are all within a pawn of each other: nothing to find.
  assert.equal(r.puzzles.filter((p) => p.kind === 'missed').length, 0);
  assert.equal(r.report[0].dropped['too-many-answers'], 1);

  const off = await generatePuzzles([{ pgn: GAME }], { thresholds: { candidateCpLoss: 0 } }, scriptedEngine(decided));
  assert.equal(off.puzzles.length, 0, 'win% alone does not see it');
  assert.equal(off.report[0].candidates, 0);
});

test('a material puzzle needs the next move to cost a clear amount', async () => {
  const close = {
    [FENS[5]]: [line('g7g6', -800), line('d8e7', -820), line('d8f6', -850), line('g8h6', -870), line('a7a6', -900)],
    [FENS[6]]: [line('h5f7', 1700), line('c4f7', 1550), line('h5e5', 1200), line('d2d3', 1100), line('g1f3', 1000)],
  };
  const r = await generatePuzzles([{ pgn: GAME }], {}, scriptedEngine(close));
  assert.equal(r.puzzles.length, 0);
  assert.equal(r.report[0].dropped['no-change'], 1);
});

test('unclear is judged against the best move too', async () => {
  // Black to save: g6 keeps 68%, the next move 42%. 42 is within minGap of the save
  // threshold (45), but 26 points under the best: a clear answer.
  const save = { [FENS[5]]: [line('g7g6', 200), line('d8e7', -90), line('d8f6', -300), line('g8h6', -350), line('a7a6', -400)] };
  const r = await generatePuzzles([{ pgn: GAME }], {}, scriptedEngine(save));
  const missed = r.puzzles.find((p) => p.kind === 'missed');
  assert.ok(missed, 'save puzzle kept');
  assert.equal(missed.goal, 'save');
  assert.deepEqual(missed.acceptedMoves, [['g7g6']]);

  const old = await generatePuzzles([{ pgn: GAME }], { thresholds: { clearGapFromBest: 100 } }, scriptedEngine(save));
  assert.equal(old.puzzles.filter((p) => p.kind === 'missed').length, 0);
  assert.equal(old.report[0].dropped['unclear-best'], 1);
});

test('the same idea for the same side is kept once', async () => {
  // 3...a6 and 4...Nf6 both leave Qxf7# for White, two plies apart: one lesson.
  const sans = ['e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'a6', 'd3', 'Nf6', 'Qxf7#'];
  const f = fensBefore(sans);
  const mate = [line('h5f7', null, 1), line('c4f7', 300), line('h5e5', 100), line('g1f3', 0), line('b1c3', 0)];
  const game = pgn('1. e4 e5 2. Bc4 Nc6 3. Qh5 a6 4. d3 Nf6 5. Qxf7# 1-0');
  const r = await generatePuzzles([{ pgn: game }], {}, scriptedEngine({ [f[6]]: mate, [f[8]]: mate }));
  const white = r.puzzles.filter((p) => p.solver === 'white');
  assert.equal(white.length, 1);
  assert.equal(r.report[0].dropped['same-idea'], 1);

  const both = await generatePuzzles([{ pgn: game }], { thresholds: { sameIdeaPlies: 0 } }, scriptedEngine({ [f[6]]: mate, [f[8]]: mate }));
  assert.equal(both.puzzles.filter((p) => p.solver === 'white').length, 2);
});

test('a given first pass replaces the search and gives the same puzzles', async () => {
  // The Game report's evals, White's point of view, for every position (8 = 7 plies + 1).
  const toWhite = (fen: string, l: EngineLine): PositionEval => {
    const sign = fen.split(' ')[1] === 'w' ? 1 : -1;
    return l.mate !== null ? { cp: null, mate: sign * l.mate } : { cp: sign * (l.cp ?? 0), mate: null };
  };
  const plain = scriptedEngine();
  const without = await generatePuzzles([{ pgn: GAME }], {}, plain);
  const probe = scriptedEngine();
  const evals: Array<PositionEval | null> = [];
  for (const fen of FENS) evals.push(toWhite(fen, (await probe.analyse(fen, 1, 12))[0]));
  evals.push(null); // after Qxf7#: checkmate, taken from the board, never searched

  const eng = scriptedEngine();
  const withEvals = await generatePuzzles([{ pgn: GAME, evals }], {}, eng);
  assert.deepEqual(withEvals.puzzles, without.puzzles);
  assert.equal(eng.passCalls, 0, 'no first-pass search');
  assert.equal(withEvals.report[0].positionsFromEvals, 7);
  assert.ok(plain.passCalls > 0);

  // A null entry (a search that timed out) is searched; a wrong length is ignored.
  const holes = scriptedEngine();
  await generatePuzzles([{ pgn: GAME, evals: evals.map((e, i) => (i === 2 ? null : e)) }], {}, holes);
  assert.equal(holes.passCalls, 1);
  const short = scriptedEngine();
  await generatePuzzles([{ pgn: GAME, evals: evals.slice(1) }], {}, short);
  assert.equal(short.passCalls, plain.passCalls);
});

test('game hash: stable, and different for a different game', () => {
  const h = new Map([['White', 'A'], ['Black', 'B']]);
  assert.match(gameHash(h, ['e4', 'e5']), /^[0-9a-f]{16}$/);
  assert.equal(gameHash(h, ['e4', 'e5']), gameHash(new Map([['Black', 'B'], ['White', 'A']]), ['e4', 'e5']));
  assert.notEqual(gameHash(h, ['e4', 'e5']), gameHash(h, ['e4', 'c5']));
});

test('level 1: games that do not qualify are skipped before any engine work', async () => {
  const eng = scriptedEngine();
  const r = await generatePuzzles([
    { pgn: pgn('1. e4 e5 2. Qh5 1-0') },
    { pgn: pgn('1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0', { TimeControl: '60+0' }) },
    { pgn: pgn('1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0', { Variant: 'Chess960' }) },
    { pgn: pgn('1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 *', { Result: '*' }) },
  ], {}, eng);
  assert.deepEqual(r.report.map((g) => g.skipReason), ['too-short', 'bullet', 'not-standard', 'no-result']);
  assert.equal(eng.calls, 0);
});

test('helpers', () => {
  assert.equal(isBulletTimeControl('60+0'), true);
  assert.equal(isBulletTimeControl('120+1'), true); // 120 + 40 = 160 < 180: bullet on Lichess
  assert.equal(isBulletTimeControl('180+0'), false);
  assert.equal(isBulletTimeControl('600+0'), false);
  assert.equal(isBulletTimeControl(undefined), false);
  assert.equal(Math.round(cpToWin(0)), 50);
  assert.ok(cpToWin(300) > 74 && cpToWin(300) < 76);
  assert.deepEqual([phaseOf(12), phaseOf(13), phaseOf(35), phaseOf(36)], ['opening', 'middlegame', 'middlegame', 'endgame']);
});
