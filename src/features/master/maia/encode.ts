/**
 * MAIA'S INPUT: lc0's classic 112 planes (MASTER_CHARACTER_IMPLEMENTATION_PLAN C3, #186).
 *
 * A port of `EncodePositionForNN` (lc0 v0.32.1, src/neural/encoder.cc, GPL-3.0) for the format Maia-1's
 * networks use, `INPUT_CLASSICAL_112_PLANE`, with lc0's default `HistoryFill=fen_only`. Every rule here was
 * read from lc0's source and is pinned by `maia.test.ts` against lc0's own answers on 396 positions:
 *
 * - 8 boards of 13 planes, newest first: the side to move's pawns, knights, bishops, rooks, queens, king, then
 *   the opponent's six, then one plane all ones if that position had occurred before (a repetition).
 * - Every board is seen from the side to move NOW: the board is mirrored top to bottom when Black is to move,
 *   and "ours" means the mover's pieces, for the older boards too.
 * - Missing history (the first moves): from the start position, the planes stay empty; from a FEN, the FEN's
 *   position is repeated, with a pawn that just made a two-square move put back on its starting square.
 * - Then 8 planes: castling (our long, our short, their long, their short), all ones when Black is to move, the
 *   rule-50 count as a raw number of plies, all zeros, all ones.
 *
 * Plane p, square s (a1 = 0, h8 = 63, already mirrored) is element p * 64 + s.
 */
import { Chess } from 'chessops/chess';
import { parseFen } from 'chessops/fen';
import { parseUci } from 'chessops/util';
import type { Role } from 'chessops/types';

export const PLANES = 112;
const ROLES: Role[] = ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king'];

/** One position of the game, in absolute terms (White at the bottom). */
interface Snapshot {
  /** 0 empty; 1-6 a white pawn..king; 7-12 a black pawn..king. */
  squares: Int8Array;
  whiteToMove: boolean;
  /** The four castling rights, as lc0 and FEN order them: K, Q, k, q. */
  castling: [boolean, boolean, boolean, boolean];
  /**
   * lc0's en passant flag: the file of a pawn that just moved two squares, when an enemy pawn stands beside it
   * (lc0 sets it whether or not the capture is legal), or that a FEN declared. -1 when none.
   */
  epFile: number;
  rule50: number;
  repetitions: number;
}

export interface GameHistory {
  /** `startpos` or a FEN. */
  start: 'startpos' | string;
  /** The moves played since, in UCI (castling as e1g1 or e1h1, both accepted). */
  moves: string[];
}

function snapshot(pos: Chess, epFile: number): Omit<Snapshot, 'repetitions'> {
  const squares = new Int8Array(64);
  for (const [sq, piece] of pos.board) {
    squares[sq] = 1 + ROLES.indexOf(piece.role) + (piece.color === 'black' ? 6 : 0);
  }
  const rights = pos.castles.castlingRights;
  return {
    squares,
    whiteToMove: pos.turn === 'white',
    castling: [rights.has(7), rights.has(0), rights.has(63), rights.has(56)],
    epFile,
    rule50: pos.halfmoves,
  };
}

function sameBoard(a: Omit<Snapshot, 'repetitions'>, b: Omit<Snapshot, 'repetitions'>): boolean {
  if (a.whiteToMove !== b.whiteToMove || a.epFile !== b.epFile) return false;
  for (let i = 0; i < 4; i++) if (a.castling[i] !== b.castling[i]) return false;
  for (let i = 0; i < 64; i++) if (a.squares[i] !== b.squares[i]) return false;
  return true;
}

/** The position after the history, and every snapshot along the way (oldest first). */
export function replay(history: GameHistory): { pos: Chess; snapshots: Snapshot[]; fromFen: boolean } {
  const fromFen = history.start !== 'startpos';
  const setup = fromFen ? parseFen(history.start).unwrap() : parseFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1').unwrap();
  const pos = Chess.fromSetup(setup).unwrap();
  // A FEN's en passant square stands as lc0 reads it (lc0 requires the enemy pawn to be there).
  const fenEp = fromFen && setup.epSquare !== undefined ? setup.epSquare % 8 : -1;
  const snapshots: Snapshot[] = [{ ...snapshot(pos, fenEp), repetitions: 0 }];

  for (const uci of history.moves) {
    const move = parseUci(uci);
    if (!move || !('from' in move)) throw new Error(`not a move: ${uci}`);
    // e1g1-style castling becomes chessops's own king-to-rook form
    const piece = pos.board.get(move.from);
    let to = move.to;
    if (piece?.role === 'king' && Math.abs((move.to % 8) - (move.from % 8)) === 2) {
      to = (move.to % 8) > (move.from % 8) ? move.from - (move.from % 8) + 7 : move.from - (move.from % 8);
    }
    const legal = { ...move, to };
    if (!pos.isLegal(legal)) throw new Error(`illegal move ${uci} in ${history.start} ${history.moves.join(' ')}`);
    const doublePush = piece?.role === 'pawn' && Math.abs(to - move.from) === 16;
    pos.play(legal);

    let epFile = -1;
    if (doublePush) {
      const file = to % 8;
      const enemy = pos.turn === 'white' ? 1 : 7; // the pawn of the side now to move
      for (const df of [-1, 1]) {
        const f = file + df;
        if (f >= 0 && f < 8 && snapshotPiece(pos, to - (to % 8) + f) === enemy) epFile = file;
      }
    }
    const snap = snapshot(pos, epFile);
    snapshots.push({ ...snap, repetitions: repetitionsOf(snapshots, snap) });
  }
  return { pos, snapshots, fromFen };
}

function snapshotPiece(pos: Chess, sq: number): number {
  const p = pos.board.get(sq);
  return p ? 1 + ROLES.indexOf(p.role) + (p.color === 'black' ? 6 : 0) : 0;
}

/** lc0's `ComputeLastMoveRepetitions`. */
function repetitionsOf(before: Snapshot[], last: Omit<Snapshot, 'repetitions'>): number {
  if (last.rule50 < 4) return 0;
  // `before` does not yet hold `last`, so lc0's positions_.size() - 5 is before.length - 4
  for (let idx = before.length - 4; idx >= 0; idx -= 2) {
    const pos = before[idx];
    if (sameBoard(pos, last)) return 1 + pos.repetitions;
    if (pos.rule50 < 2) return 0;
  }
  return 0;
}

const START = parseFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1').unwrap();
function isStartBoard(s: Snapshot): boolean {
  const start = snapshot(Chess.fromSetup(START).unwrap(), -1);
  return sameBoard({ ...s, rule50: 0 }, { ...start, rule50: 0 }) && s.whiteToMove;
}

/** The 112 x 64 input, as float32 values (0, 1, or the rule-50 count). */
export function encode(history: GameHistory): Float32Array {
  const { snapshots } = replay(history);
  const out = new Float32Array(PLANES * 64);
  const current = snapshots[snapshots.length - 1];
  const black = !current.whiteToMove;
  const mirror = (sq: number) => (black ? sq ^ 56 : sq);

  for (let i = 0; i < 8; i++) {
    const idx = snapshots.length - 1 - i;
    let snap: Snapshot;
    let unpushEp = false;
    if (idx >= 0) {
      snap = snapshots[idx];
    } else {
      // before the first position: fen_only fills with the first position, never from the start position
      snap = snapshots[0];
      if (isStartBoard(snap)) break;
      unpushEp = snap.epFile >= 0;
    }
    const base = i * 13;
    for (let sq = 0; sq < 64; sq++) {
      const code = snap.squares[sq];
      if (code === 0) continue;
      const white = code <= 6;
      const role = (code - 1) % 6;
      const ours = white !== black; // the side to move NOW
      out[(base + (ours ? 0 : 6) + role) * 64 + mirror(sq)] = 1;
    }
    if (unpushEp) {
      // the pawn that just moved two squares goes back where it came from
      const file = snap.epFile;
      const moverWasWhite = !snap.whiteToMove;
      const from = moverWasWhite ? 8 + file : 48 + file;
      const to = moverWasWhite ? 24 + file : 32 + file;
      const plane = base + ((moverWasWhite === !black) ? 0 : 6);
      out[plane * 64 + mirror(to)] = 0;
      out[plane * 64 + mirror(from)] = 1;
    }
    if (snap.repetitions >= 1) out.fill(1, (base + 12) * 64, (base + 13) * 64);
  }

  const aux = 104;
  const [wk, wq, bk, bq] = current.castling;
  const [ourShort, ourLong, theirShort, theirLong] = black ? [bk, bq, wk, wq] : [wk, wq, bk, bq];
  if (ourLong) out.fill(1, (aux + 0) * 64, (aux + 1) * 64);
  if (ourShort) out.fill(1, (aux + 1) * 64, (aux + 2) * 64);
  if (theirLong) out.fill(1, (aux + 2) * 64, (aux + 3) * 64);
  if (theirShort) out.fill(1, (aux + 3) * 64, (aux + 4) * 64);
  if (black) out.fill(1, (aux + 4) * 64, (aux + 5) * 64);
  out.fill(current.rule50, (aux + 5) * 64, (aux + 6) * 64);
  out.fill(1, (aux + 7) * 64, (aux + 8) * 64);
  return out;
}
