import { writeFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';

import { memoryLineStore } from '@/features/master/lineChooser';
import puzzleLines from '@/features/master/puzzleLines.json';
import { linesForPuzzle, notePuzzleOutcome, puzzleMasterMoment, resetLineChoices, solvedLineFor, type PuzzleLines } from './puzzleMasterMoment';
import { puzzleCardSpeechTexts, puzzleCardTexts, type PuzzleCardTextInput } from './puzzleCardVoice';
import { isGoalSentence, sameAsLastTime, simulate } from './puzzleCardVoice.sim';

const GOAL = 'White to play and win a piece.';
const MINE = new Set(Object.values(puzzleLines).flat().map((l) => l.text));
const LINES: PuzzleLines = {
  start: 'Take your time.', going: 'Good, keep going.', solved: 'Beautiful!', solvedAfterMiss: 'Well played.',
  solution: "Here's how it goes.", exploring: "Let's see what happens.",
  streak: null, hard: null, quick: 'Quick!', missed: 'Not that one. Have another look.',
};

function say(over: Partial<PuzzleCardTextInput> & { missed?: boolean; faceShown?: boolean; explored?: boolean; lines?: PuzzleLines }) {
  const base: PuzzleCardTextInput = {
    status: 'playing', message: GOAL, opening: GOAL, prompt: null, isMidSolve: false, exploring: false,
    serverUnreachable: false, filterFoundNothing: false, runOutcome: null, playedLine: null, hasOffer: false, masterLine: null,
  };
  const i = { ...base, ...over };
  const moment = puzzleMasterMoment({ status: i.status, isMidSolve: i.isMidSolve, exploring: i.exploring, missed: over.missed ?? false, quiet: false, puzzleId: 'abcde' }, over.lines ?? LINES);
  const { headline, detail } = puzzleCardTexts({ ...i, masterLine: moment.line });
  return {
    headline, detail, line: moment.line,
    spoken: puzzleCardSpeechTexts({
      status: i.status, isMidSolve: i.isMidSolve, exploring: i.exploring, opening: i.opening, headline, detail,
      faceShown: over.faceShown ?? true, expression: moment.expression, ownLine: moment.line, explored: over.explored ?? false,
    }),
  };
}

const SOLVED = { status: 'correct', message: 'Correct! Puzzle solved.' } as const;

describe('what the puzzles card shows (unchanged by #401)', () => {
  it('the card still shows its headlines', () => {
    expect(say({ message: 'Correct! Keep going...', isMidSolve: true }).headline).toBe('Correct so far — keep going');
    expect(say(SOLVED).headline).toBe('Correct! Puzzle solved.');
  });
  it('after a run, the result is the line under the headline (not his line)', () => {
    expect(say({ ...SOLVED, runOutcome: { rating: 1500, realized: 3.5, total: 5 } }).detail).toEqual({ kind: 'text', text: 'Run performance: 1500, scored 3.5 of 5' });
  });
  it('the reminder offer takes the slot after a solve', () => {
    expect(say({ ...SOLVED, hasOffer: true }).detail).toEqual({ kind: 'offer' });
  });
  it('his start line is not shown on a puzzle that has none (B3)', () => {
    expect(say({ lines: { ...LINES, start: null } }).detail).toEqual({ kind: 'none' });
  });
});

describe('what he says (#401 B2: his own line, not the headline)', () => {
  it('at the start: the goal, then his start line', () => {
    expect(say({}).spoken).toEqual([GOAL, 'Take your time.']);
  });
  it('at the start of a puzzle with no start line: the goal only (B3)', () => {
    expect(say({ lines: { ...LINES, start: null } }).spoken).toEqual([GOAL]);
  });
  it('with no goal: "White to move", then the neutral prompt', () => {
    expect(say({ opening: null, message: 'White to move', prompt: 'Find the best move' }).spoken).toEqual(['White to move', 'Find the best move']);
  });
  it('after the first correct move: his going line, not "Correct so far"', () => {
    expect(say({ message: 'Correct! Keep going...', isMidSolve: true }).spoken).toEqual(['Good, keep going.']);
  });
  it('solved: his solved line only, not "Correct! Puzzle solved."', () => {
    expect(say(SOLVED).spoken).toEqual(['Beautiful!']);
  });
  it('solved after a miss: the plainer line (B2b)', () => {
    expect(say({ ...SOLVED, missed: true }).spoken).toEqual(['Well played.']);
  });
  it('solved with the run result, the reminder offer or a game line under the headline: his solved line, off the card (#510)', () => {
    for (const over of [{ runOutcome: { rating: 1500, realized: 3.5, total: 5 } }, { hasOffer: true }, { playedLine: 'In the game Karpov played 23...Nd4.' }]) {
      const r = say({ ...SOLVED, ...over });
      expect(r.spoken).toEqual(['Beautiful!']);
      expect(r.detail.kind).not.toBe('master');
    }
  });
  it('in a variation: his exploring line; leaving it: nothing again (B2c)', () => {
    expect(say({ ...SOLVED, exploring: true }).spoken).toEqual(["Let's see what happens."]);
    expect(say({ ...SOLVED, explored: true }).spoken).toBeNull();
  });
  it('a wrong move, and the rest of that puzzle: nothing', () => {
    expect(say({ status: 'failed', message: 'Incorrect. Keep trying.', missed: true }).spoken).toBeNull();
    expect(say({ message: 'White to move. Keep going.', missed: true }).spoken).toBeNull();
  });
  it('the solution playing out: nothing', () => {
    expect(say({ status: 'solution', message: 'Solution shown.' }).spoken).toBeNull();
  });
  it('his face not on screen: nothing', () => {
    expect(say({ faceShown: false }).spoken).toBeNull();
  });
});

describe('lines chosen once per puzzle (#401 B1)', () => {
  beforeEach(() => resetLineChoices());
  it('the same puzzle keeps its lines (a re-render or remount changes nothing)', () => {
    const deps = { store: memoryLineStore(), rng: Math.random };
    const a = linesForPuzzle('p1', 'free', deps);
    expect(linesForPuzzle('p1', 'free', deps)).toBe(a);
  });
  it('the first puzzle of a run always has his start line', () => {
    const deps = { store: memoryLineStore(), rng: () => 0.99 };
    expect(linesForPuzzle('p1', 'run-1', deps).start).not.toBeNull();
    expect(linesForPuzzle('p2', 'run-1', deps).start).toBeNull(); // rng 0.99: not the one in three
    expect(linesForPuzzle('p3', 'run-2', deps).start).not.toBeNull();
  });
});

describe('lines that react to what happened (#401 C2)', () => {
  beforeEach(() => resetLineChoices());
  const deps = () => ({ store: memoryLineStore(), rng: () => 0.5 });
  const L = puzzleLines;
  const texts = (pool: keyof typeof puzzleLines) => new Set(L[pool].map((l) => l.text));

  it('after a miss: the plain pool, whatever else is true', () => {
    expect(solvedLineFor({ ...LINES, streak: 'Three in a row.', hard: 'Not an easy one, that.' }, true, 2000)).toBe('Well played.');
  });
  it('a streak, then a hard puzzle, then a quick solve, then his usual line', () => {
    const all = { ...LINES, streak: 'Three in a row.', hard: 'Not an easy one, that.' };
    expect(solvedLineFor(all, false, 2000)).toBe('Three in a row.');
    expect(solvedLineFor({ ...all, streak: null }, false, 2000)).toBe('Not an easy one, that.');
    expect(solvedLineFor({ ...all, streak: null, hard: null }, false, 2000)).toBe('Quick!');
    expect(solvedLineFor({ ...all, streak: null, hard: null }, false, 30_000)).toBe('Beautiful!');
    expect(solvedLineFor({ ...all, streak: null, hard: null }, false, null)).toBe('Beautiful!'); // unknown: never quick
  });
  it('the third clean solve in a row gets a streak line; a miss starts the count again', () => {
    const d = deps();
    const ctx = { runKey: 'free' };
    linesForPuzzle('a', ctx, d); notePuzzleOutcome('a', 'clean');
    linesForPuzzle('b', ctx, d); notePuzzleOutcome('b', 'clean');
    expect(texts('streak3').has(linesForPuzzle('c', ctx, d).streak ?? '')).toBe(true);
    notePuzzleOutcome('c', 'broken');
    expect(linesForPuzzle('d', ctx, d).streak).toBeNull();
  });
  it('a puzzle 200+ above the player is hard; less is not; an unknown rating never is', () => {
    const d = deps();
    expect(texts('hard').has(linesForPuzzle('h1', { runKey: 'free', puzzleRating: 1700, playerRating: 1500 }, d).hard ?? '')).toBe(true);
    expect(linesForPuzzle('h2', { runKey: 'free', puzzleRating: 1699, playerRating: 1500 }, d).hard).toBeNull();
    expect(linesForPuzzle('h3', { runKey: 'free', puzzleRating: 1900, playerRating: null }, d).hard).toBeNull();
  });
  it('a returning player\'s first puzzle opens with a welcome, and only the first', () => {
    const d = deps();
    expect(texts('welcome').has(linesForPuzzle('w1', { runKey: 'free', returning: true }, d).start ?? '')).toBe(true);
    expect(texts('welcome').has(linesForPuzzle('w2', { runKey: 'free', returning: true }, d).start ?? '')).toBe(false);
  });
  it('a new player\'s first puzzle has an ordinary start line', () => {
    expect(texts('start').has(linesForPuzzle('n1', { runKey: 'free', returning: false }, deps()).start ?? '')).toBe(true);
  });
  it('the wrong-move line only with the switch on, said once for the rest of the puzzle', () => {
    expect(say({ status: 'failed', message: 'Incorrect. Keep trying.', missed: true }).spoken).toBeNull();
    const on = (o: Parameters<typeof say>[0]) => {
      const moment = puzzleMasterMoment({ status: o.status!, isMidSolve: false, exploring: false, missed: true, quiet: false, puzzleId: 'x', sayMissed: true }, LINES);
      const { headline, detail } = puzzleCardTexts({ status: o.status!, message: o.message!, opening: GOAL, prompt: null, isMidSolve: false, exploring: false, serverUnreachable: false, filterFoundNothing: false, runOutcome: null, playedLine: null, hasOffer: false, masterLine: moment.line });
      return puzzleCardSpeechTexts({ status: o.status!, isMidSolve: false, exploring: false, opening: GOAL, headline, detail, faceShown: true, expression: moment.expression, ownLine: moment.line, explored: false });
    };
    const flash = on({ status: 'failed', message: 'Incorrect. Keep trying.' });
    const after = on({ status: 'playing', message: 'White to move. Keep going.' });
    expect(flash).toEqual(['Not that one. Have another look.']);
    expect(after).toEqual(flash); // the same queue: the revert neither cuts nor repeats him
  });
});

describe('speech simulator (#401 A1, B6 targets)', () => {
  const SEEDS = 20;
  const runs = (autoNext: boolean) => Array.from({ length: SEEDS }, (_, i) => simulate({ puzzles: 25, seed: i + 1, autoNext }));

  it('is deterministic for a seed', () => {
    const a = simulate({ puzzles: 25, seed: 1, autoNext: true });
    const b = simulate({ puzzles: 25, seed: 1, autoNext: true });
    expect([...a.lines]).toEqual([...b.lines]);
  });

  it('he never says the card\'s fixed headlines any more', () => {
    for (const r of [...runs(false), ...runs(true)]) {
      expect(r.lines.get('Correct! Puzzle solved.')).toBeUndefined();
      expect(r.lines.get('Correct so far — keep going')).toBeUndefined();
      expect(r.lines.get('Trying a variation')).toBeUndefined();
    }
  });

  it('no line of his twice in a row for a moment', () => {
    for (const r of [...runs(false), ...runs(true)]) {
      const repeats = sameAsLastTime(r.saidOrder);
      for (const [pool, n] of repeats) expect(n, pool).toBe(0);
    }
  });

  it('no line of his more than about 3 times in 25 puzzles, on average (#401 C5 target)', () => {
    // an average over the runs: the correct-move moment comes ~20 times in 25 puzzles, so with 8 lines one run can
    // reach 5 by chance while the average is 2.5
    for (const autoNext of [false, true]) {
      const total = new Map<string, number>();
      for (const r of runs(autoNext)) for (const [s, v] of r.lines) total.set(s, (total.get(s) ?? 0) + v.heard + v.cut);
      for (const [s, n] of total) if (MINE.has(s)) expect(n / SEEDS, s).toBeLessThanOrEqual(3.5);
    }
  });

  it('with auto-next on, his solved line is heard, not cut', () => {
    for (const r of runs(true)) {
      for (const s of puzzleLines.solved.map((l) => l.text)) expect(r.lines.get(s)?.cut ?? 0, s).toBe(0);
    }
  });

  it('writes the table (PRINT_SIM=<file>)', () => {
    const file = process.env.PRINT_SIM;
    if (!file) return;
    const out: string[] = [];
    const log = (s: string) => out.push(s);
    for (const autoNext of [false, true]) {
      const total = new Map<string, { heard: number; cut: number }>();
      const repeats = new Map<string, number>();
      for (const r of runs(autoNext)) {
        for (const [s, v] of r.lines) {
          const t = total.get(s) ?? { heard: 0, cut: 0 };
          total.set(s, { heard: t.heard + v.heard, cut: t.cut + v.cut });
        }
        for (const [p, n] of sameAsLastTime(r.saidOrder)) repeats.set(p, (repeats.get(p) ?? 0) + n);
      }
      log(`\nauto-next ${autoNext ? 'on' : 'off'}: mean per 25 puzzles over ${SEEDS} runs (goals grouped)`);
      let goalsHeard = 0;
      let goalsCut = 0;
      const rows = [...total].filter(([s, v]) => {
        if (isGoalSentence(s)) { goalsHeard += v.heard; goalsCut += v.cut; return false; }
        return true;
      }).sort((a, b) => b[1].heard - a[1].heard);
      for (const [s, v] of rows) log(`  ${(v.heard / SEEDS).toFixed(1).padStart(5)} heard ${(v.cut / SEEDS).toFixed(1).padStart(5)} cut  ${s}`);
      log(`  ${(goalsHeard / SEEDS).toFixed(1).padStart(5)} heard ${(goalsCut / SEEDS).toFixed(1).padStart(5)} cut  (goal lines, all wordings)`);
      log('  same as the last time that moment came:');
      for (const [p, n] of [...repeats].sort((a, b) => b[1] - a[1])) log(`  ${(n / SEEDS).toFixed(1).padStart(5)}  ${p}`);
    }
    writeFileSync(file, out.join('\n'));
  });
});
