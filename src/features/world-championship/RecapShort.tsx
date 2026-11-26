/**
 * Each game's YouTube Short on its recap (owner, 2026-11-25: the channel's videos on the site too). The Shorts are
 * ours (scripts/video/shorts/make-short.mjs), one per game, listed by game number in `GAME_SHORTS` so a new game's
 * Short is one line here and nothing in its recap file.
 *
 * MatchVideo's pattern: our own poster first (the Short's thumbnail, ~30 KB WebP, lazy: the section sits after the
 * story, below the fold), YouTube's player only after a press (about 1 MB of script and YouTube's cookies; the
 * Privacy page names them, `www.youtube.com` is in the CSP's frame-src). A vertical 9:16 box, at most 300 px wide.
 * Its VideoObject goes in the page's head, so search engines can list the video with the recap.
 */
import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Play } from 'lucide-react';
import { logGA4Event } from '@/services/analytics';

export interface GameShort {
  /** YouTube's id */
  id: string;
  /** The title as on YouTube */
  title: string;
  /** One sentence, as the Short's description opens */
  description: string;
  /** Our poster, under public/assets/shorts (a new name for a new picture: assets are immutable for a year) */
  poster: string;
  /** When it went up, ISO date */
  uploaded: string;
  /** Its length, ISO 8601 */
  duration: string;
}

export const GAME_SHORTS: Record<number, GameShort> = {
  1: {
    id: 'dvbzXsDrzIU',
    title: 'Gukesh had 6 minutes. One move saved him. | World Championship 2026, Game 1',
    description:
      'Game 1 of the 2026 World Chess Championship, Sindarov vs Gukesh in Geneva: a Berlin, a battle on the clock, and the one move that held.',
    poster: '/assets/shorts/wch-2026-game-1-poster.webp',
    uploaded: '2026-11-25',
    duration: 'PT55S',
  },
  2: {
    id: 'fobpyy0YWjY',
    title: "Gukesh vs Sindarov, Game 2: who's guarding b2? | World Chess Championship 2026",
    description:
      "Game 2 of the 2026 World Chess Championship in Geneva: Gukesh's London System, Sindarov's queen on b2 by move seven, and a draw in 20 moves.",
    poster: '/assets/shorts/wch-2026-game-2-poster.webp',
    uploaded: '2026-11-25',
    duration: 'PT48S',
  },
};

export function RecapShort({ game, className = 'mb-10' }: { game: number; className?: string }) {
  const short = GAME_SHORTS[game];
  const [playing, setPlaying] = useState(false);
  if (!short) return null;
  const videoObject = {
    '@context': 'https://schema.org',
    '@type': 'VideoObject',
    name: short.title,
    description: short.description,
    thumbnailUrl: [`https://www.chessplaybook.com${short.poster}`, `https://i.ytimg.com/vi/${short.id}/hqdefault.jpg`],
    uploadDate: short.uploaded,
    duration: short.duration,
    embedUrl: `https://www.youtube.com/embed/${short.id}`,
    contentUrl: `https://www.youtube.com/shorts/${short.id}`,
  };
  return (
    <section className={className} aria-labelledby={`short-${game}`}>
      <Helmet>
        <script type="application/ld+json">{JSON.stringify(videoObject)}</script>
      </Helmet>
      <h2 id={`short-${game}`} className="text-2xl font-playfair font-bold text-foreground mb-4 border-b border-primary/30 pb-2">
        Game {game} in under a minute
      </h2>
      <div className="relative mx-auto w-full max-w-[300px] overflow-hidden rounded-lg bg-muted" style={{ aspectRatio: '9 / 16' }}>
        {playing ? (
          <iframe
            src={`https://www.youtube.com/embed/${short.id}?autoplay=1&playsinline=1&rel=0`}
            title={short.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
            className="absolute inset-0 h-full w-full border-0"
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setPlaying(true);
              logGA4Event({ name: 'match_video_played', params: { surface: 'recap', video: 'short', game } });
            }}
            aria-label={`Play the game ${game} Short`}
            className="group absolute inset-0 h-full w-full"
          >
            <img src={short.poster} width={540} height={960} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform group-hover:scale-105 group-focus-visible:ring-4 group-focus-visible:ring-ring">
                <Play className="ml-0.5 h-6 w-6 fill-current" aria-hidden />
              </span>
            </span>
          </button>
        )}
      </div>
      <p className="mt-3 text-center text-sm text-muted-foreground">
        From our{' '}
        <a href={`https://www.youtube.com/shorts/${short.id}`} target="_blank" rel="noopener noreferrer" className="underline hover:text-link">
          YouTube channel
        </a>
      </p>
    </section>
  );
}
