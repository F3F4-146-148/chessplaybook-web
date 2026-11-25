import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { ChevronDown } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { FullGameAnalysis } from '@/services/GameAnalysisService';
import type { ChessGame } from '@/types/chess';
import type { GameSummaryResult } from './useGameReview';
import { buildReportView, type ClassKey } from './reportView';
import { ReportHeader } from './ReportHeader';
import { ReportGraph } from './ReportGraph';
import { ReportSummary } from './ReportSummary';
import { MoveClassTable } from './MoveClassTable';
import { ReportPhases } from './ReportPhases';

/**
 * The Game report, in a dialog (#374, layout B, chosen by the owner on the mockup).
 *
 * ONE SURFACE: the dialog is the card, with no cards inside it. In order: the
 * scoreboard header, the graph, the summary when the server wrote one, the moves table,
 * the phases. 680px wide from `sm`; it scrolls inside when it must.
 *
 * Every jump (the graph, the turning-point button, a move in an opened row) is a GRAPH
 * POSITION (0 = the start, plies played), as `onMoveClick` always took, and closes the
 * dialog so the reader lands on the board.
 *
 * FOCUS returns to the Game report button however the dialog closes (a jump, Escape,
 * the close button, a click outside): the dialog is controlled and its button is not a
 * Radix trigger, so nothing did that before.
 */
const GRAPH_DOTS: ClassKey[] = ['brilliant', 'inaccuracy', 'mistake', 'blunder', 'severe_blunder'];

export function GameReportDialog({
  open, onOpenChange, analysis, summary, moveIndex, onMoveClick, metadata, sans, gameResult, returnFocusTo, puzzles,
}: {
  /** #510: the puzzles line (made, being made, or none), under the graph. */
  puzzles?: ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  analysis: FullGameAnalysis | null;
  summary: GameSummaryResult | null;
  /** The position the board is on (plies played, 0 = the start). */
  moveIndex: number;
  onMoveClick: (moveIndex: number) => void;
  metadata?: ChessGame;
  /** The game's moves in SAN, in order. */
  sans: string[];
  gameResult: 'white' | 'black' | 'draw';
  /** Where focus goes when the dialog closes. */
  returnFocusTo?: RefObject<HTMLElement>;
}) {
  const goTo = (index: number) => { onMoveClick(index); onOpenChange(false); };

  /* MORE BELOW (owner, 2026-11-19): when the report goes on past the dialog's edge, a fade
     and a chevron at the foot say so; pressing it scrolls on. Gone at the end. On Windows a
     scrollbar shows too, but a Mac or a phone hides it until used. */
  const contentRef = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);
  const measureMore = useCallback(() => {
    const el = contentRef.current;
    setMore(!!el && el.scrollHeight - el.scrollTop - el.clientHeight > 12);
  }, []);
  useEffect(() => {
    if (!open) return;
    const el = contentRef.current;
    const t = window.setTimeout(measureMore, 50);
    if (!el || typeof ResizeObserver === 'undefined') return () => window.clearTimeout(t);
    const ro = new ResizeObserver(measureMore);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => { window.clearTimeout(t); ro.disconnect(); };
  }, [open, measureMore, analysis, summary]);
  const view = useMemo(
    () => (analysis ? buildReportView({ analysis, summary, metadata, sans, gameResult }) : null),
    [analysis, summary, metadata, sans, gameResult],
  );
  const dots = useMemo(
    () => (analysis?.classifiedMoves ?? [])
      .filter(m => (GRAPH_DOTS as string[]).includes(m.classification))
      .map(m => ({ position: m.moveIndex + 1, key: m.classification as ClassKey })),
    [analysis],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        ref={contentRef}
        onScroll={measureMore}
        className="max-h-[85dvh] max-w-[calc(100vw-16px)] gap-0 overflow-y-auto bg-popover p-[18px] sm:max-w-[680px] sm:p-[26px]"
        /* Open on the dialog itself, not its first focusable element: that is now the
           graph, which would open with a focus outline and a marked point. */
        onOpenAutoFocus={e => { e.preventDefault(); (e.currentTarget as HTMLElement | null)?.focus(); }}
        tabIndex={-1}
        onCloseAutoFocus={e => {
          if (returnFocusTo?.current) { e.preventDefault(); returnFocusTo.current.focus(); }
        }}
        data-game-report
      >
        <DialogHeader className="space-y-0 text-left">
          <DialogTitle className="text-lg">Game report</DialogTitle>
          <DialogDescription className="sr-only">
            Accuracy, the evaluation through the game, the summary, and the moves by quality.
          </DialogDescription>
        </DialogHeader>
        {view && analysis && (
          <div className="mt-3.5 flex min-w-0 flex-col">
            <ReportHeader view={view} />
            <div className="mt-4">
              <div className="hidden sm:block">
                <ReportGraph evals={analysis.evalGraph} phases={view.phases} dots={dots} currentPosition={moveIndex}
                  onMoveClick={goTo} sans={sans} height={120} />
              </div>
              <div className="sm:hidden">
                <ReportGraph evals={analysis.evalGraph} phases={view.phases} dots={dots} currentPosition={moveIndex}
                  onMoveClick={goTo} sans={sans} height={96} />
              </div>
            </div>
            {puzzles && <div className="mt-3.5" data-report-puzzles-in-dialog>{puzzles}</div>}
            {summary && (
              <>
                <div className="mt-[18px]"><ReportSummary summary={summary} critical={view.critical} onMoveClick={goTo} /></div>
                <div className="mt-[18px] h-px bg-border" aria-hidden />
              </>
            )}
            <div className="mt-4"><MoveClassTable classes={view.classes} onMoveClick={goTo} /></div>
            <div className="mt-4 h-px bg-border" aria-hidden />
            <div className="mt-3.5"><ReportPhases phases={view.phases} bonus={view.bonus} /></div>
          </div>
        )}
        {more && (
          <div className="pointer-events-none sticky bottom-0 -mx-[18px] -mb-[18px] h-0 sm:-mx-[26px] sm:-mb-[26px]" aria-hidden data-report-more>
            <div className="absolute inset-x-0 bottom-0 flex h-9 items-end justify-center bg-gradient-to-t from-popover to-transparent pb-1.5">
              <button
                type="button"
                tabIndex={-1}
                onClick={() => contentRef.current?.scrollBy({ top: contentRef.current.clientHeight * 0.7, behavior: 'smooth' })}
                className="pointer-events-auto inline-flex min-h-[28px] items-center gap-1 rounded-full border border-border-strong bg-popover px-3 text-xs text-muted-foreground shadow hover:text-foreground"
              >
                More below <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
