import type { PlayersMap } from '@/types/chess';
import players from '../../../public/assets/players/players_list.json';

/**
 * THE 18 WORLD CHAMPIONS AS THE SITE WRITES THEM (prerender plan D3, 2026-11-19): `public/assets/players/players_list.json`,
 * bundled, so `/champions` and `/champions/list` render the same list in the build (their HTML) and in the browser, with
 * no request before the first render.
 *
 * The gallery used to paint this file and then swap to the API's `/api/players`, whose biographies are a different, shorter
 * set (all 18 differed on 2026-11-19); owner: the file's are kept, and the gallery no longer asks the API. Names, order and
 * reigns are the same in both; `championRoster.test.ts` checks the file's own shape, and D4's guard checks it against the API.
 * The same file is still served under `/assets/players/` for the pages that fetch it.
 */
export const CHAMPION_ROSTER: PlayersMap = players as PlayersMap;
