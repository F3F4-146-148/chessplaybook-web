/**
 * Fixtures for the Game report (#374, plan A1): one real game, analysed once by the
 * browser engine and saved, and summaries written in the server's own templates
 * (backend/src/services/v2/GameSummaryExpressions.ts).
 *
 * The game is Tal - Jimenez Morales, Sevilla 1992 (`/champions/tal/games/1`). Its
 * analysis came from the body the page sends to `POST /api/game-summary` on the local
 * site: `evalGraph`, `bestMoves`, `mateIn`. With no LC0 policy it has no Brilliant
 * move, and it has inaccuracies on both sides, a mistake and a blunder (Black's), so
 * every kind of class row is covered: one that opens for each side, and one with
 * nothing to open.
 *
 * `cacheCheckBundle` answers `GET /api/game-summary/cache-check` in the exact shape
 * `useGameReview` reads, so the report renders from it with no engine run (the guard,
 * plan C1, and the dev page use it).
 */
import game from './talJimenez1992.json';
import summaries from './summaries.json';
import type { GameSummaryResult } from '../useGameReview';
import type { ChessGame } from '@/types/chess';

export const FIXTURE_GAME = game as {
  white: string; black: string; result: string; eco: string;
  uci: string[]; san: string[]; evals: number[]; bestMoves: string[]; mateIn: (number | null)[];
};

export const FIXTURE_METADATA: ChessGame = {
  playerName: 'Tal',
  white: FIXTURE_GAME.white,
  black: FIXTURE_GAME.black,
  result: FIXTURE_GAME.result,
  event: 'Sevilla op',
  site: 'Sevilla',
  date: '1992',
  eco: FIXTURE_GAME.eco,
};

/** The long summary has a champion link and a critical move (Black's blunder, 30... Rd8, ply index 59);
 *  the short one is one-sided, with no champion and no critical move. JSON so the guard can read it. */
export const SUMMARY_LONG: GameSummaryResult = summaries.long as GameSummaryResult;
export const SUMMARY_SHORT: GameSummaryResult = summaries.short as GameSummaryResult;

export type FixtureSummaryState = 'long' | 'short' | 'none';

export function fixtureSummary(state: FixtureSummaryState): GameSummaryResult | null {
  return state === 'long' ? SUMMARY_LONG : state === 'short' ? SUMMARY_SHORT : null;
}

/** The cache-check answer for a summary state (`useGameReview.ts`, step 1). */
export function cacheCheckBundle(state: Exclude<FixtureSummaryState, 'none'>) {
  const s = fixtureSummary(state)!;
  return {
    cached: true,
    result: {
      summary: { text: s.summary, cta: s.cta, championLink: s.championLink, criticalMoveIndex: s.criticalMoveIndex },
      policyData: null,
      evals: FIXTURE_GAME.evals,
      bestMoves: FIXTURE_GAME.bestMoves,
      mateIn: FIXTURE_GAME.mateIn,
    },
  };
}
