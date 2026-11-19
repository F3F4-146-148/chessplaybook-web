/**
 * The app theme at runtime (plan §4 B3). Replaces `next-themes`, which was
 * installed and never mounted: Sonner called its `useTheme()` with no provider
 * and always got `system`.
 *
 * The pre-paint script has already put the right theme on `<html>` before
 * React runs, so the first render only confirms it. After that this owns it:
 *
 *   - follows the operating system ONLY while the preference is `system`,
 *     so a visitor who chose light or dark is never moved by an OS change;
 *   - follows other tabs through the `storage` event, so changing the theme in
 *     one tab changes it in all of them;
 *   - stores the choice with storage access wrapped, because a browser that
 *     blocks storage must still get a working page.
 *
 * Until F3 production ignores every stored preference and draws dark
 * (`THEME_CHOICE_LIVE`); the dev server honours it so B5 can be checked in
 * light.
 */
import { createContext, startTransition, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { DESIGN_V2_LIVE, HOME_V2_LIVE } from '../designFlags';
import {
  DEFAULT_PREFERENCE,
  THEME_CHOICE_LIVE,
  THEME_STORAGE_KEY,
  applyTheme,
  designV2ForPath,
  isAlwaysDarkPath,
  parsePreference,
  readStoredPreference,
  resolveThemeForPath,
  writeStoredPreference,
  type ResolvedTheme,
  type ThemePreference,
} from './theme';

interface ThemeContextValue {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  /** False until F3 in production: then `setPreference` does nothing. */
  choiceEnabled: boolean;
  setPreference: (preference: ThemePreference) => void;
  /** The page's theme is fixed, whatever the preference (the v2 homepage, always dark): the theme control hides. */
  themeFixed: boolean;
  /** Set by ThemeRouteSync, inside the router: the path the page shows. */
  setPath: (path: string) => void;
}

const SYSTEM_DARK = '(prefers-color-scheme: dark)';

function systemPrefersDark(): boolean {
  try {
    return window.matchMedia(SYSTEM_DARK).matches;
  } catch {
    return false;
  }
}

const ThemeContext = createContext<ThemeContextValue>({
  preference: 'dark',
  resolved: 'dark',
  choiceEnabled: false,
  setPreference: () => {},
  themeFixed: false,
  setPath: () => {},
});

/** `useLayoutEffect` in the browser, `useEffect` in the build's render (where neither runs, and the first warns). */
const useBrowserLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export function ThemeProvider({
  children,
  choiceEnabled = THEME_CHOICE_LIVE || import.meta.env.DEV,
  initialPath,
}: {
  children: ReactNode;
  /** Overridable for tests; the default is the rule above. */
  choiceEnabled?: boolean;
  /** Prerender plan A4: the page's path at build (the build has no address bar); the browser reads its own. */
  initialPath?: string;
}) {
  const [preference, setPreferenceState] = useState<ThemePreference>(() =>
    choiceEnabled ? readStoredPreference() ?? DEFAULT_PREFERENCE : 'dark',
  );
  const [systemDark, setSystemDark] = useState(systemPrefersDark);
  // The path, for the homepage rule (themeCore.ts `isAlwaysDarkPath`); ThemeRouteSync keeps it current on in-app
  // navigation. It starts from the address bar, as the pre-paint script does.
  const [path, setPath] = useState(() => initialPath ?? (typeof window === 'undefined' ? '' : window.location.pathname));
  /*
    PRERENDER PLAN A4 (2026-11-19): components render the DEFAULT theme first, the visitor's right after, so a page
    built at deploy time (no stored theme there) and the browser's first render agree, and React can take over the
    built page. The page's colours do not wait: `<html>` gets the visitor's theme from the pre-paint script and from
    applyTheme below, which read the real preference. What follows a visitor's choice in the DOM (the theme button's
    icon) changes once, before the browser paints on a page React renders itself.
  */
  const [mounted, setMounted] = useState(false);
  /*
    On a built page React is taking over (`#root[data-prerendered]`, kept by main.tsx only when it hydrates), the switch
    to the visitor's theme is a transition: React holds it until the page is taken over. Applied at once, it reached the
    parts not yet taken over and React drew them again (two recoverable errors for a light-theme visitor, A10). On a page
    React renders itself it stays a layout effect, before paint, so the button's icon never flickers there.
  */
  const [takingOver] = useState(() => typeof document !== 'undefined' && document.getElementById('root')?.hasAttribute('data-prerendered') === true);
  useBrowserLayoutEffect(() => { if (!takingOver) setMounted(true); }, []);
  useEffect(() => { if (takingOver) startTransition(() => setMounted(true)); }, []);

  const resolved = choiceEnabled ? resolveThemeForPath(path, preference, systemDark) : 'dark';
  const designV2 = designV2ForPath(path);
  const themeFixed = isAlwaysDarkPath(path);

  // Before paint, so a change never shows one frame of the old theme.
  useBrowserLayoutEffect(() => {
    applyTheme(document.documentElement, choiceEnabled ? preference : 'dark', resolved, designV2);
  }, [choiceEnabled, preference, resolved, designV2]);

  // The v2 homepage draws design v2 even while the design switch is off (C3), and only there: set and cleared
  // with the path. Untouched otherwise, so the DEV preview switch and the build's attribute stay in charge.
  useBrowserLayoutEffect(() => {
    if (!HOME_V2_LIVE || DESIGN_V2_LIVE) return;
    const root = document.documentElement;
    if (designV2) root.setAttribute('data-design', 'v2'); else root.removeAttribute('data-design');
  }, [designV2]);

  // The OS scheme matters only while the preference is `system`.
  useEffect(() => {
    if (!choiceEnabled || preference !== 'system') return;
    let mql: MediaQueryList;
    try {
      mql = window.matchMedia(SYSTEM_DARK);
    } catch {
      return;
    }
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    setSystemDark(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [choiceEnabled, preference]);

  // Another tab changed it.
  useEffect(() => {
    if (!choiceEnabled) return;
    const onStorage = (e: StorageEvent) => {
      if (e.key !== THEME_STORAGE_KEY) return;
      setPreferenceState(parsePreference(e.newValue) ?? DEFAULT_PREFERENCE);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [choiceEnabled]);

  const setPreference = useCallback(
    (next: ThemePreference) => {
      if (!choiceEnabled) return;
      writeStoredPreference(next);
      setPreferenceState(next);
    },
    [choiceEnabled],
  );

  // What components render: the default until mounted (A4), then the real values.
  const shownPreference: ThemePreference = !choiceEnabled ? 'dark' : mounted ? preference : DEFAULT_PREFERENCE;
  const shownResolved = !choiceEnabled ? 'dark' : mounted ? resolved : resolveThemeForPath(path, DEFAULT_PREFERENCE, false);
  const value = useMemo(
    () => ({ preference: shownPreference, resolved: shownResolved, choiceEnabled, setPreference, themeFixed, setPath }),
    [choiceEnabled, shownPreference, shownResolved, setPreference, themeFixed],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

/**
 * Tells ThemeProvider which page is showing (it sits outside the router). A layout effect, so on navigation
 * into or out of the homepage the theme changes in the same frame as the page. Renders nothing.
 */
export function ThemeRouteSync() {
  const { pathname } = useLocation();
  const { setPath } = useTheme();
  useBrowserLayoutEffect(() => { setPath(pathname); }, [pathname, setPath]);
  return null;
}
