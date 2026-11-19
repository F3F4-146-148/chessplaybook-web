/**
 * MAY THE BROWSER TAKE OVER A BUILT PAGE IN PLACE? (prerender plan A10, 2026-11-19)
 *
 * A built page (`#root[data-prerendered]`) holds what the build rendered for a first visit with a plain address. React
 * may take it over (hydrate) only when this visitor's first render will be the same; otherwise the page is built from
 * scratch, as before, with the built body hidden before the first paint so it never shows and then disappears.
 *
 * ONE COPY OF THE RULES, RUN TWICE: main.tsx imports this file, and scripts/generate-route-html.cjs copies its source
 * into each built page's <head> (before the body is parsed, so the hiding happens before paint). So: no imports, plain
 * JavaScript a 2018 browser runs, and nothing but `PRERENDER_HYDRATE` and `shouldHydrate` at the top level.
 */

/** The committed switch (A11): off, every page is built from scratch and the built body is always hidden. */
export const PRERENDER_HYDRATE = true;

export function shouldHydrate(search, routeKey, storage) {
  // A query string the page could read changes its first render; the tracking ones are read by nothing on the page.
  var params = (search || '').replace(/^\?/, '').split('&');
  for (var i = 0; i < params.length; i++) {
    var name = decodeURIComponent(params[i].split('=')[0] || '');
    if (name && !/^(utm_.+|gclid|gbraid|wbraid|fbclid|msclkid|_gl)$/.test(name)) return false;
  }
  // A page's own rule: what only this visitor has saved that changes its first render (B0, 2026-11-19, each key read
  // in a state initialiser or at render). The board theme is an inline style computed at render, and React does not
  // patch an attribute that differs on hydration, so a chosen theme would keep the built page's default board.
  // (`boardTheme` is the legacy key, migrated into the current one at render.) No storage at all reads as a first visit,
  // which is what the page itself reads then.
  var remembered = {
    openings: ['cp_openings_repertoire', 'cp_master_voice', 'cp_master_voice_openings', 'cp_master_volume',
      'chessplaybook_board_theme', 'boardTheme'],
    puzzles: ['chessplaybook_puzzle_filters', 'chessplaybook_puzzle_progress', 'chessplaybook_board_theme', 'boardTheme']
  };
  var keys = remembered[routeKey] || [];
  for (var k = 0; k < keys.length; k++) {
    try { if (storage && storage.getItem(keys[k]) !== null) return false; } catch (e) { return false; }
  }
  return true;
}
