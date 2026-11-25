import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import routeMeta from '@/config/route-meta.json';
import { newsArticles } from '@/config/newsArticles';
import { PUBLISHED_RECAPS, RECAP_PATH_PREFIX, recapBySlug, recapOfGame, recapPath } from './recaps';
import { formatEval, formatLine } from './format';
import { DRAFT_WCH2024_GAME_14 } from './drafts/wch2024-game-14';

const meta = routeMeta as Record<string, { articleType?: string; datePublished?: string; title?: string }>;
const recapKeys = Object.keys(meta).filter((k) => `/${k}`.startsWith(RECAP_PATH_PREFIX));

describe('published recaps', () => {
  it('each has its route-meta entry, an article with a publication date', () => {
    for (const r of PUBLISHED_RECAPS) {
      const m = meta[recapPath(r).slice(1)];
      expect(m, `no route-meta entry for ${recapPath(r)}`).toBeDefined();
      expect(m.articleType).toBeTruthy();
      expect(m.datePublished).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('every route-meta recap is a published recap (a page with no data would be the 404 page)', () => {
    const published = new Set(PUBLISHED_RECAPS.map((r) => recapPath(r).slice(1)));
    expect(recapKeys.filter((k) => !published.has(k))).toEqual([]);
  });

  it('a published recap is never a draft, is a match game, and is read in game order', () => {
    PUBLISHED_RECAPS.forEach((r, i) => {
      expect(r.draft).toBeFalsy();
      expect(r.slug).toBe(`game-${r.game}`);
      if (i > 0) expect(r.game!).toBeGreaterThan(PUBLISHED_RECAPS[i - 1].game!);
    });
  });

  it('each moment has its baked facts', () => {
    for (const r of [...PUBLISHED_RECAPS, DRAFT_WCH2024_GAME_14]) {
      const plies = new Set(r.baked.moments.map((m) => m.ply));
      for (const m of r.moments) expect(plies.has(m.ply), `${r.slug}: ply ${m.ply} not baked`).toBe(true);
    }
  });

  it('every picture it shows exists and is credited in its folder (a missing file builds fine and ships broken)', () => {
    for (const r of PUBLISHED_RECAPS) {
      const photos = [r.photo, ...r.sections.map((s) => s.photo)].filter((p) => p !== undefined);
      for (const src of [...photos.map((p) => p.src), ...(r.cardImage ? [r.cardImage] : [])]) {
        const file = resolve(process.cwd(), 'public' + src);
        expect(existsSync(file), `${r.slug}: ${src} is not in public/`).toBe(true);
        const credits = resolve(dirname(file), 'CREDITS.md');
        expect(existsSync(credits), `${r.slug}: no CREDITS.md beside ${src}`).toBe(true);
        expect(readFileSync(credits, 'utf-8'), `${r.slug}: ${basename(src)} has no CREDITS.md row`).toContain(
          '`' + basename(src) + '`',
        );
      }
    }
  });

  it('is listed in the News list', () => {
    const hrefs = new Set(newsArticles.map((a) => a.href));
    for (const r of PUBLISHED_RECAPS) expect(hrefs.has(recapPath(r))).toBe(true);
  });

  it('finds a recap by slug and by game', () => {
    for (const r of PUBLISHED_RECAPS) {
      expect(recapBySlug(r.slug)).toBe(r);
      expect(recapOfGame(r.game!)).toBe(r);
    }
    expect(recapBySlug('game-99')).toBeUndefined();
    expect(recapOfGame(14)).toBe(PUBLISHED_RECAPS.find((r) => r.game === 14));
  });
});

describe('the engine facts as printed', () => {
  it('evaluations from White\'s side, a mate says who mates', () => {
    expect(formatEval({ eval: 0.35, line: [] })).toBe('+0.35');
    expect(formatEval({ eval: -6.06, line: [] })).toBe('−6.06');
    expect(formatEval({ eval: 0, line: [] })).toBe('0.00');
    expect(formatEval({ eval: 100, mate: 3, line: [] })).toBe('White mates in 3');
    expect(formatEval({ eval: -100, mate: -2, line: [] })).toBe('Black mates in 2');
  });

  it('lines carry their move numbers, from either side', () => {
    expect(formatLine(['Rxf2', 'Kxf2', 'Bd5'], 55, 'black')).toBe('55...Rxf2 56.Kxf2 Bd5');
    expect(formatLine(['Ra4', 'Rb5', 'Bg2'], 55, 'white')).toBe('55.Ra4 Rb5 56.Bg2');
    expect(formatLine(['a', 'b', 'c', 'd'], 1, 'white', 2)).toBe('1.a b');
  });
});
