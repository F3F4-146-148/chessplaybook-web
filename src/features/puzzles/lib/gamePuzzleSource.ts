/**
 * What the live card says about the game a puzzle came from, once it is solved or shown
 * (#245 B4, D7; decided 2026-11-19: text and a link to the game page at its start).
 *
 * Built from what the server sends (`source`, `routes/puzzles.ts` formatGeneratedPuzzle); the only
 * chess done here is turning the played move into SAN for display, from the puzzle's own position.
 */
import { positionFromFen, applyMove, uciToSan } from '@/components/chess/chessLogic';

/** The game, as served (`puzzleSource.ts` SourceGame). */
export interface PuzzleSourceGame {
  white: string;
  black: string;
  year: number | null;
  event: string | null;
  champion: { slug: string; name: string; index: number } | null;
}

/** `source` on a puzzle made from a game. */
export interface PuzzleGameSource {
  kind: 'missed' | 'punish';
  /** UCI, the move played in the game at the puzzle position. */
  playedMove: string;
  /** Punish only: whether that move was an accepted one. */
  foundInGame: boolean | null;
  /** Full-move number of the puzzle position. */
  moveNumber: number;
  gameId: number | null;
  game: PuzzleSourceGame | null;
}

export interface GameCardLines {
  /** "Kasparov vs Karpov, World Championship 1990" */
  game: string;
  /** "In the game Karpov played 23...Nd4." or "Kasparov found it in the game." */
  played: string | null;
  /** The champion's game page, or null when neither player is one of ours. */
  href: string | null;
}

/** "Kasparov, Garry" -> "Kasparov"; a name without a comma is kept whole. */
export function surname(pgnName: string): string {
  const name = pgnName.trim();
  const comma = name.indexOf(',');
  return comma > 0 ? name.slice(0, comma).trim() : name;
}

export function gameCardLines(puzzle: {
  fen: string;
  moves: string[];
  source?: PuzzleGameSource;
} | null | undefined): GameCardLines | null {
  const source = puzzle?.source;
  const g = source?.game;
  if (!puzzle || !source || !g) return null;

  const white = surname(g.white);
  const black = surname(g.black);
  const where = [g.event, g.year].filter((x) => x != null && x !== '').join(' ');
  const game = `${white} vs ${black}${where ? `, ${where}` : ''}`;

  /* The puzzle position is after moves[0], the game's move into it. */
  const start = positionFromFen(puzzle.fen);
  const atPuzzle = start && puzzle.moves[0] ? applyMove(start, puzzle.moves[0]) : null;
  const solverIsWhite = atPuzzle ? atPuzzle.turnColor === 'white' : null;
  const solver = solverIsWhite === null ? null : solverIsWhite ? white : black;

  let played: string | null = null;
  if (solver && source.foundInGame === true) {
    played = `${solver} found it in the game.`;
  } else if (solver && atPuzzle && source.playedMove) {
    const san = uciToSan(atPuzzle, source.playedMove);
    if (san) played = `In the game ${solver} played ${source.moveNumber}${solverIsWhite ? '.' : '...'}${san}.`;
  }

  const href = g.champion ? `/champions/${g.champion.slug}/games/${g.champion.index}` : null;
  return { game, played, href };
}
