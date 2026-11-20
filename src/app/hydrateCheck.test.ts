import { describe, expect, it } from 'vitest';
import { shouldHydrate } from './hydrateCheck.js';
import { LAST_REPERTOIRE_KEY } from '@/features/openings/welcome';
import { MASTER_VOICE_KEY, OPENINGS_VOICE_KEY, VOLUME_KEY } from '@/features/master/useMasterVoice';
import { FILTERS_KEY } from '@/features/puzzles/hooks/usePuzzleSettings';
import { PROGRESS_STORAGE_KEY } from '@/features/puzzles/hooks/usePuzzleRecord';
import { BOARD_THEME_STORAGE_KEY, LEGACY_BOARD_THEME_STORAGE_KEY } from '@/config/boardThemes';
import { ANALYSIS_CONFIG_KEY, PV_COUNT_KEY } from '@/services/analysisStorageKeys';

/**
 * The page part of the hydrate check (prerender plan B1b/B2b). hydrateCheck.js cannot import (its source is inlined into
 * each built page's head), so it names the keys itself; this test reads them from where the pages read them, so a renamed
 * key fails here instead of letting a returning visitor's page be taken over with someone else's first render.
 */
function storageWith(entries: Record<string, string>) {
  return { getItem: (k: string) => (k in entries ? entries[k] : null) };
}

const REMEMBERED: Record<string, string[]> = {
  openings: [LAST_REPERTOIRE_KEY, MASTER_VOICE_KEY, OPENINGS_VOICE_KEY, VOLUME_KEY, BOARD_THEME_STORAGE_KEY, LEGACY_BOARD_THEME_STORAGE_KEY],
  puzzles: [FILTERS_KEY, PROGRESS_STORAGE_KEY, BOARD_THEME_STORAGE_KEY, LEGACY_BOARD_THEME_STORAGE_KEY],
  // E0: the round recaps' game viewer (board theme, the analysis card's on/off and line count).
  'news/candidates-2026-round-1': [BOARD_THEME_STORAGE_KEY, LEGACY_BOARD_THEME_STORAGE_KEY, ANALYSIS_CONFIG_KEY, PV_COUNT_KEY],
  'news/candidates-2026-round-3': [BOARD_THEME_STORAGE_KEY, LEGACY_BOARD_THEME_STORAGE_KEY, ANALYSIS_CONFIG_KEY, PV_COUNT_KEY],
};

describe('shouldHydrate', () => {
  it('takes over a first visit with a plain address, or with tracking parameters only', () => {
    for (const route of ['openings', 'puzzles', 'terms']) {
      expect(shouldHydrate('', route, storageWith({}))).toBe(true);
      expect(shouldHydrate('?utm_source=x&gclid=1', route, storageWith({}))).toBe(true);
    }
  });

  it('builds from scratch for any other query string', () => {
    expect(shouldHydrate('?repertoire=french', 'openings', storageWith({}))).toBe(false);
    expect(shouldHydrate('?daily=2026-11-19', 'puzzles', storageWith({}))).toBe(false);
  });

  for (const [route, keys] of Object.entries(REMEMBERED)) {
    for (const key of keys) {
      it(`builds /${route} from scratch when "${key}" is saved, even as an empty string`, () => {
        expect(shouldHydrate('', route, storageWith({ [key]: '' }))).toBe(false);
      });
    }
  }

  it('does not apply one page\'s keys to another', () => {
    expect(shouldHydrate('', 'terms', storageWith({ [BOARD_THEME_STORAGE_KEY]: 'green' }))).toBe(true);
    expect(shouldHydrate('', 'openings', storageWith({ [FILTERS_KEY]: '{}' }))).toBe(true);
  });

  it('reads no storage as a first visit, and a storage that throws as a returning one', () => {
    expect(shouldHydrate('', 'puzzles', null)).toBe(true);
    const throwing = { getItem: () => { throw new Error('blocked'); } };
    expect(shouldHydrate('', 'puzzles', throwing)).toBe(false);
  });
});
