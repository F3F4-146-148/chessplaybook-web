import env from '@/config/env';
import { getRequestHeaders } from '@/features/auth/utils/getAuthToken';
import { type DailyLimit, readDailyLimit } from '@/services/freePlanLimit';

/**
 * Record the first move of a puzzle try. Losing telemetry must never interrupt a board move, so the move is not
 * held for this answer.
 *
 * #521: the first move takes one of today's free puzzles, so the server may refuse it (402, feature `puzzle`):
 * two tabs at the 5th, or a daily served by the preload to a player already at the limit. That limit is returned
 * so the page can stop the attempt. A refusal of a request that carried no identity is not the player's limit.
 */
export async function recordPuzzleTry(puzzleId: string, tryId?: string): Promise<DailyLimit | null> {
  try {
    const headers = await getRequestHeaders();
    const res = await fetch(`${env.apiBaseUrl}/api/puzzles/try`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ puzzleId, tryId }),
    });
    if (res.status !== 402 || !(headers.Authorization || headers['X-Anonymous-Id'])) return null;
    const limit = readDailyLimit(res.status, await res.json().catch(() => null));
    return limit?.feature === 'puzzle' ? limit : null;
  } catch {
    // A later result repeats the idempotent insert. A genuinely abandoned
    // offline try cannot be recovered and should not break solving.
    return null;
  }
}
