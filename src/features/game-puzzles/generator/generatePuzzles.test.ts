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

/** The scripted engine, except that one search (a position at one MultiPV) times out. */
function timingOut(fen: string, multiPv: number): PuzzleEngine {
  const base = scriptedEngine();
  return {
    async analyse(f, k, depth) {
      return f === fen && k === multiPv ? null : base.analyse(f, k, depth);
    },
  };
}

test('a confirming search that times out drops that puzzle only (owner, PR #304)', async () => {
  const r = await generatePuzzles([{ pgn: GAME }], {}, timingOut(FENS[6], 5));
  assert.deepEqual(r.puzzles.map((p) => p.kind), ['missed']);
  assert.equal(r.report[0].dropped.timeout, 1);
});

test('a first-pass search that times out: no candidate is read across that position', async () => {
  // White +9 everywhere (given, as the Game report gives it), except the position before
  // 3...Nf6, which must be searched and times out. Read as level, it would make 3.Qh5 look
  // like a nine-pawn blunder.
  const evals: Array<PositionEval | null> = Array.from({ length: SANS.length + 1 }, () => ({ cp: 900, mate: null }));
  evals[5] = null;
  const r = await generatePuzzles([{ pgn: GAME, evals }], {}, timingOut(FENS[5], 1));
  assert.equal(r.report[0].positionsSearched, 1);
  assert.equal(r.report[0].candidates, 0);
  assert.equal(r.puzzles.length, 0);
  assert.equal(r.report[0].dropped.timeout, 1);
});

test('color and players filters keep only the solver asked for', async () => {
  const white = await generatePuzzles([{ pgn: GAME }], { color: 'white' }, scriptedEngine());
  assert.deepEqual(white.puzzles.map((p) => p.solver), ['white']);
  const bob = await generatePuzzles([{ pgn: GAME }], { players: ['bob'] }, scriptedEngine());
  assert.deepEqual(bob.puzzles.map((p) => p.solver), ['black']);
  const nobody = await generatePuzzles([{ pgn: GAME }], { players: ['carol'] }, scriptedEngine());
  assert.equal(nobody.puzzles.length, 0);
});

test("perspective: the player's own blunder is never a puzzle for the opponent; the opponent missing it is", async () => {
  // White's 3.Qh5 loses on these evals (Black to move could punish), then Black's 3...Nf6 lets White mate.
  const evals: Array<PositionEval | null> = Array.from({ length: SANS.length + 1 }, () => ({ cp: 0, mate: null }));
  evals[5] = { cp: -500, mate: null };
  evals[6] = { cp: null, mate: 1 };
  evals[7] = { cp: null, mate: 0 };
  const kinds = (r: { puzzles: Array<{ kind: string; solver: string }> }) => r.puzzles.map((p) => `${p.kind}:${p.solver}`).sort();
  const free = await generatePuzzles([{ pgn: GAME, evals }], {}, scriptedEngine());
  assert.ok(!kinds(free).includes('missed:black'), 'without it, the position after 3.Qh5 is the punish');
  const asWhite = await generatePuzzles([{ pgn: GAME, evals }], { perspective: 'white' }, scriptedEngine());
  assert.deepEqual(kinds(asWhite), ['missed:black', 'punish:white']);
  const asBlack = await generatePuzzles([{ pgn: GAME, evals }], { perspective: 'black' }, scriptedEngine());
  assert.ok(asBlack.puzzles.every((p) => !(p.kind === 'punish' && p.solver === 'white')), JSON.stringify(kinds(asBlack)));
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

test('a forced mate longer than two moves is played to the mate (V7, #510)', async () => {
  // Scripted: after 3...Nf6, d3 "mates in 3" (d3 a6, Nf3 a5, Qxf7#). V6 stopped such a line after two moves.
  const f = fensBefore(['e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6', 'd3', 'a6', 'Nf3', 'a5', 'Qxf7#']);
  const mateIn3 = {
    [FENS[6]]: [line('d2d3', null, 3, ['a7a6']), line('c4f7', 300), line('h5e5', 100), line('a2a3', 0), line('b1c3', 0)],
    [f[8]]: [line('g1f3', null, 2, ['a6a5']), line('a2a3', 300), line('b1c3', 100), line('h2h3', 0), line('c1d2', 0)],
    [f[10]]: [line('h5f7', null, 1), line('a2a3', 300), line('b1c3', 100), line('h2h3', 0), line('c1d2', 0)],
  };
  const r = await generatePuzzles([{ pgn: GAME }], {}, scriptedEngine(mateIn3));
  const punish = r.puzzles.find((p) => p.kind === 'punish')!;
  assert.ok(punish, 'punish puzzle');
  assert.equal(punish.goal, 'mate');
  assert.equal(punish.mateIn, 3);
  assert.deepEqual(punish.moves, ['g8f6', 'd2d3', 'a7a6', 'g1f3', 'a6a5', 'h5f7']);

  const v6 = await generatePuzzles([{ pgn: GAME }], { thresholds: { maxMateMoves: 2 } }, scriptedEngine(mateIn3));
  assert.notEqual(v6.puzzles.find((p) => p.kind === 'punish')?.goal, 'mate');
});

test('a material line goes on while the next move is again the one clear answer (#510)', async () => {
  // White already +8 before 3...Nf6. After it, d3 keeps +17 (a7a6 reply), then Nf3 is again the only
  // good move (a6a5), then everything is level with everything: the line stops there.
  const f = fensBefore(['e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6', 'd3', 'a6', 'Nf3', 'a5']);
  const decided = {
    [FENS[5]]: [line('g7g6', -800), line('d8e7', -820), line('d8f6', -850), line('g8h6', -870), line('a7a6', -900)],
    [FENS[6]]: [line('d2d3', 1700, null, ['a7a6']), line('c4f7', 1300), line('h5e5', 1200), line('a2a3', 1100), line('b1c3', 1000)],
    [f[8]]: [line('g1f3', 1700, null, ['a6a5']), line('a2a3', 1300), line('b1c3', 1200), line('h2h3', 1100), line('c1d2', 1000)],
    [f[10]]: [line('a2a3', 1700), line('b1c3', 1690), line('h2h3', 1680), line('c1d2', 1670), line('e1g1', 1660)],
  };
  const r = await generatePuzzles([{ pgn: GAME }], {}, scriptedEngine(decided));
  const punish = r.puzzles.find((p) => p.kind === 'punish')!;
  assert.equal(punish.goal, 'material');
  assert.deepEqual(punish.moves, ['g8f6', 'd2d3', 'a7a6', 'g1f3']);
  assert.deepEqual(punish.acceptedMoves, [['d2d3'], ['g1f3']]);
  assert.equal(punish.reply, 'a6a5', "the engine reply to the last solver move, for the server's material count");
});

test('a material line is cut back to its last solver move that is not behind (#510)', async () => {
  // Scripted: Bxf7+ Ke7 Qxe5+ Nxe5 d3. After d3 White has lost the queen for two pawns, so the
  // server would refuse the puzzle (and with it the whole game's save): the line ends after Qxe5+.
  const f = fensBefore(['e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6', 'Bxf7+', 'Ke7', 'Qxe5+', 'Nxe5', 'd3']);
  const decided = {
    [FENS[5]]: [line('g7g6', -800), line('d8e7', -820), line('d8f6', -850), line('g8h6', -870), line('a7a6', -900)],
    [FENS[6]]: [line('c4f7', 1700, null, ['e8e7']), line('h5e5', 1300), line('d2d3', 1200), line('a2a3', 1100), line('b1c3', 1000)],
    [f[8]]: [line('h5e5', 1700, null, ['c6e5']), line('a2a3', 1300), line('b1c3', 1200), line('h2h3', 1100), line('c1d2', 1000)],
    [f[10]]: [line('d2d3', 1700), line('a2a3', 1300), line('b1c3', 1200), line('h2h3', 1100), line('c1d2', 1000)],
  };
  const r = await generatePuzzles([{ pgn: GAME }], {}, scriptedEngine(decided));
  const punish = r.puzzles.find((p) => p.kind === 'punish')!;
  assert.equal(punish.goal, 'material');
  assert.deepEqual(punish.moves, ['g8f6', 'c4f7', 'e8e7', 'h5e5']);
  assert.deepEqual(punish.acceptedMoves, [['c4f7'], ['h5e5']]);
  assert.equal(punish.reply, 'c6e5');
});

test('a line ends when a position comes back (#510)', async () => {
  // Scripted shuffle: Qg4 Ng8 Qh5 Nf6 would repeat the puzzle's position for ever.
  const f = fensBefore(['e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6', 'Qg4', 'Ng8', 'Qh5', 'Nf6', 'Qg4']);
  const shuffle = {
    [FENS[5]]: [line('g7g6', -800), line('d8e7', -820), line('d8f6', -850), line('g8h6', -870), line('a7a6', -900)],
    [FENS[6]]: [line('h5g4', 1700, null, ['f6g8']), line('c4f7', 1300), line('h5e5', 1200), line('a2a3', 1100), line('b1c3', 1000)],
    [f[8]]: [line('g4h5', 1700, null, ['g8f6']), line('a2a3', 1300), line('b1c3', 1200), line('h2h3', 1100), line('c1d2', 1000)],
  };
  shuffle[f[10]] = shuffle[FENS[6]]; // the same position again, only the move counters differ
  const r = await generatePuzzles([{ pgn: GAME }], {}, scriptedEngine(shuffle));
  const punish = r.puzzles.find((p) => p.kind === 'punish')!;
  assert.deepEqual(punish.moves, ['g8f6', 'h5g4', 'f6g8', 'g4h5']);
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
