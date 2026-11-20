import { useSyncExternalStore } from 'react';

const noSubscription = () => () => {};

/**
 * False while the build renders a page and while React takes a built page over; true at once otherwise, and right after
 * hydration (React re-renders with the client snapshot).
 *
 * For what should not be in a built page's HTML (prerender plan F1, 2026-11-20): the homepage's lower sections hold 21
 * decorative pictures, and in the built HTML a slow phone fetched them all at once beside the hero photo (Chrome loads a
 * lazy image within a few screens of the viewport at once), so the hero painted 1.4 s later. They come after hydration,
 * as they did when JavaScript drew the sections.
 */
export function useAfterHydration(): boolean {
  return useSyncExternalStore(noSubscription, () => true, () => false);
}
