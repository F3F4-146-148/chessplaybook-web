/**
 * #418 v3 C1: today's rating line (`GET /api/puzzles/today`), read when the page mounts and again after each result,
 * like the allowance (`puzzleAllowance.ts`). Never cached: it changes with every attempt. Null when it cannot be read
 * (an old server, offline): the page then draws nothing.
 */
import { useEffect, useState } from 'react';
import env from '@/config/env';
import { getRequestHeaders } from '@/features/auth/utils/getAuthToken';
import { asTodayLine, type TodayLine } from '../lib/daySummary';

export async function fetchTodayLine(): Promise<TodayLine | null> {
  try {
    const headers = await getRequestHeaders();
    const res = await fetch(`${env.apiBaseUrl}/api/puzzles/today`, { headers, cache: 'no-store' });
    if (!res.ok) return null;
    const body = await res.json().catch(() => null) as { success?: boolean; data?: unknown } | null;
    return body?.success ? asTodayLine(body.data) : null;
  } catch {
    return null;
  }
}

/** Today's line, re-read whenever `refreshKey` changes; a late answer for an older key is dropped. */
export function usePuzzleToday(refreshKey: unknown): TodayLine | null {
  const [line, setLine] = useState<TodayLine | null>(null);
  useEffect(() => {
    let live = true;
    void fetchTodayLine().then((value) => { if (live) setLine(value); });
    return () => { live = false; };
  }, [refreshKey]);
  return line;
}
