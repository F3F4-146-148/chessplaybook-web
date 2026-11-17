/**
 * WHAT THE MASTER READS ALOUD FROM THE PUZZLES CARD (#298, owner 2026-11-17: "make him speak the puzzle's
 * description and the Correct! Puzzle solved and so on").
 *
 * The card's headline and detail come from two places: the server's goal and hint sentences
 * (`backend/src/services/v2/PuzzlePrompt.ts`, `allPuzzleCardSentences`) and the page's own messages below. Every one
 * is recorded offline (`puzzleCardLines.json`, made by `backend/scripts/master/puzzle-card-lines.ts`); a text that
 * is not in that file is shown and never spoken (run figures, errors, "Loading puzzle...").
 *
 * NOT SPOKEN, by the owner's rule (#186 D9, kept 2026-11-17): a wrong move gets his serious face, never words, so
 * "Incorrect. Keep trying." and the "White to move. Keep going." that follows a miss stay silent. "Solution shown."
 * is not said either (owner, 2026-11-17): after the solution he says only his own line, once.
 */
export const PUZZLE_CARD_HEADLINES = [
  'White to move',
  'Black to move',
  'Correct! Keep going...',
  'Correct so far — keep going',
  'Correct! Puzzle solved.',
  'Trying a variation',
] as const;
