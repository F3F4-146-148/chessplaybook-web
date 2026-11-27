import { useLayoutEffect, useState } from 'react';
import { useBox } from './ProgressMomentCard';
import type { Allowance } from '../services/puzzleAllowance';
import type { DaysInARow, SessionFigures } from '../lib/daySummary';

/**
 * THE FOOT OF "YOUR RECORD" (#418, owner 2026-11-27), in the card's empty bottom on desktop.
 *
 * 1. A free player: today's free puzzles left, as five dots ("3 of 5 free puzzles left today").
 *    A Premium player: this session's performance rating (the run's formula, from the 5th rated result).
 * 2. Under it, where it fits: the days in a row, with the last seven days as dots (today last).
 *
 * Measured first (`scripts/measure-what-to-train-space.mjs <base> "your record"`): desktop windows leave 72-334 px under
 * the card's stats; 800x600, 960 wide and every stacked layout leave 14-51 px, because a stacked card is as tall as
 * what it holds. Owner: phones get nothing. So, like `TodayGraph`, the block takes the card's LEFTOVER height
 * (`card-fill`), draws absolutely positioned inside it, and draws a part only where the whole part fits: the card is
 * never resized by what arrives, and nothing is ever cut.
 *
 * "Days in a row", never "streak": the card already has Streak and Best streak, which count puzzles solved in a row.
 */

/** Heights in the card's own type (`--card-type`): a line of text, then a row of dots, with their gap. */
const PART_EM = 2.6;
const GAP_EM = 0.9;

function Dots({ on, label }: { on: boolean[]; label?: string }) {
  return (
    <div className="flex items-center gap-[0.4em]" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      {on.map((filled, i) => (
        <span
          key={i}
          className={`inline-block w-[0.7em] h-[0.7em] rounded-full ${filled ? 'bg-primary' : 'border border-muted-foreground/60'}`}
        />
      ))}
    </div>
  );
}

export interface RecordFootProps {
  /** The page's allowance answer: undefined while it is not known, null for Premium (no daily limit). */
  allowance: Allowance | null | undefined;
  session: SessionFigures | null | undefined;
  days: DaysInARow | null | undefined;
}

export function RecordFoot({ allowance, session, days }: RecordFootProps) {
  const [ref, box] = useBox<HTMLDivElement>();
  const [em, setEm] = useState(0);
  useLayoutEffect(() => {
    if (ref.current) setEm(parseFloat(getComputedStyle(ref.current).fontSize) || 0);
  }, [ref, box.h, box.w]);

  const fits = (parts: number) => em > 0 && box.w > 0 && box.h >= em * (parts * PART_EM + (parts - 1) * GAP_EM);

  let first: JSX.Element | null = null;
  if (allowance) {
    const left = Math.max(0, Math.min(allowance.left, allowance.limit));
    first = (
      <div className="flex flex-col gap-[0.3em]" data-testid="record-free-left">
        <p className="leading-tight">{left} of {allowance.limit} free puzzles left today</p>
        <Dots on={Array.from({ length: allowance.limit }, (_, i) => i < left)} />
      </div>
    );
  } else if (allowance === null && session) {
    first = (
      <div className="flex flex-col gap-[0.15em]" data-testid="record-performance">
        <p className="leading-tight text-muted-foreground">Performance this session</p>
        {session.performance != null ? (
          <p className="leading-tight">
            <span className="font-semibold tabular-nums">{/* no thousands separator: the card's own Rating reads "1200" */}{session.performance}</span>
            <span className="text-muted-foreground"> · over {session.scored} puzzles</span>
          </p>
        ) : (
          <p className="leading-tight text-muted-foreground">after 5 puzzles ({session.scored} so far)</p>
        )}
      </div>
    );
  }

  const second = days ? (
    <div className="flex flex-col gap-[0.3em]" data-testid="record-days">
      <p className="leading-tight">{days.inARow} {days.inARow === 1 ? 'day' : 'days'} in a row</p>
      <Dots on={days.last7} label={`Puzzles on ${days.last7.filter(Boolean).length} of the last 7 days`} />
    </div>
  ) : null;

  const parts = [first, second].filter(Boolean) as JSX.Element[];
  const shown = fits(2) ? parts : fits(1) ? parts.slice(0, 1) : [];

  return (
    <div
      ref={ref}
      className="card-fill relative text-[length:var(--card-type,14px)]"
      data-testid="record-foot"
      data-record-foot={shown.length}
    >
      {shown.length > 0 && (
        <div className="absolute inset-x-0 top-0 flex flex-col gap-[0.9em]">
          {shown}
        </div>
      )}
    </div>
  );
}

export default RecordFoot;
