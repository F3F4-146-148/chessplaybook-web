/**
 * HOW THE MASTER PICKS HIS MOVE (MASTER_CHARACTER_IMPLEMENTATION_PLAN C5, #186).
 *
 * Maia at one node always plays the same move in the same position, so the Master would repeat whole games. He
 * draws instead from Maia's probabilities, raised to 1/T and renormalised, but ONLY among moves Maia gives at least
 * `floor` (the most likely move is always kept): a tail move such as a hung queen, which Maia gives a fraction of a
 * percent, is never drawn by chance. T and the floor are tuned by the owner's games (C8).
 */
export interface SampleOptions {
  /** 1 = Maia's own probabilities; lower is closer to always the top move. */
  temperature: number;
  /** Moves under this probability are never drawn (the top move always may be). */
  floor: number;
  /** A uniform number in [0, 1); injectable for tests. */
  random?: () => number;
}

export const DEFAULT_SAMPLING: SampleOptions = { temperature: 1, floor: 0.05 };

/** The index of the chosen move in `probabilities`. */
export function sampleMove(probabilities: ArrayLike<number>, opts: SampleOptions = DEFAULT_SAMPLING): number {
  const n = probabilities.length;
  if (n === 0) throw new Error('no legal moves');
  let top = 0;
  for (let i = 1; i < n; i++) if (probabilities[i] > probabilities[top]) top = i;
  if (opts.temperature <= 0) return top;

  const weights = new Float64Array(n);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    if (i !== top && probabilities[i] < opts.floor) continue;
    weights[i] = Math.pow(probabilities[i], 1 / opts.temperature);
    sum += weights[i];
  }
  let r = (opts.random ?? Math.random)() * sum;
  for (let i = 0; i < n; i++) {
    if (weights[i] === 0) continue;
    r -= weights[i];
    if (r < 0) return i;
  }
  return top;
}
