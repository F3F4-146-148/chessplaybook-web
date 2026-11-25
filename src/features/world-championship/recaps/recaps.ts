/**
 * Every game recap of the 2026 World Championship (owner, 2026-11-23). A recap is published by adding it to
 * PUBLISHED_RECAPS together with its route-meta.json entry (`news/world-championship-2026/game-N`); a test checks the
 * two lists agree, and the News list, the sitemap and the hub's game rows read from here.
 *
 * DRAFTS are drawn on the dev server only (`import.meta.env.DEV`): the format, and the explainer's moments, are shown
 * to the owner on a past game before anything is published.
 */

import type { GameRecap } from './types';
import { DRAFT_WCH2024_GAME_14 } from './drafts/wch2024-game-14';
import { GAME_1_RECAP } from './game-1';
import { GAME_2_RECAP } from './game-2';

/** Published recaps, in game order. Each is read by the owner before it goes here (owner, 2026-11-23). */
export const PUBLISHED_RECAPS: readonly GameRecap[] = [GAME_1_RECAP, GAME_2_RECAP];

const DRAFTS: readonly GameRecap[] = import.meta.env.DEV ? [DRAFT_WCH2024_GAME_14] : [];

export const RECAP_PATH_PREFIX = '/news/world-championship-2026/';

export function recapPath(recap: Pick<GameRecap, 'slug'>): string {
  return RECAP_PATH_PREFIX + recap.slug;
}

/** The recap at this slug: a published one anywhere, a draft only on the dev server. */
export function recapBySlug(slug: string | undefined): GameRecap | undefined {
  if (!slug) return undefined;
  return PUBLISHED_RECAPS.find((r) => r.slug === slug) ?? DRAFTS.find((r) => r.slug === slug);
}

/** The published recap of match game n, if there is one (the hub's game rows link to it). */
export function recapOfGame(n: number): GameRecap | undefined {
  return PUBLISHED_RECAPS.find((r) => r.game === n);
}
