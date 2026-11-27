import { useEffect, useRef } from "react";
import { BrowserRouter } from "react-router-dom";
import { AppTree } from "@/app/AppTree";

// ---------------------------------------------------------------------------
// Analytics: deferred loading
// ---------------------------------------------------------------------------
// Page views have exactly two sources, and neither is manual:
//   - the entry page_view comes from gtag's own `config` (send_page_view, left
//     at its default true);
//   - SPA navigations come from GA4 Enhanced Measurement ("page changes based
//     on browser history events").
//
// Enhanced Measurement does NOT cover the initial load. Suppressing the config
// page_view therefore made every non-navigating visitor invisible — see the
// note in services/analytics.ts. Do not add a manual page_view call: that is
// what caused the duplicates this comment used to warn about.

const App = () => {
  const initRef = useRef(false);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    // Prerender plan A2/A10: the first render, or the hydration of a built page, ends here (main.tsx marks its start).
    performance.mark('app-first-effect');
    const hydrated = performance.getEntriesByName('hydrate-start', 'mark').length > 0;
    try {
      performance.measure(hydrated ? 'hydrate' : 'app-first-render', hydrated ? 'hydrate-start' : 'app-render-start', 'app-first-effect');
    } catch { /* no start mark */ }

    const load = () => {
      import('./services/analytics').then(m => {
        m.initializeAnalytics();
        // Prerender plan A14: how a page built at deploy time was rendered (main.tsx), and React's recovered mismatches.
        const w = window as unknown as { __prerender?: { route: string; mode: 'hydrate' | 'create' }; __prerenderRecoverable?: number };
        if (w.__prerender) {
          m.logGA4Event({ name: 'prerender_load', params: { ...w.__prerender, recoverable_errors: w.__prerenderRecoverable ?? 0 } });
        }
      });
      // Meta Pixel — loads in parallel with GA, no-ops in dev.
      // See docs/Master Plan - Active/M1/META_PIXEL_INSTALL_PLAN.md.
      // CONSENT (#564): only once advertising is allowed. GA4 above loads for everyone (Consent
      // Mode v2 Advanced; the defaults are in index.html); the Pixel has no such mode, so a UK or
      // EEA visitor's Pixel waits for their answer, and follows it if they change it later.
      void Promise.all([import('./services/metaPixel'), import('./services/consent')]).then(([pixel, consent]) => {
        const follow = () => {
          if (consent.advertisingAllowed()) pixel.initMetaPixel();
          else pixel.revokeMetaPixel();
        };
        void consent.startConsent().then(follow);
        consent.subscribeConsent(follow);
      });
    };

    if ('requestIdleCallback' in window) {
      requestIdleCallback(load, { timeout: 5000 });
    } else {
      setTimeout(load, 3000);
    }
  }, []);

  return <AppTree router={(content) => <BrowserRouter>{content}</BrowserRouter>} />;
};

export default App;
