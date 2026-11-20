import ReportProblemLink from '@/components/support/ReportProblemLink';
import { Button } from '@/components/ui/button';
import { GamesTableHead, GAME_CELL } from './GamesTableHead';

/** Rows per page of both champion game tables; every champion has more (549+ games, 100 best games). */
export const GAMES_PER_PAGE = 50;

/**
 * THE GAMES TABLE BEFORE ITS GAMES (prerender plan D1/D2, 2026-11-19).
 *
 * The champion list pages are built into their HTML at deploy time with the games still to come from the API, so the
 * written content under the table (the ranking, the questions, About) is on screen from the first paint. A short
 * "Loading games..." box let the table arrive 2,500px tall and push all of it down (measured on production: 50 rows of
 * 49.5px, 33.5px on a phone, then the pagination). So the placeholder IS the table: the same head, 50 blank rows with
 * the same cells, the pagination's height. No words a search result could show, no spinner.
 *
 * A failed load keeps the frame and says so at its top: collapsing it would pull the content below up the same way.
 */
export function GamesTablePlaceholder({
  pagination,
  onRetry,
}: {
  /** The page's own pagination row: `/games` 40px (h-10), `/best-games` 36px (h-9). */
  pagination: 'h-10' | 'h-9';
  /** Set when the games could not be loaded: the message and "Try again" over the frame. */
  onRetry?: () => void;
}) {
  const failed = Boolean(onRetry);
  return (
    <div className="relative" role={failed ? undefined : 'status'} aria-label={failed ? undefined : 'Loading games'} aria-busy={!failed}>
      <div className={`overflow-x-auto ${failed ? 'opacity-30' : ''}`} aria-hidden="true">
        <table className="w-full table-fixed min-w-[500px]">
          <GamesTableHead />
          <tbody>
            {Array.from({ length: GAMES_PER_PAGE }, (_, i) => (
              <tr key={i} className="border-b border-border/50">
                {[2, 7, 7, 4, 4, 9].map((w, j) => (
                  <td key={j} className={GAME_CELL}>
                    <span className="inline-block h-[0.6em] max-w-full rounded bg-muted align-middle" style={{ width: `${w}ch` }} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={`mt-6 ${pagination}`} aria-hidden="true" />
      {failed && (
        // Placed by inline style: these classes are not in a built page's critical CSS (the message is not in its HTML),
        // so with a late stylesheet it jumped into place (CLS 0.16 measured).
        <div style={{ position: 'absolute', left: 0, right: 0, top: '4rem', display: 'flex', justifyContent: 'center', padding: '0 1rem' }}>
          <div className="rounded-lg border border-border bg-card px-6 py-6 text-center shadow-sm">
            <p className="text-lg text-muted-foreground mb-4">The games could not be loaded.</p>
            <Button onClick={onRetry}>Try again</Button>
            <div className="mt-4">
              <ReportProblemLink surface="load_error" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
