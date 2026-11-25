import { describe, expect, it } from 'vitest';
import { parseGames, skipReasonOf } from '../generator/generatePuzzles';
import { buildRows, defaultSelection, MAX_GAMES_PER_RUN, sideOf, suggestName } from './gameList';

const game = (white: string, black: string, moves = '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 1-0', extra = '') =>
  `[Event "x"]\n[Date "2026.11.15"]\n[White "${white}"]\n[Black "${black}"]\n[Result "1-0"]\n${extra}\n${moves}\n\n`;

describe('the games list (own-game puzzles C1)', () => {
  it('reads each game: players, date, result, moves', async () => {
    const games = await parseGames([{ pgn: game('dhoward', 'Bob') }]);
    const [row] = buildRows(games, [null], new Set(), 'dhoward');
    expect(row).toMatchObject({ white: 'dhoward', black: 'Bob', date: '2026.11.15', result: '1-0', moves: 4, block: null, side: 'white' });
  });

  it('blocks what the generator would skip, what is already done, and a game pasted twice', async () => {
    const pgn = game('a', 'b') + game('a', 'b', '1. e4 e5 1-0') + game('a', 'b') + game('a', 'c');
    const games = await parseGames([{ pgn }]);
    const skips = await Promise.all(games.map((g) => skipReasonOf(g)));
    const rows = buildRows(games, skips, new Set([games[3].hash]), 'a');
    expect(rows.map((r) => r.block)).toEqual([null, 'too-short', 'duplicate', 'analysed']);
  });

  it('the pre-check agrees with the generator on a game that is not standard chess', async () => {
    const [g] = await parseGames([{ pgn: game('a', 'b', '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 1-0', '[Variant "Chess960"]') }]);
    expect(await skipReasonOf(g)).toBe('not-standard');
  });

  it('a game played here knows its side without a name (C3)', async () => {
    const games = await parseGames([{ pgn: game('Guest-ab12', 'Bob') + game('Al', 'Guest-ab12') }]);
    const rows = buildRows(games, [null, null], new Set(), '', ['white', 'black']);
    expect(rows.map((r) => r.side)).toEqual(['white', 'black']);
  });

  it('finds which side is "you" by name, whatever the case', () => {
    expect(sideOf({ white: 'DHoward', black: 'Bob' }, ' dhoward ')).toBe('white');
    expect(sideOf({ white: 'Al', black: 'dhoward' }, 'DHOWARD')).toBe('black');
    expect(sideOf({ white: 'Al', black: 'Bob' }, 'dhoward')).toBeNull();
    expect(sideOf({ white: 'Al', black: 'Bob' }, '')).toBeNull();
  });

  it('suggests the name in most of the games, and nothing when it cannot tell', async () => {
    const mine = await parseGames([{ pgn: game('dhoward', 'Bob') + game('Al', 'DHoward') + game('dhoward', 'Cy') }]);
    expect(suggestName(mine)?.toLowerCase()).toBe('dhoward');
    expect(suggestName(await parseGames([{ pgn: game('dhoward', 'Bob') }]))).toBeNull();
    expect(suggestName(await parseGames([{ pgn: game('a', 'b') + game('c', 'd') }]))).toBeNull();
    expect(suggestName(await parseGames([{ pgn: game('a', 'b') + game('b', 'a') }]))).toBeNull();
    const withStray = await parseGames([{ pgn: game('me', 'x') + game('y', 'me') + game('me', 'z') + game('p', 'q') }]);
    expect(suggestName(withStray)).toBe('me');
    expect(suggestName(await parseGames([{ pgn: game('me', 'x') + game('p', 'q') + game('r', 's') + game('t', 'u') + game('me', 'v') }]))).toBeNull();
  });

  it('ticks the first games it can analyse, up to what is left today and the run cap', async () => {
    const pgn = Array.from({ length: 25 }, (_, i) => game('me', `opp${i}`)).join('');
    const games = await parseGames([{ pgn }]);
    const rows = buildRows(games, games.map(() => null), new Set([games[0].hash]), 'me');
    expect([...defaultSelection(rows, 3)]).toEqual([games[1].hash, games[2].hash, games[3].hash]);
    expect(defaultSelection(rows, null).size).toBe(MAX_GAMES_PER_RUN);
    expect(defaultSelection(rows, 0).size).toBe(0);
    // #510: a side is not needed; such a game makes both sides' puzzles.
    const unknownSide = buildRows(games, games.map(() => null), new Set(), 'nobody');
    expect(defaultSelection(unknownSide, null).size).toBe(defaultSelection(rows, null).size);
  });
});
