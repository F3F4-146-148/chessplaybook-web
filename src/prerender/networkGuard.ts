/**
 * THE NETWORK IS CLOSED DURING A BUILD RENDER (prerender plan A7, 2026-11-19; the owner's rule 2).
 *
 * What our engines generate, and every other answer of our API, must never enter a built page. A render that reaches
 * for the network would bake whatever it got into the HTML, so here every way out is replaced, BEFORE any app module
 * is imported (src/entry-prerender.tsx imports this module first): `fetch`, `XMLHttpRequest`, `WebSocket` and
 * `EventSource` record the attempt and throw. Throwing alone is not enough, because the app catches its own fetch errors
 * (a failed request shows an error state); so the render also fails afterwards when any attempt was recorded, caught
 * or not, and when a promise was rejected without a handler during it.
 *
 * Imported for its effect. Never part of the browser's bundle.
 */
const attempts: string[] = [];
const unhandled: unknown[] = [];

function blocked(kind: string, target: unknown): never {
  const where = typeof target === 'string' ? target : target instanceof URL ? target.href : String((target as { url?: string })?.url ?? target);
  attempts.push(`${kind} ${where}`);
  throw new Error(`prerender: the network is closed during a build render (${kind} ${where})`);
}

const g = globalThis as Record<string, unknown>;
g.fetch = (input: unknown) => blocked('fetch', input);
for (const name of ['XMLHttpRequest', 'WebSocket', 'EventSource']) {
  g[name] = class {
    constructor(url?: unknown) { blocked(name, url ?? '(no url)'); }
  };
}

process.on('unhandledRejection', (reason) => { unhandled.push(reason); });

/** The attempts and unhandled rejections since the last call, cleared. A render fails if either is not empty. */
export function takeNetworkViolations(): { attempts: string[]; unhandled: string[] } {
  const out = { attempts: attempts.splice(0), unhandled: unhandled.splice(0).map(String) };
  return out;
}
