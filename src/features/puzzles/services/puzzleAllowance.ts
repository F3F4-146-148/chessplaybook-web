/**
 * #521 A6: what is left of today's free puzzle allowances, as the server counts it (`GET /api/puzzles/allowance`).
 *
 * Each allowance is `{ limit, left, resetsAt }`, or null when it does not apply (the switch off, Premium, admin).
 * `runPass` is whether the active run is still served past the daily 5 today. Never cached: it is per player and
 * changes with every attempt, so the page reads it on load and after each result.
 */
import { useEffect, useState } from 'react';
import env from '@/config/env';
import { getRequestHeaders } from '@/features/auth/utils/getAuthToken';

export interface Allowance {
  limit: number;
  left: number;
  /** ISO UTC: the next Europe/Bucharest midnight. */
  resetsAt: string;
}

export interface PuzzleAllowance {
  puzzle: Allowance | null;
  puzzleExplanation: Allowance | null;
  /** #559: the ask offers these while they are still free today (undefined from an older server: not offered). */
  guidedGame?: Allowance | null;
  openingSession?: Allowance | null;
  runPass: boolean;
}

function asAllowance(value: unknown): Allowance | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  return typeof v.limit === 'number' && typeof v.left === 'number' && typeof v.resetsAt === 'string'
    ? { limit: v.limit, left: v.left, resetsAt: v.resetsAt }
    : null;
}

/** The server's answer, or null when it could not be read (an old server, offline): the page then shows nothing. */
export async function fetchPuzzleAllowance(): Promise<PuzzleAllowance | null> {
  try {
    const headers = await getRequestHeaders();
    const res = await fetch(`${env.apiBaseUrl}/api/puzzles/allowance`, { headers, cache: 'no-store' });
    if (!res.ok) return null;
    const body = await res.json().catch(() => null) as { success?: boolean; data?: Record<string, unknown> } | null;
    if (!body?.success || !body.data) return null;
    return {
      puzzle: asAllowance(body.data.puzzle),
      puzzleExplanation: asAllowance(body.data.puzzleExplanation),
      guidedGame: 'guidedGame' in body.data ? asAllowance(body.data.guidedGame) : undefined,
      openingSession: 'openingSession' in body.data ? asAllowance(body.data.openingSession) : undefined,
      runPass: body.data.runPass === true,
    };
  } catch {
    return null;
  }
}

/**
 * The allowance, read when the page mounts and again whenever `refreshKey` changes (pass something that changes
 * after each result, such as the count of attempts recorded). A late answer for an older key is dropped.
 */
export function usePuzzleAllowance(refreshKey: unknown): PuzzleAllowance | null {
  const [allowance, setAllowance] = useState<PuzzleAllowance | null>(null);
  useEffect(() => {
    let live = true;
    void fetchPuzzleAllowance().then((value) => { if (live) setAllowance(value); });
    return () => { live = false; };
  }, [refreshKey]);
  return allowance;
}
