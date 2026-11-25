/**
 * FIDE's videos of the match, from their YouTube channel: the trailer, and each game's broadcast (owner, 2026-11-23:
 * shown while the game is on, and as the replay after it; ids in `GAME_STREAMS`). Embedding is allowed on all of
 * them: YouTube's oEmbed answers, which it refuses for a video whose owner turned embedding off (checked 2026-11-20
 * for the trailer, 2026-11-23 for game 1).
 *
 * Two places, both asked for by the owner on 2026-11-20 (the trailer first sat below the hub's games, where nobody
 * found it):
 * - `MatchVideo`, at the top of the hub, small by default, with Larger / Smaller / Hide in a header bar: the
 *   Candidates game-day stream's pattern (TournamentGameDay.tsx). It shows the live game's broadcast while a game is
 *   on, else the latest finished game's replay, else the trailer (`hubVideo`).
 * - `MatchVideoInCard`, the upper half of a game page's Moves card, with Enlarge (a dialog) and Hide: that game's
 *   broadcast (`gameVideo`), else the trailer.
 *
 * A picture first, YouTube's player only after a press: the player is about 1 MB of script and sets YouTube's
 * cookies, and these pages are read mostly on phones. The official site does the same behind its "Allow embedded
 * media". `www.youtube.com` is already in the site's CSP `frame-src`; the picture is on i.ytimg.com, which
 * `img-src https:` covers. The Privacy page names YouTube.
 *
 * AT THE TOP OF THE HUB YOUTUBE'S PICTURE WAS THE PAGE'S LARGEST PAINT (LCP): the 132 KB maxres JPEG measured 3.03 s
 * on the slow phone, a 22 KB WebP 1.34 s, against 0.43 s for the page without it (2026-11-20). So the hub's small
 * player shows our own poster (`poster`: the two portraits the score card already loads, a line, a play button),
 * which is no larger paint than the text; YouTube's picture only once the visitor makes it larger (owner's OK).
 * The built hub is made with no game played, so it always starts on the trailer; the broadcast's answer then
 * switches it, which changes only the poster's line.
 *
 * Sizes are state that starts the same on the server and the client, so a built page hydrates in place; they change
 * only on a press, which is not a layout shift. The thumbnails are 4:3 with the 16:9 picture letterboxed inside, so
 * `object-cover` in a 16:9 box crops exactly the black bars.
 */

import { useState } from 'react';
import { Maximize2, Minimize2, Play, Tv, X } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { PlayerPortrait } from '@/components/chess/PlayerPortrait';
import { logGA4Event } from '@/services/analytics';
import { GAME_STREAMS, PLAYERS, PLAYER_ORDER, isFinished, type GameResult, type ScoredGame } from './match';

export const MATCH_VIDEO_ID = 'ZBkJIHUPevM';

export type MatchVideoKind = 'trailer' | 'upcoming' | 'live' | 'replay';

export interface MatchVideoSource {
  id: string;
  kind: MatchVideoKind;
  /** The game, for every kind but the trailer. */
  game?: number;
}

export const TRAILER: MatchVideoSource = { id: MATCH_VIDEO_ID, kind: 'trailer' };

/** Game `n`'s broadcast: live once a move is in, a replay once it has a result, upcoming before; null without an id. */
export function gameVideo(n: number, result: GameResult | undefined): MatchVideoSource | null {
  const id = GAME_STREAMS[n];
  if (!id) return null;
  const kind: MatchVideoKind = result === 'playing' ? 'live' : result && isFinished(result) ? 'replay' : 'upcoming';
  return { id, kind, game: n };
}

/** The hub's video: the live game's broadcast, else the latest finished game's replay, else the trailer. */
export function hubVideo(games: Iterable<ScoredGame>, liveGame: number | undefined): MatchVideoSource {
  if (liveGame !== undefined && GAME_STREAMS[liveGame]) return { id: GAME_STREAMS[liveGame]!, kind: 'live', game: liveGame };
  const finished = [...games].filter((g) => isFinished(g.result) && GAME_STREAMS[g.game]).sort((a, b) => b.game - a.game);
  return finished.length ? { id: GAME_STREAMS[finished[0].game]!, kind: 'replay', game: finished[0].game } : TRAILER;
}

/** The line naming the video: the hub's header, the dialog's title. */
export function videoLabel(v: MatchVideoSource): string {
  if (v.kind === 'trailer') return 'FIDE’s match trailer';
  if (v.kind === 'live') return `Live: FIDE’s broadcast of game ${v.game}`;
  if (v.kind === 'replay') return `Replay: FIDE’s broadcast of game ${v.game}`;
  return `FIDE’s broadcast of game ${v.game}`;
}

/** The poster's line under the play button. */
function callToAction(v: MatchVideoSource): string {
  if (v.kind === 'trailer') return 'Watch the trailer';
  if (v.kind === 'live') return `Watch game ${v.game} live`;
  if (v.kind === 'replay') return `Watch the replay of game ${v.game}`;
  return `Watch game ${v.game}`;
}

function iframeTitle(v: MatchVideoSource): string {
  return v.kind === 'trailer'
    ? 'Salesforce FIDE World Championship 2026: Gukesh vs Sindarov, the trailer'
    : `Salesforce FIDE World Championship 2026, game ${v.game}: Gukesh vs Sindarov, FIDE’s broadcast`;
}

const thumb = (id: string, name: string) => `https://i.ytimg.com/vi/${id}/${name}.jpg`;
const webp = (id: string, name: string) => `https://i.ytimg.com/vi_webp/${id}/${name}.webp`;

type Surface = 'hub' | 'game';

const iconButton = 'inline-flex h-8 w-8 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground';

/**
 * The picture, then the player. Fills its parent (which must be positioned and sized); `large` picks the sharp
 * picture, `autoPlay` starts the player at once (the dialog, opened by a press). Callers key it by the video id, so a
 * new video starts on its picture again.
 */
function VideoPlayer({ video, surface, large = false, autoPlay = false, priority = false, poster = false }: {
  video: MatchVideoSource;
  surface: Surface;
  large?: boolean;
  autoPlay?: boolean;
  priority?: boolean;
  /** Our own poster instead of YouTube's picture (the hub's small player, see the header). */
  poster?: boolean;
}) {
  const [playing, setPlaying] = useState(autoPlay);
  if (playing) {
    return (
      <iframe
        src={`https://www.youtube.com/embed/${video.id}?autoplay=1&playsinline=1&rel=0`}
        title={iframeTitle(video)}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        referrerPolicy="strict-origin-when-cross-origin"
        allowFullScreen
        className="absolute inset-0 h-full w-full border-0"
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => {
        setPlaying(true);
        logGA4Event({ name: 'match_video_played', params: { surface, video: video.kind, game: video.game ?? 0 } });
      }}
      aria-label={callToAction(video)}
      className="group absolute inset-0 h-full w-full"
    >
      {poster ? (
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-muted px-4">
          <span className="flex items-center gap-4">
            <PlayerPortrait src={PLAYERS[PLAYER_ORDER[0]].portrait} className="h-14 w-14" />
            <span className="text-sm font-semibold text-muted-foreground">vs</span>
            <PlayerPortrait src={PLAYERS[PLAYER_ORDER[1]].portrait} className="h-14 w-14" />
          </span>
          {/* The page's primary-button colours (as "Watch game live"): a role, so it follows the theme. */}
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform group-hover:scale-105 group-focus-visible:ring-4 group-focus-visible:ring-ring">
            <Play className="ml-0.5 h-5 w-5 fill-current" aria-hidden />
          </span>
          <span className="text-xs text-muted-foreground">{callToAction(video)}</span>
        </span>
      ) : (
        <>
          <img
            src={large ? thumb(video.id, 'maxresdefault') : webp(video.id, 'sddefault')}
            alt=""
            fetchPriority={priority ? 'high' : undefined}
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover opacity-90 transition-opacity group-hover:opacity-100"
          />
          <span className="absolute left-1/2 top-1/2 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform group-hover:scale-105 group-focus-visible:ring-4 group-focus-visible:ring-ring">
            <Play className="ml-0.5 h-5 w-5 fill-current" aria-hidden />
          </span>
        </>
      )}
    </button>
  );
}

/** "Live" or "Replay" on a game's picture, where there is no header to say it. */
function KindBadge({ video }: { video: MatchVideoSource }) {
  if (video.kind !== 'live' && video.kind !== 'replay') return null;
  return (
    <span className="pointer-events-none absolute left-1 top-1 z-10 inline-flex items-center gap-1 rounded bg-card/90 px-1.5 py-0.5 text-xs font-medium text-foreground">
      {video.kind === 'live' && <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden />}
      {video.kind === 'live' ? 'Live' : 'Replay'}
    </span>
  );
}

/** The hub's video: under the title, small until made larger. */
export function MatchVideo({ video = TRAILER }: { video?: MatchVideoSource }) {
  const [size, setSize] = useState<'compact' | 'expanded' | 'hidden'>('compact');

  if (size === 'hidden') {
    return (
      <div className="mb-8 flex justify-center">
        <button
          type="button"
          onClick={() => setSize('compact')}
          className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
        >
          <Tv className="h-4 w-4" aria-hidden />
          {callToAction(video)}
        </button>
      </div>
    );
  }

  return (
    <section
      aria-label={videoLabel(video)}
      className={`mx-auto mb-8 overflow-hidden rounded-lg border border-border bg-card ${size === 'expanded' ? 'max-w-4xl' : 'max-w-sm'}`}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-1.5">
        <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          {video.kind === 'live'
            ? <span className="h-2 w-2 shrink-0 rounded-full bg-success" aria-hidden />
            : <Tv className="h-3.5 w-3.5 shrink-0" aria-hidden />}
          <span className="truncate">{videoLabel(video)}</span>
        </span>
        <div className="flex shrink-0 items-center gap-1">
          <a
            href={`https://www.youtube.com/watch?v=${video.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded border border-border px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Open on YouTube"
          >
            YouTube
          </a>
          {size === 'compact' ? (
            <button type="button" onClick={() => setSize('expanded')} className={iconButton} aria-label="Make the video larger" title="Larger">
              <Maximize2 className="h-4 w-4" aria-hidden />
            </button>
          ) : (
            <button type="button" onClick={() => setSize('compact')} className={iconButton} aria-label="Make the video smaller" title="Smaller">
              <Minimize2 className="h-4 w-4" aria-hidden />
            </button>
          )}
          <button type="button" onClick={() => setSize('hidden')} className={iconButton} aria-label="Hide the video" title="Hide">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
      <div className="relative aspect-video bg-muted">
        <VideoPlayer key={video.id} video={video} surface="hub" large={size === 'expanded'} poster={size === 'compact'} />
      </div>
    </section>
  );
}

/**
 * A game page's video, in the upper half of the Moves card. The card's height is a fixed share of its lane, so the
 * video is the largest 16:9 box that fits the half (`.match-video-slot`, a size container) and is dropped where that
 * half is too short to be worth it. Enlarge opens it in a dialog; Hide gives the moves the whole card back.
 */
export function MatchVideoInCard({ video = TRAILER, onHide }: { video?: MatchVideoSource; onHide: () => void }) {
  const [enlarged, setEnlarged] = useState(false);
  return (
    <div className="match-video-slot">
      <div className="match-video-box relative overflow-hidden rounded-md bg-muted">
        {/* The inline player stops while the dialog plays it. */}
        {!enlarged && <VideoPlayer key={video.id} video={video} surface="game" />}
        <KindBadge video={video} />
        <div className="absolute right-1 top-1 z-10 flex gap-1">
          <button
            type="button"
            onClick={() => setEnlarged(true)}
            className="inline-flex h-7 w-7 items-center justify-center rounded bg-card/90 text-foreground hover:bg-card"
            aria-label="Enlarge the video"
            title="Enlarge"
          >
            <Maximize2 className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={onHide}
            className="inline-flex h-7 w-7 items-center justify-center rounded bg-card/90 text-foreground hover:bg-card"
            aria-label="Hide the video"
            title="Hide"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
      <Dialog open={enlarged} onOpenChange={setEnlarged}>
        <DialogContent className="max-w-4xl p-3 sm:p-4">
          <DialogTitle className="text-sm font-medium text-muted-foreground">{videoLabel(video)}</DialogTitle>
          <div className="relative aspect-video overflow-hidden rounded-md bg-muted">
            <VideoPlayer key={video.id} video={video} surface="game" large autoPlay />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** The row that brings the video back after Hide. */
export function ShowMatchVideo({ video = TRAILER, onShow }: { video?: MatchVideoSource; onShow: () => void }) {
  return (
    <button type="button" onClick={onShow} className="card-row w-full text-left hover:text-foreground">
      <Tv className="shrink-0" aria-hidden />
      <span>{video.kind === 'trailer' ? 'Show the match trailer' : `Show FIDE’s broadcast of game ${video.game}`}</span>
    </button>
  );
}
