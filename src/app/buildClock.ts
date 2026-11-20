/**
 * THE TIME A FIRST RENDER READS (prerender plan E1, 2026-11-20).
 *
 * A page that shows something worked out from today's date ("Game 3 starts Thursday", "being played now") was built at
 * deploy time with the build's clock. React takes a built page over only if the browser's first render is the same, so
 * while it does, that first render must read the build's time, not the visitor's; the page's own effect then moves it
 * to the real time, as it moves every minute.
 *
 * The clock is fixed in two places only: the build's render (entry-prerender.tsx, the generator's `builtAt`) and the
 * hydration of a built page (main.tsx, the page's `data-built-at`), released once the page's own Suspense boundary has
 * hydrated (PageRegion.tsx). Any other render, a navigation included, reads the real time.
 */
let fixed: string | null = null;
/** The build's time once known; unlike `fixed`, never released (the hydration snapshot below). */
let builtAt: string | null = null;

/** Fix the clock to an ISO time (the build's), or release it with null. */
export function fixRenderClock(iso: string | null): void {
  fixed = iso && !Number.isNaN(Date.parse(iso)) ? iso : null;
  if (fixed) builtAt = fixed;
}

/**
 * The build's time, for `useSyncExternalStore`'s server snapshot (F1, 2026-11-20). React hydrates each Suspense boundary
 * in its own later pass, so a part inside a nested boundary (the homepage's lower sections) renders after the page's
 * boundary released `renderNow()`; a server snapshot is read whenever React hydrates the part, so it reads this.
 */
export function buildTime(): Date {
  return builtAt ? new Date(builtAt) : new Date();
}

/** The time for a state initialiser: the build's while a built page is rendered or taken over, else now. */
export function renderNow(): Date {
  return fixed ? new Date(fixed) : new Date();
}
