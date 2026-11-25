/**
 * One game back to PGN text, for `POST /api/game-puzzles` (own-game puzzles C2): the server replays
 * the game it is sent and checks its hash, which is computed from every header and the mainline
 * SANs (`gameHash`). Comments, clocks and variations are left out; they are not part of the hash.
 */
import type { ParsedGame } from '../generator/generatePuzzles';

const quote = (v: string) => v.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

export function gamePgn(game: Pick<ParsedGame, 'headers' | 'sans'>): string {
  const tags = [...game.headers.entries()].map(([k, v]) => `[${k} "${quote(v)}"]`).join('\n');
  const result = game.headers.get('Result') ?? '*';
  return `${tags}\n\n${game.sans.join(' ')} ${result}\n`;
}
