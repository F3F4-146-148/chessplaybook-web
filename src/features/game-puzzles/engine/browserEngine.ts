/**
 * The game-puzzle generator on the visitor's own engine (owner decision D2:
 * visitors' games are analysed in the browser, never on our server).
 *
 * `withBrowserPuzzleEngine(work)` hands `work` a PuzzleEngine backed by the
 * site's Stockfish 18 worker (AnalysisService), for the length of `work`:
 * the analysis panel is paused and restored around it.
 *
 * `evalsFromGameReport` turns the Game report's per-position arrays into the
 * generator's first pass, so a game the report has just analysed costs only
 * the confirming searches.
 */
import { analysisService } from '@/services/AnalysisService';
import type { PositionEval, PuzzleEngine } from '../generator/types';
import { parseMultiPv } from './parseMultiPv';

export function withBrowserPuzzleEngine<T>(work: (engine: PuzzleEngine) => Promise<T>): Promise<T> {
  return analysisService.runEngineSession((search) => work({
    async analyse(fen, multiPv, depth) {
      return parseMultiPv(await search(fen, multiPv, depth));
    },
  }));
}

/**
 * The Game report's arrays (AnalysisService.analyzeFullGameClientSide, or a
 * cached report): one entry per position, White's point of view, a mate as
 * evalCp +-10000 with `mateIn` signed for White.
 *
 * - A search that timed out comes back as eval 0 with no best move. It is not a
 *   level position, so it becomes null and the generator searches it itself
 *   (#245 section 4.2: never read a timed-out search as level).
 * - `mate 0` (the side to move is already mated) loses its sign in `mateIn`
 *   (0 * flip); the sign is read from evalCp, which carries it.
 */
export function evalsFromGameReport(report: {
  evals: number[];
  bestMoves: string[];
  mateIn: Array<number | null>;
}): Array<PositionEval | null> {
  return report.evals.map((evalCp, i) => {
    const mateIn = report.mateIn[i] ?? null;
    const best = report.bestMoves[i] ?? '';
    if (mateIn === null && evalCp === 0 && best === '') return null;
    if (mateIn !== null) {
      const mate = mateIn !== 0 ? mateIn : (evalCp > 0 ? 1 : -1);
      return { cp: null, mate };
    }
    return { cp: evalCp, mate: null };
  });
}
