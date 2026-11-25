/**
 * The list on `/puzzles/from-games` (own-game puzzles C1): one row per game, what stops a game from
 * being analysed, which side is "you", and which games are ticked to start with.
 *
 * Pure, so the page's rules are tested without a browser. The page feeds it the parsed games, the
 * generator's skip reasons and the server's answer to `/api/game-puzzles/check`.
 */
import type { ParsedGame } from '../generator/generatePuzzles';
import type { Side, SkipReason } from '../generator/types';

/** At most this many games a run (plan P4, confirmed by the phone measurement A2). */
export const MAX_GAMES_PER_RUN = 20;

/**
 * Why a row cannot be analysed: the generator's reasons, "already done" from the server, and the
 * same game a second time in the paste.
 */
export type RowBlock = SkipReason | 'analysed' | 'duplicate';

export interface GameRow {
  index: number;
  hash: string;
  white: string;
  black: string;
  /** The PGN date as written ("2026.11.15"), or null when it is missing or "????". */
  date: string | null;
  result: string;
  /** Full moves, rounded up. */
  moves: number;
  block: RowBlock | null;
  /** The colour that is "you" by the name, or null when the name matches neither player. */
  side: Side | null;
}

const clean = (s: string | undefined) => (s ?? '').trim();
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export function sideOf(game: { white: string; black: string }, name: string): Side | null {
  const me = name.trim();
  if (!me) return null;
  if (same(game.white, me)) return 'white';
  if (same(game.black, me)) return 'black';
  return null;
}

export function buildRows(
  games: ParsedGame[],
  skips: Array<SkipReason | null>,
  analysed: ReadonlySet<string>,
  name: string,
  /** Games played here know their side from the account (C3); a name is then not needed. */
  knownSides?: ReadonlyArray<Side | null>,
): GameRow[] {
  const seen = new Set<string>();
  return games.map((g, i) => {
    const repeat = seen.has(g.hash);
    seen.add(g.hash);
    const white = clean(g.headers.get('White')) || '?';
    const black = clean(g.headers.get('Black')) || '?';
    const rawDate = clean(g.headers.get('Date') ?? g.headers.get('UTCDate'));
    return {
      index: g.index,
      hash: g.hash,
      white,
      black,
      date: rawDate && !rawDate.startsWith('????') ? rawDate : null,
      result: clean(g.headers.get('Result')) || '*',
      moves: Math.ceil(g.sans.length / 2),
      block: skips[i] ?? (repeat ? 'duplicate' : analysed.has(g.hash) ? 'analysed' : null),
      side: knownSides?.[i] ?? sideOf({ white, black }, name),
    };
  });
}

/**
 * The name to start with: the player in the most games (a player's own export has them on one side
 * of every game), as long as they are in at least two games and half of them, and no other name is
 * in as many. A stray game of someone else's does not stop the suggestion; a paste of other people's
 * games, or a single game (two names, no way to tell), gives none.
 */
export function suggestName(games: ParsedGame[]): string | null {
  const counts = new Map<string, { name: string; n: number }>();
  for (const g of games) {
    const names = new Set([clean(g.headers.get('White')), clean(g.headers.get('Black'))].filter((n) => n && n !== '?'));
    for (const n of names) {
      const key = n.toLowerCase();
      const c = counts.get(key) ?? { name: n, n: 0 };
      c.n += 1;
      counts.set(key, c);
    }
  }
  const [first, second] = [...counts.values()].sort((x, y) => y.n - x.n);
  if (!first || first.n < 2 || first.n * 2 < games.length) return null;
  if (second && second.n === first.n) return null;
  return first.name;
}

/** A row can be ticked when nothing blocks it. With no side known it makes both sides' puzzles (#510). */
export function selectable(row: GameRow): boolean {
  return row.block === null;
}

/**
 * Ticked to start with: the first games that can be analysed, up to what is left today (null:
 * unlimited) and the run's cap. A side is not needed (#510, owner R3: both sides by default).
 */
export function defaultSelection(rows: GameRow[], left: number | null): Set<string> {
  const cap = Math.min(MAX_GAMES_PER_RUN, left ?? MAX_GAMES_PER_RUN);
  const out = new Set<string>();
  for (const r of rows) {
    if (out.size >= cap) break;
    if (selectable(r)) out.add(r.hash);
  }
  return out;
}
