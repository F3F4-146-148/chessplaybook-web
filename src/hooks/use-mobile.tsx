import * as React from "react";

const MOBILE_BREAKPOINT = 768;

/**
 * True below `breakpoint` CSS pixels (default 768). A component whose CSS stacks at
 * another width passes that width, so its JS branch and its CSS agree (D32).
 *
 * A page built at deploy time (prerender plan E0, 2026-11-20) was rendered with no window, as wide. React takes it over
 * only if the browser's first render is the same, so while it takes over a built page this reads the build's answer
 * (false), then the window's, at once (`useSyncExternalStore`'s server snapshot). Any other first render reads the
 * window directly, as before, with no false-then-true flash.
 */
export function useIsMobile(breakpoint: number = MOBILE_BREAKPOINT) {
  const subscribe = React.useCallback((onChange: () => void) => {
    const mql = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [breakpoint]);
  return React.useSyncExternalStore(
    subscribe,
    () => window.innerWidth < breakpoint,
    () => false,
  );
}
