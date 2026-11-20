/**
 * The moves table (#374, plan B3): one row per move class, White's count and bar on
 * the left, Black's on the right, the bars growing out from the class column.
 *
 * THE CLASS COLUMN IS ALIGNED (owner, on the mockup): the class cell holds a block of
 * fixed width, left-aligned in a centred cell, so every icon starts at the same x,
 * and the arrow that opens a row has its own fixed slot, empty where a row does not
 * open. In the first mockup each row was centred on its own width and the icons
 * zigzagged.
 *
 * ROWS THAT OPEN (idea 2, as approved in the mockup): a class with moves (Brilliant and
 * the errors) opens to both sides' moves of that class, in game order; each is a button
 * that goes to the move.
 */
import { Fragment, useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { MoveClassIcon } from './MoveClassIcon';
import type { ReportClass, ClassKey } from './reportView';

const BAR: Record<ClassKey, string> = {
  brilliant: 'bg-move-brilliant/85',
  best: 'bg-move-best/85',
  excellent: 'bg-move-excellent/85',
  good: 'bg-move-good/85',
  inaccuracy: 'bg-move-inaccuracy/85',
  mistake: 'bg-move-mistake/85',
  blunder: 'bg-move-blunder/85',
  severe_blunder: 'bg-move-severe-blunder/85',
};
/* The bar's track: 64px where there is room, down to 24px on the narrowest phones
   (at 360px wide a fixed 64px made the table 30px wider than the dialog; the guard
   found it). A bar is a share of its track. */
const TRACK = 'clamp(24px, 10vw, 64px)';

function Count({ value, max, keyName, side }: { value: number; max: number; keyName: ClassKey; side: 'white' | 'black' }) {
  const bar = (
    <span className="flex shrink-0" style={{ width: TRACK, justifyContent: side === 'white' ? 'flex-end' : 'flex-start' }} aria-hidden>
      <span className={`h-2 rounded-sm ${BAR[keyName]}`} style={{ width: value ? `max(3px, ${(value / Math.max(1, max)) * 100}%)` : 0 }} />
    </span>
  );
  const n = (
    <span className={`w-6 text-center tabular-nums ${value ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>{value}</span>
  );
  return (
    <div className={`flex items-center gap-1.5 ${side === 'white' ? 'justify-end' : 'justify-start'}`}>
      {side === 'white' ? <>{bar}{n}</> : <>{n}{bar}</>}
    </div>
  );
}

export function MoveClassTable({ classes, onMoveClick }: { classes: ReportClass[]; onMoveClick: (position: number) => void }) {
  const [open, setOpen] = useState<Set<ClassKey>>(new Set());
  const base = useId();
  const max = Math.max(1, ...classes.flatMap(c => [c.white, c.black]));
  const toggle = (k: ClassKey) => setOpen(prev => {
    const next = new Set(prev);
    if (next.has(k)) next.delete(k); else next.add(k);
    return next;
  });

  return (
    <table className="w-full border-collapse text-[13px]" data-report-table>
      <caption className="sr-only">Moves by quality, White and Black</caption>
      <thead>
        <tr className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
          <th scope="col" className="w-[36%] pb-1.5 text-right font-medium">White</th>
          <th scope="col" className="w-[28%] pb-1.5 font-medium">Moves</th>
          <th scope="col" className="w-[36%] pb-1.5 text-left font-medium">Black</th>
        </tr>
      </thead>
      <tbody>
        {classes.map((c, i) => {
          const isOpen = open.has(c.key);
          const movesId = `${base}-${c.key}`;
          const label = (
            <>
              <MoveClassIcon classKey={c.key} />
              <span className="flex-1 whitespace-nowrap text-left text-foreground">{c.name}</span>
              <span className="flex w-3 justify-center text-muted-foreground" aria-hidden>
                {c.openable && <ChevronDown className={`h-3 w-3 transition-transform motion-reduce:transition-none ${isOpen ? 'rotate-180' : ''}`} />}
              </span>
            </>
          );
          return (
            <Fragment key={c.key}>
              {i === 4 && <tr aria-hidden><td colSpan={3} className="h-2.5" /></tr>}
              <tr
                className={c.openable ? 'cursor-pointer hover:bg-muted/60' : ''}
                onClick={c.openable ? () => toggle(c.key) : undefined}
                data-class-row={c.key}
              >
                <td className="h-7"><Count value={c.white} max={max} keyName={c.key} side="white" /></td>
                <th scope="row" className="h-7 font-normal">
                  {c.openable ? (
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      aria-controls={movesId}
                      onClick={e => { e.stopPropagation(); toggle(c.key); }}
                      className="mx-auto flex min-h-[24px] w-[150px] items-center gap-2 rounded-sm"
                      data-class-block
                    >
                      {label}
                    </button>
                  ) : (
                    <div className="mx-auto flex w-[150px] items-center gap-2" data-class-block>{label}</div>
                  )}
                </th>
                <td className="h-7"><Count value={c.black} max={max} keyName={c.key} side="black" /></td>
              </tr>
              {c.openable && (
                <tr id={movesId} hidden={!isOpen} data-class-moves={c.key}>
                  <td colSpan={3} className="pb-2 pt-0.5">
                    <div className="flex flex-wrap justify-center gap-1.5">
                      {c.moves.map(m => (
                        <button
                          key={m.position}
                          type="button"
                          onClick={() => onMoveClick(m.position)}
                          className="min-h-[24px] rounded-full border border-border-strong bg-muted px-2.5 font-mono text-xs text-foreground hover:bg-muted/70"
                          data-move-chip={m.position}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}
