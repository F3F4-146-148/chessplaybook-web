/**
 * The phases row (#374, plan B4): each phase's score on a neutral track filled in its
 * band colour. The old bars painted the rest of the track in the Blunder colour, so a
 * 96 showed a red tail.
 */
import type { Band, ReportView } from './reportView';

const FILL: Record<Band, string> = {
  best: 'bg-move-best',
  excellent: 'bg-move-excellent',
  inaccuracy: 'bg-move-inaccuracy',
  mistake: 'bg-move-mistake',
  blunder: 'bg-move-blunder',
};

export function ReportPhases({ phases, bonus }: { phases: ReportView['phases']; bonus: string | null }) {
  if (phases.length === 0 && !bonus) return null;
  return (
    <div className="flex flex-wrap items-end gap-x-5 gap-y-3" data-report-phases>
      {phases.map(p => (
        <div key={p.name} className="flex min-w-[96px] flex-1 flex-col gap-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{p.name}</span>
            <b className="tabular-nums text-foreground">{Math.round(p.score)}</b>
          </div>
          <div className="h-[5px] overflow-hidden rounded-full bg-muted" aria-hidden>
            <i className={`block h-full rounded-full ${FILL[p.band]}`} style={{ width: `${Math.max(0, Math.min(100, p.score))}%` }} />
          </div>
        </div>
      ))}
      {bonus && <span className="text-xs text-muted-foreground">{bonus}</span>}
    </div>
  );
}
