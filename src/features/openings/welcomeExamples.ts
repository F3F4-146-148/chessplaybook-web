/**
 * THE GOALS OF THE OPENING SHOWN BY EXAMPLE (owner, 2026-11-26: the trainer's board "as in the video"). The vertical
 * principles video (#427, 2026-11-22) showed a real opening position for each goal from Castle on; it was recorded in
 * a dev-only mode and the site never had it. These are its positions and marks, as the owner approved them then
 * (every position from the v3 book, every move checked with Stockfish 15.1), one list of scenes per goal of
 * `WELCOME_GOALS`, in its order. The sixth goal has the video's three scenes (gain, stop, take away), played in turn.
 *
 * A scene: the moves from the start that set its position, then steps timed from the scene's start: marks to draw
 * (reasonBoardMarks.ts: "!" the other side's, "*" the idea's gold) and a move to play.
 */
import { applyMove, positionFromFen } from '@/components/chess/chessLogic';

export interface ExampleStep {
  /** ms from the start of the scene */
  at: number;
  /** a move to play now (UCI), shown as the last move */
  play?: string;
  /** the marks from now on */
  marks?: string;
}

export interface ExampleScene {
  /** UCI moves from the starting position */
  moves: string[];
  steps: ExampleStep[];
}

/** How long a scene stays after its last step, and the shortest a goal is shown. */
export const SCENE_HOLD_MS = 2500;
export const GOAL_MIN_MS = 4000;

const u = (s: string) => s.split(' ').filter(Boolean);

const CASTLE_LINE = u('d2d4 d7d5 c1f4 e7e6 e2e3 c7c5 c2c3 f8d6 d4c5 d6c5 b1d2 b8c6 g1f3 g8f6 f1d3 e8g8');

export const WELCOME_EXAMPLES: readonly (readonly ExampleScene[])[] = [
  // Take the centre with your pawns: White's centre squares and Black's
  [{ moves: [], steps: [{ at: 0, marks: 'd4 e4 !d5 !e5' }] }],
  // Bring out your knights and bishops: White's, then Black's beside them
  [{ moves: [], steps: [{ at: 0, marks: 'b1c3 g1f3 c1f4 f1c4' }, { at: 900, marks: 'b1c3 g1f3 c1f4 f1c4 !b8c6 !g8f6 !c8f5 !f8c5' }] }],
  // Castle to keep your king safe. London: 1.d4 d5 2.Bf4 e6 3.e3 c5 4.c3 Bd6 5.dxc5 Bxc5 6.Nd2 Nc6 7.Ngf3 Nf6 8.Bd3 O-O 9.O-O
  [{ moves: CASTLE_LINE, steps: [{ at: 0, marks: 'e1g1' }, { at: 1100, play: 'e1g1', marks: 'g1 f1' }] }],
  // Connect your rooks. London: ... 9.O-O Bb7 10.Qe2, the rooks a1-f1 connected
  [{
    moves: u('d2d4 g8f6 c1f4 e7e6 e2e3 c7c5 c2c3 f8e7 b1d2 b8c6 h2h3 d7d5 g1f3 e8g8 f1d3 b7b6 e1g1 c8b7'),
    steps: [{ at: 0, marks: 'd1e2' }, { at: 550, play: 'd1e2', marks: '' }, { at: 850, marks: 'a1f1' }],
  }],
  // Move each piece once, queen at home: the castling position after 9.O-O, nothing moved twice, the queen on d1
  [{ moves: [...CASTLE_LINE, 'e1g1'], steps: [{ at: 0, marks: '*d1' }] }],
  // Give every move a purpose
  [
    // gain something: London 1.d4 Nf6 2.Bf4 d5 3.e3 c5 4.c3 cxd4 5.cxd4 Nc6 6.Nc3 Bf5 7.Nf3 a6 8.Rc1, e6 Qb3 Bd6 Qxb7
    {
      moves: u('d2d4 g8f6 c1f4 d7d5 e2e3 c7c5 c2c3 c5d4 c3d4 b8c6 b1c3 c8f5 g1f3 a7a6 a1c1'),
      steps: [
        { at: 0, play: 'e7e6' }, { at: 550, play: 'd1b3' }, { at: 1100, play: 'f8d6' },
        { at: 1600, marks: 'b3b7' }, { at: 2500, play: 'b3b7', marks: '' },
      ],
    },
    // stop the opponent gaining something: London ... 5.Nf3 d6 6.h3, which stops ...Bg4 pinning the knight
    {
      moves: u('d2d4 g8f6 c1f4 g7g6 e2e3 f8g7 c2c3 e8g8 g1f3 d7d6'),
      steps: [{ at: 0, marks: '!c8g4' }, { at: 700, marks: 'h2h3 !c8g4' }, { at: 1300, play: 'h2h3', marks: '!c8g4 g4' }],
    },
    // take away their options: Slav ... 11.Bxc3 Ne4 12.Bb4, the bishop on f8's diagonal: Black cannot castle short
    {
      moves: u('d2d4 d7d5 g1f3 g8f6 e2e3 c7c6 c2c4 c8f5 b1c3 e7e6 f3h4 f5g6 h4g6 h7g6 g2g3 b8d7 c1d2 f8b4 d1c2 b4c3 d2c3 f6e4'),
      steps: [{ at: 0, marks: 'c3b4' }, { at: 700, play: 'c3b4', marks: '' }, { at: 1100, marks: 'b4f8 f8 !e8' }],
    },
  ],
];

const sceneMs = (s: ExampleScene) => (s.steps.length ? s.steps[s.steps.length - 1].at : 0) + SCENE_HOLD_MS;

/** How long goal `i`'s example takes, all its scenes, at least GOAL_MIN_MS. */
export function goalExampleMs(i: number): number {
  const scenes = WELCOME_EXAMPLES[i] ?? [];
  return Math.max(GOAL_MIN_MS, scenes.reduce((t, s) => t + sceneMs(s), 0));
}

/** The scene playing at `t` ms into goal `i`'s example, with its own time. */
export function sceneAt(i: number, t: number): { scene: number; at: number } | null {
  const scenes = WELCOME_EXAMPLES[i];
  if (!scenes?.length) return null;
  let start = 0;
  for (let k = 0; k < scenes.length; k++) {
    const end = start + sceneMs(scenes[k]);
    if (t < end || k === scenes.length - 1) return { scene: k, at: t - start };
    start = end;
  }
  return null;
}

export interface ExampleFrame { fen: string; lastMove: [string, string] | undefined; marks: string }

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** The board at `at` ms into scene `k` of goal `i`. Throws on an illegal move (the test plays every scene). */
export function exampleFrame(i: number, k: number, at: number): ExampleFrame | null {
  const scene = WELCOME_EXAMPLES[i]?.[k];
  if (!scene) return null;
  const done = scene.steps.filter((s) => s.at <= at);
  const played = done.filter((s) => s.play).map((s) => s.play!);
  let pos = positionFromFen(START);
  for (const m of [...scene.moves, ...played]) {
    const next = pos ? applyMove(pos, m) : null;
    if (!next) throw new Error(`welcome example ${i}.${k}: ${m} is not legal in ${pos?.fen}`);
    pos = next;
  }
  const marks = [...done].reverse().find((s) => s.marks !== undefined)?.marks ?? '';
  const last = played[played.length - 1];
  return { fen: pos!.fen, lastMove: last ? [last.slice(0, 2), last.slice(2, 4)] : undefined, marks };
}
