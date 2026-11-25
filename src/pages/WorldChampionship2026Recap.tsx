/**
 * A game recap of the 2026 World Championship match, /news/world-championship-2026/game-N (owner, 2026-11-23).
 *
 * Every recap is drawn the same way from its data (src/features/world-championship/recaps), TEXT FIRST (owner: for
 * readers who want the story, not the moves): the header and lead, a photo, the story in words (off the board, the
 * venue, the game), then for chess players the key moments (a board, the engine's facts and the recap's own words)
 * and the whole game on the article viewer, then FIDE's replay, the links and the sources. Nothing here asks the
 * engine or the API, so a built page is the whole page.
 *
 * A draft (dev server only) carries `noindex` (DraftRecapHead) and a banner; a published recap takes its title and description from
 * route-meta.json like every other article.
 */

import { Link, useParams } from 'react-router-dom';
import { DraftRecapHead } from '@/features/world-championship/recaps/DraftRecapHead';
import type { Key } from '@lichess-org/chessground/types';
import SeoHead, { type RouteMetaKey } from '@/components/SeoHead';
import { ArticleGameViewer } from '@/components/game-viewer/ArticleGameViewer';
import { ChessBoard } from '@/components/chess/ChessBoard';
import { MatchVideo } from '@/features/world-championship/MatchVideo';
import { RecapShort } from '@/features/world-championship/RecapShort';
import { MATCH_PATH, gamePath } from '@/features/world-championship/match';
import { recapBySlug, recapPath } from '@/features/world-championship/recaps/recaps';
import type { BakedMoment, GameRecap, RecapMoment, RecapPhoto } from '@/features/world-championship/recaps/types';
import NotFound from './NotFound';

const H2 = 'text-2xl font-playfair font-bold text-foreground mb-4 border-b border-primary/30 pb-2';

function moveLabel(m: Pick<BakedMoment, 'moveNumber' | 'color' | 'san'>): string {
  return `${m.moveNumber}${m.color === 'white' ? '.' : '...'}${m.san}`;
}

function Photo({ photo, className = 'mb-10' }: { photo: RecapPhoto; className?: string }) {
  return (
    <figure className={className}>
      <img src={photo.src} width={photo.width} height={photo.height} alt={photo.alt} className="w-full h-auto rounded-lg" decoding="async" />
      <figcaption className="mt-2 text-xs text-muted-foreground">{photo.alt}. PHOTO: {photo.credit}</figcaption>
    </figure>
  );
}

/* A key moment is the board and the recap's own words (owner, 2026-11-24: "people don't really care about the
   evaluation number, they want to see a human story"). The baked evaluations stay in moments/*.json as the facts the
   words are checked against; a number appears only where the text itself chooses to say it. */
function KeyMoment({ moment, baked }: { moment: RecapMoment; baked: BakedMoment }) {
  return (
    <section className="mb-12">
      <h3 className="text-xl font-playfair font-bold text-foreground mb-3">{moment.heading}</h3>
      <div className="grid gap-5 md:grid-cols-[minmax(0,280px)_1fr] md:items-start">
        <figure className="mx-auto w-full max-w-[280px]">
          <ChessBoard fen={baked.fen} lastMove={baked.lastMove as Key[]} viewOnly coordinates={false} className="w-full aspect-square" />
          <figcaption className="mt-2 text-center text-xs text-muted-foreground">After {moveLabel(baked)}</figcaption>
        </figure>
        <div className="min-w-0">
          {moment.paragraphs.map((p) => (
            <p key={p.slice(0, 40)} className="text-muted-foreground leading-relaxed mb-3">{p}</p>
          ))}
        </div>
      </div>
    </section>
  );
}

function RecapBody({ recap }: { recap: GameRecap }) {
  const bakedByPly = new Map(recap.baked.moments.map((m) => [m.ply, m]));
  const linkClass = 'underline hover:text-link';

  return (
    <div className="bg-background flex flex-col">
      {recap.draft && (
        <div className="bg-warning/15 border-b border-warning/40 px-4 py-2 text-center text-sm text-foreground">
          Draft, shown on the dev server only. Not published.
        </div>
      )}

      {/* The header */}
      <div className="bg-gradient-to-b from-card via-card to-background">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 text-center">
          <p className="text-editorial font-semibold tracking-wider uppercase text-sm mb-4">{recap.kicker}</p>
          <h1 className="text-4xl sm:text-5xl font-playfair font-bold text-foreground mb-3 leading-tight">{recap.title}</h1>
          <h2 className="text-xl sm:text-2xl font-playfair text-link mb-6">{recap.subtitle}</h2>
          <div className="inline-flex flex-wrap items-center justify-center gap-3 sm:gap-6 text-sm text-muted-foreground mb-6">
            <span>{recap.resultLine}</span>
            <span className="hidden sm:inline text-border">|</span>
            <span>{recap.scoreLine}</span>
            <span className="hidden sm:inline text-border">|</span>
            <span>{recap.dateLabel}</span>
          </div>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">{recap.lead}</p>
        </div>
      </div>

      <article className="py-8 px-4 sm:px-6 lg:px-8 flex-grow">
        <div className="max-w-3xl mx-auto">
          {recap.photo && <Photo photo={recap.photo} />}

          {/* The story, in words */}
          {recap.sections.map((s) => (
            <section key={s.heading} className="mb-10">
              <h2 className={H2}>{s.heading}</h2>
              {s.paragraphs.map((p) => (
                <p key={p.slice(0, 40)} className="text-muted-foreground leading-relaxed mb-4">{p}</p>
              ))}
              {s.photo && <Photo photo={s.photo} className="mt-6" />}
            </section>
          ))}

          {/* Our Short of the game, after the story (owner, 2026-11-25; GAME_SHORTS, nothing when there is none) */}
          {recap.game && <RecapShort game={recap.game} />}

          {/* For chess players: the key moments, then the whole game */}
          {recap.moments.length > 0 && (
            <section className="mb-6">
              <h2 className={H2}>The key moments</h2>
              {recap.moments.map((m) => {
                const baked = bakedByPly.get(m.ply);
                return baked ? <KeyMoment key={m.ply} moment={m} baked={baked} /> : null;
              })}
            </section>
          )}

          {recap.pgn && (
            <ArticleGameViewer
              title="Replay the whole game"
              games={[{ id: recap.slug, label: recap.gameLabel, section: 'The game', pgn: recap.pgn }]}
            />
          )}

          {/* FIDE's replay */}
          {recap.videoId && recap.game && (
            <section className="mb-10">
              <h2 className={H2}>Watch the broadcast</h2>
              <MatchVideo video={{ id: recap.videoId, kind: 'replay', game: recap.game }} />
            </section>
          )}

          {/* Where next */}
          <nav aria-label="More from the match" className="mb-10 flex flex-wrap gap-3">
            {recap.game && (
              <Link to={gamePath(recap.game)} className="rounded-md border border-border px-4 py-2 text-sm text-foreground hover:bg-muted">
                Game {recap.game} on the live board
              </Link>
            )}
            <Link to={MATCH_PATH} className="rounded-md border border-border px-4 py-2 text-sm text-foreground hover:bg-muted">
              The match: score and every game
            </Link>
          </nav>

          {/* Sources: one short line (owner, 2026-11-24); the photo credit is under each photo */}
          {recap.sources.length > 0 && (
            <p className="mb-8 border-t border-border pt-6 text-xs text-muted-foreground leading-relaxed">
              Sources:{' '}
              {recap.sources.map((part, i) =>
                typeof part === 'string' ? (
                  <span key={i}>{part}</span>
                ) : part.href.startsWith('/') ? (
                  <Link key={i} to={part.href} className={linkClass}>{part.text}</Link>
                ) : (
                  <a key={i} href={part.href} className={linkClass} target="_blank" rel="noopener noreferrer">{part.text}</a>
                ),
              )}
            </p>
          )}
        </div>
      </article>
    </div>
  );
}

export default function WorldChampionship2026Recap() {
  const { slug } = useParams<{ slug: string }>();
  const recap = recapBySlug(slug);
  if (!recap) return <NotFound />;

  return (
    <>
      {recap.draft ? (
        <DraftRecapHead title={recap.title} />
      ) : (
        <SeoHead routeKey={recapPath(recap).slice(1) as RouteMetaKey} />
      )}
      <RecapBody recap={recap} />
    </>
  );
}
