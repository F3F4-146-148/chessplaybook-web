/**
 * #428 D4: WHAT THE END SUMMARY OF A GUIDED GAME SAYS (analysis 3.5): the player's two biggest mistakes among the
 * moves that stand, each with SF's better move; and one thing to work on, chosen by the stage (SF's, the server's
 * rule) where the biggest mistake was played: the opening principles, or the puzzles of that stage. The counts come
 * from the game and Hint as they are.
 *
 * A guided game always starts from the starting position (`?fen=` turns it off), so the moves are replayed from there.
 */
import { useEffect, useMemo, useState } from 'react';

import { applyMove, initialPosition, uciToSan, type ChessPosition } from '@/components/chess/chessLogic';
import { biggestMistakes, type MoveGrade } from './useGuidedGame';
import { fetchStage, type HintStage } from './guidedApi';

export interface SummaryMistake {
  /** The move's ply in the line (1 = the game's first move); "Go to" shows the position after it. */
  ply: number;
  /** "14. Nxe5" or "14... Nxe5" */
  played: string;
  /** SF's better move, written the same way, or null when unknown. */
  better: string | null;
  /** The win% it cost. */
  loss: number;
}

export interface WorkOn { label: string; href: string }

/** The link for a stage (owner to approve the words). */
export function workOnFor(stage: HintStage): WorkOn {
  if (stage === 'opening') return { label: 'Opening principles', href: '/openings?welcome=1' };
  if (stage === 'endgame') return { label: 'Endgame puzzles', href: '/puzzles?area=endgame' };
  return { label: 'Middlegame puzzles', href: '/puzzles?area=middlegame' };
}

const numbered = (ply: number, san: string) => `${Math.ceil(ply / 2)}${ply % 2 === 1 ? '.' : '...'} ${san}`;

/** The mistakes written out: the move played and SF's better one, from the position before the move. */
export function writeMistakes(mistakes: readonly MoveGrade[], moves: readonly string[]): SummaryMistake[] {
  return mistakes.map((m) => {
    let pos: ChessPosition | null = initialPosition();
    for (const u of moves.slice(0, m.ply - 1)) pos = pos ? applyMove(pos, u) : null;
    const played = pos ? uciToSan(pos, m.uci) : null;
    const better = pos && m.best && m.best !== m.uci ? uciToSan(pos, m.best) : null;
    return { ply: m.ply, played: numbered(m.ply, played ?? m.uci), better: better ? numbered(m.ply, better) : null, loss: Math.round(m.before - m.after) };
  });
}

export function useGuidedSummary({ ended, gameId, grades, moves }: {
  ended: boolean;
  gameId: string | null;
  grades: readonly MoveGrade[];
  moves: readonly string[];
}): { mistakes: SummaryMistake[]; workOn: WorkOn | null } {
  const picked = useMemo(() => (ended ? biggestMistakes(grades, moves) : []), [ended, grades, moves]);
  const mistakes = useMemo(() => writeMistakes(picked, moves), [picked, moves]);
  const [workOn, setWorkOn] = useState<WorkOn | null>(null);
  const first = picked[0]?.ply ?? null;
  useEffect(() => {
    setWorkOn(null);
    if (!ended || !gameId || first === null) return;
    let live = true;
    // The stage of the position the mistake was played in; the whole line is sent, so it binds to the game.
    void fetchStage(gameId, [...moves], first - 1).then((stage) => { if (live && stage) setWorkOn(workOnFor(stage)); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per game end and mistake, not per array identity
  }, [ended, gameId, first, moves.length]);
  return { mistakes, workOn };
}
