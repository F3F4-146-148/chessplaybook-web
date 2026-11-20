/**
 * FIDE's trailer for the match, from their YouTube channel (embedding allowed: YouTube's oEmbed answers for it, which
 * it refuses for a video whose owner turned embedding off; checked 2026-11-20).
 *
 * A picture first, YouTube's player only after a press: the player is about 1 MB of script and sets YouTube's
 * cookies, and the hub is a built page read mostly on phones. The official site does the same behind its
 * "Allow embedded media". `www.youtube.com` is already in the site's CSP `frame-src`; the picture is on i.ytimg.com,
 * which `img-src https:` covers. The Privacy page names YouTube.
 *
 * The thumbnails are 4:3 with the 16:9 picture letterboxed inside, so `object-cover` in a 16:9 box crops exactly the
 * black bars.
 */

import { useState } from 'react';
import { Play } from 'lucide-react';
import { logGA4Event } from '@/services/analytics';

export const MATCH_VIDEO_ID = 'ZBkJIHUPevM';
const TITLE = 'Salesforce FIDE World Championship 2026: Gukesh vs Sindarov, the trailer';
const thumb = (name: string) => `https://i.ytimg.com/vi/${MATCH_VIDEO_ID}/${name}.jpg`;

export function MatchVideo({ surface }: { surface: 'hub' }) {
  const [playing, setPlaying] = useState(false);

  return (
    <section aria-labelledby="match-video-title" className="surface-card rounded-lg p-5 sm:p-7 mb-8">
      <h2 id="match-video-title" className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wider">
        The match trailer
      </h2>
      <div className="relative aspect-video overflow-hidden rounded-md bg-muted">
        {playing ? (
          <iframe
            src={`https://www.youtube.com/embed/${MATCH_VIDEO_ID}?autoplay=1&playsinline=1&rel=0`}
            title={TITLE}
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
              logGA4Event({ name: 'match_video_played', params: { surface } });
            }}
            aria-label="Play the match trailer"
            className="group absolute inset-0 h-full w-full"
          >
            <img
              src={thumb('sddefault')}
              srcSet={`${thumb('hqdefault')} 480w, ${thumb('sddefault')} 640w, ${thumb('maxresdefault')} 1280w`}
              sizes="(min-width: 896px) 830px, 100vw"
              alt=""
              loading="lazy"
              decoding="async"
              className="absolute inset-0 h-full w-full object-cover opacity-90 transition-opacity group-hover:opacity-100"
            />
            {/* The page's primary-button colours (as "Watch game live"): a role, so it follows the theme. */}
            <span className="absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform group-hover:scale-105 group-focus-visible:ring-4 group-focus-visible:ring-ring">
              <Play className="ml-1 h-7 w-7 fill-current" aria-hidden />
            </span>
          </button>
        )}
      </div>
      <p className="text-xs text-muted-foreground mt-3">
        FIDE&rsquo;s official trailer. It plays from YouTube, which may set its own cookies once you press play.{' '}
        <a
          href={`https://www.youtube.com/watch?v=${MATCH_VIDEO_ID}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-link hover:underline"
        >
          Watch on YouTube
        </a>
      </p>
    </section>
  );
}
