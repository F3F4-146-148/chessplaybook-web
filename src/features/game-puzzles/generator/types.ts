/**
 * Puzzles from games: the generator's contract.
 *
 * Spec: docs/Features Development/PUZZLES_FROM_OWN_GAMES_ANALYSIS.md, section 13.
 *
 * The generator takes games and settings and returns puzzles plus a report per
 * game. It does not know where the games came from, who asked, or where the
 * puzzles go (G1). The engine is passed in (G2), so the same code runs on the
 * SF 15.1 fork in a script, on a server, or on any other engine later.
 */

export type Side = 'white' | 'black';
export type Phase = 'opening' | 'middlegame' | 'endgame';
export type PieceRole = 'pawn' | 'knight' | 'bishop' | 'rook' | 'queen' | 'king';

/** One principal variation, SIDE-TO-MOVE point of view. */
export interface EngineLine {
  /** First move of the line, standard UCI (castling as e1g1, not e1h1). */
  uci: string;
  /** Centipawns for the side to move, or null when the score is a mate. */
  cp: number | null;
  /** Mate in N for the side to move (negative: the side to move is mated). */
  mate: number | null;
  /** The whole line, standard UCI. */
  pv: string[];
}

export interface PuzzleEngine {
  /**
   * Search `fen` at MultiPV `multiPv` to a fixed `depth`. Fixed depth, never a
   * time budget, so the result does not depend on how busy the machine is.
   * Returns the lines best first. An empty array means no legal move.
   */
  analyse(fen: string, multiPv: number, depth: number): Promise<EngineLine[]>;
}

/**
 * Every number the rules depend on. All PROVISIONAL (section 4.7, 13.4a): the
 * first run on real games sets them.
 */
export interface Thresholds {
  /** Level 1: a game with fewer full moves is skipped. Kept low on purpose. */
  minFullMoves: number;
  /** Level 1: skip games whose estimated duration (base + 40 x increment) is under 180 s. */
  excludeBullet: boolean;
  /** Depth of the first pass over every position of the game. */
  passDepth: number;
  /** Depth of the confirming search on each candidate. */
  confirmDepth: number;
  /** MultiPV of the confirming search. If the last line is still accepted, there are too many answers. */
  confirmMultiPv: number;
  /** A move is a candidate mistake when it loses at least this many win% points for its side. */
  candidateWinLoss: number;
  /**
   * ... or at least this many centipawns (mate counts as 3000), whatever the win%. Win% hardly
   * moves in a decided position, where 42% of beginners' material blunders happen (analysis 3a).
   * 0 turns it off.
   */
  candidateCpLoss: number;
  /** Goal "win": the best move keeps the solver at or above this win%. */
  winningWin: number;
  /** Goal "save": the played line left the solver at or below this win% ... */
  lostWin: number;
  /** ... and the best move keeps the solver at or above this win%. */
  savingWin: number;
  /** Goal "mate" only for a forced mate in at most this many solver moves. */
  maxMateMoves: number;
  /** The first rejected line must be at least this many win% points under the goal's threshold ... */
  minGap: number;
  /** ... or at least this many win% points under the best line (best 71, next 41 is clear). */
  clearGapFromBest: number;
  /**
   * Goal "material", when no other goal applies: the best line is at least this many centipawns
   * above the first rejected line ...
   */
  materialGap: number;
  /** ... and every line within this many centipawns of the best is accepted. */
  materialAccept: number;
  /** A position with more accepted first moves than this is not a puzzle. */
  maxAccepted: number;
  /** Most solver moves in a solution line. */
  maxSolverMoves: number;
  /** Skip a candidate whose solver moved with less than this many seconds left (needs [%clk]). */
  lowClockSeconds: number;
  /** A position in check with fewer legal moves than this is not a puzzle (nothing to find). */
  checkMinLegalMoves: number;
  /** At most this many puzzles from one game, the best kept (mate, win, material, save; then the clearest). 0: no cap. */
  maxPuzzlesPerGame: number;
  /**
   * One lesson, not the same one repeated: two puzzles for the same side whose first solution move
   * lands on the same square, within this many plies, keep only the better one (a hanging piece
   * missed twice).
   */
  sameIdeaPlies: number;
}

export interface GeneratorSettings {
  /** Names matched against the White and Black tags; only positions where one of them is to move. */
  players?: string[];
  /** The side to move in the puzzle. */
  color?: Side | 'any';
  /** By the full-move number of the puzzle position (proposal: 1-12, 13-35, 36+). */
  phase?: Phase | 'any';
  /** The piece that makes the first solution move. */
  piece?: PieceRole | 'any';
  thresholds?: Partial<Thresholds>;
}

/**
 * An evaluation already computed for one position, WHITE'S point of view (the Game report's
 * convention). Exactly one of cp / mate is set: mate > 0 means White mates.
 */
export interface PositionEval {
  cp: number | null;
  mate: number | null;
}

export interface GameInput {
  pgn: string;
  /**
   * Optional first pass, one entry per position from the start to after the last move
   * (plies + 1). When given, those positions are not searched again: the Game report has
   * already searched every one. A null entry (a search that timed out) is searched. Used
   * only when the PGN holds exactly one game and the length matches; otherwise ignored.
   */
  evals?: Array<PositionEval | null>;
}

export type PuzzleKind = 'missed' | 'punish';
/**
 * mate: a forced short mate. win: from below the winning threshold to above it. save: from lost to
 * saved. material: none of these, but the best move keeps a clear material edge over the next one
 * (taking a hung piece, keeping one); one solver move.
 */
export type PuzzleGoal = 'mate' | 'win' | 'save' | 'material';

export interface GeneratedPuzzle {
  /** Position BEFORE the setup move (the corpus format: moves[0] is played by the opponent). */
  fen: string;
  /** Standard UCI. moves[0] = the game's move into the puzzle position, then the solution. */
  moves: string[];
  /** For each solver move in `moves`, every move that is accepted (includes the main one). */
  acceptedMoves: string[][];
  /** The side that solves the puzzle. */
  solver: Side;
  /**
   * By colour, never "you" (section 4.0): `missed` = the solver's own move here
   * lost; `punish` = the opponent's previous move lost, and the solver must
   * take advantage of it (whether they did or not in the game).
   */
  kind: PuzzleKind;
  goal: PuzzleGoal;
  /** Mate in N solver moves, when the goal is mate. */
  mateIn: number | null;
  phase: Phase;
  /** The piece that makes the first solution move. */
  piece: PieceRole;
  /** The move actually played in the game at the puzzle position, standard UCI. */
  playedMove: string;
  /** Punish only: whether the game's move was one of the accepted ones. */
  foundInGame: boolean | null;
  /** Full-move number of the puzzle position. */
  moveNumber: number;
  /** Engine numbers, solver point of view. */
  engine: {
    bestWin: number;
    firstRejectedWin: number | null;
    playedWin: number | null;
    preErrorWin: number;
    depth: number;
    multiPv: number;
  };
  /** Index of the game in the input, and a hash of its moves and headers. */
  game: { index: number; hash: string };
}

export type SkipReason =
  | 'unparseable'
  | 'not-standard'
  | 'no-result'
  | 'too-short'
  | 'bullet';

export interface GameReport {
  index: number;
  hash: string;
  white: string;
  black: string;
  status: 'used' | 'skipped';
  skipReason?: SkipReason;
  /** Candidates found by the first pass (after the settings' filters). */
  candidates: number;
  puzzles: number;
  /** Why each dropped candidate was dropped, counted. */
  dropped: Record<string, number>;
  positionsSearched: number;
  /** First-pass positions taken from the input's evals instead of searched. */
  positionsFromEvals: number;
  ms: number;
}

export interface GeneratorResult {
  puzzles: GeneratedPuzzle[];
  report: GameReport[];
  thresholds: Thresholds;
}
