import puzzleCardLines from '@/features/master/puzzleCardLines.json';
import puzzleLines from '@/features/master/puzzleLines.json';
import { linesForPuzzle, noteLineReached, notePuzzleOutcome, puzzleMasterMoment, resetLineChoices } from './puzzleMasterMoment';
import { memoryLineStore, type LineStore } from '@/features/master/lineChooser';
import { AUTO_ADVANCE_AFTER_LINE_MS, AUTO_ADVANCE_MAX_MS, AUTO_ADVANCE_MS, ownLineUsed, puzzleCardSpeechTexts, puzzleCardTexts } from './puzzleCardVoice';

/**
 * THE SPEECH SIMULATOR (#401 A1): what the Master is heard saying over a run of puzzles on the puzzles card.
 *
 * It plays puzzles as a sequence of card states in time (start, each correct move, a miss and the 700 ms revert,
 * a variation after the solve, the solution announced, the next puzzle), runs each state through the card's own
 * rules (`puzzleCardTexts`, `puzzleCardSpeechTexts`, `puzzleMasterMoment`), and plays the queues as
 * `useMasterVoice` does: a queue that changes cuts the one playing, lines in a queue follow each other after
 * 200 ms. A line is "heard" when it plays to its end, "cut" when a new queue stops it first or comes
 * before it starts.
 *
 * The run's mix is production's, last 30 days to 2026-11-21 (1,147 attempts, `puzzle_attempts` joined to the
 * corpus, read-only): 63% solved, 3.6% solution shown, solver moves 1: 4%, 2: 59%, 3: 29%, 4+: 7%, a goal known on
 * 99%, thinking time p25 11 s, median 19 s, p75 35 s. What happens after a miss is not recorded, so it is a guess
 * (half solve it anyway, some show the solution, the rest move on). Line lengths are estimated from their words
 * (0.4 s plus 0.45 s a word), fitted to the recordings measured on 2026-11-21 ("Beautiful!" about
 * 0.9 s of speech, "Correct! Puzzle solved." about 2.6 s).
 */

export interface SimOptions {
  puzzles: number;
  seed: number;
  /** "Start next puzzle immediately" (1.2 s after a solve) */
  autoNext: boolean;
}

export interface SimLine { heard: number; cut: number }

export interface SimResult {
  /** per sentence: how often heard to the end, how often cut */
  lines: Map<string, SimLine>;
  /** the sentences heard, in order (cut ones excluded) */
  heardOrder: string[];
  /** every sentence he started or had queued, heard or cut: the order lines were used in */
  saidOrder: string[];
}

export const AUTO_NEXT_S = AUTO_ADVANCE_MS / 1000;
const BETWEEN_LINES_S = 0.2;
const REVERT_S = 0.7;

export function lineSeconds(text: string): number {
  return 0.4 + 0.45 * text.split(/\s+/).filter(Boolean).length;
}

/** Mulberry32: a small seeded generator, so a run is the same every time. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ALL_GOALS = puzzleCardLines.map((l) => l.text).filter((t) => /^(White|Black) to (play|move) /.test(t) && !/save/.test(t));
const MATE_GOALS = ALL_GOALS.filter((t) => /mate/.test(t));
const WIN_GOALS = ALL_GOALS.filter((t) => /and win\.$|winning move/.test(t));
const MATERIAL_GOALS = ALL_GOALS.filter((t) => !MATE_GOALS.includes(t) && !WIN_GOALS.includes(t));

interface CardState {
  status: string;
  message: string;
  isMidSolve: boolean;
  exploring: boolean;
  missed: boolean;
  /** Show solution pressed: he says his solution line, then the board plays it */
  announcing?: boolean;
}

/** `solveMs`: from the puzzle's start to this event; `ratingGap`: the puzzle's rating minus the player's. */
type Event = { t: number; puzzleId: string; opening: string | null; state: CardState; solveMs: number; ratingGap: number };

function pick<T>(r: () => number, xs: readonly T[]): T {
  return xs[Math.floor(r() * xs.length)];
}

function thinkSeconds(r: () => number): number {
  const x = r();
  return x < 0.25 ? 6 + r() * 5 : x < 0.5 ? 11 + r() * 8 : x < 0.75 ? 19 + r() * 16 : 35 + r() * 40;
}

function solverMoves(r: () => number): number {
  const x = r();
  return x < 0.04 ? 1 : x < 0.63 ? 2 : x < 0.92 ? 3 : 4;
}

/** The events of one puzzle from `t0`; returns them and the time the next puzzle starts. */
function playPuzzle(r: () => number, t0: number, puzzleId: string, autoNext: boolean): { events: Event[]; next: number; solvedAt?: number } {
  const g = r();
  const opening = g < 0.01 ? null : g < 0.31 ? pick(r, MATE_GOALS) : g < 0.35 ? pick(r, WIN_GOALS) : pick(r, MATERIAL_GOALS);
  const side = opening?.startsWith('Black') ? 'Black' : 'White';
  const start = opening ?? `${side} to move`;
  const events: Event[] = [];
  // the puzzle's rating against the player's: served near it (production: within a few hundred points)
  const ratingGap = -400 + r() * 700;
  const at = (t: number, state: CardState) => events.push({ t, puzzleId, opening, state, solveMs: (t - t0) * 1000, ratingGap });
  const moves = solverMoves(r);
  let t = t0;
  at(t, { status: 'playing', message: start, isMidSolve: false, exploring: false, missed: false });

  const outcome = r();
  const reveal = (from: number) => {
    at(from, { status: 'playing', message: start, isMidSolve: false, exploring: false, missed: false, announcing: true });
    return from; // the solution state comes when his line ends (see simulate)
  };
  if (outcome < 0.036) {
    t += thinkSeconds(r);
    reveal(t);
    return { events, next: t + 6 + (autoNext ? 0 : 3) };
  }
  const clean = outcome < 0.036 + 0.631;
  const missAt = clean ? -1 : Math.floor(r() * moves);
  let missed = false;
  for (let m = 0; m < moves; m++) {
    t += m === 0 ? thinkSeconds(r) : thinkSeconds(r) / 2;
    if (m === missAt) {
      missed = true;
      at(t, { status: 'failed', message: 'Incorrect. Keep trying.', isMidSolve: false, exploring: false, missed: true });
      t += REVERT_S;
      at(t, { status: 'playing', message: `${side} to move. Keep going.`, isMidSolve: false, exploring: false, missed: true });
      const after = r();
      if (after < 0.15) { t += thinkSeconds(r) / 2; reveal(t); return { events, next: t + 6 + (autoNext ? 0 : 3) }; }
      if (after >= 0.65) return { events, next: t + 3 }; // moves on
      t += thinkSeconds(r) / 2; // works it out after all, unscored
    }
    if (m < moves - 1) {
      // `isMidSolve` is false for the rest of a puzzle once it was missed (usePuzzleBoard.ts:297)
      at(t, { status: 'playing', message: 'Correct! Keep going...', isMidSolve: !missed, exploring: false, missed });
    }
  }
  at(t, { status: 'correct', message: 'Correct! Puzzle solved.', isMidSolve: false, exploring: false, missed });
  // a variation after the solve, sometimes (cancels auto-next)
  if (r() < 0.1) {
    // 4 s after the solve: after his longest solved line (~3 s), so a cut here would be the player's act, not the page's
    at(t + 4, { status: 'correct', message: 'Correct! Puzzle solved.', isMidSolve: false, exploring: true, missed });
    at(t + 9, { status: 'correct', message: 'Correct! Puzzle solved.', isMidSolve: false, exploring: false, missed });
    return { events, next: t + 12 };
  }
  // with auto-next the next puzzle's time depends on his line (B4): `simulate` sets it from `solvedAt`
  return autoNext ? { events, next: t + AUTO_NEXT_S, solvedAt: t } : { events, next: t + 2 + r() * 4 };
}

/** The trainer's auto-next rule (TrainerLayoutSkeleton, #401 B4), in seconds after the solve. */
export const AUTO_NEXT_MAX_S = AUTO_ADVANCE_MAX_MS / 1000;
const AFTER_LINE_S = AUTO_ADVANCE_AFTER_LINE_MS / 1000;
function autoNextDelay(lineEndsAfterSolve: number): number {
  if (lineEndsAfterSolve <= AUTO_NEXT_S) return AUTO_NEXT_S;
  return Math.min(AUTO_NEXT_MAX_S, lineEndsAfterSolve + AFTER_LINE_S);
}

interface PuzzleSpeechState { explored: boolean }

/** What he would say for one card state (the card's own rules), null when silent; marks the moment reached. */
function queueFor(e: Event, ps: PuzzleSpeechState, store: LineStore, r: () => number): string[] | null {
  const { state, puzzleId, opening } = e;
  const deps = { store, rng: r };
  const PLAYER = 1500;
  const lines = linesForPuzzle(puzzleId, { runKey: 'free', puzzleRating: PLAYER + e.ratingGap, playerRating: PLAYER }, deps);
  if (state.announcing) {
    notePuzzleOutcome(puzzleId, 'broken');
    noteLineReached(puzzleId, lines.solution, deps);
    return [lines.solution];
  }
  if (state.status === 'correct') notePuzzleOutcome(puzzleId, state.missed ? 'broken' : 'clean');
  if (state.status === 'failed') notePuzzleOutcome(puzzleId, 'broken');
  if (state.exploring) ps.explored = true;
  const input = { status: state.status, isMidSolve: state.isMidSolve, exploring: state.exploring, missed: state.missed };
  const moment = puzzleMasterMoment({ ...input, quiet: false, puzzleId, solveMs: e.solveMs }, lines);
  const { headline, detail } = puzzleCardTexts({
    status: state.status, message: state.message, opening, prompt: null, isMidSolve: state.isMidSolve, exploring: state.exploring,
    serverUnreachable: false, filterFoundNothing: false, runOutcome: null, playedLine: null, hasOffer: false, masterLine: moment.line,
  });
  const spoken = puzzleCardSpeechTexts({
    status: state.status, isMidSolve: state.isMidSolve, exploring: state.exploring, opening, headline, detail,
    faceShown: true, expression: moment.expression, ownLine: moment.line, explored: ps.explored,
  });
  // the card's rule: his line counts as used only when shown or said
  if (ownLineUsed(moment.line, detail, spoken)) noteLineReached(puzzleId, moment.line, deps);
  return spoken;
}

export function simulate({ puzzles, seed, autoNext }: SimOptions): SimResult {
  const r = rng(seed);
  const store = memoryLineStore();
  resetLineChoices();

  const lines = new Map<string, SimLine>();
  const heardOrder: string[] = [];
  const saidOrder: string[] = [];
  const tally = (s: string, k: keyof SimLine) => {
    const v = lines.get(s) ?? { heard: 0, cut: 0 };
    v[k]++;
    lines.set(s, v);
  };
  // the queue playing: its sentences with their start and end times
  let playing: { text: string; from: number; to: number }[] = [];
  let key: string | null = null;
  const settle = (until: number) => {
    for (const p of playing) {
      saidOrder.push(p.text);
      if (p.to <= until) { tally(p.text, 'heard'); heardOrder.push(p.text); } else tally(p.text, 'cut');
    }
    playing = [];
  };
  const play = (e: Event, ps: PuzzleSpeechState) => {
    const q = queueFor(e, ps, store, r);
    const k = q ? `${e.puzzleId}\n${q.join('\n')}` : null;
    if (k === key) return; // the same memoised value: he does not restart
    settle(e.t);
    key = k;
    if (!q) return;
    let at = e.t;
    for (const text of q) {
      const d = lineSeconds(text);
      playing.push({ text, from: at, to: at + d });
      at += d + BETWEEN_LINES_S;
    }
  };

  let t = 0;
  for (let i = 0; i < puzzles; i++) {
    const id = Array.from({ length: 5 }, () => 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[Math.floor(r() * 62)]).join('');
    const p = playPuzzle(r, t, id, autoNext);
    const ps: PuzzleSpeechState = { explored: false };
    for (const e of p.events) play(e, ps);
    t = p.next;
    if (p.solvedAt !== undefined) {
      const lineEnd = playing.length > 0 ? playing[playing.length - 1].to : p.solvedAt;
      t = p.solvedAt + autoNextDelay(lineEnd - p.solvedAt);
    }
  }
  settle(t + 60); // the run ends: whatever is playing finishes
  return { lines, heardOrder, saidOrder };
}

/** The card's neutral prompts (a puzzle with no known goal): card text read at the start, like the goals. */
const CARD_PROMPTS = new Set(puzzleCardLines.map((l) => l.text).filter((t) => !/^(White|Black) /.test(t) && !/^Correct|^Trying a variation/.test(t)));

const POOL_OF = new Map<string, string>(
  Object.entries(puzzleLines).flatMap(([pool, ls]) => ls.map((l) => [l.text, pool] as [string, string])),
);

/**
 * How often a moment's line is the same as the last time that moment came (his pools: start, solved, ...), so
 * "Beautiful!" on two solves running counts, whatever was said between them. The card's fixed headlines are each
 * their own moment, so every time after the first counts. Goals are left out (one per puzzle, by its type).
 */
export function sameAsLastTime(order: readonly string[]): Map<string, number> {
  const last = new Map<string, string>();
  const repeats = new Map<string, number>();
  for (const s of order) {
    if (isGoalSentence(s) || CARD_PROMPTS.has(s)) continue;
    const pool = POOL_OF.get(s) ?? `headline:${s}`;
    if (last.get(pool) === s) repeats.set(pool, (repeats.get(pool) ?? 0) + 1);
    last.set(pool, s);
  }
  return repeats;
}

export const isGoalSentence = (s: string): boolean => /^(White|Black) to (play|move)/.test(s) && !/Keep going/.test(s);
