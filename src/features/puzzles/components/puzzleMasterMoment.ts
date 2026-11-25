import type { MasterExpression } from '@/components/master/masterAssets';
import puzzleLines from '@/features/master/puzzleLines.json';
import puzzleCardLines from '@/features/master/puzzleCardLines.json';
import { PUZZLE_AUDIO_BASE, voicedLine } from '@/features/master/eventLines';
import type { MasterLine } from '@/features/master/narrationApi';
import { browserLineStore, chooseLine, noteLineUsed, type LineStore } from '@/features/master/lineChooser';

/**
 * WHAT THE MASTER LOOKS LIKE AND SAYS ON THE PUZZLES CARD (MASTER_CHARACTER_IMPLEMENTATION_PLAN B1, #186).
 *
 * One face and at most one short line per state, as in the mock-ups the owner reviewed (2026-11-15). His lines
 * NEVER name the motif, the move, the move count or the outcome (puzzles rule B2): the card's headline already
 * says the goal ("Black to play and mate"), so he only encourages. Pure, so it is tested without a page.
 *
 * A line is chosen once per puzzle and kept (`linesForPuzzle`, #401 B1), never the same as last time for that
 * moment.
 */
export interface PuzzleMasterInput {
  status: string;
  isMidSolve: boolean;
  exploring: boolean;
  /** A wrong move was played on this puzzle (the attempt is scored; `failed` itself lasts only 700 ms). */
  missed: boolean;
  /** The card is saying something else (no server, nothing matched): he keeps quiet. */
  quiet: boolean;
  puzzleId?: string | null;
  /** how long the solve took, for "Quick!" (#401 C2); unknown: never quick */
  solveMs?: number | null;
  /** the wrong-move line's switch is on (#401 C2b) */
  sayMissed?: boolean;
}

export interface PuzzleMasterMoment {
  expression: MasterExpression;
  line: string | null;
}

/*
  His lines live in `src/features/master/puzzleLines.json` with the name of each recording (#298: he speaks them in
  George's voice; `backend/scripts/master/synthesize-kokoro.ts` voices that file), so the text has one home.
*/
type PoolName = keyof typeof puzzleLines;
export const PUZZLE_MASTER_LINES = Object.fromEntries(
  Object.entries(puzzleLines).map(([pool, lines]) => [pool, lines.map((l) => l.text)]),
) as Record<PoolName, string[]>;

// his own lines and the card's texts he reads aloud (`puzzleCardSpeech.ts`): one lookup, text to recording
const KEYS = new Map([...Object.values(puzzleLines).flat(), ...puzzleCardLines].map((l) => [l.text, l.key]));

/** A puzzles-card text (his line, a goal, a hint, a message) with its recording and cues; null if never voiced. */
export function puzzleVoiceLine(text: string | null): MasterLine | null {
  const key = text ? KEYS.get(text) : undefined;
  return key ? voicedLine(text!, key, PUZZLE_AUDIO_BASE) : null;
}

/*
  WHICH LINE FOR EACH MOMENT OF A PUZZLE (#401 B1, B3, C2): chosen ONCE per puzzle, the first time the card needs a
  line for it, and kept in a module-level map, so a re-render, StrictMode's discarded mount or a remount of the card
  gets the same choice and the line on screen never changes mid-puzzle; the preload uses the same lines.
  `lineChooser` keeps the same line from coming twice in a row; a line counts as used only when it is shown or said
  (`noteLineReached`), so a line chosen and never reached uses up nothing.

  THE START LINE LESS OFTEN (#401 B3, V2): the goal is read on every puzzle; his "Take your time." after it only on
  the first puzzle of a run (or of the visit) and about one in three after. When not said it is not shown either.

  A SOLVE AFTER A MISS (#401 B2b): not scored, so not "Beautiful!": its own plainer pool ("You got there.").

  LINES THAT REACT TO WHAT HAPPENED (#401 C2, V5, owner-approved 2026-11-21), each only from a fact the page has:
  - a returning player's first puzzle of the visit opens with "Welcome back." instead of a start line (someone who
    solved on an earlier day);
  - a clean solve that makes 3, 5 or 10 clean solves in a row this visit: "Three in a row.";
  - a clean solve of a puzzle 200+ points above the player's rating: "That was a hard one. Well found.";
  - a clean solve in under 10 s: "Quick!".
  One at most, in that order, in place of his usual solved line. Clean: no wrong move on the puzzle.

  A LINE AFTER A WRONG MOVE (#401 C2b, D4): today a mistake gets his face, never words. Behind a switch
  (`?masterMissed=1`, remembered in this browser) he says "Not that one. Have another look." once per puzzle, so the
  owner can try it before anyone else hears it.
*/
export interface PuzzleLines {
  start: string | null;
  going: string;
  solved: string;
  solvedAfterMiss: string;
  solution: string;
  exploring: string;
  /** a streak milestone (3, 5, 10) reached by solving this one cleanly, else null */
  streak: string | null;
  /** this puzzle is 200+ above the player's rating, else null */
  hard: string | null;
  quick: string;
  missed: string;
}

export interface PuzzleContext {
  /** the run's id, or 'free' outside a run */
  runKey: string;
  /** the puzzle's rating and the player's, when known */
  puzzleRating?: number | null;
  playerRating?: number | null;
  /** solved on an earlier day than today (read before today's first result) */
  returning?: boolean;
}

export interface LineChoiceDeps { store?: LineStore; rng?: () => number }

const START_LINE_SHARE = 1 / 3;
export const HARD_MARGIN = 200;
export const QUICK_MS = 10_000;
const STREAKS: Record<number, keyof typeof PUZZLE_MASTER_LINES> = { 3: 'streak3', 5: 'streak5', 10: 'streak10' };
const CHOSEN_MAX = 64;

const chosen = new Map<string, PuzzleLines>();
const runsSeen = new Set<string>();
const reached = new Set<string>();
const outcomes = new Map<string, 'clean' | 'broken'>();
let visitStarted = false;
/** clean solves in a row this visit */
let cleanRun = 0;

/** Which pool a line belongs to (texts are unique across pools). */
const POOL_OF = new Map<string, string>(
  Object.entries(PUZZLE_MASTER_LINES).flatMap(([pool, ls]) => ls.map((l) => [l, pool] as [string, string])),
);

/** His lines for this puzzle, chosen the first time and kept. */
export function linesForPuzzle(puzzleId: string, ctx: PuzzleContext | string, deps: LineChoiceDeps = {}): PuzzleLines {
  const have = chosen.get(puzzleId);
  if (have) return have;
  const c: PuzzleContext = typeof ctx === 'string' ? { runKey: ctx } : ctx;
  const store = deps.store ?? browserLineStore;
  const rng = deps.rng ?? Math.random;
  const L = PUZZLE_MASTER_LINES;
  const firstOfVisit = !visitStarted;
  visitStarted = true;
  const firstOfRun = !runsSeen.has(c.runKey);
  runsSeen.add(c.runKey);
  const pick = (pool: keyof typeof L) => chooseLine(pool, L[pool], store, rng);
  const streakPool = STREAKS[cleanRun + 1];
  const hard = c.puzzleRating != null && c.playerRating != null && c.puzzleRating - c.playerRating >= HARD_MARGIN;
  const lines: PuzzleLines = {
    start: firstOfVisit && c.returning ? pick('welcome')
      : firstOfRun || rng() < START_LINE_SHARE ? pick('start') : null,
    going: pick('going'),
    solved: pick('solved'),
    solvedAfterMiss: pick('solvedAfterMiss'),
    solution: pick('solution'),
    exploring: pick('exploring'),
    streak: streakPool ? pick(streakPool) : null,
    hard: hard ? pick('hard') : null,
    quick: pick('quick'),
    missed: pick('missed'),
  };
  chosen.set(puzzleId, lines);
  if (chosen.size > CHOSEN_MAX) chosen.delete(chosen.keys().next().value as string);
  return lines;
}

/** His solved line: after a miss the plain one; else a streak, a hard puzzle, a quick solve, or his usual one. */
export function solvedLineFor(lines: PuzzleLines, missed: boolean, solveMs: number | null | undefined): string {
  if (missed) return lines.solvedAfterMiss;
  return lines.streak ?? lines.hard ?? (solveMs != null && solveMs < QUICK_MS ? lines.quick : null) ?? lines.solved;
}

/** The lines this puzzle may still need after its start, to load ahead (the reactive ones included). */
export function linesToPreload(lines: PuzzleLines, missed: boolean): string[] {
  return missed
    ? [lines.solvedAfterMiss, lines.solution]
    : [lines.going, lines.streak, lines.hard, lines.quick, lines.solved, lines.solution].filter((l): l is string => !!l);
}

/** A line of his was shown or said: it counts as used for its pool, once per puzzle and pool. */
export function noteLineReached(puzzleId: string, line: string | null, deps: LineChoiceDeps = {}): void {
  if (!line) return;
  const pool = POOL_OF.get(line);
  if (!pool) return;
  const k = `${puzzleId}\n${pool}`;
  if (reached.has(k)) return;
  reached.add(k);
  if (reached.size > CHOSEN_MAX * 8) reached.delete(reached.values().next().value as string);
  noteLineUsed(pool, line, deps.store ?? browserLineStore);
}

/**
 * How a puzzle ended, once: a clean solve extends the visit's run of clean solves, a miss or a shown solution ends
 * it (a puzzle skipped unsolved leaves it as it is). Read when the next puzzle's lines are chosen.
 */
export function notePuzzleOutcome(puzzleId: string, outcome: 'clean' | 'broken'): void {
  if (outcomes.has(puzzleId)) return;
  outcomes.set(puzzleId, outcome);
  if (outcomes.size > CHOSEN_MAX) outcomes.delete(outcomes.keys().next().value as string);
  cleanRun = outcome === 'clean' ? cleanRun + 1 : 0;
}

/** Forgets every choice (the speech simulator starts each run fresh). */
export function resetLineChoices(): void {
  chosen.clear();
  runsSeen.clear();
  reached.clear();
  outcomes.clear();
  visitStarted = false;
  cleanRun = 0;
}

/* THE WRONG-MOVE LINE'S SWITCH (#401 C2b): ON since 2026-11-22 (owner, trying it with the wrong-move marks, after a
   first-time visitor could not tell a wrong move had been made); a browser can still turn it off with
   `?masterMissed=0`. */
const MISSED_KEY = 'cp_master_missed_line';
export function missedLineOn(): boolean {
  try {
    const q = new URLSearchParams(window.location.search).get('masterMissed');
    if (q === '1' || q === '0') window.localStorage.setItem(MISSED_KEY, q);
    return window.localStorage.getItem(MISSED_KEY) !== '0';
  } catch {
    return true;
  }
}

export function puzzleMasterMoment(
  { status, isMidSolve, exploring, missed, quiet, puzzleId, solveMs, sayMissed }: PuzzleMasterInput,
  lines?: PuzzleLines | null,
): PuzzleMasterMoment {
  if (quiet) return { expression: 'presenting', line: null };
  const own = lines ?? (puzzleId ? linesForPuzzle(puzzleId, 'free') : null);
  if (exploring) return { expression: 'thinking', line: own?.exploring ?? null };
  if (status === 'correct') return { expression: 'pleased', line: own ? solvedLineFor(own, missed, solveMs) : null };
  if (status === 'solution') return { expression: 'presenting', line: own?.solution ?? null };
  // A mistake gets a face; words only behind the switch, and the same line for the rest of the puzzle (said once)
  if (status === 'failed' || (status === 'playing' && missed)) return { expression: 'serious', line: sayMissed ? own?.missed ?? null : null };
  if (status === 'playing' && isMidSolve) return { expression: 'thinking', line: own?.going ?? null };
  if (status === 'playing') return { expression: 'presenting', line: own?.start ?? null };
  return { expression: 'presenting', line: null };
}
