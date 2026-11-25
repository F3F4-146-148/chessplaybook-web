/**
 * The Game report's puzzles line (#510): the box before the puzzles are made, then what became of
 * them, with "Solve them" opening a run of this game's puzzles on /puzzles (R4: a replay).
 */
import { Link } from 'react-router-dom';
import { Puzzle } from 'lucide-react';
import { logGA4Event } from '@/services/analytics';
import type { ReportPuzzlesState } from './useReportPuzzles';

export function ReportPuzzlesLine({ state, wanted, onWanted, onRetry, className = '' }: {
  state: ReportPuzzlesState;
  wanted: boolean;
  onWanted: (on: boolean) => void;
  onRetry: () => void;
  className?: string;
}) {
  const base = `flex min-w-0 items-center gap-2 text-sm ${className}`;

  if (state.kind === 'idle') {
    return (
      <label className={`${base} cursor-pointer text-muted-foreground`} data-report-puzzles="idle">
        <input
          type="checkbox" checked={wanted} onChange={(e) => onWanted(e.target.checked)}
          className="h-4 w-4 shrink-0 accent-[hsl(var(--primary))]"
        />
        <span className="truncate">Make puzzles from this game</span>
      </label>
    );
  }
  if (state.kind === 'making') {
    return (
      <p className={`${base} text-muted-foreground`} data-report-puzzles="making" aria-live="polite">
        <Puzzle className="h-4 w-4 shrink-0" aria-hidden />
        <span className="truncate">Making puzzles from this game…</span>
      </p>
    );
  }
  if (state.kind === 'saved') {
    const n = state.ids.length;
    return (
      <p className={base} data-report-puzzles="saved" aria-live="polite">
        <Puzzle className="h-4 w-4 shrink-0 text-link" aria-hidden />
        <span className="truncate">{n} {n === 1 ? 'puzzle' : 'puzzles'} from this game.</span>
        <Link
          to={`/puzzles?run=game&game=${state.hash}`}
          onClick={() => logGA4Event({ name: 'report_puzzles_solve_clicked', params: { puzzles: n } })}
          className="shrink-0 font-medium text-link underline-offset-2 hover:underline"
        >
          Solve {n === 1 ? 'it' : 'them'}
        </Link>
      </p>
    );
  }
  if (state.kind === 'none') {
    return (
      <p className={`${base} text-muted-foreground`} data-report-puzzles="none">
        <Puzzle className="h-4 w-4 shrink-0" aria-hidden />
        <span className="truncate" title={state.text}>{state.text}</span>
      </p>
    );
  }
  if (state.kind === 'limit') {
    return (
      <p className={`${base} text-muted-foreground`} data-report-puzzles="limit">
        <Puzzle className="h-4 w-4 shrink-0" aria-hidden />
        <span className="truncate">No puzzles today: the free plan&apos;s limit is reached.</span>
        <Link to="/premium" className="shrink-0 font-medium text-link underline-offset-2 hover:underline">Premium</Link>
      </p>
    );
  }
  return (
    <p className={`${base} text-muted-foreground`} data-report-puzzles="failed">
      <Puzzle className="h-4 w-4 shrink-0" aria-hidden />
      <span className="truncate">The puzzles could not be made.</span>
      <button type="button" onClick={onRetry} className="shrink-0 font-medium text-link underline-offset-2 hover:underline">
        Try again
      </button>
    </p>
  );
}
