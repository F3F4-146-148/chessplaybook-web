/**
 * What the free plan limits and Premium does not, shown on /premium's comparison and /membership's "what Premium
 * includes" (#467 plan B3): one list, so the two pages cannot disagree. The numbers are the server's
 * (FREE_PLAN_ALLOWANCE, tested against backend FREE_PLAN_LIMITS).
 *
 * Own-game puzzles joined 2026-11-24 (#474, owner): it was the one limited feature the page did not name.
 * Puzzles joined 2026-11-26 (#521 C, owner), first: the feature people use, and the one the puzzle ask sends here for.
 * "Game reports and their puzzles" (#521, owner after the staging test): the report's puzzles (#510) are covered by
 * the report's daily use, so the row names them.
 * Guided games join with the feature itself (#428 D6, owner 2026-11-26: "Guided games with the Master", 1 a day): behind
 * GUIDED_LIVE, so neither page names a feature nobody can reach yet.
 */
import { FREE_PLAN_ALLOWANCE as A } from '@/services/freePlanLimit';
import { GUIDED_LIVE } from '@/design/designFlags';

export const perDay = (n: number) => `${n} a day`;

export const LIMITED: ReadonlyArray<readonly [feature: string, free: string]> = [
  ['Puzzles', perDay(A.puzzle)],
  /* Second, after puzzles (owner, 2026-11-27): after puzzles, games against the Master are what people use most. */
  ...(GUIDED_LIVE ? [['Guided games with the Master', perDay(A.guided_game)] as const] : []),
  ['Opening variations to learn', perDay(A.opening_variation)],
  ['Opening training sessions', perDay(A.opening_session)],
  ['Game reports and their puzzles', perDay(A.game_report)],
  ['Position explanations', perDay(A.explain_position)],
  ['Puzzle explanations', perDay(A.puzzle_explanation)],
  ['Puzzles from your games', `${A.game_puzzles} games a day`],
  ['Champion Challenge', perDay(A.challenge_session)],
];
