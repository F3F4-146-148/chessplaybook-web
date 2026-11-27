/**
 * THE VISUAL REDESIGN'S TWO SWITCHES (VISUAL_REDESIGN_IMPLEMENTATION_PLAN B1).
 *
 * Committed constants, not environment variables: the deploy workflow passes a fixed list of
 * variables (`deploy.yml`, `deploy/resolve-deploy-target.sh`), and an env-only switch is invisible
 * in the repository (the 08-06 E10 lesson). Turning one on is a commit; rolling back is a revert.
 *
 * DESIGN_V2_LIVE  design v2: the colour roles of `designV2.tokens.ts`, the nav and the footer.
 *                 The build writes `data-design="v2"` on `<html>` (vite.config.ts), so the rules
 *                 apply before first paint and the critical-CSS step inlines them. Light-theme
 *                 visitors are unaffected: every v2 rule is scoped `:not([data-theme="light"])`.
 * HOME_V2_LIVE    the new homepage (phase C). `Index.tsx` renders today's homepage while it is off,
 *                 so the two roll back separately.
 *
 * With both off the site is exactly today's; every guard, `verify-theme-colors-unchanged` included,
 * passes unchanged. In DEV the preview switch at /dev/home-v2 can still turn v2 on for a session.
 *
 * Imported by `vite.config.ts`, so relative imports only and no DOM.
 */
export const DESIGN_V2_LIVE: boolean = true;
export const HOME_V2_LIVE: boolean = true;

/**
 * THE MASTER'S TWO SWITCHES (MASTER_CHARACTER_IMPLEMENTATION_PLAN A2, #186).
 *
 * MASTER_LIVE  the Master's pictures on the board pages and the "Show the Master" control. Off, every
 *              page is exactly today's: `MasterPortrait` renders nothing and the control is not drawn.
 * MAIA_LIVE    Maia-1 plays the Master's levels on /play (Phase C-D). Off, those levels fall back to
 *              the Stockfish definitions kept for this purpose.
 *
 * Both start OFF and are turned on by a commit when their phase ships.
 */
export const MASTER_LIVE: boolean = true;
export const MAIA_LIVE: boolean = true;

/**
 * GUIDED GAMES AGAINST THE MASTER (#428, GUIDED_GAME_IMPLEMENTATION_PLAN D1). On, /play's Game card shows the
 * "Guided game" switch and a guided game can be played (warnings, takebacks, Hint and Why?). Off, /play is exactly
 * today's; in DEV `?guidedMock=1` (or `=warn`) still shows it, as in Phase A. Turned on for production by the release
 * commit (E4, `GUIDED_RELEASED`); before it, a build made with `VITE_GUIDED_LIVE=on` has it (staging, for the owner's
 * E3 test), as the progress moment's switch does. Declared below BUILD_ENV, which it reads.
 */
const GUIDED_RELEASED = true;

/**
 * THE PUZZLE PROGRESS MOMENT (#418): after a few clean solves the card under the live card shows the sitting's graph
 * and the Master says what he saw. On in development, and in a build made with `VITE_PROGRESS_MOMENT_LIVE=on` (the
 * staging environment's variable, read by deploy.yml); off on production until the launch (plan D2). The server's
 * own switch (`PROGRESS_MOMENT_LIVE=on`) must be on too, or no moment is ever sent.
 */
// `?.`: this file is also read by vite.config.ts and the build scripts in Node, where `import.meta.env` is undefined
// (found starting the dev server: the config failed to load); there it reads as off.
const BUILD_ENV = (import.meta as { env?: { DEV?: boolean; VITE_PROGRESS_MOMENT_LIVE?: string; VITE_GUIDED_LIVE?: string } }).env;
/* #428: see GUIDED_RELEASED above. */
export const GUIDED_LIVE: boolean = GUIDED_RELEASED || BUILD_ENV?.VITE_GUIDED_LIVE === 'on';
export const PROGRESS_MOMENT_LIVE: boolean = BUILD_ENV?.DEV === true || BUILD_ENV?.VITE_PROGRESS_MOMENT_LIVE === 'on';

/**
 * THE NEW /PUZZLES ARRANGEMENT (#521, plan B2), for the whole traffic when on (owner, 2026-11-26: no half-and-half
 * test, today's page sells nothing). `features/puzzles/lib/layoutArm.ts`. Off until the arrangement is finished;
 * `?layout=b` shows it in any build meanwhile, `?layout=a` today's page.
 */
export const PUZZLES_NEW_LAYOUT_LIVE: boolean = true;
