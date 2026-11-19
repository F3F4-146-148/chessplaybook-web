/**
 * Per-route static HTML for the champion pages.
 *
 * WHY THIS EXISTS
 *
 * The site is a client-rendered SPA behind CloudFront: every unknown path 404s at
 * S3 and CloudFront rewrites it to /index.html. So all 36 champion pages served
 * BYTE-IDENTICAL raw HTML — the generic homepage title, the homepage description,
 * and no canonical. Champion-specific meta only appeared after JS ran AND an
 * api.chessplaybook.com call resolved. Google renders JS, but in a deferred second
 * pass, and 36 URLs that are indistinguishable on first fetch is exactly what
 * produces "Crawled - currently not indexed". Requesting indexing does not help,
 * because it does not change what the crawler receives.
 *
 * HOW IT WORKS — no CloudFront change required
 *
 * CloudFront's viewer-request function does no path rewriting, and the SPA fallback
 * is a 403/404 custom error response. So an S3 object at the EXACT key
 * `champions/gukesh/games` (no extension) is found and served directly, and every
 * other route keeps falling through to /index.html as before. That is why output
 * files here are extensionless: the key must match the URL path character for
 * character.
 *
 * Because the keys have no extension, `aws s3 sync` would guess
 * application/octet-stream and browsers would download the page instead of
 * rendering it. deploy/deploy.sh therefore uploads these with an explicit
 * --content-type; see step 2f there. Do not fold them back into the bulk sync.
 *
 * WHAT IT EMITS
 *
 * dist/index.html with title/description/canonical/og/twitter replaced per route,
 * plus a short <noscript> block so the page carries unique body text even on the
 * first, non-rendered fetch. The tags carry data-rh="true" so react-helmet-async
 * REPLACES them on mount rather than appending a second copy — the same contract
 * index.html follows, for the same reason (see SEO_DUPLICATE_META_FIX).
 *
 * Static copy deliberately carries NO game counts. The React pages put the live
 * count in their titles, but the count comes from the API and is unknowable at
 * build time; baking a stale number into the crawlable HTML is worse than omitting
 * it. Helmet supplies the real thing once JS runs.
 *
 * Usage: node scripts/generate-route-html.cjs   (runs after generate-sitemap)
 */

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

/*
  THE SITE THIS BUILD IS FOR (#34).

  Hardcoded to production until 2026-08-23, so a staging build emitted PRODUCTION
  canonicals - an SEO hazard on top of a configuration one, and the kind that is
  invisible until Google has already read it. Defaults to production, so a build
  with `SITE_URL` unset is byte-identical to before.
*/
const PRODUCTION_DOMAIN = 'https://www.chessplaybook.com';
const DOMAIN = (process.env.SITE_URL || PRODUCTION_DOMAIN).replace(/\/$/, '');
const IS_PRODUCTION_SITE = DOMAIN === PRODUCTION_DOMAIN;
const DIST_DIR = path.join(__dirname, '../dist');
const INDEX_PATH = path.join(DIST_DIR, 'index.html');
const PLAYERS_JSON_PATH = path.join(__dirname, '../public/assets/players/players_list.json');
const CHAMPION_ROUTE_META = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/config/champion-route-meta.json'), 'utf-8'));
const CHAMPION_CONTENT = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/config/champion-content.json'), 'utf-8'));

/** Escape a string for use inside a double-quoted HTML attribute. */
function attr(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Escape a string for use as HTML text content. */
function text(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Replace the value of a <meta> tag identified by attribute name/value, or insert
 * it before </head> if the template does not already carry it.
 *
 * Throws rather than silently no-oping: a missed replacement would ship the
 * homepage copy again, which is the exact bug this script exists to fix, and it
 * would do so invisibly.
 */
function setMeta(html, attrName, attrValue, content) {
  // The closing delimiter must be the SAME quote character the tag opened with.
  // A naive [^"']* terminates early on an apostrophe inside the value — the
  // homepage description contains "the champion's playbook", which silently left
  // the tail of the old copy appended to the new. Hence one pattern per quote
  // style, each matching only its own delimiter.
  const patterns = [
    new RegExp(
      `(<meta\\b[^>]*\\b${attrName}=["']${attrValue}["'][^>]*\\bcontent=")[^"]*(")`,
      'i'
    ),
    new RegExp(
      `(<meta\\b[^>]*\\b${attrName}=["']${attrValue}["'][^>]*\\bcontent=')[^']*(')`,
      'i'
    ),
  ];
  for (const pattern of patterns) {
    if (pattern.test(html)) {
      return html.replace(pattern, `$1${attr(content)}$2`);
    }
  }
  const tag = `    <meta data-rh="true" ${attrName}="${attrValue}" content="${attr(content)}" />\n`;
  return html.replace('</head>', `${tag}  </head>`);
}

function setTitle(html, title) {
  if (!/<title>[\s\S]*?<\/title>/i.test(html)) {
    throw new Error('index.html has no <title> to replace');
  }
  return html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${text(title)}</title>`);
}

/**
 * Replace the `description` inside the static WebSite JSON-LD block, so the
 * homepage's structured data cannot disagree with its <meta description>.
 * Scoped to that block by anchoring on `"@type": "WebSite"` — a bare
 * `"description":` replace would also hit any other schema on the page.
 */
function setJsonLdDescription(html, description) {
  return html.replace(
    /("@type":\s*"WebSite"[\s\S]*?"description":\s*)"(?:[^"\\]|\\.)*"/,
    (_m, prefix) => `${prefix}${JSON.stringify(description)}`,
  );
}

/**
 * Remove the homepage's `WebSite` JSON-LD from a non-home route.
 *
 * Every route file is a copy of `dist/index.html`, so until 2026-08-07 all 60 of
 * them shipped the homepage's structured data — name, url, the homepage
 * description. After the 08-06 meta rewrite that
 * became visibly self-contradictory: `/puzzles` served a correct
 * `<meta description>` describing the training system and, three tags later, a
 * schema description describing the homepage. Two answers to one question, on one
 * page.
 *
 * REMOVED rather than replaced with a per-page `WebApplication`. `WebSite` is a
 * claim about the SITE, so exactly one page should make it, and the homepage
 * already does — writing a second, page-specific block would be a second copy of
 * the same sentence, which is the failure mode this generator exists to end.
 * Articles are the exception and keep their own schema, built below from the same
 * fields the meta tags come from.
 *
 * Throws when the block is absent: a silent no-op here would ship the homepage
 * schema on every route again, invisibly, which is the bug itself.
 *
 * LIMIT, worth knowing before changing the schema layout. This removes a WHOLE
 * `<script>` element, matched by the `@type` inside it. That is right while each
 * block is one entity, which is today's shape. If the page's structured data is
 * ever consolidated into a single `@graph` script holding `WebSite` alongside
 * page or article nodes, this would take all of them out — and the build would
 * still pass, because the guard only asserts `WebSite` is absent. Splitting the
 * graph, or filtering nodes rather than elements, has to happen in the same
 * change.
 */
const WEBSITE_JSONLD = new RegExp(
  '\\s*<script\\b[^>]*type=["\']application/ld\\+json["\'][^>]*>' +
    '(?:(?!</script>)[\\s\\S])*?"@type"\\s*:\\s*"WebSite"' +
    '(?:(?!</script>)[\\s\\S])*?</script>',
  'i',
);

function stripWebsiteJsonLd(html, routeKey) {
  if (!WEBSITE_JSONLD.test(html)) {
    throw new Error(
      `index.html has no WebSite JSON-LD block to strip for /${routeKey}. ` +
        'If it was moved or renamed, update stripWebsiteJsonLd — do not delete ' +
        'this check, or every route silently ships the homepage schema again.',
    );
  }
  return html.replace(WEBSITE_JSONLD, '');
}

/**
 * `noindex, follow` for the per-user pages, IN THE SERVED HTML.
 *
 * These are one person's training plan and one person's record. Nobody searches
 * for them, a crawler sees an empty loading state, and they are reachable from
 * `/puzzles` — so left alone they are thin pages with no demand behind them.
 * `follow`, so the links back into the site still count.
 *
 * WHY HERE AND NOT IN `SeoHead`. The 2026-07-28 incident was not caused by
 * `noindex`; it was caused by an INVISIBLE one. Three live pages carried a
 * client-injected robots tag for four months: the prerendered HTML was clean, so
 * `curl` returned a healthy 200 and two audits missed it — only a JS-rendering
 * crawler ever saw the block. Emitted here it is in the file that is served,
 * visible to `curl`, to a human, and to `check-indexability`.
 *
 * NO `data-rh`, and that attribute is the whole trap. Every other tag this
 * generator writes carries it so react-helmet-async takes ownership and replaces
 * it on mount. `SeoHead` renders no robots tag — so a `data-rh` robots tag would
 * be adopted by Helmet and then REMOVED the moment the app hydrates, leaving
 * exactly the invisible-difference-between-served-and-rendered state that caused
 * the original bug, pointing the other way.
 */
// `reminders` (2026-11-12): one person's email setting, reached from their own emails.
const NOINDEX_ROUTES = new Set(['puzzles/plan', 'puzzles/progress', 'reminders']);

/*
  A NON-PRODUCTION SITE IS noindex IN FULL (#34).

  The two routes above are noindex because of what they contain. This is a
  different reason: a staging copy of the whole site, reachable and crawlable,
  competes with production for its own content - and by the time that shows up in
  Search Console the damage is already indexed. So when `SITE_URL` names anything
  other than production, EVERY prerendered route gets the tag.

  Written into the prerendered HTML for exactly the reason the per-user pages are:
  a robots rule that exists only in a config, or only in the rendered DOM, is the
  2026-07-28 failure with the sign flipped. `check-indexability.cjs` REQUIRES this
  on a non-production build rather than merely tolerating it.
*/
function routeIsNoindex(routeKey) {
  return !IS_PRODUCTION_SITE || NOINDEX_ROUTES.has(routeKey);
}

function setRobotsNoindex(html) {
  const pattern = /<meta\b[^>]*\bname=["']robots["'][^>]*>/i;
  const tag = '<meta name="robots" content="noindex, follow" />';
  if (pattern.test(html)) return html.replace(pattern, tag);
  return html.replace('</head>', `    ${tag}
  </head>`);
}

function setCanonical(html, href) {
  const pattern = /<link\b[^>]*\brel=["']canonical["'][^>]*>/i;
  const tag = `<link data-rh="true" rel="canonical" href="${attr(href)}" />`;
  if (pattern.test(html)) {
    return html.replace(pattern, tag);
  }
  return html.replace('</head>', `    ${tag}\n  </head>`);
}

/**
 * Inject crawlable body text into the #root element.
 *
 * It goes in a <noscript> so it never renders for real users and cannot affect
 * LCP or CLS — the project tracks a PSI-98 mobile score and a visible fallback
 * block would put that at risk. The text says the same thing the rendered page
 * says; it exists so the first fetch is not indistinguishable from every other
 * champion page.
 */
function injectNoscript(html, block) {
  const rootPattern = /(<div\b[^>]*\bid=["']root["'][^>]*>)/i;
  if (!rootPattern.test(html)) {
    throw new Error('index.html has no #root element to inject into');
  }
  return html.replace(rootPattern, `$1<noscript>${block}</noscript>`);
}

/**
 * THE BUILT PAGE (prerender plan A8, 2026-11-19): the page's own content, rendered at build from the same components
 * the browser renders (src/entry-prerender.tsx), written into #root. `data-prerendered` tells main.tsx the page may be
 * taken over in place (hydrated); `data-built-at` is the build's time, which the first render of anything that shows a
 * date uses (A4). A built page has no <noscript> copy: its real content is the page.
 */
function injectPrerendered(html, body, routeKey, builtAt) {
  const rootPattern = /<div\b[^>]*\bid=["']root["'][^>]*>\s*<\/div>/i;
  if (!rootPattern.test(html)) {
    throw new Error('index.html has no empty #root element to render into');
  }
  return html.replace(
    rootPattern,
    () => `<div id="root" data-prerendered="${attr(routeKey)}" data-built-at="${attr(builtAt)}">${body}</div>`,
  );
}

/**
 * THE HEAD CHECK OF A BUILT PAGE (prerender plan A10). src/app/hydrateCheck.js decides whether the browser may take the
 * built page over in place; its source is copied here, comments removed, so the head and main.tsx run the same rules.
 * When the answer is no, a class on <html> hides the built body before the first paint, and main.tsx (removing the
 * marker) builds the page from scratch as before: the built text never shows and then disappears. Without JavaScript
 * nothing is hidden, which is what a crawler that does not run it reads.
 */
const HYDRATE_CHECK_PATH = path.join(__dirname, '../src/app/hydrateCheck.js');
function hydrateHeadScript(routeKey) {
  const source = fs.readFileSync(HYDRATE_CHECK_PATH, 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\bexport\s+/g, '')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
  if (!/function shouldHydrate\(/.test(source) || !/PRERENDER_HYDRATE\s*=/.test(source)) {
    throw new Error('prerender: src/app/hydrateCheck.js no longer defines shouldHydrate and PRERENDER_HYDRATE');
  }
  const key = JSON.stringify(routeKey);
  return '<style>html.cp-no-hydrate #root[data-prerendered]{display:none}</style>' +
    `<script>(function(){${source}\ntry{if(!PRERENDER_HYDRATE||!shouldHydrate(location.search,${key},window.localStorage))` +
    `document.documentElement.classList.add('cp-no-hydrate')}catch(e){document.documentElement.classList.add('cp-no-hydrate')}})()</script>`;
}

/**
 * Which pages are built (prerender plan A8): the allowlist, unless `PRERENDER=off` (the rollback switch, A11). Every
 * key must be a route the generator writes and a page of the registry (src/app/prerenderRoutes.tsx); the render
 * refuses the second, and the check after the loop the first.
 */
const ALLOWLIST_PATH = path.join(__dirname, 'prerender-allowlist.json');
/** A built document over this, compressed and with its critical CSS, is not prerendered (plan §2); the build warns. */
const PRERENDER_MAX_GZIP = 30 * 1024;
const SSR_ENTRY = path.join(__dirname, '../dist-ssr/entry-prerender.js');

/**
 * A BUILT PAGE'S OWN STYLESHEETS (prerender plan B4, 2026-11-19). Vite puts a page's CSS (the Workspace's, for one) in
 * its chunk's stylesheet, which the browser fetches only with the page's JavaScript. The built body painted without it
 * (the lanes at 0x0) and moved by 0.92 CLS when it arrived. Every stylesheet the page's module imports, from the client
 * manifest, is linked here, before the critical CSS step, which inlines what the body uses and loads the rest without
 * blocking. Vite then finds the link already there and does not add it again.
 */
const CLIENT_MANIFEST = path.join(__dirname, '../dist/.vite/manifest.json');
function withPageStylesheets(html, source) {
  const manifest = JSON.parse(fs.readFileSync(CLIENT_MANIFEST, 'utf-8'));
  if (!manifest[source]) throw new Error(`prerender: ${source} is not in the client manifest (the registry's source is wrong)`);
  const css = new Set();
  const seen = new Set();
  (function walk(key) {
    if (seen.has(key) || !manifest[key]) return;
    seen.add(key);
    for (const c of manifest[key].css || []) css.add(c);
    for (const i of manifest[key].imports || []) walk(i);
  })(source);
  const links = [...css]
    .filter((c) => !html.includes(`href="/${c}"`))
    .map((c) => `<link rel="stylesheet" crossorigin href="/${c}">`);
  return links.length ? html.replace('</head>', `    ${links.join('')}
  </head>`) : html;
}
function prerenderAllowlist() {
  if (process.env.PRERENDER === 'off') return new Set();
  return new Set(JSON.parse(fs.readFileSync(ALLOWLIST_PATH, 'utf-8')).routes);
}

/**
 * News routes, added after the article launch showed the SPA-fallback cost twice:
 * `x-cache: Error from cloudfront` on every article fetch (the 403→index.html
 * error path, slower and poorly cached at the edge), and generic homepage meta on
 * the first crawl — the same "Crawled - currently not indexed" trap the champion
 * pages were in.
 *
 * These strings are COPIES of each page's Helmet block, not imports — this script
 * runs in plain Node against .cjs, before anything TSX exists. If an article's
 * Helmet title or description changes, change it here too. The static and
 * rendered values must match across Google's two passes, which is the whole
 * contract (see the champion routes above).
 *
 * og:image is set per-article here, unlike the champion routes, because articles
 * are what get shared: a link preview is generated from the first fetch, where
 * only this static HTML exists.
 */
/**
 * Static + article routes come from `src/config/route-meta.json`, which is
 * ALSO what `<SeoHead>` renders at runtime. One file, both passes.
 *
 * This used to be two hand-maintained arrays of copies, with a comment telling
 * whoever edited a page's Helmet block to remember to edit here too. By
 * 2026-07-28 eight routes had drifted apart, and `/live-events` had never been
 * added at all — so a sitemapped, nav-linked page served the homepage's title
 * and canonical on every non-rendering fetch.
 *
 * og:image is per-article: a link preview is generated from the first fetch,
 * where only this static HTML exists.
 */
function buildMetaRoutes() {
  const meta = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../src/config/route-meta.json'), 'utf-8')
  );
  return Object.entries(meta).map(([key, value]) => ({ key, ...value }));
}

function buildRoutes(playersData) {
  const routes = [];

  Object.keys(playersData).forEach(playerName => {
    const slug = playerName.toLowerCase();
    const data = playersData[playerName];
    // fullName is what the React pages use as pageTitle once the API resolves, so
    // matching it keeps the static and rendered titles consistent across Google's
    // two passes.
    const name = data.fullName || playerName;
    const years = (data.championshipYears || '').trim();
    const bio = (data.biography || '').trim();
    const reign = years ? ` ${years}.` : '';

    // Title and description come from src/config/champion-route-meta.json, which the
    // rendered pages read too, so both passes carry the same text. A champion with
    // written content (champion-content.json) gets its intro as the crawlable body.
    const fill = tpl => tpl.replace(/\{name\}/g, name).replace(/\{slug\}/g, slug);
    const intro = CHAMPION_CONTENT[slug] && CHAMPION_CONTENT[slug].intro;
    for (const [kind, segment] of [['games', 'games'], ['bestGames', 'best-games']]) {
      const m = CHAMPION_ROUTE_META[kind];
      routes.push({
        key: `champions/${slug}/${segment}`,
        title: fill(m.title),
        description: fill(m.description),
        ogTitle: fill(m.ogTitle),
        ogDescription: fill(m.ogDescription),
        keywords: fill(m.keywords),
        heading: fill(m.heading),
        body: intro || (kind === 'games'
          ? `Replay the games of ${name}, World Chess Champion.${reign}` + (bio ? ` ${bio}` : '')
          : `The highest-quality games of ${name}, World Chess Champion, ranked by engine-measured accuracy.${reign}` + (bio ? ` ${bio}` : '')),
      });
    }
  });

  return routes;
}

async function generate() {
  if (!fs.existsSync(INDEX_PATH)) {
    console.error(`Error: ${INDEX_PATH} not found. Run the build first.`);
    process.exit(1);
  }
  if (!fs.existsSync(PLAYERS_JSON_PATH)) {
    console.error('Error: players_list.json not found');
    process.exit(1);
  }

  const template = fs.readFileSync(INDEX_PATH, 'utf-8');
  const ROUTES_DIR = path.join(DIST_DIR, '_routes');
  fs.rmSync(ROUTES_DIR, { recursive: true, force: true });
  fs.mkdirSync(ROUTES_DIR, { recursive: true });
  const manifest = [];
  const playersData = JSON.parse(fs.readFileSync(PLAYERS_JSON_PATH, 'utf-8'));
  const allMeta = buildMetaRoutes();

  /**
   * The '' key is the homepage. It is not a _routes object — S3 serves
   * dist/index.html at '/' directly — so it patches that file in place
   * instead, from the same source as every other route.
   *
   * This matters more than a normal route: index.html is ALSO the SPA shell
   * served for any path without its own object, so its <head> is what a
   * crawler sees on every soft 404. It carried the long-superseded
   * "Chess Playbook - Master Your Game" / "Elevate your chess strategy…"
   * copy while the rendered homepage said something completely different.
   */
  const homeMeta = allMeta.find(r => r.key === '');
  const routes = buildRoutes(playersData).concat(allMeta.filter(r => r.key !== ''));

  // Prerender plan A8: the build's own render of the allowlisted pages, from dist-ssr/ (built just before).
  const allow = prerenderAllowlist();
  let renderPage = null;
  let pageSource = null;
  if (allow.size) {
    if (!fs.existsSync(SSR_ENTRY)) throw new Error(`prerender: ${SSR_ENTRY} not found (vite build --ssr runs before this)`);
    ({ render: renderPage, pageSource } = await import(pathToFileURL(SSR_ENTRY).href));
  }
  const builtAt = new Date().toISOString();
  const rendered = [];
  const overCap = [];
  // A9: a built page starts from the raw page (before the shell's critical CSS) and gets the critical CSS of its own
  // content, then the route preload, as the shell does.
  let rawTemplate = null;
  let criticalize = null;
  let preload = null;
  if (allow.size) {
    ({ criticalize, RAW_PATH: rawTemplate } = require('./inline-critical-css.cjs'));
    rawTemplate = fs.readFileSync(rawTemplate, 'utf-8');
    preload = require('./preload-route-chunks.cjs').preloadScript();
  }

  for (const route of routes) {
    const url = `${DOMAIN}/${route.key}`;
    const building = allow.has(route.key);
    // The route's head (title, description, canonical, social tags, schema), applied to either starting page (A9).
    const withMeta = (start) => {
    let html = start;

    // The site-level schema belongs to the homepage alone; see above.
    html = stripWebsiteJsonLd(html, route.key);

    html = setTitle(html, route.title);
    html = setMeta(html, 'name', 'description', route.description);
    html = setMeta(html, 'name', 'keywords', route.keywords);
    html = setCanonical(html, url);
    if (routeIsNoindex(route.key)) html = setRobotsNoindex(html);

    html = setMeta(html, 'property', 'og:title', route.ogTitle);
    html = setMeta(html, 'property', 'og:description', route.ogDescription);
    html = setMeta(html, 'property', 'og:url', url);

    html = setMeta(html, 'name', 'twitter:title', route.ogTitle);
    html = setMeta(html, 'name', 'twitter:description', route.ogDescription);

    // Articles override the homepage og:image; champion routes keep it.
    if (route.ogImage) {
      html = setMeta(html, 'property', 'og:image', route.ogImage);
      html = setMeta(html, 'name', 'twitter:image', route.ogImage);
      html = setMeta(html, 'property', 'og:image:alt', route.ogTitle || route.title);
      html = setMeta(html, 'name', 'twitter:image:alt', route.ogTitle || route.title);
    }

    // Article schema, built from the same fields <SeoHead> derives it from.
    // Without this the prerendered article carries index.html's `WebSite`
    // schema, so Google's first pass and every social scraper see no article,
    // no publish date and no author.
    // `data-rh` (plan P1, 2026-11-14): Helmet owns a head tag only if it carries it. Without it this
    // block stayed when <SeoHead> rendered its own, so every article declared its Article twice.
    if (route.articleType) {
      const schema = {
        '@context': 'https://schema.org',
        '@type': route.articleType,
        headline: route.ogTitle || route.title,
        description: route.description,
        image: route.ogImage,
        datePublished: route.datePublished,
        dateModified: route.dateModified || route.datePublished,
        author: { '@type': 'Organization', name: 'Chess Playbook', url: DOMAIN },
        publisher: { '@type': 'Organization', name: 'Chess Playbook', url: DOMAIN },
        mainEntityOfPage: url,
      };
      html = html.replace(
        '</head>',
        `<script data-rh="true" type="application/ld+json">${JSON.stringify(schema)}</script></head>`
      );
    }

    return html;
    };
    let html = withMeta(template);
    let built = null;
    if (building) {
      built = injectPrerendered(withMeta(rawTemplate), await renderPage(`/${route.key}`), route.key, builtAt);
      built = withPageStylesheets(built, pageSource(`/${route.key}`));
      built = await criticalize(built);
      if (preload) built = built.replace('</head>', `    ${preload}\n  </head>`);
      built = built.replace('</head>', `    ${hydrateHeadScript(route.key)}\n  </head>`);
      const size = require('zlib').gzipSync(built).length;
      if (size > PRERENDER_MAX_GZIP) {
        overCap.push(`${route.key} (${(size / 1024).toFixed(1)} KB)`);
        built = null; // served as before: the shell's critical CSS, the noscript copy
      }
    }
    if (built) {
      html = built;
      rendered.push(route.key);
    } else {
      html = injectNoscript(
        html,
        `<h1>${text(route.heading)}</h1><p>${text(route.body)}</p>`
      );
    }

    // All route HTML goes under dist/_routes/ with '/' flattened to '__',
    // because S3's flat keyspace allows `news` and `news/x` to coexist while a
    // filesystem cannot hold a file and a directory of the same name. The
    // manifest maps each flat file back to its real S3 key; deploy.sh step 2f
    // uploads from it and the bulk sync excludes _routes/ wholesale.
    const outPath = path.join(ROUTES_DIR, route.key.replace(/\//g, '__'));
    fs.writeFileSync(outPath, html, 'utf-8');
    manifest.push(`${route.key.replace(/\//g, '__')}\t${route.key}`);
  }

  if (overCap.length) console.warn(`  ! not prerendered, over ${PRERENDER_MAX_GZIP / 1024} KB compressed: ${overCap.join(', ')}`);
  // An allowlisted key that is not a route file would be built nowhere, silently.
  const unknown = [...allow].filter((k) => !rendered.includes(k) && !overCap.some((o) => o.startsWith(`${k} `)));
  if (unknown.length) throw new Error(`prerender: allowlisted but not a route file: ${unknown.join(', ')}`);
  // What was actually built, for the guards (A12) and the tests.
  fs.writeFileSync(path.join(DIST_DIR, 'prerendered.json'), JSON.stringify({ builtAt, routes: rendered }, null, 2) + '\n', 'utf-8');
  console.log(`  Prerendered: ${rendered.length ? rendered.join(', ') : 'none'}${process.env.PRERENDER === 'off' ? ' (PRERENDER=off)' : ''}`);

  fs.writeFileSync(path.join(ROUTES_DIR, 'manifest.tsv'), manifest.join('\n') + '\n', 'utf-8');

  // Homepage: patch dist/index.html in place from the same source.
  if (homeMeta) {
    let home = template;
    home = setTitle(home, homeMeta.title);
    home = setMeta(home, 'name', 'description', homeMeta.description);
    home = setMeta(home, 'name', 'keywords', homeMeta.keywords);
    home = setCanonical(home, `${DOMAIN}/`);
    home = setMeta(home, 'property', 'og:title', homeMeta.ogTitle);
    home = setMeta(home, 'property', 'og:description', homeMeta.ogDescription);
    home = setMeta(home, 'property', 'og:url', `${DOMAIN}/`);
    home = setMeta(home, 'name', 'twitter:title', homeMeta.ogTitle);
    home = setMeta(home, 'name', 'twitter:description', homeMeta.ogDescription);
    // The WebSite JSON-LD description too, derived rather than hand-kept.
    // It was a third copy of the homepage description and went stale for
    // months (it still said "replay legendary games" long after the page had
    // moved on), because nothing tied it to route-meta.json.
    home = setJsonLdDescription(home, homeMeta.description);
    /*
      THE SHELL CLAIMS NO URL (SEO audit, 2026-11-15). Since '/' is served from home.html (P2, 2026-11-14),
      dist/index.html is only the shell for paths without their own file: game, player and live pages, and
      unknown champion slugs. With the homepage's canonical and og:url, every one of them told a crawler that
      had not run the JavaScript "I am the homepage". A page that declares a canonical still gets its own once
      rendered (SeoHead and the pages' Helmet add it); the rest are noindex once rendered.
    */
    const shell = home
      .replace(/[ \t]*<link\b[^>]*\brel=["']canonical["'][^>]*>\r?\n?/i, '')
      .replace(/[ \t]*<meta\b[^>]*\bproperty=["']og:url["'][^>]*>\r?\n?/i, '');
    if (/rel=["']canonical["']|property=["']og:url["']/i.test(shell)) {
      throw new Error('generate-route-html: the shell still carries a canonical or og:url');
    }
    fs.writeFileSync(INDEX_PATH, shell, 'utf-8');
    console.log('  Homepage meta applied to dist/index.html (shell: no canonical, no og:url)');

    // P2 (2026-11-14): the homepage's own prerendered object, with the noscript <h1> and text every other route
    // has. It cannot go into index.html, which is also the shell for every route without its own file (game,
    // player and live pages): they would all carry the homepage's heading. The CloudFront canonical function
    // serves '/' from /home.html; a request for /home.html itself is a 404 there (a .html URL is not a route).
    const homePage = injectNoscript(home, `<h1>${text(homeMeta.heading)}</h1><p>${text(homeMeta.body)}</p>`);
    fs.writeFileSync(path.join(DIST_DIR, 'home.html'), homePage, 'utf-8');
    console.log('  Homepage prerendered to dist/home.html');
  }

  console.log(`Route HTML generated: ${routes.length} pages`);
  console.log(`  Output: ${ROUTES_DIR} (flat files + manifest.tsv)`);
}

// Run as a script (the build); a test requires it for buildRoutes alone.
if (require.main === module) {
  generate().catch((error) => {
    console.error('Error generating route HTML:', error);
    process.exit(1);
  });
}

module.exports = { buildRoutes };
