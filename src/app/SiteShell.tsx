import { useContext, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import { ChromeContext, type Chrome } from './chromeContext';
import { Outlet, useLocation, useNavigationType } from 'react-router-dom';
import { DailyLimitDialog } from '@/features/premium/DailyLimitDialog';
import { ConsentBanner } from '@/components/ConsentBanner';
import { Navigation } from '@/components/Navigation';
import { useReminderClick } from '@/features/reminders/useReminderClick';

/**
 * WHAT THIS IS FOR.
 *
 * Until #55 there was no shell. Forty-three page components each wrote
 * `<Navigation />` into their own JSX, so navigating unmounted one page together
 * with its nav and mounted another page with its own. There was never a single
 * instance to be consistent, which is why the bar could differ by route at all -
 * different width on `/puzzles`, different type on `/analysis`, a visible
 * correction after paint - and why every fix had to be verified by measurement
 * rather than guaranteed by construction.
 *
 * This is a LAYOUT ROUTE: it is the parent of every page, it renders the chrome
 * once, and `<Outlet />` is where the page goes. React reconciles only the
 * outlet's subtree on navigation, so the nav element is never unmounted and
 * never re-created. "The menu row changes between pages" stops being something
 * to test and becomes something that cannot happen.
 *
 * It also owns the page FRAME - the `min-h-screen` flex column the 42 pages each
 * declared for themselves. The frame belongs to whoever owns the chrome inside
 * it; a page that declared its own was really declaring the shell's.
 */


/**
 * Hide or show the site chrome from inside a page.
 *
 * Returns a stable setter. Call it from an effect keyed on your own state, and
 * restore it when that state clears or when the page unmounts - a page that
 * leaves focus mode by navigating away would otherwise hide the nav on every
 * route after it.
 */
export function useChrome(): Chrome {
  const ctx = useContext(ChromeContext);
  if (!ctx) {
    throw new Error('useChrome must be used inside SiteShell. Every page route is a child of it.');
  }
  return ctx;
}

/*
  A LINK OPENS ITS PAGE AT THE TOP (owner, 2026-11-16). The shell stays mounted across pages (#55), so the
  document kept the scroll position of the page left: a footer link opened its page scrolled down, ~4,600 px on
  /premium, and looked like nothing happened (every footer link, desktop and phone; verify-footer-scroll-top.mjs).
  A new page (a link, a redirect) starts at the top; Back and Forward (POP) keep the browser's own restored
  position, and a link to an anchor (#...) is left to the page that owns it.
*/
function useNewPageAtTop() {
  const { pathname, hash } = useLocation();
  const navigationType = useNavigationType();
  useLayoutEffect(() => {
    if (navigationType === 'POP' || hash) return;
    window.scrollTo(0, 0);
  }, [pathname, hash, navigationType]);
}

export function SiteShell({ children }: { children?: ReactNode }) {
  const [chromeHidden, setChromeHidden] = useState(false);
  const value = useMemo(() => ({ setChromeHidden, chromeHidden }), [chromeHidden]);
  // A reminder email's link lands on more than one page, so the shell reports it.
  useReminderClick();
  useNewPageAtTop();

  return (
    <ChromeContext.Provider value={value}>
      {/*
        THE SHELL IS A TWO-ROW GRID WITH EXACTLY TWO CHILDREN (spec §1, layout
        redesign C1a): the `<nav>` and the page region, which is the kind
        layout's element carrying `data-kind`. No wrapper between them: the
        Workspace lock is `:has(> [data-kind="workspace"])` on this element and
        only sees a DIRECT child. The rows, the lock and the print reset are in
        `index.css` under `[data-shell]`, because `min-block-size` needs its
        `100vh` fallback before `100dvh`, which a class cannot express.

        THE SUSPENSE BOUNDARY MOVED INTO THE PAGE REGION. It used to wrap
        `<Routes>` (above the shell, so a loading chunk replaced the nav), then
        sat here around a wrapper div. It is now inside each kind layout,
        around the page only, so a loading page keeps both the nav and its own
        region, `data-kind` included, and cannot unlock a Workspace shell.
      */}
      <div data-shell className="bg-background">
        {/*
          FOCUS MODE KEEPS THE NAV MOUNTED (C1a). It used to be unmounted, which
          threw away its state and made the bar a new element on the way back,
          the defect #55 exists to prevent. Now it stays, collapsed to a zero
          row and `inert`, so it cannot take focus, be clicked or be read.
        */}
        <Navigation hidden={chromeHidden} />
        {children ?? <Outlet />}
      </div>
      {/* Outside the two-child grid: the dialog portals to the body and renders nothing until a limit is met. */}
      <DailyLimitDialog />
      {/* #564: over the foot of the window, outside the grid; nothing until the visitor's country is known. */}
      <ConsentBanner />
    </ChromeContext.Provider>
  );
}
