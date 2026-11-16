/**
 * DRAWS BY RULE (MASTER_CHARACTER_IMPLEMENTATION_PLAN D2, #186).
 *
 * chessops's `isEnd()` knows checkmate, stalemate and insufficient material, not threefold repetition or the
 * 50-move rule, so a game against an opponent who cannot convert a won ending (Maia does not search) could go on
 * for ever. Both are declared automatically, as chess.com does against the computer.
 */
import type { Chess } from 'chessops/chess';
import { makeFen } from 'chessops/fen';

/** The part of a FEN that defines a repetition: placement, side to move, castling, en passant. */
export function repetitionKey(pos: Chess): string {
  return makeFen(pos.toSetup()).split(' ').slice(0, 4).join(' ');
}

export type DrawRule = 'threefold' | 'fifty-moves' | null;

/** `keys`: the repetition key of every position of the game so far, the current one last. */
export function drawByRule(pos: Chess, keys: string[]): DrawRule {
  if (pos.isCheckmate()) return null;
  const now = keys[keys.length - 1];
  if (keys.filter((k) => k === now).length >= 3) return 'threefold';
  if (pos.halfmoves >= 100) return 'fifty-moves';
  return null;
}
