/**
 * WHAT THE PUZZLES CARD SHOWS IN ITS TWO TEXT ROWS, AND WHAT THE MASTER SAYS OF THEM (#401 A1).
 *
 * Moved out of `PuzzleLiveCard.tsx` unchanged, so the card and the speech simulator
 * (`puzzleCardVoice.test.ts`) run the same rule: a count of what he says is a count of what the page does.
 *
 * The rules themselves are the card's (#298):
 * - the headline, then the line under it, each only if it was recorded (the caller maps texts to recordings);
 * - the goal ("White to play and mate", "White to move") only at the start;
 * - after a correct move mid-puzzle, or in a variation, only the headline;
 * - nothing while his face is serious (a wrong move), while the solution plays out, or while his speaker is not on
 *   screen (`faceShown`), so he never talks where he cannot be muted.
 */

/*
  AUTO-NEXT AND HIS LINE (#401 B4): the next puzzle comes 1.2 s after a solve, or a short pause after his line ends,
  whichever is later, and never later than AUTO_ADVANCE_MAX_MS after the solve (a recording that never loads must
  not hold the page). Shared by the trainer and the speech simulator. 4 s: his longest solved line is 3.2 s of speech (measured on the recordings, 2026-11-21), plus the start.
*/
export const AUTO_ADVANCE_MS = 1200;
export const AUTO_ADVANCE_MAX_MS = 4000;
export const AUTO_ADVANCE_AFTER_LINE_MS = 400;

export type CardDetail =
  | { kind: 'text'; text: string }
  /** his own line, drawn in his style */
  | { kind: 'master'; text: string }
  /** the reminder offer, a component the card renders */
  | { kind: 'offer' }
  | { kind: 'none' };

export interface PuzzleCardTextInput {
  status: string;
  message: string;
  opening: string | null;
  prompt?: string | null;
  isMidSolve: boolean;
  exploring: boolean;
  serverUnreachable: boolean;
  filterFoundNothing: boolean;
  runOutcome: { rating: number; realized: number; total: number } | null;
  /** a game puzzle's "In the game Karpov played 23...Nd4.", once resolved */
  playedLine: string | null | undefined;
  /** the reminder offer is to be shown (the card passes one) */
  hasOffer: boolean;
  /** his line for this state, null when he has none */
  masterLine: string | null;
}

export function puzzleCardTexts(i: PuzzleCardTextInput): { headline: string; detail: CardDetail } {
  const master: CardDetail = i.masterLine ? { kind: 'master', text: i.masterLine } : { kind: 'none' };
  const text = (t: string): CardDetail => ({ kind: 'text', text: t });
  const detail: CardDetail = i.serverUnreachable
    ? text('These are offline practice puzzles, so nothing here is scored.')
    : i.filterFoundNothing
      ? text('Nothing in your rating range carries it. The board still has your last puzzle.')
      : i.status === 'playing'
        ? (i.opening
          ? (!i.isMidSolve && !i.exploring && i.message === i.opening ? master : text(i.opening))
          : text(i.prompt || 'Find the best move'))
        /*
          The slot is empty once a puzzle is resolved, which is exactly when a run has just ended.

          THE RATING IS THE FIGURE (owner, 2026-08-16: *"the rating performance is a rating"*), and the score is
          what it was computed from - a bare number with nothing behind it invites "performance at what?". Partial
          solving is why it can read 3.5 rather than 4.
        */
        : i.runOutcome
          ? text(`Run performance: ${i.runOutcome.rating}, scored ${i.runOutcome.realized.toFixed(1)} of ${i.runOutcome.total}`)
          : i.playedLine
            ? text(i.playedLine)
            : i.status === 'correct' && i.hasOffer
              ? { kind: 'offer' }
              : master;
  const headline = i.serverUnreachable
    ? 'Cannot reach the server'
    : i.filterFoundNothing
      ? 'Nothing matched that filter'
      : i.exploring
        ? 'Trying a variation'
        : i.isMidSolve
          ? 'Correct so far — keep going'
          : (i.message || 'Loading puzzle...');
  return { headline, detail };
}

/**
 * Whether his own line for this state was used: shown on the card (the line under the headline) or said (#401 B1).
 * Only then does it count for "not the same as last time": a start line chosen for a puzzle with no known goal is
 * neither (the card shows the neutral prompt there), and counting it made the next puzzle avoid the wrong line
 * (found by the simulator: the same start line twice running).
 */
export function ownLineUsed(ownLine: string | null, detail: CardDetail, spoken: readonly string[] | null): boolean {
  if (!ownLine) return false;
  return (detail.kind === 'master' && detail.text === ownLine) || (spoken?.includes(ownLine) ?? false);
}

export interface PuzzleCardSpeechInput {
  status: string;
  isMidSolve: boolean;
  exploring: boolean;
  opening: string | null;
  headline: string;
  detail: CardDetail;
  /** his face and speaker are on screen */
  faceShown: boolean;
  /** his face for this state; null when the Master is not live */
  expression: string | null;
  /** his own line for this state (`puzzleMasterMoment`), shown or not */
  ownLine: string | null;
  /** a variation was entered on this puzzle after it was solved */
  explored: boolean;
}

/**
 * The texts he says for the card as it is now, in order; null when he is silent.
 *
 * HE SAYS HIS OWN LINE, NOT THE CARD'S HEADLINE (#401 B2, V1): he used to read "Correct so far — keep going" and
 * "Correct! Puzzle solved." aloud on every puzzle (measured: about 19 and 22 times in 25 puzzles, the two most
 * repeated sentences). The card still shows them; he says one line of his own:
 * - at the start: the goal, then his start line when he has one (B3: not on every puzzle);
 * - after the first correct move: his "going" line (not on the card: the line under the headline keeps the goal);
 * - in a variation: his exploring line;
 * - on a solve: his solved line, which is the line under the headline. When that line is something else (the
 *   run's result, the reminder offer, a game's "played" line) he still says his solved line, off the card (#510;
 *   until then he said nothing there, so a run of one game's puzzles had no word on any solve).
 * - after leaving a variation on a solved puzzle: nothing (he had said his piece).
 */
export function puzzleCardSpeechTexts(i: PuzzleCardSpeechInput): string[] | null {
  if (!i.faceShown || !i.expression || i.status === 'solution') return null;
  /* A wrong move: his serious face, and words only when the switch gave him a line (#401 C2b). The same line for
     the rest of the puzzle, so the 700 ms revert and a second miss never restart or repeat it. */
  if (i.expression === 'serious') return i.ownLine ? [i.ownLine] : null;
  const detailText = i.detail.kind === 'text' || i.detail.kind === 'master' ? i.detail.text : null;
  if (i.exploring) return i.ownLine ? [i.ownLine] : null;
  if (i.status === 'correct') {
    if (i.explored) return null;
    // When the card's line is something else (a game's "played" line, the run's result), he still says his solved
    // line, only not on the card (owner, #510 testing: a game run had no word on any solve).
    if (i.detail.kind === 'master') return [i.detail.text];
    return i.ownLine ? [i.ownLine] : null;
  }
  if (i.status === 'playing' && i.isMidSolve) return i.ownLine ? [i.ownLine] : null;
  const atStart = i.status === 'playing';
  const isGoal = i.headline === i.opening || /^(White|Black) to move$/.test(i.headline);
  if (isGoal && !atStart) return null;
  return atStart && detailText ? [i.headline, detailText] : [i.headline];
}
