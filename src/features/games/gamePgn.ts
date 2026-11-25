/**
 * The PGN of a game played on the site, built in the browser (#416): Copy and Download during a game
 * against the computer, before the server has the game. Once a game is stored the server's PGN is used
 * (`GET /api/online-games/:id`). The two builders must agree: `gamePgn.test.ts` runs the server's
 * (`backend/src/services/PgnService.ts`) beside this one on the same games and requires the same text.
 */

export type GameMode = 'online' | 'master' | 'stockfish';

export interface GamePgnParams {
  /** `rating` null: no Elo tag for that player (#440). */
  white: { username: string; rating: number | null };
  black: { username: string; rating: number | null };
  /** '1-0' | '0-1' | '1/2-1/2', or '*' for a game still being played. */
  result: string;
  endReason: string;
  sanMoves: string[];
  /** Seconds; 0 with no increment is a game with no clock (TimeControl `-`). */
  timeControlInitial: number;
  timeControlIncrement: number;
  playedAt: Date;
  mode?: GameMode;
  startFen?: string | null;
}

const EVENT: Record<GameMode, string> = {
  online: 'Chess Playbook Online',
  master: 'Chess Playbook vs the Master',
  stockfish: 'Chess Playbook vs Stockfish',
};

const TERMINATION: Record<string, string> = { timeout: 'Time forfeit', abandonment: 'Abandoned' };

export const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const escapeTag = (v: string) => v.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

function pgnDate(d: Date): string {
  return `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${String(d.getUTCDate()).padStart(2, '0')}`;
}

function moveCounter(fen: string | null | undefined): { blackFirst: boolean; fullmove: number } {
  const fields = (fen ?? '').trim().split(/\s+/);
  const fullmove = Number.parseInt(fields[5] ?? '', 10);
  return { blackFirst: fields[1] === 'b', fullmove: Number.isFinite(fullmove) && fullmove > 0 ? fullmove : 1 };
}

export function buildGamePgn(params: GamePgnParams): string {
  const { white, black, result, endReason, sanMoves, timeControlInitial, timeControlIncrement, playedAt } = params;
  const mode = params.mode ?? 'online';
  const startFen = params.startFen && params.startFen.trim() !== INITIAL_FEN ? params.startFen.trim() : null;
  const tc = timeControlInitial <= 0 && timeControlIncrement <= 0
    ? '-'
    : timeControlIncrement > 0 ? `${timeControlInitial}+${timeControlIncrement}` : `${timeControlInitial}`;
  const finished = result !== '*';

  const headers = [
    `[Event "${EVENT[mode]}"]`,
    `[Site "chessplaybook.com"]`,
    `[Date "${pgnDate(playedAt)}"]`,
    `[Round "-"]`,
    `[White "${escapeTag(white.username)}"]`,
    `[Black "${escapeTag(black.username)}"]`,
    `[Result "${result}"]`,
    ...(white.rating === null ? [] : [`[WhiteElo "${white.rating}"]`]),
    ...(black.rating === null ? [] : [`[BlackElo "${black.rating}"]`]),
    `[TimeControl "${tc}"]`,
    // A game still being played has no Termination yet (the PGN standard's "unterminated").
    ...(finished ? [`[Termination "${TERMINATION[endReason] ?? 'Normal'}"]`] : []),
    ...(startFen ? [`[SetUp "1"]`, `[FEN "${escapeTag(startFen)}"]`] : []),
  ].join('\n');

  const { blackFirst, fullmove } = moveCounter(startFen);
  const tokens: string[] = [];
  sanMoves.forEach((san, i) => {
    const ply = i + (blackFirst ? 1 : 0);
    const number = fullmove + Math.floor(ply / 2);
    if (ply % 2 === 0) tokens.push(`${number}.`);
    else if (i === 0) tokens.push(`${number}...`);
    tokens.push(san);
  });
  tokens.push(result);
  return `${headers}\n\n${tokens.join(' ')}`;
}

/** A file name for a downloaded game: `chessplaybook-2026-11-25-white-vs-black.pgn`, letters and digits only. */
export function gamePgnFileName(white: string, black: string, playedAt: Date): string {
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'player';
  const day = playedAt.toISOString().slice(0, 10);
  return `chessplaybook-${day}-${slug(white)}-vs-${slug(black)}.pgn`;
}
