/**
 * #379: the Game report's brilliant moves and critical move, computed in the browser after the report's batch.
 *
 * `detectBrilliantMoves(input, deps)` runs the two rules of `brilliantRule.ts`: the board facts (no engine), then
 * Maia 1900 on the positions that pass either rule's cheap tests, then a fresh two-line search on those Maia finds
 * surprising, then the decisions. The answer is `complete` or `failed`, never a guess: any timed-out position in the
 * batch, any Maia or search failure, a search that did not reach depth 16, or the whole step passing its budget gives
 * `failed`, and a failed report shows no brilliant move and no critical move (plan A4, B2).
 *
 * `detectBrilliantMovesInBrowser(input)` wires the real Maia (`MaiaOpponent`, loaded only when a position needs it)
 * and the site's Stockfish worker (`analysisService.runEngineSession`).
 */
import { analysisService } from './AnalysisService';
import { conclude, needsSearch, prepareAsync, secondLine, winFor, type GameInput, type SecondLine } from './brilliantRule';

export type Detection =
  | {
      status: 'complete';
      moves: Array<{ moveIndex: number; type: 1 | 2 }>;
      /** The button's move, or null for no button. */
      critical: number | null;
    }
  | { status: 'failed'; moves: []; critical: null; reason: string };

export interface DetectionInput extends GameInput {
  /** The batch's best move per position; an empty one marks a search that timed out. */
  bestMoves: string[];
}

export interface DetectionDeps {
  /** Maia 1900's probability for every legal move after `moves` (UCI from the start). */
  maia: (moves: string[]) => Promise<Array<{ uci: string; p: number }>>;
  /**
   * One fresh MultiPV 2, depth 16 search of a position given as the game's moves from the start ("startpos moves
   * e2e4 …", as the rule was measured): the engine's `info` and `bestmove` lines, side-to-move scores.
   */
  search: (position: string) => Promise<string[]>;
}

export const DETECTION_BUDGET_MS = 30_000;
const DEPTH = 16;

const failed = (reason: string): Detection => ({ status: 'failed', moves: [], critical: null, reason });

class DetectionFailure extends Error {}

/**
 * The two-line search's lines in White's centipawns (a mate as +-10000, as the report stores evaluations), or a
 * failure when the search did not finish (no bestmove) or a line stopped short of depth 16. One line only (a single
 * legal move) is a complete answer.
 */
export function readTwoLines(raw: string[], whiteToMove: boolean): Array<{ move: string; cp: number }> {
  if (!raw.some((l) => l.startsWith('bestmove'))) throw new DetectionFailure('search did not finish');
  const flip = whiteToMove ? 1 : -1;
  const byIndex = new Map<number, { move: string; cp: number; depth: number }>();
  for (const line of raw) {
    if (!line.startsWith('info ') || line.includes(' lowerbound') || line.includes(' upperbound')) continue;
    const pvAt = line.indexOf(' pv ');
    if (pvAt < 0) continue;
    const head = line.slice(0, pvAt);
    const cp = head.match(/ score cp (-?\d+)/);
    const mate = head.match(/ score mate ([-+]?\d+)/);
    if (!cp && !mate) continue;
    const move = line.slice(pvAt + 4).trim().split(/\s+/)[0];
    if (!move) continue;
    const k = Number(head.match(/ multipv (\d+)/)?.[1] ?? 1);
    const depth = Number(head.match(/ depth (\d+)/)?.[1] ?? 0);
    const score = cp ? Number(cp[1]) * flip : (Number(mate![1]) > 0 ? 10000 : -10000) * flip;
    byIndex.set(k, { move, cp: score, depth });
  }
  const lines = [...byIndex.entries()].sort(([a], [b]) => a - b).map(([, l]) => l).slice(0, 2);
  if (!lines.length) throw new DetectionFailure('search gave no line');
  if (lines.some((l) => l.depth < DEPTH)) throw new DetectionFailure('search stopped short of depth 16');
  return lines.map(({ move, cp }) => ({ move, cp }));
}

export async function detectBrilliantMoves(
  input: DetectionInput,
  deps: DetectionDeps,
  budgetMs = DETECTION_BUDGET_MS,
): Promise<Detection> {
  if (input.bestMoves.some((m) => !m)) return failed('a position of the batch timed out');
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Past the budget the answer is `failed`, and the work stops at its next step: no Maia call or search starts after
  // the engine session that runs it has ended.
  const state = { over: false };
  const budget = new Promise<Detection>((resolve) => {
    timer = setTimeout(() => {
      state.over = true;
      resolve(failed('over budget'));
    }, budgetMs);
  });
  try {
    return await Promise.race([run(input, deps, state), budget]);
  } catch (e) {
    return failed(e instanceof Error ? e.message : 'detection failed');
  } finally {
    clearTimeout(timer);
  }
}

async function run(input: DetectionInput, deps: DetectionDeps, state: { over: boolean }): Promise<Detection> {
  const step = () => {
    if (state.over) throw new DetectionFailure('over budget');
  };
  const p = await prepareAsync(input);
  const maiaP = new Map<number, number>();
  const second = new Map<number, SecondLine | null>();
  if (p.needMaia.length) {
    for (const i of p.needMaia) {
      step();
      const list = await deps.maia(input.moves.slice(0, i));
      maiaP.set(i, list.find((m) => m.uci === input.moves[i])?.p ?? 0);
    }
    for (const i of p.needMaia) {
      if (!needsSearch(maiaP.get(i) ?? null)) continue;
      step();
      const position = i === 0 ? 'startpos' : `startpos moves ${input.moves.slice(0, i).join(' ')}`;
      const lines = readTwoLines(await deps.search(position), i % 2 === 0);
      second.set(i, secondLine(lines, input.moves[i], (cp) => winFor(i, cp)));
    }
  }
  const r = conclude(p, (i) => maiaP.get(i) ?? null, (i) => second.get(i) ?? null);
  return { status: 'complete', moves: r.brilliant, critical: r.critical };
}

/** The real Maia and the site's engine. Maia's worker is started only when a position needs it, and closed after. */
export async function detectBrilliantMovesInBrowser(input: DetectionInput): Promise<Detection> {
  if (input.bestMoves.some((m) => !m)) return failed('a position of the batch timed out');
  let opponent: import('@/features/master/maia/MaiaOpponent').MaiaOpponent | null = null;
  try {
    return await analysisService.runEngineSession(
      (search) => detectBrilliantMoves(input, {
        async maia(moves) {
          if (!opponent) {
            const { MaiaOpponent } = await import('@/features/master/maia/MaiaOpponent');
            opponent = new MaiaOpponent(1900);
          }
          return (await opponent.evaluate({ start: 'startpos', moves })).moves;
        },
        // A search the session gave up on answers null: no bestmove, so the detection fails.
        search: async (position) => (await search(position, 2, DEPTH)) ?? [],
      }),
      10_000,
    );
  } finally {
    opponent?.dispose();
  }
}
