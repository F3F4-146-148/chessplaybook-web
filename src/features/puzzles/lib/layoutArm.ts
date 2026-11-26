/**
 * Which /puzzles arrangement a visitor sees (#521, plan B2).
 *
 * EVERYONE OR NOBODY (owner, 2026-11-26): the new arrangement (the "What to train" card, one record card, Try other
 * lines) goes to the whole traffic when `PUZZLES_NEW_LAYOUT_LIVE` is on; there is no half-and-half test, since today's
 * page sells nothing and there is nothing to compare it with. Not tied to an identity, so the page never changes
 * when the sign-in state arrives.
 *
 * `?layout=b` or `?layout=a` on the address forces one arrangement for that tab: `b` to try the new one before it is
 * live, `a` to see today's page after.
 */
import { PUZZLES_NEW_LAYOUT_LIVE } from '@/design/designFlags';

export type LayoutArm = 'a' | 'b';

const OVERRIDE_KEY = 'cp_puzzles_layout';

/** The address's `?layout=` override, kept for the tab so a reload or a move inside the page keeps it. */
function override(): LayoutArm | null {
  if (typeof window === 'undefined') return null;
  try {
    const q = new URLSearchParams(window.location.search).get('layout');
    if (q === 'a' || q === 'b') {
      window.sessionStorage.setItem(OVERRIDE_KEY, q);
      return q;
    }
    const kept = window.sessionStorage.getItem(OVERRIDE_KEY);
    return kept === 'a' || kept === 'b' ? kept : null;
  } catch {
    return null;
  }
}

export function layoutArm(): LayoutArm {
  return override() ?? (PUZZLES_NEW_LAYOUT_LIVE ? 'b' : 'a');
}
