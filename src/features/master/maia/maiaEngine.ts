/**
 * ONE MAIA EVALUATION (MASTER_CHARACTER_IMPLEMENTATION_PLAN C5, #186).
 *
 * The part of the engine that does not care where it runs: given an onnxruntime session for one level's network,
 * a game's history and the sampling options, it returns the move the Master plays, plus what the page needs later
 * for his reactions (D9): every legal move's probability and Maia's win/draw/loss for the side to move. The Web
 * Worker (`maia.worker.ts`) wraps it; the tests run it directly in Node.
 */
import type * as Ort from 'onnxruntime-web';

import { encode, replay, type GameHistory } from './encode';
import { fromHalf, legalMoves, legalProbabilities, toHalf } from './policy';
import { sampleMove, type SampleOptions } from './sample';

export const MAIA_RATINGS = [1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900] as const;
export type MaiaRating = (typeof MAIA_RATINGS)[number];

/** `assets/` is immutable for a year: a changed network goes in a new folder (`maia-v2/`). */
export const maiaNetUrl = (rating: MaiaRating) => `/assets/maia-v1/maia-${rating}.onnx`;

export interface MaiaEvaluation {
  /** Every legal move (standard UCI) with Maia's probability, most likely first. */
  moves: Array<{ uci: string; p: number }>;
  /** Win, draw, loss for the side to move. */
  wdl: [number, number, number];
}

export async function evaluate(ort: typeof Ort, session: Ort.InferenceSession, history: GameHistory): Promise<MaiaEvaluation> {
  const planes = encode(history);
  const out = await session.run({ '/input/planes': new ort.Tensor('float16', toHalf(planes), [1, 112, 8, 8]) });
  const scores = asFloat(out['/output/policy']);
  const wdl = asFloat(out['/output/wdl']);
  const moves = legalMoves(replay(history).pos);
  const probs = legalProbabilities(scores, moves);
  const list = moves.map((m, i) => ({ uci: m.uci, p: probs[i] })).sort((a, b) => b.p - a.p);
  return { moves: list, wdl: [wdl[0], wdl[1], wdl[2]] };
}

export function chooseMove(evaluation: MaiaEvaluation, opts: SampleOptions): string {
  return evaluation.moves[sampleMove(evaluation.moves.map((m) => m.p), opts)].uci;
}

function asFloat(t: Ort.Tensor): Float32Array {
  const d = t.data as ArrayLike<number>;
  return d instanceof Uint16Array ? fromHalf(d) : Float32Array.from(d);
}
