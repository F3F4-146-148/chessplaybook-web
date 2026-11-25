/**
 * Puzzles from games: the generator (spec section 13).
 *
 * Two levels:
 *   1. The game (from the PGN alone, before any engine work): standard chess,
 *      a result, a minimum length, not bullet.
 *   2. The position: a first pass evaluates every position; a move that loses
 *      enough win% makes two candidates (the position before it, where its side
 *      missed something, and the position after it, where the other side can
 *      punish it); a confirming search at MultiPV K decides which candidates are
 *      puzzles and which moves are accepted.
 *
 * Every chess fact about QUALITY comes from the engine. chessops is used only to
 * replay the game's moves, write FENs and read which piece stands on a square,
 * as the Champion Challenge bake does (scripts/lib/pgnReplay.ts).
 *
 * All thresholds are PROVISIONAL; the first run on real games sets them.
 */

import { Chess, normalizeMove } from 'chessops/chess';
import { parseFen, makeFen } from 'chessops/fen';
import { parseSan } from 'chessops/san';
import { parseUci, makeUci } from 'chessops/util';
import { parsePgn, parseComment, startingPosition } from 'chessops/pgn';
import type {
  EngineLine, GameInput, GameReport, GeneratedPuzzle, GeneratorResult, GeneratorSettings,
  Phase, PieceRole, PositionEval, PuzzleEngine, PuzzleGoal, PuzzleKind, Side, SkipReason, Thresholds,
} from './types';

/**
 * The rules' version, stored with every puzzle (`game_puzzles.rules_version`): "V6" is the rule set
 * the owner chose after the 200-game measurement (spec 13.7); "V7" (#510, owner: "all the way down")
 * plays a forced mate of up to 5 moves to the mate, and any other line on while the solver's next
 * move is again the one clear answer, up to 5 solver moves (V6: mates of up to 2, other lines at
 * most 2 moves, a material puzzle 1). Change it with any change to the rules
 * or DEFAULT_THRESHOLDS, so puzzles made by different rules can be told apart.
 */
export const RULES_VERSION = 'V7';

export const DEFAULT_THRESHOLDS: Thresholds = {
  minFullMoves: 4,
  excludeBullet: true,
  passDepth: 12,
  confirmDepth: 16,
  confirmMultiPv: 5,
  candidateWinLoss: 20,
  candidateCpLoss: 250,
  winningWin: 75,
  lostWin: 25,
  savingWin: 45,
  maxMateMoves: 5,
  minGap: 10,
  clearGapFromBest: 20,
  materialGap: 250,
  materialAccept: 100,
  maxAccepted: 3,
  maxSolverMoves: 5,
  lowClockSeconds: 20,
  checkMinLegalMoves: 4,
  maxPuzzlesPerGame: 0,
  sameIdeaPlies: 6,
};

/** Centipawns for the side to move, a mate as +-MATE_CP, others clamped to it. */
const MATE_CP = 3000;
export function lineCp(line: EngineLine): number {
  if (line.mate !== null) return line.mate > 0 ? MATE_CP : -MATE_CP;
  return Math.max(-MATE_CP, Math.min(MATE_CP, line.cp ?? 0));
}

// ─── chessops ─────────────────────────────────────────────────────────────
// Plain ESM imports: this module runs in the browser (the Game report) and in
// the offline Node scripts under tsx (backend/scripts), never in the compiled
// CommonJS server, so it needs no dynamic-import workaround. Kept behind one
// object so the rest of the file reads as before.
interface Chessops {
  Chess: any; parseFen: any; makeFen: any; parseSan: any; parseUci: any; makeUci: any;
  normalizeMove: any; parsePgn: any; parseComment: any; startingPosition: any;
}
const CHESSOPS: Chessops = {
  Chess, normalizeMove, parseFen, makeFen, parseSan, parseUci, makeUci, parsePgn, parseComment, startingPosition,
};
async function loadChessops(): Promise<Chessops> {
  return CHESSOPS;
}

// ─── Small pure helpers ───────────────────────────────────────────────────

/** Lichess's win% (the Game report's formula, GameAnalysisService.cpToWinPercent). */
export function cpToWin(cp: number): number {
  const clamped = Math.max(-1000, Math.min(1000, cp));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * clamped)) - 1);
}

/** Win% of a line for the side to move. A mate is 100 or 0. */
export function lineWin(line: EngineLine): number {
  if (line.mate !== null) return line.mate > 0 ? 100 : 0;
  return cpToWin(line.cp ?? 0);
}

export function phaseOf(moveNumber: number): Phase {
  if (moveNumber <= 12) return 'opening';
  if (moveNumber <= 35) return 'middlegame';
  return 'endgame';
}

const other = (s: Side): Side => (s === 'white' ? 'black' : 'white');

/**
 * The best move is not clearly the answer: the first rejected move is close under the goal's
 * threshold AND close to the best move. Judged against the best too, so best 71 against next 41
 * is clear even though 41 is within minGap of a save threshold of 45 (analysis 3a.2).
 */
export function unclear(bestWin: number, rejectedWin: number, threshold: number, t: Thresholds): boolean {
  return rejectedWin > threshold - t.minGap && bestWin - rejectedWin < t.clearGapFromBest;
}

/** Estimated duration as Lichess defines it: base + 40 x increment, in seconds. */
export function isBulletTimeControl(tc: string | undefined): boolean {
  if (!tc) return false;
  const m = tc.match(/^(\d+)\+(\d+)$/);
  if (!m) return false;
  return Number(m[1]) + 40 * Number(m[2]) < 180;
}

/**
 * A 64-bit hash of the headers and moves, as 16 hex characters: the same game
 * pasted twice is analysed once. Two 32-bit FNV-1a style lanes with different
 * seeds and a final avalanche (cyrb53's mixing), so it runs identically in the
 * browser and in Node without crypto. Not a security hash; nothing trusts it.
 */
export function gameHash(headers: Map<string, string>, sans: string[]): string {
  const text = [...headers.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => `${k}=${v}`).join('\n')
    + '\n\n' + sans.join(' ');
  let h1 = 0xdeadbeef ^ text.length;
  let h2 = 0x41c6ce57 ^ text.length;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}

// ─── Parsing ──────────────────────────────────────────────────────────────

export interface ParsedGame {
  index: number;
  headers: Map<string, string>;
  hash: string;
  /** Mainline SANs as written. */
  sans: string[];
  /** Clock left after each ply, in seconds, when the PGN has [%clk]. */
  clocks: (number | null)[];
  /** The input's first pass, when given for a one-game PGN (GameInput.evals). */
  evals?: Array<PositionEval | null>;
}

/** Split one or more PGN texts into games, numbered in order. */
export async function parseGames(inputs: GameInput[]): Promise<ParsedGame[]> {
  const co = await loadChessops();
  const out: ParsedGame[] = [];
  for (const input of inputs) {
    const games = co.parsePgn(input.pgn);
    const evals = input.evals && games.length === 1 ? input.evals : undefined;
    for (const game of games) {
      const sans: string[] = [];
      const clocks: (number | null)[] = [];
      for (const node of game.moves.mainline()) {
        sans.push(node.san);
        let clock: number | null = null;
        for (const c of node.comments ?? []) {
          const parsed = co.parseComment(c);
          if (typeof parsed.clock === 'number') clock = parsed.clock;
        }
        clocks.push(clock);
      }
      out.push({ index: out.length, headers: game.headers, hash: gameHash(game.headers, sans), sans, clocks, evals });
    }
  }
  return out;
}

// ─── Replay ───────────────────────────────────────────────────────────────

interface Ply {
  /** FEN before this ply. */
  fen: string;
  turn: Side;
  moveNumber: number;
  uci: string;
  /** Square the move lands on (0-63), for the recapture rule. */
  to: number;
  wasCapture: boolean;
}

interface Replay {
  plies: Ply[];
  /** FEN after the last ply. */
  finalFen: string;
  finalTurn: Side;
  /** Win% for the side to move at the final position when it is terminal, else null. */
  finalTerminalWin: number | null;
}

/** Standard UCI for a chessops move (castling as king two squares, as engines print it). */
function stdUci(co: Chessops, pos: any, move: any): string {
  if ('from' in move && pos.board.king.has(move.from) && pos.board[pos.turn].has(move.to)) {
    const to = move.to > move.from ? move.from + 2 : move.from - 2;
    return co.makeUci({ from: move.from, to });
  }
  return co.makeUci(move);
}

function replay(co: Chessops, sans: string[]): Replay | null {
  const pos = co.Chess.default();
  const plies: Ply[] = [];
  for (const san of sans) {
    const move = co.parseSan(pos, san);
    if (!move) return null;
    const isEp = pos.board.getRole(move.from) === 'pawn' && (move.from & 7) !== (move.to & 7) && !pos.board.occupied.has(move.to);
    const capture = (pos.board.occupied.has(move.to) && !pos.board[pos.turn].has(move.to)) || isEp;
    plies.push({
      fen: co.makeFen(pos.toSetup()),
      turn: pos.turn,
      moveNumber: pos.fullmoves,
      uci: stdUci(co, pos, move),
      to: move.to,
      wasCapture: capture,
    });
    pos.play(move);
  }
  let finalTerminalWin: number | null = null;
  if (pos.isCheckmate()) finalTerminalWin = 0;
  else if (pos.isEnd()) finalTerminalWin = 50;
  return { plies, finalFen: co.makeFen(pos.toSetup()), finalTurn: pos.turn, finalTerminalWin };
}

function positionFromFen(co: Chessops, fen: string): any {
  return co.Chess.fromSetup(co.parseFen(fen).unwrap()).unwrap();
}

function applyUci(co: Chessops, pos: any, uci: string): boolean {
  const raw = co.parseUci(uci);
  if (!raw) return false;
  const move = co.normalizeMove(pos, raw);
  if (!pos.isLegal(move)) return false;
  pos.play(move);
  return true;
}

const PIECE_VALUE = { pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9 } as const;

/** The solver's material minus the opponent's, in pawns: the server's own count (puzzleBoard.ts). */
function materialBalance(pos: any, solver: Side): number {
  let total = 0;
  for (const role of Object.keys(PIECE_VALUE) as Array<keyof typeof PIECE_VALUE>) {
    total += (pos.board.pieces(solver, role).size() - pos.board.pieces(solver === 'white' ? 'black' : 'white', role).size()) * PIECE_VALUE[role];
  }
  return total;
}

function legalMoveCount(pos: any): number {
  let n = 0;
  for (const [, dests] of pos.allDests()) n += dests.size();
  return n;
}

// ─── Level 1 ──────────────────────────────────────────────────────────────

function qualify(game: ParsedGame, t: Thresholds): SkipReason | null {
  const variant = game.headers.get('Variant');
  if ((variant && !/^(standard|chess)$/i.test(variant)) || game.headers.has('FEN') || game.headers.get('SetUp') === '1') {
    return 'not-standard';
  }
  const result = game.headers.get('Result');
  if (!result || result === '*') return 'no-result';
  if (Math.ceil(game.sans.length / 2) < t.minFullMoves) return 'too-short';
  if (t.excludeBullet && isBulletTimeControl(game.headers.get('TimeControl'))) return 'bullet';
  return null;
}

// ─── Level 2 ──────────────────────────────────────────────────────────────

/**
 * Why a game would be skipped, before any engine work (own-game puzzles C1: the page lists it greyed
 * with the reason). The same two checks `generateForGame` makes first, so the list and the run agree.
 */
export async function skipReasonOf(game: ParsedGame, thresholds: Partial<Thresholds> = {}): Promise<SkipReason | null> {
  const t: Thresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };
  const skip = qualify(game, t);
  if (skip) return skip;
  return replay(await loadChessops(), game.sans) ? null : 'unparseable';
}

interface Candidate {
  /** Index of the puzzle position: the position before ply `p`. */
  p: number;
  solver: Side;
  kind: PuzzleKind;
  /** Solver's win% before the error (own move for missed, opponent's blunder for punish). */
  preErrorWin: number;
  /** Solver's win% after the move actually played at p (first pass), or null at the game's end. */
  playedWin: number | null;
}

function matchesPlayer(game: ParsedGame, side: Side, players: string[] | undefined): boolean {
  if (!players || players.length === 0) return true;
  const name = (game.headers.get(side === 'white' ? 'White' : 'Black') ?? '').trim().toLowerCase();
  return players.some((p) => p.trim().toLowerCase() === name);
}

/** Generate puzzles for one parsed game. */
export async function generateForGame(
  game: ParsedGame,
  settings: GeneratorSettings,
  engine: PuzzleEngine,
): Promise<{ puzzles: GeneratedPuzzle[]; report: GameReport }> {
  const started = Date.now();
  const t: Thresholds = { ...DEFAULT_THRESHOLDS, ...(settings.thresholds ?? {}) };
  const co = await loadChessops();
  const report: GameReport = {
    index: game.index, hash: game.hash,
    white: game.headers.get('White') ?? '?', black: game.headers.get('Black') ?? '?',
    status: 'used', candidates: 0, puzzles: 0, dropped: {}, positionsSearched: 0, positionsFromEvals: 0, ms: 0,
  };
  const drop = (reason: string) => { report.dropped[reason] = (report.dropped[reason] ?? 0) + 1; };
  const done = (puzzles: GeneratedPuzzle[]) => {
    report.puzzles = puzzles.length;
    report.ms = Date.now() - started;
    return { puzzles, report };
  };

  const skip = qualify(game, t);
  if (skip) { report.status = 'skipped'; report.skipReason = skip; return done([]); }
  const rp = replay(co, game.sans);
  if (!rp) { report.status = 'skipped'; report.skipReason = 'unparseable'; return done([]); }

  const search = async (fen: string, multiPv: number, depth: number) => {
    report.positionsSearched++;
    return engine.analyse(fen, multiPv, depth);
  };

  // First pass: White's win% and centipawns at every position 0..N.
  const n = rp.plies.length;
  const whiteWin: number[] = new Array(n + 1);
  const whiteCp: number[] = new Array(n + 1);
  // A position whose search timed out has no evaluation: no candidate is read
  // across it (owner, PR #304: a timed-out position never becomes a puzzle).
  const timedOut: boolean[] = new Array(n + 1).fill(false);
  // A given first pass is used only when it covers every position.
  const inputEvals = game.evals && game.evals.length === n + 1 ? game.evals : undefined;
  for (let i = 0; i <= n; i++) {
    const fen = i < n ? rp.plies[i].fen : rp.finalFen;
    const turn = i < n ? rp.plies[i].turn : rp.finalTurn;
    let stm: number;
    let stmCp: number;
    const given = inputEvals?.[i];
    if (i === n && rp.finalTerminalWin !== null) {
      stm = rp.finalTerminalWin;
      stmCp = stm === 0 ? -MATE_CP : 0;
    } else if (given) {
      // White's point of view in, side to move's out.
      const asLine: EngineLine = { uci: '', cp: given.cp, mate: given.mate, pv: [] };
      const whiteWinGiven = lineWin(asLine);
      const whiteCpGiven = lineCp(asLine);
      stm = turn === 'white' ? whiteWinGiven : 100 - whiteWinGiven;
      stmCp = turn === 'white' ? whiteCpGiven : -whiteCpGiven;
      report.positionsFromEvals++;
    } else {
      const lines = await search(fen, 1, t.passDepth);
      if (lines === null) { timedOut[i] = true; drop('timeout'); }
      stm = lines?.length ? lineWin(lines[0]) : 50;
      stmCp = lines?.length ? lineCp(lines[0]) : 0;
    }
    whiteWin[i] = turn === 'white' ? stm : 100 - stm;
    whiteCp[i] = turn === 'white' ? stmCp : -stmCp;
  }
  const winFor = (i: number, side: Side) => (side === 'white' ? whiteWin[i] : 100 - whiteWin[i]);
  const cpFor = (i: number, side: Side) => (side === 'white' ? whiteCp[i] : -whiteCp[i]);

  // Candidates: a move that loses enough win%, or enough material even where win%
  // hardly moves (a decided position). A position that is both a punish and a
  // missed is kept once, as punish (the more precise lesson, section 4.1).
  const byPosition = new Map<number, Candidate>();
  for (let i = 0; i < n; i++) {
    if (timedOut[i] || timedOut[i + 1]) continue;
    const mover = rp.plies[i].turn;
    const loss = winFor(i, mover) - winFor(i + 1, mover);
    const cpLoss = cpFor(i, mover) - cpFor(i + 1, mover);
    const byMaterial = t.candidateCpLoss > 0 && cpLoss >= t.candidateCpLoss;
    if (loss < t.candidateWinLoss && !byMaterial) continue;
    if (i >= 1 && !byPosition.has(i)) {
      byPosition.set(i, { p: i, solver: mover, kind: 'missed', preErrorWin: winFor(i, mover), playedWin: winFor(i + 1, mover) });
    }
    const after = i + 1;
    const terminal = after === n && rp.finalTerminalWin !== null;
    const solver = other(mover);
    if (!terminal && !(settings.perspective && solver !== settings.perspective)) {
      byPosition.set(after, {
        p: after, solver, kind: 'punish',
        preErrorWin: winFor(i, solver),
        playedWin: after < n && !timedOut[after + 1] ? winFor(after + 1, solver) : null,
      });
    }
  }

  // The settings' filters, before any more engine work.
  const candidates: Candidate[] = [];
  for (const c of [...byPosition.values()].sort((a, b) => a.p - b.p)) {
    const moveNumber = c.p < n ? rp.plies[c.p].moveNumber : positionFromFen(co, rp.finalFen).fullmoves;
    if (settings.color && settings.color !== 'any' && c.solver !== settings.color) continue;
    if (!matchesPlayer(game, c.solver, settings.players)) continue;
    if (settings.phase && settings.phase !== 'any' && phaseOf(moveNumber) !== settings.phase) continue;
    candidates.push(c);
  }
  report.candidates = candidates.length;

  const confirmed: Array<{ puzzle: GeneratedPuzzle; p: number }> = [];
  for (const c of candidates) {
    const puzzle = await confirm(c);
    if (typeof puzzle === 'string') drop(puzzle);
    else confirmed.push({ puzzle, p: c.p });
  }

  // One lesson once: the best first, and a second puzzle for the same side whose
  // first move lands on the same square a few plies later is the same idea (a
  // run on 120 beginner games gave one game 12 puzzles, most of them one idea
  // missed back and forth). No cap by default: 200 beginner games had 33 with
  // six or more genuine moments (analysis 3a); a caller can set one.
  const goalRank: Record<PuzzleGoal, number> = { mate: 4, win: 3, material: 2, save: 1 };
  const score = (x: GeneratedPuzzle) =>
    goalRank[x.goal] * 1000 + (x.engine.bestWin - (x.engine.firstRejectedWin ?? 0));
  const target = (x: GeneratedPuzzle) => x.moves[1].slice(2, 4);
  const kept: Array<{ puzzle: GeneratedPuzzle; p: number }> = [];
  for (const cand of [...confirmed].sort((a, b) => score(b.puzzle) - score(a.puzzle))) {
    if (t.maxPuzzlesPerGame > 0 && kept.length >= t.maxPuzzlesPerGame) { drop('per-game-cap'); continue; }
    const sameIdea = kept.some((k) => k.puzzle.solver === cand.puzzle.solver
      && target(k.puzzle) === target(cand.puzzle) && Math.abs(k.p - cand.p) <= t.sameIdeaPlies);
    if (sameIdea) { drop('same-idea'); continue; }
    kept.push(cand);
  }
  return done(kept.sort((a, b) => a.p - b.p).map((k) => k.puzzle));

  // ── The confirming search on one candidate ──────────────────────────────
  async function confirm(c: Candidate): Promise<GeneratedPuzzle | string> {
    const fen = c.p < n ? rp!.plies[c.p].fen : rp!.finalFen;
    const pos = positionFromFen(co, fen);
    const moveNumber = pos.fullmoves as number;

    // Time trouble: the solver's move here was made with little clock left.
    const clock = c.p < n ? game.clocks[c.p] : null;
    if (clock !== null && clock !== undefined && clock < t.lowClockSeconds) return 'low-clock';
    const legal = legalMoveCount(pos);
    if (legal <= 1) return 'forced';
    if (pos.isCheck() && legal < t.checkMinLegalMoves) return 'check-few-moves';

    const lines = await search(fen, t.confirmMultiPv, t.confirmDepth);
    if (lines === null) return 'timeout';
    if (!lines.length) return 'no-moves';
    const wins = lines.map(lineWin);
    const best = lines[0];

    // The goal.
    let goal: PuzzleGoal;
    let threshold: number;
    const before = c.kind === 'missed' ? (c.playedWin ?? 0) : c.preErrorWin;
    if (best.mate !== null && best.mate > 0 && best.mate <= t.maxMateMoves) {
      goal = 'mate'; threshold = 100;
    } else if (wins[0] >= t.winningWin && before < t.winningWin) {
      goal = 'win'; threshold = t.winningWin;
    } else if (wins[0] >= t.savingWin && before <= t.lostWin) {
      goal = 'save'; threshold = t.savingWin;
    } else {
      // Material: no result changes, but one move keeps a clear material edge
      // over the rest (take the hung piece, or keep your own). Decided by
      // centipawns, since win% hardly moves here (analysis 3a).
      goal = 'material'; threshold = NaN;
    }
    // "Not already decided" (section 4.3, point 4) is the `before` test above: a
    // win needs the solver below the winning threshold before the error, a save
    // needs them lost. Short mates are always kept. A decided position can still
    // give a material puzzle.

    // Accepted moves.
    const cps = lines.map(lineCp);
    const accepted = goal === 'mate'
      ? lines.filter((l) => l.mate === best.mate).map((l) => l.uci)
      : goal === 'material'
        ? lines.filter((_, k) => cps[k] >= cps[0] - t.materialAccept).map((l) => l.uci)
        : lines.filter((_, k) => wins[k] >= threshold).map((l) => l.uci);
    if (accepted.length === lines.length && lines.length === t.confirmMultiPv) return 'too-many-answers';
    if (accepted.length > t.maxAccepted) return 'too-many-answers';
    const firstRejected = lines.findIndex((l) => !accepted.includes(l.uci));
    const firstRejectedWin = firstRejected >= 0 ? wins[firstRejected] : null;
    if (goal === 'material') {
      // Nothing else to compare with (fewer legal moves than lines, all accepted), or
      // the next move costs too little: not a material lesson.
      if (firstRejected < 0 || cps[0] - cps[firstRejected] < t.materialGap) return 'no-change';
    } else if (goal !== 'mate' && firstRejectedWin !== null && unclear(wins[0], firstRejectedWin, threshold, t)) {
      return 'unclear-best';
    }

    const playedMove = c.p < n ? rp!.plies[c.p].uci : '';
    if (c.kind === 'missed' && accepted.includes(playedMove)) return 'played-was-fine';

    // An obvious recapture is not a puzzle.
    const setup = rp!.plies[c.p - 1];
    const bestTo = co.parseUci(best.uci)?.to;
    if (goal !== 'mate' && setup.wasCapture && bestTo === setup.to) return 'recapture';

    const bestFrom = co.parseUci(best.uci)?.from;
    const piece = pos.board.getRole(bestFrom) as PieceRole | undefined;
    if (!piece) return 'engine-move-unreadable';
    if (settings.piece && settings.piece !== 'any' && piece !== settings.piece) return 'piece-filter';

    // The solution line: ends on the solver's move, at most maxSolverMoves.
    const moves = [setup.uci, best.uci];
    const acceptedMoves = [accepted];
    let line = best;
    let solverMoves = 1;
    let mateIn: number | null = goal === 'mate' ? best.mate : null;
    const walk = positionFromFen(co, fen);
    // A position seen before ends the line (a perpetual or a piece shuffling back is no lesson).
    const posKey = () => co.makeFen(walk.toSetup()).split(' ').slice(0, 4).join(' ');
    const seen = new Set([posKey()]);
    // A mate is played to the mate; any other line goes on while the solver's next move is again
    // the one clear answer, up to maxSolverMoves (owner, #510 testing: "all the way down").
    while (goal === 'mate' || solverMoves < t.maxSolverMoves) {
      if (goal === 'mate' && line.mate === 1) break;
      const reply = line.pv[1];
      if (!reply || !applyUci(co, walk, line.uci) || !applyUci(co, walk, reply) || walk.isEnd()) break;
      if (seen.has(posKey())) break;
      seen.add(posKey());
      const next = await search(co.makeFen(walk.toSetup()), t.confirmMultiPv, t.confirmDepth);
      // A timed-out continuation is not used: the line stops at the last searched move.
      if (!next || !next.length) break;
      const nextWins = next.map(lineWin);
      let nextAccepted: string[];
      if (goal === 'mate') {
        if (next[0].mate === null || next[0].mate <= 0) break;
        nextAccepted = next.filter((l) => l.mate === next[0].mate).map((l) => l.uci);
      } else if (goal === 'material') {
        // The same test as the first move: a clear centipawn gap to the next move.
        const nextCps = next.map(lineCp);
        nextAccepted = next.filter((_, k) => nextCps[k] >= nextCps[0] - t.materialAccept).map((l) => l.uci);
        const rej = next.findIndex((l) => !nextAccepted.includes(l.uci));
        if (rej < 0 || nextAccepted.length > t.maxAccepted || nextCps[0] - nextCps[rej] < t.materialGap) break;
      } else {
        nextAccepted = next.filter((_, k) => nextWins[k] >= threshold).map((l) => l.uci);
        const all = nextAccepted.length === next.length && next.length === t.confirmMultiPv;
        const rej = next.findIndex((l) => !nextAccepted.includes(l.uci));
        const notClear = rej >= 0 && unclear(nextWins[0], nextWins[rej], threshold, t);
        if (!nextAccepted.length || all || nextAccepted.length > t.maxAccepted || notClear) break;
      }
      moves.push(reply, next[0].uci);
      acceptedMoves.push(nextAccepted);
      line = next[0];
      solverMoves++;
    }
    // A mate goal whose line stops before the mate is a "win" puzzle.
    if (goal === 'mate' && !(line.mate === 1)) { goal = 'win'; mateIn = null; }

    // A material line ends on its last solver move where the solver is not behind the material they
    // started with (the server refuses one that is, and that refused the whole game's save, #510: a
    // longer line can stop mid-exchange). None: not a material puzzle.
    let reply: string | null = line.pv[1] ?? null;
    if (goal === 'material') {
      const start = materialBalance(positionFromFen(co, fen), c.solver);
      const walkBack = positionFromFen(co, fen);
      let keep = 0;
      for (let k = 1; k < moves.length; k += 2) {
        if (!applyUci(co, walkBack, moves[k])) break;
        if (materialBalance(walkBack, c.solver) >= start) keep = k;
        if (k + 1 < moves.length && !applyUci(co, walkBack, moves[k + 1])) break;
      }
      if (keep === 0) return 'material-down';
      if (keep + 1 < moves.length) {
        reply = moves[keep + 1];
        moves.length = keep + 1;
        acceptedMoves.length = (keep + 1) / 2;
      }
    }

    return {
      fen: setup.fen,
      moves,
      acceptedMoves,
      solver: c.solver,
      kind: c.kind,
      goal,
      mateIn,
      phase: phaseOf(moveNumber),
      piece,
      playedMove,
      foundInGame: c.kind === 'punish' ? (playedMove ? accepted.includes(playedMove) : null) : null,
      moveNumber,
      engine: {
        bestWin: round1(wins[0]),
        firstRejectedWin: firstRejectedWin === null ? null : round1(firstRejectedWin),
        playedWin: c.playedWin === null ? null : round1(c.playedWin),
        preErrorWin: round1(c.preErrorWin),
        depth: t.confirmDepth,
        multiPv: t.confirmMultiPv,
      },
      reply,
      game: { index: game.index, hash: game.hash },
    };
  }
}

const round1 = (x: number) => Math.round(x * 10) / 10;

/** The contract of section 13.2: games and settings in, puzzles and a report out. */
export async function generatePuzzles(
  games: GameInput[],
  settings: GeneratorSettings,
  engine: PuzzleEngine,
): Promise<GeneratorResult> {
  const thresholds: Thresholds = { ...DEFAULT_THRESHOLDS, ...(settings.thresholds ?? {}) };
  const parsed = await parseGames(games);
  const puzzles: GeneratedPuzzle[] = [];
  const report: GameReport[] = [];
  for (const g of parsed) {
    const r = await generateForGame(g, settings, engine);
    puzzles.push(...r.puzzles);
    report.push(r.report);
  }
  return { puzzles, report, thresholds };
}
