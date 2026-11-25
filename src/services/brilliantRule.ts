/**
 * #379: which moves the Game report calls brilliant, and which move its button calls critical.
 *
 * A port of `scripts/brilliant-379/rule.ts`, the reference the owner's marks were measured on
 * (BRILLIANT_MOVES_ANALYSIS §6 and §7). Pure functions over chess.js; the engine numbers, Maia's probabilities and
 * the two-line search come from the caller (`brilliantDetection.ts`). Keep the two files in step: the parity test
 * runs this module over the fixtures the reference wrote.
 *
 * Win percentages are always from the mover's side (0 to 100).
 */
import { Chess, type Square } from 'chess.js';
import { cpToWinPercent } from './GameAnalysisService';

/** The brilliant rule (analysis §6). */
export const RULE = { minPly: 10, maxLoss: 3, minGive: 2, maiaP: 0.12, gap: 3, decisiveCp: 200, floor: 30 } as const;
/** The critical move (analysis §7). */
export const CRIT = { prevDrop: 10, maxLoss: 3, maiaP: 0.12, gap: 8, floor: 30 } as const;

// ── Material ────────────────────────────────────────────────────────────────
const V: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 1000 };

/**
 * What the side to move wins by capturing on `sq` and resolving the exchange: least valuable attacker first, either
 * side stopping when going on is worse. Played with real legal moves, so pins and check count; the board is left as
 * it was found.
 */
export function seeGain(board: Chess, sq: Square): number {
  const caps = board.moves({ verbose: true }).filter((m) => m.to === sq && m.captured);
  if (!caps.length) return 0;
  caps.sort((a, b) => V[a.piece] - V[b.piece]);
  const c = caps[0];
  board.move({ from: c.from, to: c.to, promotion: c.promotion });
  const g = Math.max(0, V[c.captured!] - seeGain(board, sq));
  board.undo();
  return g;
}

/** The mover's knights and bigger pieces the opponent (to move) can win material on, with the amount. */
function enPrise(board: Chess, mover: 'w' | 'b'): Map<Square, number> {
  const out = new Map<Square, number>();
  // Only squares the side to move can capture on are worth an exchange (one move generation, not one per piece).
  const targets = new Set<Square>();
  for (const m of board.moves({ verbose: true })) {
    if (m.captured && m.captured !== 'p' && m.captured !== 'k') targets.add(m.to as Square);
  }
  for (const sq of targets) {
    const c = board.get(sq);
    if (!c || c.color !== mover) continue;
    const g = seeGain(board, sq);
    if (g > 0) out.set(sq, g);
  }
  return out;
}

/** The same position with the other side to move (no en passant), or null when that is not a legal position. */
function passTurn(board: Chess): Chess | null {
  const f = board.fen().split(' ');
  f[1] = f[1] === 'w' ? 'b' : 'w';
  f[3] = '-';
  try { return new Chess(f.join(' ')); } catch { return null; }
}

/** Lost anyway: no legal move of the mover's leaves the piece on `sq` where it cannot be won. */
function lostAnyway(board: Chess, sq: Square): boolean {
  return !board.moves({ verbose: true }).some((m) => {
    board.move(m);
    const at = (m.from === sq ? m.to : sq) as Square;
    const ok = seeGain(board, at) === 0;
    board.undo();
    return ok;
  });
}

export interface BoardFacts {
  inCheck: boolean;
  promotion: boolean;
  mates: boolean;
  capture: boolean;
  /** The exchange on the move's square: what it captured minus what the opponent then wins there. */
  net: number;
  /** Material the move gives (analysis §6). Exact when it reaches RULE.minGive; below that it may read 0. Computed
   *  only for positions `wanted` selects, else 0. */
  gives: number;
}

/**
 * Facts from the moves alone, from the starting position. `gives` (the expensive part) is computed only where
 * `wanted(i)` says the cheap gates passed.
 */
export function boardFacts(moves: string[], wanted: (i: number) => boolean): BoardFacts[] {
  return [...boardFactsSteps(moves, wanted)];
}

/** The same, one move at a time, so a caller can give the page a turn between moves. */
export function* boardFactsSteps(moves: string[], wanted: (i: number) => boolean): Generator<BoardFacts> {
  const board = new Chess();
  for (let i = 0; i < moves.length; i++) {
    const u = moves[i];
    const from = u.slice(0, 2) as Square;
    const to = u.slice(2, 4) as Square;
    const mover = board.turn();
    const inCheck = board.inCheck();
    const look = wanted(i) && !inCheck;
    const promotion = u.length > 4 ? u[4] : undefined;
    const played = board.move({ from, to, promotion });
    const net = (played.captured ? V[played.captured] : 0) - seeGain(board, to); // en passant included
    let gives = 0;
    if (look) {
      const after = enPrise(board, mover);
      after.delete(to); // the moved piece is counted by `net`
      if (Math.max(-net, ...after.values()) >= RULE.minGive) {
        // Only now the expensive part: which pieces were already en prise before the move (they do not count), and
        // whether the moved piece was lost anyway (then it gives nothing).
        board.undo();
        const passed = passTurn(board);
        const before = passed ? enPrise(passed, mover) : new Map<Square, number>();
        const doomed = before.has(from) && lostAnyway(board, from);
        board.move({ from, to, promotion });
        gives = doomed ? 0 : Math.max(0, -net);
        for (const [sq, g] of after) if (!before.has(sq)) gives = Math.max(gives, g);
      }
    }
    yield { inCheck, promotion: u.length > 4, mates: board.isCheckmate(), capture: !!played.captured, net, gives };
  }
}

// ── The brilliant move ──────────────────────────────────────────────────────
export interface SecondLine { best: number; second: number }

/**
 * The two-line search's answer as the rules read it, in win% from the mover's side, or null. Null also when the
 * search's first line is not the move played: the gap then measures another move's uniqueness, not this one's.
 */
export function secondLine(
  lines: Array<{ move: string; cp: number }>,
  played: string,
  winForMover: (cp: number) => number,
): SecondLine | null {
  if (lines.length < 2 || lines[0].move !== played) return null;
  return { best: winForMover(lines[0].cp), second: winForMover(lines[1].cp) };
}

export interface MoveNumbers {
  i: number;
  winBefore: number;
  winAfter: number;
  /** The mover's win% before the opponent's last move. */
  winPrevBefore: number | null;
  /** The opponent's last move lost 150 cp or 18 win% (the report's own figures). */
  prevError: boolean;
  /** Maia 1900's probability of the move played; null when Maia gave no answer. */
  maiaP: number | null;
  /** The separate two-line search; null when it found fewer than two lines. */
  second: SecondLine | null;
}

/** Everything but Maia and the two-line search. */
export function cheapGates(f: BoardFacts, n: { i: number; winBefore: number; winAfter: number }): boolean {
  return n.i >= RULE.minPly && !f.inCheck && !f.promotion && !f.mates && !(f.capture && f.net > 0)
    && n.winBefore - n.winAfter <= RULE.maxLoss;
}

/** Whether the board part of the brilliant rule passes: the cheap gates and the material. */
export function brilliantCandidate(f: BoardFacts, n: { i: number; winBefore: number; winAfter: number }): boolean {
  return cheapGates(f, n) && f.gives >= RULE.minGive;
}

/** 1 (cashing in), 2 (holding), or null. Missing data is never brilliant. */
export function decide(f: BoardFacts, n: MoveNumbers): 1 | 2 | null {
  if (!brilliantCandidate(f, n)) return null;
  if (n.maiaP == null || n.maiaP >= RULE.maiaP) return null;
  if (!n.second) return null;
  const D = cpToWinPercent(RULE.decisiveCp);
  if (n.second.best - n.second.second < RULE.gap || n.second.second >= D) return null;
  if (n.prevError && n.winPrevBefore != null && n.winPrevBefore < D && n.winBefore >= D && n.winAfter >= D) return 1;
  return n.winAfter >= RULE.floor ? 2 : null;
}

// ── The critical move ───────────────────────────────────────────────────────
export interface CriticalNumbers {
  i: number;
  winBefore: number;
  winAfter: number;
  /** What the opponent's last move cost them, in win% from their side. */
  prevDrop: number | null;
  maiaP: number | null;
  second: SecondLine | null;
}

/** Everything but Maia and the two-line search. */
export function criticalGates(f: BoardFacts, n: CriticalNumbers): boolean {
  return n.i >= RULE.minPly && !f.mates && !(f.capture && f.net >= 0)
    && n.prevDrop != null && n.prevDrop >= CRIT.prevDrop
    && n.winBefore - n.winAfter <= CRIT.maxLoss && n.winAfter >= CRIT.floor;
}

/** The hard-to-find reply that takes the chance. Missing data is never critical. */
export function isCritical(f: BoardFacts, n: CriticalNumbers): boolean {
  if (!criticalGates(f, n)) return false;
  if (n.maiaP == null || n.maiaP >= CRIT.maiaP || !n.second) return false;
  return n.second.best - n.second.second >= CRIT.gap;
}

/** The button's move: the critical move after the largest drop (the first on a tie), or null. */
export function pickCritical(critical: Array<{ i: number; prevDrop: number }>): number | null {
  let top: { i: number; prevDrop: number } | null = null;
  for (const x of critical) if (!top || x.prevDrop > top.prevDrop) top = x;
  return top?.i ?? null;
}

// ── A whole game, in two steps ──────────────────────────────────────────────
export interface GameInput {
  /** The moves in UCI, from the starting position. */
  moves: string[];
  /** The report's batch: the evaluation before each move and after the last, White's side, centipawns. */
  evals: number[];
  /** The report's own classification, for the opponent's mistake (`cpLoss`, `winPercentLoss` per move). */
  classified: Array<{ cpLoss: number; winPercentLoss: number }>;
}

export interface Prepared {
  input: GameInput;
  facts: BoardFacts[];
  /** The positions that pass either rule's cheap tests: the ones Maia must be asked about. */
  needMaia: number[];
}

/** The mover's win% from White's centipawns at position `i` (the mover of move `i` is White when `i` is even). */
export const winFor = (i: number, cp: number): number => (i % 2 === 0 ? cpToWinPercent(cp) : 100 - cpToWinPercent(cp));

function numbers(g: GameInput, i: number) {
  return { i, winBefore: winFor(i, g.evals[i]), winAfter: winFor(i, g.evals[i + 1]) };
}
function prevDrop(g: GameInput, i: number): number | null {
  return i > 0 ? winFor(i - 1, g.evals[i - 1]) - winFor(i - 1, g.evals[i]) : null;
}

/** Step 1, no engine and no Maia: the board facts and the positions worth asking Maia about. */
export function prepare(input: GameInput): Prepared {
  return prepared(input, boardFacts(input.moves, wantGives(input)));
}

/**
 * The same, giving the page a turn whenever `sliceMs` has passed (the board facts take up to ~0.8 s for a long game
 * on a desktop, several times that on a phone).
 */
export async function prepareAsync(input: GameInput, sliceMs = 8): Promise<Prepared> {
  const facts: BoardFacts[] = [];
  let start = performance.now();
  for (const f of boardFactsSteps(input.moves, wantGives(input))) {
    facts.push(f);
    if (performance.now() - start > sliceMs) {
      await new Promise((r) => setTimeout(r, 0));
      start = performance.now();
    }
  }
  return prepared(input, facts);
}

function wantGives(input: GameInput) {
  return (i: number) => {
    const n = numbers(input, i);
    return i >= RULE.minPly && n.winBefore - n.winAfter <= RULE.maxLoss;
  };
}

function prepared(input: GameInput, facts: BoardFacts[]): Prepared {
  const needMaia: number[] = [];
  facts.forEach((f, i) => {
    const n = numbers(input, i);
    const crit = criticalGates(f, { ...n, prevDrop: prevDrop(input, i), maiaP: null, second: null });
    if (brilliantCandidate(f, n) || crit) needMaia.push(i);
  });
  return { input, facts, needMaia };
}

/** Whether position `i` needs the two-line search, once Maia has answered (both rules share Maia's bar). */
export function needsSearch(maiaP: number | null): boolean {
  return maiaP != null && maiaP < Math.max(RULE.maiaP, CRIT.maiaP);
}

export interface GameResult {
  brilliant: Array<{ moveIndex: number; type: 1 | 2 }>;
  /** Every critical move, and the one the button goes to. */
  criticalMoves: number[];
  critical: number | null;
}

/** Step 2: the decisions, from Maia's probability and the two-line search for the positions of step 1. */
export function conclude(
  p: Prepared,
  maiaP: (i: number) => number | null,
  second: (i: number) => SecondLine | null,
): GameResult {
  const g = p.input;
  const brilliant: GameResult['brilliant'] = [];
  const critical: Array<{ i: number; prevDrop: number }> = [];
  for (const i of p.needMaia) {
    const f = p.facts[i];
    const n = numbers(g, i);
    const m = maiaP(i);
    const s = second(i);
    const t = decide(f, {
      ...n,
      winPrevBefore: i > 0 ? winFor(i, g.evals[i - 1]) : null,
      prevError: i > 0 && (g.classified[i - 1].cpLoss >= 150 || g.classified[i - 1].winPercentLoss >= 18),
      maiaP: m,
      second: s,
    });
    if (t) brilliant.push({ moveIndex: i, type: t });
    const d = prevDrop(g, i);
    if (isCritical(f, { ...n, prevDrop: d, maiaP: m, second: s })) critical.push({ i, prevDrop: d! });
  }
  return { brilliant, criticalMoves: critical.map((x) => x.i), critical: pickCritical(critical) };
}
