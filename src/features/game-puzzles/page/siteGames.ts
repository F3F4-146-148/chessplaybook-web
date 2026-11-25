/**
 * The player's games played here (own-game puzzles C3), as the same list as a pasted PGN.
 *
 * `GET /api/online-games?userId=` lists them (a guest is `anon:<uuid>` there, an account its
 * Cognito sub, as on the game history page) without their PGN, so each one is read from
 * `/api/online-games/:id`, a few at a time. The side is known from the game, not from a name; the
 * save sends the game's id and the server reads its own copy (B2).
 */
import env from '@/config/env';
import { parseGames, type ParsedGame } from '../generator/generatePuzzles';
import type { Side } from '../generator/types';
import { MAX_GAMES_PER_RUN } from './gameList';

export interface SiteGame {
  game: ParsedGame;
  /** online_games.id, sent as `sourceGameRef`. */
  ref: string;
  side: Side;
}

interface Summary {
  id: string;
  white: { userId: string };
  black: { userId: string };
}

/** The newest games, at most one run's worth. Games whose PGN cannot be read are left out. */
export async function loadSiteGames(userId: string, limit = MAX_GAMES_PER_RUN): Promise<SiteGame[]> {
  const headers = await (await import('@/features/auth/utils/getAuthToken')).getRequestHeaders();
  const params = new URLSearchParams({ userId, page: '1', limit: String(limit) });
  const res = await fetch(`${env.apiBaseUrl}/api/online-games?${params}`, { headers });
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  const list = ((await res.json()).games ?? []) as Summary[];

  const out: Array<SiteGame | null> = new Array(list.length).fill(null);
  let next = 0;
  const worker = async () => {
    while (next < list.length) {
      const i = next++;
      const g = list[i];
      const side: Side | null = g.white.userId === userId ? 'white' : g.black.userId === userId ? 'black' : null;
      if (!side) continue;
      try {
        const one = await fetch(`${env.apiBaseUrl}/api/online-games/${encodeURIComponent(g.id)}`);
        if (!one.ok) continue;
        const pgn = ((await one.json()) as { pgn?: string }).pgn;
        if (!pgn) continue;
        const [game] = await parseGames([{ pgn }]);
        if (game) out[i] = { game, ref: g.id, side };
      } catch {
        /* one game that cannot be read is left out, not the list */
      }
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  return out.filter((x): x is SiteGame => x !== null).map((x, index) => ({ ...x, game: { ...x.game, index } }));
}
