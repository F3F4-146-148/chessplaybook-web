/**
 * The head of a DRAFT recap: a draft exists on the dev server only (`recaps.ts`, `import.meta.env.DEV`), is never
 * built, listed or put in the sitemap, and carries `noindex` in case one is ever opened anywhere else.
 *
 * It lives here rather than in src/pages/WorldChampionship2026Recap.tsx on purpose: check-indexability.cjs reads a
 * route's page file for a robots tag, and every BUILT recap is indexable. With this tag in the page file the check
 * read the whole route as noindex and failed the build for game 1 (2026-11-24).
 */

import { Helmet } from 'react-helmet-async';

export function DraftRecapHead({ title }: { title: string }) {
  return (
    <Helmet>
      <title>{`Draft: ${title} | Chess Playbook`}</title>
      <meta name="robots" content="noindex, nofollow" />
    </Helmet>
  );
}
