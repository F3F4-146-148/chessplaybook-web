/**
 * The Game report's evaluation graph (#374, plan A4 and A5). Replaces `EvalGraph`
 * inside the report (the old file stays until the switch, plan B5/C2).
 *
 * DRAWN IN PIXELS, NOT STRETCHED. The old graph drew a 1000x250 viewBox into a box of
 * another shape, so it kept its own shape and drew at less than half its box, with
 * dots shrinking to about 1.4px on a phone. Here a ResizeObserver gives the width and
 * the drawing uses it, so the graph fills its box and the dots stay round at 8px.
 *
 * COLOURS ARE ROLES: `graph-white`, `graph-black`, `graph-axis`, the `move-*` roles
 * for the dots, `link` for the current move; every mark has a `popover` ring so it
 * stands out from both areas (contrast.test.ts, "the report graph").
 *
 * THE SCALE IS UNCHANGED (content): a logistic squeeze whose constant follows the game
 * (between 2.5 and 4 pawns). An advantage of that size reaches about halfway to the
 * edge, and the edge is near 10 pawns.
 *
 * INTERACTION (plan A5):
 *   - mouse: hover shows the value; a click goes to that move (as before);
 *   - touch: a tap marks the point and shows the value with a "Go to move" button,
 *     which goes there. A tap no longer jumps at once, so a phone can read values;
 *   - keyboard: focus the graph, arrows move the mark, Home/End go to the ends, Enter
 *     goes to the marked move.
 * Positions count from 0 (the start); position p is the position after move p - 1.
 */
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ClassKey, ReportPhase } from './reportView';

export interface GraphDot { position: number; key: ClassKey }

const DOT_FILL: Partial<Record<ClassKey, string>> = {
  brilliant: 'hsl(var(--move-brilliant))',
  inaccuracy: 'hsl(var(--move-inaccuracy))',
  mistake: 'hsl(var(--move-mistake))',
  blunder: 'hsl(var(--move-blunder))',
  severe_blunder: 'hsl(var(--move-severe-blunder))',
};

/** "After 17. Nd4" / "After 17... Nd4" / "Start". */
export function positionLabel(position: number, sans?: string[]): string {
  if (position <= 0) return 'Start';
  const mi = position - 1;
  const n = Math.floor(mi / 2) + 1;
  const san = sans?.[mi];
  return `After ${n}${mi % 2 === 0 ? '.' : '...'}${san ? ` ${san}` : ''}`;
}

export function evalText(cp: number): string {
  if (Math.abs(cp) >= 9000) return cp > 0 ? 'White mates' : 'Black mates';
  return `${cp >= 0 ? '+' : ''}${(cp / 100).toFixed(2)}`;
}

/** The go-to label for a position: "Go to move 17" or "Go to the start". */
export function goToLabel(position: number): string {
  return position <= 0 ? 'Go to the start' : `Go to move ${Math.floor((position - 1) / 2) + 1}`;
}

export function ReportGraph({
  evals, phases, dots, currentPosition, onMoveClick, height = 120, sans,
}: {
  evals: number[];
  phases: ReportPhase[];
  dots: GraphDot[];
  /** The position the board is on. */
  currentPosition: number;
  onMoveClick: (position: number) => void;
  height?: number;
  sans?: string[];
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const last = Math.max(1, evals.length - 1);
  const clipId = useId();

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const read = () => setWidth(el.clientWidth);
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const sigmoid = useMemo(() => {
    const rawMax = evals.length ? Math.max(...evals.map(cp => Math.abs(cp))) : 0;
    const effectiveMax = Math.max(Math.min(rawMax, 400), 250);
    return (cp: number) => {
      const c = Math.max(-1000, Math.min(1000, cp));
      return 2 / (1 + Math.exp(-c / effectiveMax)) - 1;
    };
  }, [evals]);

  const mid = height / 2;
  const x = useCallback((p: number) => (p / last) * width, [last, width]);
  const y = useCallback((cp: number) => mid - sigmoid(cp) * (mid - 3), [mid, sigmoid]);

  const whiteArea = useMemo(() => {
    if (!width || evals.length === 0) return '';
    const pts = evals.map((cp, i) => `${x(i).toFixed(1)},${y(cp).toFixed(1)}`).join(' ');
    return `${pts} ${width.toFixed(1)},${height} 0,${height}`;
  }, [evals, width, height, x, y]);

  /* The marked point: a tap (touch) or the keyboard sets it; null when none. */
  const [mark, setMark] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [touchMarked, setTouchMarked] = useState(false);
  useEffect(() => { setMark(null); setTouchMarked(false); }, [currentPosition]);

  const posAt = (clientX: number, rect: DOMRect) =>
    Math.max(0, Math.min(last, Math.round(((clientX - rect.left) / rect.width) * last)));

  const shown = hover ?? mark;
  const marker = mark ?? currentPosition;

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.pointerType === 'mouse') return;
    const p = posAt(e.clientX, e.currentTarget.getBoundingClientRect());
    setMark(p);
    setTouchMarked(true);
  };
  const onClick = (e: React.MouseEvent<SVGSVGElement>) => {
    // A touch tap also fires click; pointer type is not on MouseEvent, so a mark set
    // by the pointer-down of a touch means the click came from that tap.
    if (touchMarked) return;
    onMoveClick(posAt(e.clientX, e.currentTarget.getBoundingClientRect()));
  };
  const onKeyDown = (e: React.KeyboardEvent<SVGSVGElement>) => {
    const from = mark ?? currentPosition;
    let next: number | null = null;
    if (e.key === 'ArrowRight') next = Math.min(last, from + 1);
    else if (e.key === 'ArrowLeft') next = Math.max(0, from - 1);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = last;
    else if (e.key === 'Enter') { e.preventDefault(); onMoveClick(from); return; }
    if (next === null) return;
    e.preventDefault();
    setMark(next);
  };

  const captions = phases.length > 1 || phases.some(p => p.from > 0 || p.to < last);
  const tipLeft = shown === null ? 0 : Math.min(88, Math.max(12, (shown / last) * 100));

  return (
    <div className="flex flex-col gap-1">
      {captions && (
        <div className="flex text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground" aria-hidden>
          {phases.map((ph, i) => (
            <span
              key={ph.name}
              data-phase-caption={ph.name}
              className={`overflow-hidden whitespace-nowrap ${i > 0 ? 'border-l border-border pl-1.5' : ''}`}
              style={{ width: `${((ph.to - ph.from) / last) * 100}%` }}
            >
              {ph.name}
            </span>
          ))}
        </div>
      )}
      {/* The hairline edge: in light theme White's area is the dialog's own white. */}
      <div ref={wrapRef} className="relative w-full rounded-md border border-border" style={{ height: height + 2 }}>
        {width > 0 && (
          <svg
            width={width}
            height={height}
            className="block cursor-pointer touch-manipulation rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            role="img"
            tabIndex={0}
            aria-label="Evaluation graph. Arrow keys move along the game, Enter goes to the move."
            data-report-graph
            onPointerDown={onPointerDown}
            onPointerMove={e => { if (e.pointerType === 'mouse') setHover(posAt(e.clientX, e.currentTarget.getBoundingClientRect())); }}
            onPointerLeave={e => { if (e.pointerType === 'mouse') setHover(null); }}
            onClick={onClick}
            onKeyDown={onKeyDown}
            onBlur={() => { if (!touchMarked) setMark(null); }}
          >
            <defs>
              <clipPath id={clipId}><rect width={width} height={height} rx={6} ry={6} /></clipPath>
            </defs>
            <g clipPath={`url(#${clipId})`}>
              <rect width={width} height={height} fill="hsl(var(--graph-black))" />
              <polygon points={whiteArea} fill="hsl(var(--graph-white))" />
              <line x1={0} x2={width} y1={mid} y2={mid} stroke="hsl(var(--graph-axis))" strokeWidth={1} />
              {phases.slice(1).map(ph => (
                <line key={ph.name} data-phase-line={ph.name} x1={x(ph.from)} x2={x(ph.from)} y1={0} y2={height}
                  stroke="hsl(var(--graph-axis))" strokeWidth={1} strokeDasharray="3 3" />
              ))}
              <line x1={x(marker)} x2={x(marker)} y1={0} y2={height} stroke="hsl(var(--popover))" strokeWidth={4} />
              <line data-graph-marker x1={x(marker)} x2={x(marker)} y1={0} y2={height} stroke="hsl(var(--link))" strokeWidth={2} />
              {dots.map(d => DOT_FILL[d.key] && evals[d.position] !== undefined && (
                <circle key={`${d.position}-${d.key}`} data-graph-dot={d.key} cx={x(d.position)} cy={y(evals[d.position])} r={4}
                  fill={DOT_FILL[d.key]} stroke="hsl(var(--popover))" strokeWidth={1.5} />
              ))}
            </g>
          </svg>
        )}
        {shown !== null && evals[shown] !== undefined && (
          <div
            className="pointer-events-none absolute top-1.5 -translate-x-1/2 whitespace-nowrap rounded border border-border-strong bg-popover px-1.5 py-0.5 text-[11px] tabular-nums text-popover-foreground"
            style={{ left: `${tipLeft}%` }}
            data-graph-label
          >
            {positionLabel(shown, sans)} · {evalText(evals[shown])}
          </div>
        )}
        {touchMarked && mark !== null && (
          <button
            type="button"
            className="absolute bottom-1.5 min-h-[32px] -translate-x-1/2 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground shadow"
            style={{ left: `${Math.min(80, Math.max(20, (mark / last) * 100))}%` }}
            onClick={() => onMoveClick(mark)}
            data-graph-goto
          >
            {goToLabel(mark)}
          </button>
        )}
      </div>
    </div>
  );
}
