/**
 * What the free plan limits and Premium does not, shown on /premium's comparison and /membership's "what Premium
 * includes" (#467 plan B3): one list, so the two pages cannot disagree. The numbers are the server's
 * (FREE_PLAN_ALLOWANCE, tested against backend FREE_PLAN_LIMITS).
 *
 * Own-game puzzles joined 2026-11-24 (#474, owner): it was the one limited feature the page did not name.
 */
import { FREE_PLAN_ALLOWANCE as A } from '@/services/freePlanLimit';

export const perDay = (n: number) => `${n} a day`;

export const LIMITED: ReadonlyArray<readonly [feature: string, free: string]> = [
  ['Opening variations to learn', perDay(A.opening_variation)],
  ['Opening training sessions', perDay(A.opening_session)],
  ['Game reports', perDay(A.game_report)],
  ['Position explanations', perDay(A.explain_position)],
  ['Puzzle explanations', perDay(A.puzzle_explanation)],
  ['Puzzles from your games', `${A.game_puzzles} games a day`],
  ['Champion Challenge', perDay(A.challenge_session)],
];
