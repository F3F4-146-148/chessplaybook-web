/**
 * MAIA'S OUTPUT: the network's 1858 move scores to the legal moves (MASTER_CHARACTER_IMPLEMENTATION_PLAN C4, #186).
 *
 * Our own conversion (`lc0 leela2onnx`) already maps the network's raw policy to lc0's 1858 moves, so this only
 * names each legal move's entry, as lc0's `MoveToNNIndex` does, and turns the scores of the LEGAL moves into
 * probabilities (gather, keep the legal ones, then softmax; the illegal entries never take part).
 */
import { Chess } from 'chessops/chess';
import { LC0_MOVES } from './lc0Moves';

const INDEX = new Map(LC0_MOVES.map((m, i) => [m, i]));
const FILES = 'abcdefgh';
const name = (sq: number) => FILES[sq % 8] + String(Math.floor(sq / 8) + 1);

export interface LegalMove {
  /** Standard UCI: castling as e1g1, promotions with their piece (a7a8n). */
  uci: string;
  /** lc0's index in the 1858 list. */
  index: number;
}

/** Every legal move of the position with its lc0 index. */
export function legalMoves(pos: Chess): LegalMove[] {
  const black = pos.turn === 'black';
  const m = (sq: number) => (black ? sq ^ 56 : sq);
  const out: LegalMove[] = [];
  for (const [from, dests] of pos.allDests()) {
    const piece = pos.board.get(from)!;
    for (const to of dests) {
      const target = pos.board.get(to);
      if (piece.role === 'king' && target?.role === 'rook' && target.color === piece.color) {
        // castling: chessops and lc0 both say king to rook; the world says king two squares
        const kingTo = to > from ? from + 2 : from - 2;
        out.push({ uci: name(from) + name(kingTo), index: INDEX.get(name(m(from)) + name(m(to)))! });
        continue;
      }
      const promotes = piece.role === 'pawn' && (Math.floor(to / 8) === 7 || Math.floor(to / 8) === 0);
      if (!promotes) {
        out.push({ uci: name(from) + name(to), index: INDEX.get(name(m(from)) + name(m(to)))! });
        continue;
      }
      for (const p of ['q', 'r', 'b', 'n']) {
        // lc0: a knight promotion uses the plain move's entry
        const key = name(m(from)) + name(m(to)) + (p === 'n' ? '' : p);
        out.push({ uci: name(from) + name(to) + p, index: INDEX.get(key)! });
      }
    }
  }
  for (const mv of out) {
    if (mv.index === undefined) throw new Error(`no lc0 index for ${mv.uci}`);
  }
  return out;
}

/** Softmax over the legal moves' scores. Returns probabilities aligned with `moves`. */
export function legalProbabilities(scores: Float32Array, moves: LegalMove[]): Float64Array {
  const p = new Float64Array(moves.length);
  let max = -Infinity;
  for (const mv of moves) max = Math.max(max, scores[mv.index]);
  let sum = 0;
  moves.forEach((mv, i) => { p[i] = Math.exp(scores[mv.index] - max); sum += p[i]; });
  for (let i = 0; i < p.length; i++) p[i] /= sum;
  return p;
}

/* Half precision: the networks are stored as float16 to halve the download (1.4 MB a level, gzipped). The input
   values (0, 1 and a ply count up to ~100) are exact in float16. */
const f32 = new Float32Array(1);
const u32 = new Uint32Array(f32.buffer);

export function toHalf(values: Float32Array): Uint16Array {
  const out = new Uint16Array(values.length);
  for (let i = 0; i < values.length; i++) {
    f32[0] = values[i];
    const x = u32[0];
    const sign = (x >>> 16) & 0x8000;
    const exp = ((x >>> 23) & 0xff) - 127 + 15;
    const mant = x & 0x7fffff;
    if (values[i] === 0) out[i] = sign;
    else if (exp >= 31) out[i] = sign | 0x7c00;
    else if (exp <= 0) out[i] = sign; // nothing this small is ever encoded
    else out[i] = sign | (exp << 10) | (mant >>> 13);
  }
  return out;
}

export function fromHalf(bits: Uint16Array): Float32Array {
  const out = new Float32Array(bits.length);
  for (let i = 0; i < bits.length; i++) {
    const h = bits[i];
    const sign = h & 0x8000 ? -1 : 1;
    const exp = (h >>> 10) & 0x1f;
    const mant = h & 0x3ff;
    out[i] = exp === 0 ? sign * mant * 2 ** -24
      : exp === 31 ? (mant ? NaN : sign * Infinity)
        : sign * (1 + mant / 1024) * 2 ** (exp - 15);
  }
  return out;
}
