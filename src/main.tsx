import { createRoot, hydrateRoot } from "react-dom/client";
import App from "./App.tsx";
import { PRERENDER_HYDRATE, shouldHydrate } from "@/app/hydrateCheck.js";
import { resolvePrerendered } from "@/app/prerenderRoutes";
import "./index.css";

// Visual redesign experiment (DEV only): `/dev/home-v2` can keep design v2 on for
// every page, so the Workspace pages can be judged in it too. Production never sets it.
if (import.meta.env.DEV) {
  try {
    if (localStorage.getItem('cpb.designPreview') === 'v2') document.documentElement.setAttribute('data-design', 'v2');
  } catch { /* storage blocked: preview stays off */ }
}

/*
  TAKE OVER A BUILT PAGE, OR BUILD IT FROM SCRATCH (prerender plan A10, 2026-11-19).

  A page built at deploy time (`#root[data-prerendered]`) is hydrated in place when this visitor's first render is the
  same as the build's (hydrateCheck.js, which the page's <head> has already run): its code is loaded first, so nothing
  suspends during hydration. Otherwise, and on every page without a built body, React renders from scratch exactly as
  before; the head script has already hidden a built body before the first paint, and the marker is removed so React's
  own content shows.

  Timing (A2): `app-render-start` or `hydrate-start` here, their end at the app's first effect (App.tsx).
*/
const container = document.getElementById("root")!;
const builtRoute = container.dataset.prerendered;

function safeStorage(): Storage | null {
  try { return window.localStorage; } catch { return null; }
}

/** For the telemetry (A14): which built page this was, and how it was rendered; App sends it once analytics loads. */
function notePrerender(mode: 'hydrate' | 'create') {
  if (builtRoute !== undefined) (window as unknown as { __prerender?: object }).__prerender = { route: builtRoute, mode };
}

function renderFromScratch() {
  notePrerender('create');
  if (builtRoute !== undefined) {
    // Empty first, then un-hide: React's first commit is not immediate, and un-hiding the built body before it lands
    // showed it for a moment and then took it away (seen on staging, A16). Empty, the page is as it always was.
    container.replaceChildren();
    container.removeAttribute('data-prerendered');
  }
  performance.mark('app-render-start');
  createRoot(container).render(<App />);
}

if (builtRoute !== undefined && PRERENDER_HYDRATE && shouldHydrate(location.search, builtRoute, safeStorage())) {
  void resolvePrerendered(location.pathname).then((ready) => {
    if (!ready) { renderFromScratch(); return; }
    notePrerender('hydrate');
    performance.mark('hydrate-start');
    hydrateRoot(container, <App />, {
      // A mismatch React recovered from by rendering part of the page again: counted for the telemetry (A14).
      onRecoverableError(error) {
        (window as unknown as { __prerenderRecoverable?: number }).__prerenderRecoverable =
          ((window as unknown as { __prerenderRecoverable?: number }).__prerenderRecoverable ?? 0) + 1;
        // In production too: React's code (418 a mismatch, 423 the page redrawn, 421 an update before hydration ended)
        // is what tells a built page's problem apart, and a warning costs nothing.
        console.warn('[prerender] recoverable hydration error', String((error as Error)?.message ?? error).slice(0, 200));
      },
    });
  });
} else {
  renderFromScratch();
}

// Register service worker for return-visitor caching (deferred, non-blocking)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Silent fail — SW is an enhancement, not a requirement
    });
  });
}
