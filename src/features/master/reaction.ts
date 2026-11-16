/**
 * HIS FACE AT YOUR MOVE (MASTER_CHARACTER_IMPLEMENTATION_PLAN D9, #186).
 *
 * A face only, never words (owner, 2026-11-15): Maia's estimate is rough and may disagree with the Stockfish game
 * report afterwards, so he never SAYS a move was a mistake. From two Maia evaluations, of the position before your
 * move (you to move) and after it (him to move), and the probability Maia gave the move you chose:
 *
 * - your chances clearly dropped: kindly serious;
 * - a move Maia found unlikely, and your chances held or rose: surprised (a clever move);
 * - your chances clearly rose: pleased;
 * - otherwise no reaction, so he is not smiling at every move.
 *
 * Chances are win + half a draw. The thresholds are first values, tuned by the owner's games (C8).
 */
import type { MasterExpression } from '@/components/master/masterAssets';
import type { MaiaEvaluation } from './maia/maiaEngine';

export const REACTION = { drop: 0.15, rise: 0.08, unlikely: 0.1, holds: -0.03 };

export function reactionTo(before: MaiaEvaluation, after: MaiaEvaluation, playerUci: string): MasterExpression | null {
  // before: the player is to move; after: the Master is to move, so the player's win is his loss
  const chancesBefore = before.wdl[0] + before.wdl[1] / 2;
  const chancesAfter = after.wdl[2] + after.wdl[1] / 2;
  const delta = chancesAfter - chancesBefore;
  const p = before.moves.find((m) => m.uci === playerUci)?.p ?? 0;
  if (delta <= -REACTION.drop) return 'serious';
  if (p < REACTION.unlikely && delta >= REACTION.holds) return 'surprised';
  if (delta >= REACTION.rise) return 'pleased';
  return null;
}
