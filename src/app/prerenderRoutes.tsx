import { lazyRetry, prerenderable, type PrerenderableComponent } from './prerenderable';
import { matchPath } from 'react-router-dom';
import IndexPage, { HomeSections } from '@/pages/Index';

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

export { lazyRetry, prerenderable, type PrerenderableComponent } from './prerenderable';

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
// Phase E, the articles, hubs and fixed-text pages (2026-11-20): their written content. `/live-events` stays off (it
// redirects from today's date).
export const News = prerenderable(() => lazyRetry(() => import('@/pages/News')));
export const CandidatesArticle2026 = prerenderable(() => lazyRetry(() => import('@/pages/CandidatesArticle2026')));
export const CandidatesArticleWomen2026 = prerenderable(() => lazyRetry(() => import('@/pages/CandidatesArticleWomen2026')));
export const CandidatesRound1Recap2026 = prerenderable(() => lazyRetry(() => import('@/pages/CandidatesRound1Recap2026')));
export const CandidatesRound3Recap2026 = prerenderable(() => lazyRetry(() => import('@/pages/CandidatesRound3Recap2026')));
export const CandidatesConclusion2026 = prerenderable(() => lazyRetry(() => import('@/pages/CandidatesConclusion2026')));
export const SindarovGukeshHeadToHead = prerenderable(() => lazyRetry(() => import('@/pages/SindarovGukeshHeadToHead')));
export const VaishaliJuWenjunTitleMatch = prerenderable(() => lazyRetry(() => import('@/pages/VaishaliJuWenjunTitleMatch')));
export const WorldChampionship2026Announced = prerenderable(() => lazyRetry(() => import('@/pages/WorldChampionship2026Announced')));
export const Candidates2026Hub = prerenderable(() => lazyRetry(() => import('@/pages/Candidates2026Hub')));
export const WorldCup2025Hub = prerenderable(() => lazyRetry(() => import('@/pages/WorldCup2025Hub')));
export const WorldChampionship2026Hub = prerenderable(() => lazyRetry(() => import('@/pages/WorldChampionship2026Hub')));
/* The match's game recaps (2026-11-23): written content, one page per game; the slug picks the recap. */
export const WorldChampionship2026Recap = prerenderable(() => lazyRetry(() => import('@/pages/WorldChampionship2026Recap')));
export const WorldChampionshipCycle = prerenderable(() => lazyRetry(() => import('@/pages/WorldChampionshipCycle')));
export const Contact = prerenderable(() => lazyRetry(() => import('@/pages/Contact')));
export const Credits = prerenderable(() => lazyRetry(() => import('@/pages/Credits')));
// Phase F (2026-11-20): the homepage stays in the main bundle (it always was: the front door paints without waiting for a
// chunk), so its loader hands over the module already loaded; Premium and Explain are on demand as before.
export const Home = prerenderable(() => HomeSections.preload().then(() => ({ default: IndexPage })));
export const Premium = prerenderable(() => lazyRetry(() => import('@/pages/Premium')));
export const Explain = prerenderable(() => lazyRetry(() => import('@/pages/Explain')));

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
  { path: '/news', Component: News, source: 'src/pages/News.tsx' },
  { path: '/news/candidates-2026', Component: CandidatesArticle2026, source: 'src/pages/CandidatesArticle2026.tsx' },
  { path: '/news/candidates-2026-women', Component: CandidatesArticleWomen2026, source: 'src/pages/CandidatesArticleWomen2026.tsx' },
  { path: '/news/candidates-2026-round-1', Component: CandidatesRound1Recap2026, source: 'src/pages/CandidatesRound1Recap2026.tsx' },
  { path: '/news/candidates-2026-round-3', Component: CandidatesRound3Recap2026, source: 'src/pages/CandidatesRound3Recap2026.tsx' },
  { path: '/news/candidates-2026-conclusion', Component: CandidatesConclusion2026, source: 'src/pages/CandidatesConclusion2026.tsx' },
  { path: '/news/sindarov-gukesh-head-to-head', Component: SindarovGukeshHeadToHead, source: 'src/pages/SindarovGukeshHeadToHead.tsx' },
  { path: '/news/vaishali-ju-wenjun-title-match', Component: VaishaliJuWenjunTitleMatch, source: 'src/pages/VaishaliJuWenjunTitleMatch.tsx' },
  { path: '/news/world-championship-2026-geneva', Component: WorldChampionship2026Announced, source: 'src/pages/WorldChampionship2026Announced.tsx' },
  { path: '/news/world-championship-2026/:slug', Component: WorldChampionship2026Recap, source: 'src/pages/WorldChampionship2026Recap.tsx' },
  { path: '/candidates-2026', Component: Candidates2026Hub, source: 'src/pages/Candidates2026Hub.tsx' },
  { path: '/world-cup-2025', Component: WorldCup2025Hub, source: 'src/pages/WorldCup2025Hub.tsx' },
  { path: '/world-championship-2026', Component: WorldChampionship2026Hub, source: 'src/pages/WorldChampionship2026Hub.tsx' },
  { path: '/world-championship-cycle', Component: WorldChampionshipCycle, source: 'src/pages/WorldChampionshipCycle.tsx' },
  { path: '/contact', Component: Contact, source: 'src/pages/Contact.tsx' },
  { path: '/credits', Component: Credits, source: 'src/pages/Credits.tsx' },
  { path: '/', Component: Home, source: 'src/pages/Index.tsx' },
  { path: '/premium', Component: Premium, source: 'src/pages/Premium.tsx' },
  { path: '/explain', Component: Explain, source: 'src/pages/Explain.tsx' },
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
