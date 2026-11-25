import { describe, expect, it } from 'vitest';
import { parseGames } from '../generator/generatePuzzles';
import { gamePgn } from './gamePgn';

describe('one game back to PGN (own-game puzzles C2)', () => {
  it('gives the same hash as the game it came from, so the server accepts it', async () => {
    const pgn = [
      '[Event "Club \\"open\\" C:\\\\"]', '[Site "https://lichess.org/abc"]', '[White "dhoward"]', '[Black "Bob"]',
      '[Result "1-0"]', '[UTCDate "2026.11.15"]', '',
      '1. e4 { [%clk 0:10:00] } e5 (1... c5 2. Nf3) 2. Bc4!? Nc6 3. Qh5 Nf6?? 4. Qxf7# 1-0', '',
      '[Event "x"]', '[White "a"]', '[Black "b"]', '[Result "0-1"]', '', '1. f3 e5 2. g4 Qh4# 0-1', '',
    ].join('\n');
    const games = await parseGames([{ pgn }]);
    expect(games).toHaveLength(2);
    for (const g of games) {
      const [again] = await parseGames([{ pgn: gamePgn(g) }]);
      expect(again.hash).toBe(g.hash);
      expect(again.sans).toEqual(g.sans);
      expect(again.headers.get('Event')).toBe(g.headers.get('Event'));
    }
    expect(games[0].headers.get('Event')).toBe('Club "open" C:\\');
  });
});
