/**
 * A stored game's PGN from the server (#416): `GET /api/online-games/:id`, public, built by the server's one
 * PGN builder. Used by Copy and Download once a game is stored. An online game is written as it ends, so a
 * press in the first moment after the end may find it not there yet: a 404 is asked again (0.6 s, then 1.5 s).
 */
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function fetchStoredGamePgn(id: string): Promise<string> {
  const env = (await import('@/config/env')).default;
  let status = 0;
  for (const delay of [0, 600, 1500]) {
    if (delay) await wait(delay);
    const res = await fetch(`${env.apiBaseUrl}/api/online-games/${encodeURIComponent(id)}`);
    status = res.status;
    if (res.ok) {
      const game = await res.json() as { pgn?: string };
      if (game.pgn) return game.pgn;
      break;
    }
    if (res.status !== 404) break;
  }
  throw new Error(`game ${id}: ${status}`);
}
