/**
 * The summary block (#374, plan B2): the server's paragraphs as the report's lead
 * text (no card, no heading), the critical move as a button, the champion link.
 *
 * The server's closing line ("Check move 20 for the critical moment. Use the position
 * explainer...") is not shown: the button replaces its first sentence, and its second
 * is the same in every report (plan §2, confirmed by the owner at review).
 */
import { ArrowRight } from 'lucide-react';
import type { GameSummaryResult } from './useGameReview';
import type { ReportView } from './reportView';

const LINK = 'w-fit text-[13px] text-link underline decoration-link/40 underline-offset-[3px] hover:decoration-link';
// The games open in a NEW TAB (owner, 2026-11-20): the game and its report stay where they
// are. noopener: the new tab gets no handle on this one (and gtag's linker stays out of it).
const NEW_TAB = { target: '_blank', rel: 'noopener' } as const;
const sideWord = (side: 'white' | 'black') => (side === 'white' ? 'White' : 'Black');

export function ReportSummary({
  summary, critical, onMoveClick,
}: {
  summary: GameSummaryResult;
  critical: ReportView['critical'];
  onMoveClick: (position: number) => void;
}) {
  const paragraphs = summary.summary.split('\n\n').filter(p => p.trim());
  return (
    <div className="flex flex-col gap-2 text-sm leading-relaxed" data-report-summary>
      {paragraphs.map((p, i) => (
        <p key={i} className={`m-0 text-pretty ${i === 0 ? 'text-muted-foreground' : 'text-foreground'}`}>{p}</p>
      ))}
      {/* The critical move and the reference games share ONE row (owner, 2026-11-20: the
          links were made compact so they sit to the right of the button); they wrap under it
          only when the row is too narrow. */}
      {(critical || summary.championLink?.championName) && (
      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-2" data-report-summary-actions>
      {critical && (
          <button
            type="button"
            onClick={() => onMoveClick(critical.position)}
            className="inline-flex min-h-[32px] items-center gap-1.5 rounded-md border border-primary/70 bg-primary/10 px-3 text-[13px] font-semibold text-link hover:bg-primary/20"
            data-report-critical
          >
            {critical.label}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </button>
      )}
      {/* The champion's games in this opening, with the colour they played it with, and the
          champion who met it best from the other colour (owner, 2026-11-19: "how to combat a
          specific opening with white" is instructive). ONE LINE (owner: two full-width links
          made the report look worse): "Games in this opening: Kramnik with Black · Anand with
          White". A report cached before the colour was added keeps its one old link. */}
      {summary.championLink?.championName && (
        summary.championLink.side ? (
          /* Owner, 2026-11-20: "Reference games: White · Black", White first; the champion
             behind each link is in its title and accessible name. */
          <p className="m-0 text-[13px] text-muted-foreground" data-report-champion-links>
            Reference games:{' '}
            {[summary.championLink, summary.counterLink]
              .filter((l): l is NonNullable<typeof l> & { side: 'white' | 'black' } => !!l?.championName && !!l.side)
              .sort((a, b) => (a.side === 'white' ? 0 : 1) - (b.side === 'white' ? 0 : 1))
              .map((l, i) => (
                <span key={l.side}>
                  {i > 0 && <span aria-hidden> · </span>}
                  <a
                    href={l.url}
                    {...NEW_TAB}
                    className={LINK}
                    title={`${l.championName}'s games with ${sideWord(l.side)} in this opening`}
                    aria-label={`${l.championName}'s games with ${sideWord(l.side)} in this opening (opens in a new tab)`}
                  >
                    {sideWord(l.side)}
                  </a>
                </span>
              ))}
          </p>
        ) : (
          <a href={summary.championLink.url} {...NEW_TAB} className={LINK} data-report-champion-links>
            {summary.championLink.championName}&apos;s best games in this opening
          </a>
        )
      )}
      </div>
      )}
    </div>
  );
}
