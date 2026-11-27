import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { UserPlus } from 'lucide-react';
import { logGA4Event } from '@/services/analytics';
import { SittingChart, useBox } from './ProgressMomentCard';
import { RatingChange } from './RatingChange';
import { type TodayLine } from '../lib/daySummary';

/**
 * TODAY'S RATING, IN THE EMPTY PART OF "WHAT TO TRAIN" (#418 v3 C1, owner 2026-11-27).
 *
 * Desktop windows leave 120-440 px free under the card's last row (measured on production across the viewport
 * matrix, `scripts/measure-what-to-train-space.mjs`); phones, upright tablets and 800x600 leave none, because a stacked
 * card is as tall as what it holds. So the block takes the card's LEFTOVER height (`card-fill`: flex 1 1 0) and draws
 * inside it absolutely positioned. It measures the space without its own content (Codex), so arriving points can
 * never resize the card, and where the space is too small it draws nothing at all.
 *
 * Before the day's first rated result: one quiet line (owner, 2026-11-27). A guest is offered an account under the
 * graph, in v2's words (owner): signing up carries the guest's rating to the account (#237). The card is replaced
 * by the moment or the day's summary while one shows, so the two never draw together.
 */

/** The least height that holds the rating row, a readable chart and the account line. */
export const TODAY_GRAPH_MIN_H = 96;
let shownDay: string | null = null;

export function TodayGraph({ line, offerAccount = false }: { line: TodayLine | null; offerAccount?: boolean }) {
  const [ref, box] = useBox<HTMLDivElement>();
  const points = line?.points ?? [];
  const hasGraph = points.length >= 2 && box.h >= TODAY_GRAPH_MIN_H && box.w > 0;
  /* Only where the graph itself will fit: "will show here" on a phone, where it never shows, would be false. */
  const quiet = !hasGraph && points.length < 2 && line !== null && box.h >= TODAY_GRAPH_MIN_H;
  const now = points[points.length - 1];

  /* GA4 once a day per tab: the graph was drawn, so desktop reach can be read (C3). */
  const day = line?.day ?? null;
  useEffect(() => {
    if (!hasGraph || !day || shownDay === day) return;
    shownDay = day;
    logGA4Event({ name: 'today_graph_shown', params: { points: points.length } });
  }, [hasGraph, day, points.length]);

  const accountH = offerAccount ? 22 : 0;
  return (
    <div ref={ref} className="card-fill relative" data-testid="today-graph-slot" data-today-shown={hasGraph ? 'graph' : quiet ? 'quiet' : 'none'}>
      {hasGraph && (
        <div className="absolute inset-0 flex flex-col gap-[0.25em]" data-testid="today-graph">
          <div className="flex items-baseline gap-[0.5em] text-[length:var(--card-type,14px)]">
            <span className="text-muted-foreground">Today</span>
            <span className="font-semibold tabular-nums">{now}</span>
            <RatingChange points={points} />
          </div>
          <div className="relative flex-1 min-h-0">
            <SittingChart
              points={points}
              w={box.w}
              h={Math.max(40, box.h - 26 - accountH)}
              compact
              label={`Your rating today, from ${points[0]} to ${now}`}
            />
          </div>
          {offerAccount && (
            <Link
              to={`/signup?returnTo=${encodeURIComponent('/puzzles')}`}
              className="moment-offer"
              onClick={() => logGA4Event({ name: 'puzzle_moment_signup', params: { kind: 'today', rating: now } })}
            >
              <UserPlus style={{ width: '1em', height: '1em' }} aria-hidden />
              Create a free account to keep your {now} rating.
            </Link>
          )}
        </div>
      )}
      {quiet && (
        <p className="absolute inset-x-0 bottom-0 text-[length:var(--card-type,14px)] text-muted-foreground" data-testid="today-graph-quiet">
          Your rating today will show here.
        </p>
      )}
    </div>
  );
}

export default TodayGraph;
