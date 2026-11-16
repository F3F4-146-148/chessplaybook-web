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
