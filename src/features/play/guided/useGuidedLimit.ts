/**
 * #428 D6: IS TODAY'S FREE GUIDED GAME USED? The server says so once, when it refuses a game (402, the free plan's one
 * a day); `useGuidedGame` keeps the reset time it gave in localStorage (`LIMIT_KEY`). This reads it back, so the page
 * can say why the help is gone before and during a game, until the reset time passes. Read again when the server
 * refuses (`refused`), when the window gets focus (another tab may have used it) and at the reset time.
 */
import { useEffect, useState } from 'react';

import { limitApplies, FREE_PLAN_ALLOWANCE, type DailyLimit } from '@/services/freePlanLimit';
import { LIMIT_CHANGED_EVENT, LIMIT_KEY } from './useGuidedGame';

export function readGuidedLimit(now: number = Date.now()): DailyLimit | null {
  let resetsAt: string | null = null;
  try { resetsAt = localStorage.getItem(LIMIT_KEY); } catch { return null; }
  if (!resetsAt) return null;
  const limit: DailyLimit = { feature: 'guided_game', limit: FREE_PLAN_ALLOWANCE.guided_game, resetsAt };
  return limitApplies(limit, now) ? limit : null;
}

export function useGuidedLimit(refused: boolean): DailyLimit | null {
  const [limit, setLimit] = useState<DailyLimit | null>(() => readGuidedLimit());
  useEffect(() => { setLimit(readGuidedLimit()); }, [refused]);
  useEffect(() => {
    const again = () => setLimit(readGuidedLimit());
    window.addEventListener('focus', again);
    window.addEventListener(LIMIT_CHANGED_EVENT, again); // a game started in this tab cleared it (E2)
    return () => { window.removeEventListener('focus', again); window.removeEventListener(LIMIT_CHANGED_EVENT, again); };
  }, []);
  useEffect(() => {
    if (!limit) return;
    const ms = Date.parse(limit.resetsAt) - Date.now();
    if (!(ms > 0) || ms > 2 ** 31 - 1) return;
    const t = window.setTimeout(() => setLimit(readGuidedLimit()), ms + 1000);
    return () => window.clearTimeout(t);
  }, [limit]);
  return limit;
}
