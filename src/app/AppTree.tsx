import { useEffect, useRef, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import type { QueryClient } from "@tanstack/react-query";
import { Providers } from "@/app/providers";
import { AppRoutes } from "@/app/routes";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { trackPageView as trackMetaPixelPageView } from "@/services/metaPixel";
import { usePresenceHeartbeat } from "@/hooks/usePresenceHeartbeat";
import { captureFirstTouch, flushFunnelMemory, hasInteracted, onFirstInteraction, recordVisit } from "@/services/funnel";
import { startConsent, subscribeConsent } from "@/services/consent";
import { isPrerendering, onPrerenderActivated } from "@/services/prerender";
import { ThemeRouteSync } from '@/design/theme/ThemeProvider';

/**
 * THE APP BELOW ITS ROUTER (prerender plan A3, 2026-11-19). The browser renders it inside `BrowserRouter` (App.tsx);
 * the build renders the same tree inside a static router at a page's URL (src/entry-prerender.tsx), with its own
 * QueryClient and a Helmet context it discards. One tree, so the built HTML and the browser's first render come from the
 * same components.
 */
export function AppTree({ router, queryClient, helmetContext, initialPath }: {
  /** Wraps the routed content in a router: `BrowserRouter` in the browser, a static router at build. */
  router: (content: ReactNode) => ReactNode;
  queryClient?: QueryClient;
  helmetContext?: object;
  /** The page's path at build (the theme's page rules); the browser reads its own. */
  initialPath?: string;
}) {
  return (
    <ErrorBoundary>
      <Providers queryClient={queryClient} helmetContext={helmetContext} initialPath={initialPath}>
        {router(
          <>
            <PresenceHeartbeat />
            <FunnelVisit />
            <MetaPixelRouteListener />
            {/* The theme follows the page too: the v2 homepage is always dark (redesign plan C3). */}
            <ThemeRouteSync />
            <AppRoutes />
          </>,
        )}
      </Providers>
    </ErrorBoundary>
  );
}

function PresenceHeartbeat() {
  usePresenceHeartbeat();
  return null;
}

/**
 * The funnel's first touch and daily visit (#46). The first touch is read from the page
 * the browser loaded, so it runs once, before any navigation; a prerendered page waits
 * until someone actually sees it. A tab left open past midnight records the new day
 * when it is looked at again.
 */
function FunnelVisit() {
  useEffect(() => {
    // The visit itself waits for the page's first real input (see onFirstInteraction).
    let stopWaiting: (() => void) | undefined;
    const start = () => { captureFirstTouch(); stopWaiting = onFirstInteraction(() => void recordVisit()); };
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !isPrerendering() && hasInteracted()) void recordVisit();
    };
    document.addEventListener('visibilitychange', onVisible);
    let stop: (() => void) | undefined;
    if (isPrerendering()) stop = onPrerenderActivated(start);
    else start();
    // #564: the funnel keeps its keys in memory until Measurement is allowed, then writes them.
    void startConsent().then(flushFunnelMemory);
    const stopConsent = subscribeConsent(flushFunnelMemory);
    return () => { document.removeEventListener('visibilitychange', onVisible); stop?.(); stopWaiting?.(); stopConsent(); };
  }, []);
  return null;
}

/**
 * Fires Meta Pixel `PageView` on every SPA route change.
 *
 * Required because Meta Pixel doesn't auto-track client-side
 * navigation the way GA4's Enhanced Measurement does. Without this
 * listener, only the first page-load fires PageView and every
 * internal route change is missed — retargeting and conversion
 * attribution would be wildly broken.
 *
 * Component must live INSIDE <BrowserRouter> for useLocation to
 * have router context. Renders nothing — it's a listener-only.
 *
 * Skips the very first location change (the initial mount), since
 * `initMetaPixel()` already fires PageView at boot. Without this
 * skip, the first page-load would emit two PageView events: one
 * from init, one from the listener's first effect run.
 */
function MetaPixelRouteListener() {
  const location = useLocation();
  const firstRun = useRef(true);

  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    trackMetaPixelPageView();
  }, [location.pathname, location.search]);

  return null;
}
