import type { MasterExpression } from '@/components/master/masterAssets';
import puzzleLines from '@/features/master/puzzleLines.json';
import puzzleCardLines from '@/features/master/puzzleCardLines.json';
import { voicedLine } from '@/features/master/eventLines';
import type { MasterLine } from '@/features/master/narrationApi';

/**
 * WHAT THE MASTER LOOKS LIKE AND SAYS ON THE PUZZLES CARD (MASTER_CHARACTER_IMPLEMENTATION_PLAN B1, #186).
 *
 * One face and at most one short line per state, as in the mock-ups the owner reviewed (2026-11-15). His lines
 * NEVER name the motif, the move, the move count or the outcome (puzzles rule B2): the card's headline already
 * says the goal ("Black to play and mate"), so he only encourages. Pure, so it is tested without a page.
 *
 * A line is picked from a small pool by the puzzle's id, so the same puzzle always reads the same and the next
 * one may read differently.
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
  return key ? voicedLine(text!, key) : null;
}

function pick(pool: readonly string[], id: string | null | undefined): string {
  let h = 0;
  for (const c of id ?? '') h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return pool[h % pool.length];
}

export function puzzleMasterMoment({ status, isMidSolve, exploring, missed, quiet, puzzleId }: PuzzleMasterInput): PuzzleMasterMoment {
  const L = PUZZLE_MASTER_LINES;
  if (quiet) return { expression: 'presenting', line: null };
  if (exploring) return { expression: 'thinking', line: pick(L.exploring, puzzleId) };
  if (status === 'correct') return { expression: 'pleased', line: pick(L.solved, puzzleId) };
  if (status === 'solution') return { expression: 'presenting', line: pick(L.solution, puzzleId) };
  // A mistake gets a face, never words (owner's /play ruling, 2026-11-15); the headline already says it.
  if (status === 'failed' || (status === 'playing' && missed)) return { expression: 'serious', line: null };
  if (status === 'playing' && isMidSolve) return { expression: 'thinking', line: pick(L.going, puzzleId) };
  if (status === 'playing') return { expression: 'presenting', line: pick(L.start, puzzleId) };
  return { expression: 'presenting', line: null };
}
