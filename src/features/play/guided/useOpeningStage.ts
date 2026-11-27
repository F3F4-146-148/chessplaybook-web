/**
 * #428 D3c: IS THE GUIDED GAME STILL IN THE OPENING? (owner, 2026-11-26: the opening-principles tab is shown "until
 * SF says the opening is over"). The server answers with SF's own rule, the one Hint and Why? use (hintLadder.stageAt);
 * the page asks after each move while the answer is still "opening", and once it is not, the opening is over for the
 * rest of the game (a takeback does not bring the tab back). Before the server knows the game (the first move not yet
 * graded) the game is in the opening. A failed answer changes nothing.
 */
import { useEffect, useRef, useState } from 'react';

import { fetchStage } from './guidedApi';

export function useOpeningStage({ enabled, gameId, moves, newGame }: {
  enabled: boolean;
  gameId: string | null;
  /** The game's moves in UCI (the store's). */
  moves: string[];
  /** The game status: the opening starts again when it becomes "playing". */
  newGame: unknown;
}): boolean {
  const [inOpening, setInOpening] = useState(true);
  /* Each answer belongs to one line: an answer for a line that is gone is dropped. */
  const askRef = useRef(0);
  /* A game starts in the opening; an answer still on its way from the last game is dropped (E2: Codex, Fable). */
  useEffect(() => { if (newGame === 'playing') { askRef.current++; setInOpening(true); } }, [newGame]);
  const movesRef = useRef(moves);
  movesRef.current = moves;
  const plies = moves.length;
  useEffect(() => {
    if (!enabled || !inOpening || !gameId || plies === 0) return;
    const ask = ++askRef.current;
    void fetchStage(gameId, [...movesRef.current]).then((stage) => {
      if (ask !== askRef.current || stage === null) return;
      if (stage !== 'opening') setInOpening(false);
    });
  }, [enabled, inOpening, gameId, plies]);
  return inOpening;
}
