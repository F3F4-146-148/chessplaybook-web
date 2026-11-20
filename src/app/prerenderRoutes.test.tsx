import { describe, expect, it } from 'vitest';
import { Suspense, useState } from 'react';
import { renderToString } from 'react-dom/server';
import { act, render, screen } from '@testing-library/react';
import { existsSync, readFileSync } from 'node:fs';
import * as registry from './prerenderRoutes';
import { PRERENDER_ROUTES, prerenderable, prerenderRouteFor, resolvePrerendered } from './prerenderRoutes';

/** A page module whose load the test controls. */
function controlledPage() {
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  function Page() {
    const [n, setN] = useState(0);
    return <button onClick={() => setN(n + 1)}>{`clicked ${n}`}</button>;
  }
  const load = () => gate.then(() => ({ default: Page }));
  return { load, release };
}

describe('prerenderable (prerender plan A5)', () => {
  it('after preload, renders directly: no Suspense needed, as hydration requires', async () => {
    const { load, release } = controlledPage();
    const Route = prerenderable(load);
    release();
    await Route.preload();
    // renderToString throws on a suspending component without a boundary: rendering fine proves no suspension
    expect(renderToString(<Route />)).toContain('clicked 0');
  });

  it('before its code has loaded, it suspends as a lazy page always did', () => {
    const { load } = controlledPage();
    const Route = prerenderable(load);
    expect(renderToString(<Suspense fallback={<p>loading</p>}><Route /></Suspense>)).toContain('loading');
  });

  it('a page mounted as lazy keeps its state when its code arrives (no remount)', async () => {
    const { load, release } = controlledPage();
    const Route = prerenderable(load);
    const { rerender } = render(<Suspense fallback={<p>loading</p>}><Route /></Suspense>);
    await act(async () => { release(); await Route.preload(); });
    const button = await screen.findByText('clicked 0');
    await act(async () => { button.click(); });
    expect(screen.getByText('clicked 1')).toBeTruthy();
    rerender(<Suspense fallback={<p>loading</p>}><Route /></Suspense>);
    expect(screen.getByText('clicked 1')).toBeTruthy();
  });
});

describe('the registry', () => {
  it('knows the legal pages, the two flagships, the champion pages, the articles, hubs and fixed-text pages, nothing else yet', () => {
    for (const p of ['/news', '/candidates-2026', '/world-cup-2025', '/world-championship-2026', '/world-championship-cycle',
      '/contact', '/credits', '/news/candidates-2026-round-1']) {
      expect(prerenderRouteFor(p)?.path).toBe(p);
    }
    // /live-events redirects from today's date; the game days and match games are the API's
    expect(prerenderRouteFor('/live-events')).toBeUndefined();
    expect(prerenderRouteFor('/candidates-2026/round-1')).toBeUndefined();
    expect(prerenderRouteFor('/world-championship-2026/game-1')).toBeUndefined();
    expect(prerenderRouteFor('/terms')?.path).toBe('/terms');
    expect(prerenderRouteFor('/privacy')?.path).toBe('/privacy');
    expect(prerenderRouteFor('/refund-policy')?.path).toBe('/refund-policy');
    expect(prerenderRouteFor('/openings')?.path).toBe('/openings');
    expect(prerenderRouteFor('/puzzles')?.path).toBe('/puzzles');
    expect(prerenderRouteFor('/champions')?.path).toBe('/champions');
    expect(prerenderRouteFor('/champions/list')?.path).toBe('/champions/list');
    expect(prerenderRouteFor('/champions/tal/games')?.path).toBe('/champions/:name/games');
    expect(prerenderRouteFor('/champions/tal/best-games')?.path).toBe('/champions/:name/best-games');
    expect(prerenderRouteFor('/terms/extra')).toBeUndefined();
    expect(prerenderRouteFor('/puzzles/plan')).toBeUndefined();
    // Phase F: the homepage, Premium and Explain
    for (const p of ['/', '/premium', '/explain']) expect(prerenderRouteFor(p)?.path).toBe(p);
    // a game itself is not built: its moves and analysis are the API's
    expect(prerenderRouteFor('/champions/tal/games/12')).toBeUndefined();
    expect(prerenderRouteFor('/champions/tal/best-games/3')).toBeUndefined();
  });

  it('an unknown path resolves false, so main.tsx builds it from scratch', async () => {
    expect(await resolvePrerendered('/not-a-prerendered-page')).toBe(false);
  });
});

/*
  EVERY ARTICLE IS BUILT, NOW AND LATER (E2b, owner 2026-11-19). The allowlist builds every news/ page of route-meta.json
  without naming it, so an article only has to be in the registry, and its route must render the registry's component:
  a plain `lazy` would suspend while the built page is taken over.
*/
describe('every article (E2b)', () => {
  const meta = JSON.parse(readFileSync('src/config/route-meta.json', 'utf8')) as Record<string, unknown>;
  const routesFile = readFileSync('src/app/routes.tsx', 'utf8');
  const articles = Object.keys(meta).filter((k) => k.startsWith('news/'));

  it('route-meta.json has the articles', () => {
    expect(articles.length).toBeGreaterThanOrEqual(8);
  });

  for (const key of articles) {
    it(`/${key} is in the registry (add it to src/app/prerenderRoutes.tsx) and its route renders the registry's page`, () => {
      const route = prerenderRouteFor(`/${key}`);
      expect(route?.path, `/${key} needs an entry in PRERENDER_ROUTES`).toBe(`/${key}`);
      const name = Object.entries(registry).find(([, v]) => v === route?.Component)?.[0];
      const element = routesFile.match(new RegExp(`<Route path="/${key}" element={<(\\w+) />}`))?.[1];
      expect(element, `routes.tsx renders /${key}`).toBe(name);
      expect(routesFile, `${name} comes from prerenderRoutes in routes.tsx, not a lazy of its own`)
        .not.toMatch(new RegExp(`const ${name} = lazy\\(`));
    });
  }
});

describe("each route's source (B4: the build links that module's stylesheets into the built page)", () => {
  const file = readFileSync('src/app/prerenderRoutes.tsx', 'utf8');
  for (const r of PRERENDER_ROUTES) {
    it(`${r.path}: ${r.source} exists and is the module its loader imports`, () => {
      expect(existsSync(r.source)).toBe(true);
      const name = Object.entries(registry).find(([, v]) => v === r.Component)?.[0];
      expect(name, 'the component is exported from the registry').toBeTruthy();
      // A page loaded on demand names its module in its loader; a page already in the bundle (the homepage) is handed
      // over by name, and that name's import names the module.
      const decl = file.match(new RegExp(`export const ${name} = prerenderable\\([^;]*?import\\('@/([^']+)'\\)`));
      const handed = file.match(new RegExp(`export const ${name} = prerenderable\\([^;]*?\\{ default: (\\w+) \\}`));
      const handedFrom = handed && file.match(new RegExp(`^import ${handed[1]}\\b[^;]* from '@/([^']+)';`, 'm'));
      const module = decl?.[1] ?? handedFrom?.[1];
      expect(module ? `src/${module}.tsx` : null).toBe(r.source);
    });
  }
});

