/**
 * THE BUILD-TIME RENDER OF A PAGE (prerender plan A6-A7, 2026-11-19). Never runs in a browser.
 *
 * Built by `vite build --ssr src/entry-prerender.tsx --outDir dist-ssr` and called by scripts/generate-route-html.cjs
 * for each allowlisted route: `render(url)` returns the HTML of the page's `#root`, rendered from the same tree the
 * browser renders (AppTree, A3) inside a static router at that URL, with its own QueryClient and a Helmet context that
 * is discarded (the head is the generator's), after the page's code is resolved (A5) so nothing suspends.
 *
 * What may go into that HTML is the owner's rule 2 (docs/Features Development/SEO_PRERENDER_ANALYSIS.md): the site's
 * own written content, never what our engines generate. The network is closed before any app module loads (the first
 * import below, A7), and a render that tried to reach it fails, even when the page caught the error.
 */
import { takeNetworkViolations } from '@/prerender/networkGuard';
import type { ReactElement } from 'react';
import { renderToPipeableStream } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { Writable } from 'node:stream';
import { QueryClient } from '@tanstack/react-query';
import { AppTree } from '@/app/AppTree';
import { prerenderRouteFor } from '@/app/prerenderRoutes';
import { fixRenderClock } from '@/app/buildClock';

/*
  React warns once per component that uses `useLayoutEffect` (the nav, the shell, the Workspace): such effects never run
  in a build render and run as usual after hydration, so the warning says nothing here. Exactly that warning is dropped;
  every other warning and error still prints.
*/
const consoleError = console.error;
console.error = (...args: unknown[]) => {
  if (typeof args[0] === 'string' && args[0].startsWith('Warning: useLayoutEffect does nothing on the server')) return;
  consoleError(...args);
};

/** A render that has not finished by then is a failure (a page waiting on something that will never come). */
const RENDER_TIMEOUT_MS = 20_000;

/** Renders an element to HTML with every check of a build render: boundary errors, the timeout, the closed network. */
export async function renderElement(element: ReactElement, label: string): Promise<string> {
  takeNetworkViolations(); // a clean slate for this render
  const html = await new Promise<string>((resolve, reject) => {
    let out = '';
    const errors: unknown[] = [];
    const sink = new Writable({
      write(chunk, _enc, done) { out += chunk.toString(); done(); },
    });
    sink.on('finish', () => {
      clearTimeout(timer);
      if (errors.length) reject(new Error(`prerender: ${label} rendered with errors: ${errors.map(String).join(' | ')}`));
      else resolve(out);
    });
    const stream = renderToPipeableStream(element, {
      onAllReady() { stream.pipe(sink); },
      onShellError(error) { clearTimeout(timer); reject(error); },
      // A boundary that errors renders its fallback silently in a stream; here it fails the page.
      onError(error) { errors.push(error); },
    });
    const timer = setTimeout(() => {
      stream.abort();
      reject(new Error(`prerender: ${label} did not finish within ${RENDER_TIMEOUT_MS / 1000} s`));
    }, RENDER_TIMEOUT_MS);
  });
  // a rejection from a promise the render started surfaces after the current task
  await new Promise((r) => setImmediate(r));
  const { attempts, unhandled } = takeNetworkViolations();
  if (attempts.length) throw new Error(`prerender: ${label} tried the network (rule 2): ${attempts.join(', ')}`);
  if (unhandled.length) throw new Error(`prerender: ${label} left a rejected promise unhandled: ${unhandled.join(' | ')}`);
  return html;
}

export async function render(url: string, builtAt: string = new Date().toISOString()): Promise<string> {
  const pathname = new URL(url, 'https://build.invalid').pathname;
  const route = prerenderRouteFor(pathname);
  if (!route) throw new Error(`prerender: ${pathname} is not a prerendered route (src/app/prerenderRoutes.tsx)`);
  await route.Component.preload();
  // E1: what the page works out from today's date is worked out from the build's time, the `data-built-at` the browser
  // reads while it takes the page over.
  fixRenderClock(builtAt);
  try {
    return await renderBuilt(url, pathname);
  } finally {
    fixRenderClock(null);
  }
}

function renderBuilt(url: string, pathname: string): Promise<string> {
  return renderElement(
    <AppTree
      router={(content) => <StaticRouter location={url}>{content}</StaticRouter>}
      queryClient={new QueryClient()}
      helmetContext={{}}
      initialPath={pathname}
    />,
    pathname,
  );
}

/** The source module of a built page (the registry's `source`), so the generator can link its stylesheets (B4). */
export function pageSource(pathname: string): string {
  const route = prerenderRouteFor(pathname);
  if (!route) throw new Error(`prerender: ${pathname} is not a prerendered route (src/app/prerenderRoutes.tsx)`);
  return route.source;
}
