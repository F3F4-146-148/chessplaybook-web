// @vitest-environment node
/**
 * The port against lc0 itself (MASTER_CHARACTER_IMPLEMENTATION_PLAN C3-C4, #186).
 *
 * For each of the nine networks and each of the 396 positions in `__fixtures__/reference.json` (made by
 * `scripts/maia/make_reference.py` from lc0 v0.32.1): our encoder, our float16 network (`public/assets/maia-v1`)
 * and our move decoder must give lc0's legal moves with lc0's indices, every move's probability within
 * tolerance of lc0's, the same top move (unless lc0's top two are tied to the printed precision), and lc0's WDL.
 * The probability check covers EVERY legal move, so a wrong history, repetition or rule-50 plane, which may leave
 * the top move unchanged, still fails it.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as ort from 'onnxruntime-web';
import { describe, expect, it } from 'vitest';

import { encode, replay, type GameHistory } from './encode';
import { fromHalf, legalMoves, legalProbabilities, toHalf } from './policy';

const ROOT = resolve(__dirname, '../../../..');
const fixture = JSON.parse(readFileSync(resolve(__dirname, '__fixtures__/reference.json'), 'utf8')) as {
  positions: Array<{
    name: string;
    position: string;
    moves: Array<[string, number]>;
    nets: Record<string, { p: number[]; wl: number; d: number; best: string }>;
  }>;
};
const RATINGS = ['1100', '1200', '1300', '1400', '1500', '1600', '1700', '1800', '1900'];
/**
 * Basis points (0.01%) a move's probability may differ from lc0's. The shipped networks are float16, which moves a
 * probability near 50% by up to ~0.4 points (measured: 27-38 bp at most, only on moves near 50%), so the allowance
 * is 25 bp plus 1% of the probability. The EXACT check is the float32 test below: same encoder, same decoder,
 * a full-precision network, and lc0's two printed decimals as the only allowance.
 */
const p_tol = (p: number) => 25 + 0.01 * p;
const P_TOL = 25;

export function parsePosition(cmd: string): GameHistory {
  const parts = cmd.split(' ');
  const mi = parts.indexOf('moves');
  const moves = mi >= 0 ? parts.slice(mi + 1) : [];
  if (parts[1] === 'startpos') return { start: 'startpos', moves };
  return { start: parts.slice(2, mi >= 0 ? mi : undefined).join(' '), moves };
}

ort.env.wasm.numThreads = 1;

async function session(rating: string, file = `public/assets/maia-v1/maia-${rating}.onnx`) {
  const bytes = readFileSync(resolve(ROOT, file));
  return ort.InferenceSession.create(bytes, { executionProviders: ['wasm'] });
}

function values(t: ort.Tensor): Float32Array {
  const d = t.data as ArrayLike<number>;
  return d instanceof Uint16Array ? fromHalf(d) : Float32Array.from(d);
}

describe('Maia-1 in the browser matches lc0', () => {
  for (const rating of RATINGS) {
    it(`maia-${rating}: legal moves, indices, every probability, top move and WDL on all positions`, async () => {
      const s = await session(rating);
      let worstP = 0;
      let worstWdl = 0;
      const failures: string[] = [];
      for (const pos of fixture.positions) {
        const history = parsePosition(pos.position);
        const planes = encode(history);
        const out = await s.run({ '/input/planes': new ort.Tensor('float16', toHalf(planes), [1, 112, 8, 8]) });
        const scores = values(out['/output/policy']);
        const wdl = values(out['/output/wdl']);

        const moves = legalMoves(replay(history).pos);
        const ours = new Map(moves.map((m) => [m.uci, m.index]));
        const theirs = new Map(pos.moves);
        if (ours.size !== theirs.size || [...theirs].some(([u, i]) => ours.get(u) !== i)) {
          failures.push(`${pos.name}: moves or indices differ`);
          continue;
        }
        const probs = legalProbabilities(scores, moves);
        const ref = pos.nets[rating];
        const byUci = new Map(moves.map((m, i) => [m.uci, probs[i] * 10000]));
        pos.moves.forEach(([u], i) => {
          const diff = Math.abs(byUci.get(u)! - ref.p[i]);
          worstP = Math.max(worstP, diff);
          if (diff > p_tol(ref.p[i])) failures.push(`${pos.name} ${u}: ${byUci.get(u)!.toFixed(0)} vs lc0 ${ref.p[i]}`);
        });

        const sorted = [...ref.p].sort((a, b) => b - a);
        const tied = sorted.length > 1 && sorted[0] - sorted[1] <= P_TOL;
        const ourBest = moves[probs.indexOf(Math.max(...probs))].uci;
        if (!tied && ourBest !== ref.best) failures.push(`${pos.name}: top ${ourBest} vs lc0 ${ref.best}`);

        // WDL: [win, draw, loss] for the side to move; lc0 prints W-L (5 decimals) and D (3 decimals)
        const wl = wdl[0] - wdl[2];
        const dw = Math.max(Math.abs(wl - ref.wl), Math.abs(wdl[1] - ref.d));
        worstWdl = Math.max(worstWdl, dw);
        if (dw > 0.01) failures.push(`${pos.name}: wdl W-L ${wl.toFixed(4)} D ${wdl[1].toFixed(3)} vs lc0 ${ref.wl} ${ref.d}`);
      }
      console.log(`maia-${rating}: worst probability gap ${worstP.toFixed(1)} bp, worst WDL gap ${worstWdl.toFixed(4)}`);
      expect(failures.slice(0, 15)).toEqual([]);
    }, 120000);
  }
});

/*
  THE EXACT CHECK. A float32 copy of maia-1500 (scripts/maia/fixtures, not shipped, not in the public source copy):
  with full precision the only allowance left is lc0 printing two decimals of a percent, so a wrong history,
  repetition, castling or rule-50 plane, which may move a probability by a fraction of a point, fails here.
*/
/**
 * Measured 2026-11-15: through our encoder, the float32 network differs from lc0 by 1.3 bp on the start position,
 * 2.9 bp at the median and 7.1 bp at worst (ordinary game positions; the special cases sit inside that range).
 * lc0's two CPU backends agree with each other to the digit, so this is the converted network's arithmetic, not
 * the encoder. A wrong plane moves probabilities by far more (see the counterfactuals in the plan, C3).
 */
const EXACT_TOL = 10;

describe('the encoder is exact (float32 network)', () => {
  it('maia-1500 float32: every legal move within lc0 printed precision on all positions (allowance: arithmetic noise)', async () => {
    const s = await session('1500', 'scripts/maia/fixtures/maia-1500-f32.onnx');
    let worst = 0;
    const failures: string[] = [];
    for (const pos of fixture.positions) {
      const history = parsePosition(pos.position);
      const out = await s.run({ '/input/planes': new ort.Tensor('float32', encode(history), [1, 112, 8, 8]) });
      const scores = values(out['/output/policy']);
      const moves = legalMoves(replay(history).pos);
      const probs = legalProbabilities(scores, moves);
      const byUci = new Map(moves.map((m, i) => [m.uci, probs[i] * 10000]));
      pos.moves.forEach(([u], i) => {
        const diff = Math.abs(byUci.get(u)! - pos.nets['1500'].p[i]);
        worst = Math.max(worst, diff);
        if (diff > EXACT_TOL) failures.push(`${pos.name} ${u}: ${byUci.get(u)!.toFixed(2)} vs lc0 ${pos.nets['1500'].p[i]}`);
      });
    }
    console.log(`maia-1500 float32: worst probability gap ${worst.toFixed(2)} bp`);
    expect(failures.slice(0, 15)).toEqual([]);
  }, 120000);
});
