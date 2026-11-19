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
  it('knows the legal pages and the two flagships, and nothing else yet', () => {
    expect(prerenderRouteFor('/terms')?.path).toBe('/terms');
    expect(prerenderRouteFor('/privacy')?.path).toBe('/privacy');
    expect(prerenderRouteFor('/refund-policy')?.path).toBe('/refund-policy');
    expect(prerenderRouteFor('/openings')?.path).toBe('/openings');
    expect(prerenderRouteFor('/puzzles')?.path).toBe('/puzzles');
    expect(prerenderRouteFor('/terms/extra')).toBeUndefined();
    expect(prerenderRouteFor('/puzzles/plan')).toBeUndefined();
    expect(prerenderRouteFor('/explain')).toBeUndefined();
  });

  it('an unknown path resolves false, so main.tsx builds it from scratch', async () => {
    expect(await resolvePrerendered('/not-a-prerendered-page')).toBe(false);
  });
});

describe("each route's source (B4: the build links that module's stylesheets into the built page)", () => {
  const file = readFileSync('src/app/prerenderRoutes.tsx', 'utf8');
  for (const r of PRERENDER_ROUTES) {
    it(`${r.path}: ${r.source} exists and is the module its loader imports`, () => {
      expect(existsSync(r.source)).toBe(true);
      const name = Object.entries(registry).find(([, v]) => v === r.Component)?.[0];
      expect(name, 'the component is exported from the registry').toBeTruthy();
      const decl = file.match(new RegExp(`export const ${name} = prerenderable\\([^;]*?import\\('@/([^']+)'\\)`));
      expect(decl ? `src/${decl[1]}.tsx` : null).toBe(r.source);
    });
  }
});

