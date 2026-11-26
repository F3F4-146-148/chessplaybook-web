/**
 * #428 B3: THE WARNING GATE of a guided game, as A1 measured it and the owner ruled at A3 (rule B):
 *
 *   - a win% loss of GATE (20) or more, from Lichess's formula (the Game report's), confirmed by a longer search;
 *   - never in a position already lost (win% under 20 before the move);
 *   - a mate allowed always warns (his line mates the player), unless the player was already being mated;
 *   - a draw the move makes by rule (stalemate, repetition, 50 moves, material) from a winning score (75+) warns.
 *
 * Pure: the scores come from `AnalysisService.searchScore`, which is from the side to move's point of view. The
 * search BEFORE the move has the player to move; the search AFTER it has the Master to move.
 */
import type { SearchScore } from '@/services/AnalysisService';

export const GATE = 20;
export const ALREADY_LOST = 20;
export const DRAW_FROM_WINNING = 75;

/** Lichess's winning chances, 0-100, for a centipawn score from one side's point of view. */
export const winPct = (cp: number) => 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * Math.max(-1000, Math.min(1000, cp)))) - 1);

/** The player's win% from a search; `playerToMove` says whose point of view the search's score is. */
export function playerWin(s: Pick<SearchScore, 'cp' | 'mate'>, playerToMove: boolean): number {
  if (s.mate !== null) return (s.mate > 0) === playerToMove ? 100 : 0;
  const cp = s.cp ?? 0;
  return winPct(playerToMove ? cp : -cp);
}

export type GateKind = 'mate_allowed' | 'draw_thrown' | 'loss';

export interface GateVerdict {
  /** Past the gate: confirm it (a loss) or warn now (a mate or a draw, which a longer search does not undo). */
  kind: GateKind | null;
  before: number;
  after: number;
  /** His line mates the player: told to the server as `mateForHim` (A3). */
  mateForHim: boolean;
}

/**
 * `before`: the search of the position before the move (player to move). `after`: the search after it (his move),
 * or null when the move ended the game. `drawByRule`: the move ended the game in a draw.
 */
export function gate(before: Pick<SearchScore, 'cp' | 'mate'>, after: Pick<SearchScore, 'cp' | 'mate'> | null, drawByRule: boolean): GateVerdict {
  const b = playerWin(before, true);
  if (drawByRule) return { kind: b >= DRAW_FROM_WINNING ? 'draw_thrown' : null, before: b, after: 50, mateForHim: false };
  if (!after) return { kind: null, before: b, after: b, mateForHim: false };
  const a = playerWin(after, false);
  const mateForHim = after.mate !== null && after.mate > 0;
  const alreadyMated = before.mate !== null && before.mate < 0;
  if (b < ALREADY_LOST) return { kind: null, before: b, after: a, mateForHim }; // rule B: never in a lost position
  if (mateForHim && !alreadyMated) return { kind: 'mate_allowed', before: b, after: a, mateForHim };
  return { kind: b - a >= GATE ? 'loss' : null, before: b, after: a, mateForHim };
}

/** A loss past the gate stands only if the longer search of the position after the move agrees. */
export function confirmed(verdict: GateVerdict, confirmAfter: Pick<SearchScore, 'cp' | 'mate'> | null): boolean {
  if (verdict.kind !== 'loss') return verdict.kind !== null;
  if (!confirmAfter) return false; // no answer in time: no warning (the plan: a failed grade means no warning)
  if (confirmAfter.mate !== null && confirmAfter.mate > 0) return true;
  return verdict.before - playerWin(confirmAfter, false) >= GATE;
}
