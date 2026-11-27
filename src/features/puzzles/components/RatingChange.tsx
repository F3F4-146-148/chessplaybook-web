import { ArrowDown, ArrowUp } from 'lucide-react';

/**
 * The day's rating change (#418 v3, owner 2026-11-27): green with an arrow up when it rose, red with an arrow down
 * when it fell, plain when level. The colour roles are the site's own (`success`, `destructive`), so both themes keep
 * their contrast; the arrow and the sign say it too, so the colour is never the only signal.
 */
export function RatingChange({ points }: { points: number[] }) {
  const d = points.length >= 2 ? points[points.length - 1] - points[0] : 0;
  const cls = d > 0 ? 'text-success' : d < 0 ? 'text-destructive' : 'text-muted-foreground';
  const label = d > 0 ? `up ${d} today` : d < 0 ? `down ${-d} today` : 'level today';
  return (
    <span className={`inline-flex items-center gap-[0.15em] tabular-nums font-medium ${cls}`} aria-label={label} data-testid="rating-change">
      {d > 0 && <ArrowUp className="w-[0.9em] h-[0.9em]" aria-hidden />}
      {d < 0 && <ArrowDown className="w-[0.9em] h-[0.9em]" aria-hidden />}
      {d > 0 ? `+${d}` : d < 0 ? `−${-d}` : '0'}
    </span>
  );
}

export default RatingChange;
