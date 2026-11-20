import { createElement, lazy, useState, type ComponentType } from 'react';

/*
  The helpers of the prerendered routes (prerender plan A5), in their own module since Phase F (2026-11-20): a page
  that is itself in the registry (the homepage) uses `prerenderable` for a part of it, and importing it from the registry
  would be a circular import.
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
