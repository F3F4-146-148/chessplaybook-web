import { createElement, lazy, useState, type ComponentType } from 'react';
import { matchPath } from 'react-router-dom';

/**
 * THE PRERENDERED ROUTES (prerender plan A5, 2026-11-19).
 *
 * A page whose HTML is built at deploy time must render, in the browser's first render, exactly what was built, or
 * React throws the built HTML away. An on-demand page (`React.lazy`) suspends on its first render until its chunk has
 * loaded, and awaiting the chunk elsewhere does not change that: `lazy` only learns its module from its own call. So a
 * prerendered page is defined here, once, with its loader, and:
 *   - the browser awaits `resolvePrerendered(pathname)` before `hydrateRoot` (main.tsx), and the page then renders its
 *     component directly, with no Suspense, on the first render;
 *   - the build (src/entry-prerender.tsx) does the same before rendering;
 *   - everywhere else (a visit to another page first, then a navigation here) it is the same `lazy` as before.
 * A failed load makes main.tsx build the page from scratch, as today.
 */

/**
 * Retry a dynamic import up to `retries` times with exponential backoff.
 * Handles flaky mobile networks where chunk downloads intermittently fail.
 */
export function lazyRetry<T extends { default: React.ComponentType<unknown> }>(
  factory: () => Promise<T>,
  retries = 2,
): Promise<T> {
  return factory().catch((err: unknown) => {
    if (retries <= 0) throw err;
    return new Promise<T>((resolve) =>
      setTimeout(() => resolve(lazyRetry(factory, retries - 1)), 1000),
    );
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyComponent = ComponentType<any>;

export interface PrerenderableComponent {
  (props: Record<string, unknown>): ReturnType<typeof createElement>;
  /** Loads the page's code; after it, the component renders directly (no Suspense). */
  preload: () => Promise<void>;
}

/**
 * A route component that renders its page directly once its code is loaded, and as a `lazy` otherwise. Which of the
 * two is fixed when an instance mounts (`useState`): switching an already-mounted page from the `lazy` to the direct
 * component would make React remount it and lose its state.
 */
export function prerenderable(load: () => Promise<{ default: AnyComponent }>): PrerenderableComponent {
  let resolved: AnyComponent | null = null;
  const loadOnce = () => load().then((m) => { resolved = m.default; return m; });
  const Lazy = lazy(loadOnce);
  function PrerenderableRoute(props: Record<string, unknown>) {
    const [Component] = useState<AnyComponent>(() => resolved ?? Lazy);
    return createElement(Component, props);
  }
  PrerenderableRoute.preload = async () => { if (!resolved) await loadOnce(); };
  return PrerenderableRoute;
}

export interface PrerenderRoute {
  /** The route's path, as in routes.tsx. */
  path: string;
  Component: PrerenderableComponent;
  /**
   * The page's own part of the hydrate check (A10): false when something only this visitor has (a remembered state)
   * would make its first render differ from the built page.
   */
  hydrateCheck?: () => boolean;
  /**
   * The page's module, as its loader imports it (B4, 2026-11-19). The build links that module's stylesheets into the
   * built page: a page's own CSS (the Workspace's, for one) otherwise arrives only with its JavaScript, so the built body
   * painted without it and moved by 0.92 when it came. A test checks it against the loader.
   */
  source: string;
}

export const Terms = prerenderable(() => lazyRetry(() => import('@/pages/Terms')));
export const Privacy = prerenderable(() => lazyRetry(() => import('@/pages/Privacy')));
export const RefundPolicy = prerenderable(() => lazyRetry(() => import('@/pages/RefundPolicy')));
// Phase B, the flagships (2026-11-19): a first visit with a plain address is built; what each one remembers is in
// hydrateCheck.js. Their trainers' data stays the API's.
export const OpeningTrainer = prerenderable(() => lazyRetry(() => import('@/features/openings/pages/OpeningTrainer')));
export const PuzzleTrainer = prerenderable(() => lazyRetry(() => import('@/features/puzzles/components/TrainerLayoutSkeleton')));
// Phase D, the champion pages (2026-11-19): their written content, and the roster bundled. The games come from the API
// after load, into a table-sized frame; a query string (?eco=, filters) is built from scratch by the head check.
export const ChampionsGallery = prerenderable(() => lazyRetry(() => import('@/pages/Champions')));
export const ChampionsList = prerenderable(() => lazyRetry(() => import('@/pages/ChampionsList')));
export const ChampionGames = prerenderable(() => lazyRetry(() => import('@/pages/GameList')));
export const ChampionBestGames = prerenderable(() => lazyRetry(() => import('@/pages/BestGames')));

/** Every route that may be built at deploy time. The build's allowlist (scripts/prerender-allowlist.json) picks among them. */
export const PRERENDER_ROUTES: readonly PrerenderRoute[] = [
  { path: '/terms', Component: Terms, source: 'src/pages/Terms.tsx' },
  { path: '/privacy', Component: Privacy, source: 'src/pages/Privacy.tsx' },
  { path: '/refund-policy', Component: RefundPolicy, source: 'src/pages/RefundPolicy.tsx' },
  { path: '/openings', Component: OpeningTrainer, source: 'src/features/openings/pages/OpeningTrainer.tsx' },
  { path: '/puzzles', Component: PuzzleTrainer, source: 'src/features/puzzles/components/TrainerLayoutSkeleton.tsx' },
  { path: '/champions', Component: ChampionsGallery, source: 'src/pages/Champions.tsx' },
  { path: '/champions/list', Component: ChampionsList, source: 'src/pages/ChampionsList.tsx' },
  { path: '/champions/:name/games', Component: ChampionGames, source: 'src/pages/GameList.tsx' },
  { path: '/champions/:name/best-games', Component: ChampionBestGames, source: 'src/pages/BestGames.tsx' },
];

/** The registry entry for a pathname, if any. */
export function prerenderRouteFor(pathname: string): PrerenderRoute | undefined {
  return PRERENDER_ROUTES.find((r) => matchPath({ path: r.path, end: true }, pathname));
}

/*
  THE SHELL'S OWN ON-DEMAND PARTS (A16, 2026-11-19): the nav's account slot is a `lazy` inside its own Suspense
  boundary on every page. Not loaded before hydration, React left that boundary for later, and an update in the meantime
  (the nav's live link, set in an effect) reached it: React error 421, the part drawn again (seen on staging, 1 load in
  3; locally the chunk came too fast to show it). A shell part made with `prerenderable` registers its preload here, and
  every hydration awaits them with the page's code.
*/
const shellPreloads: Array<() => Promise<void>> = [];
export function preloadWithEveryBuiltPage(component: PrerenderableComponent): PrerenderableComponent {
  shellPreloads.push(component.preload);
  return component;
}

/** Loads the page's code and the shell's; false when the pathname is not a prerendered route or the code would not load. */
export async function resolvePrerendered(pathname: string): Promise<boolean> {
  const route = prerenderRouteFor(pathname);
  if (!route) return false;
  try {
    await Promise.all([route.Component.preload(), ...shellPreloads.map((p) => p())]);
    return true;
  } catch {
    return false;
  }
}
