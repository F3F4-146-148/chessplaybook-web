import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUp, Target, UserPlus } from 'lucide-react';
import { logGA4Event } from '@/services/analytics';
import { FaTrophy } from 'react-icons/fa';
import type { ProgressMoment } from '../lib/progressMoment';

/*
  THE PROGRESS MOMENT (#418, owner 2026-11-22). After a few clean solves the card under the live card shows the
  sitting's graph in the homepage "Your Chess Journey" style, with a cup, until the next puzzle starts; the Master says
  what he saw in the live card. Everything drawn comes from the moment the server sent: the sitting's ratings (the
  start, then one per rated result, a miss included so its dip stays visible), the gain, the next round rating as a
  goal. No button of its own (D4): the live card's Next puzzle is always on screen, on a phone too.

  A NEW ALL-TIME BEST is the bigger version: a larger cup with a shine, "New best", the record point marked.
*/

function nextRound(r: number) { return Math.ceil((r + 1) / 100) * 100; }

/*
  A SMOOTH LINE THAT NEVER LEAVES THE POINTS (monotone cubic, Fritsch-Carlson). The homepage's Catmull-Rom can bulge
  past a point, which on real ratings would draw a high the player never reached.
*/
export function monotonePath(pts: [number, number][]): string {
  const n = pts.length;
  if (n < 2) return n ? `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}` : '';
  const dx: number[] = [], m: number[] = [];
  for (let i = 0; i < n - 1; i++) { dx.push(pts[i + 1][0] - pts[i][0]); m.push((pts[i + 1][1] - pts[i][1]) / dx[i]); }
  const t: number[] = [m[0]];
  for (let i = 1; i < n - 1; i++) t.push(m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2);
  t.push(m[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
    const a = t[i] / m[i], b = t[i + 1] / m[i], s = a * a + b * b;
    if (s > 9) { const k = 3 / Math.sqrt(s); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
  }
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += ` C${(pts[i][0] + h).toFixed(1)},${(pts[i][1] + h * t[i]).toFixed(1)} ${(pts[i + 1][0] - h).toFixed(1)},${(pts[i + 1][1] - h * t[i + 1]).toFixed(1)} ${pts[i + 1][0].toFixed(1)},${pts[i + 1][1].toFixed(1)}`;
  }
  return d;
}

const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function useCountUp(from: number, to: number, ms: number, delay: number, run: boolean) {
  const [v, setV] = useState(() => (reducedMotion() ? to : from));
  useEffect(() => {
    if (reducedMotion()) { setV(to); return; }
    if (!run) return;
    let raf = 0;
    const start = performance.now() + delay;
    const step = (now: number) => {
      const k = Math.min(1, Math.max(0, (now - start) / ms));
      setV(Math.round(from + (to - from) * (1 - (1 - k) ** 3)));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [from, to, ms, delay, run]);
  return v;
}

/*
  IT STARTS WHEN IT IS SEEN (C5): on a phone the card is below the board, so drawn at once it would be over before the
  player scrolled to it. Until half of it is on screen the drawing waits (its CSS animations paused, the count not
  started).
*/
function useSeen<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    if (typeof IntersectionObserver === 'undefined') { setSeen(true); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) setSeen(true); }, { threshold: 0.5 });
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  return [ref, seen] as const;
}

/* Watches its own size: the roomy composition, or the 800x600 one under 70px of height. */
export function useBox<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, box] as const;
}

/*
  A GUEST IS OFFERED AN ACCOUNT under the graph (owner, 2026-11-22: "so they keep the ratings"): the moment a guest has
  something worth keeping. True as said: signing up carries the guest's rating and history to the account
  (linkAnonymous `mergeRatingState`, #237). Back to /puzzles after. Never to a signed-in player, nor while sign-in is
  still being read (it would flash for a player who has an account).
*/
export function ProgressMomentCard({ moment, offerAccount = false }: { moment: ProgressMoment; offerAccount?: boolean }) {
  const points = moment.points;
  const startR = points[0], now = points[points.length - 1], gain = now - startR;
  const goal = nextRound(now);
  const best = moment.kind === 'best';
  const [seenRef, seen] = useSeen<HTMLDivElement>();
  const shown = useCountUp(startR, now, 1100, 250, seen);
  const [chartRef, box] = useBox<HTMLDivElement>();
  const compact = box.h > 0 && box.h < 70;

  return (
    <>
      <span className={`card-label inline-flex items-center gap-[0.35em]${best ? ' moment-best' : ''}`}>
        <FaTrophy className="moment-cup" style={{ color: 'hsl(var(--gold-top))' }} aria-hidden />
        {moment.heading}
      </span>
      <div ref={seenRef} className={`card-body moment-body${seen ? '' : ' moment-waiting'}`} data-moment-kind={moment.kind}>
        <div className="moment-grid">
          <div className="moment-stats">
            <div className="moment-rating tabular-nums" aria-label={`Rating ${now}`}>{shown.toLocaleString('en-US')}</div>
            <div className="moment-gain">
              <ArrowUp style={{ width: '0.9em', height: '0.9em' }} aria-hidden />+{gain} this sitting
            </div>
            {!compact && (
              <div className="moment-goal">
                <Target style={{ width: '0.9em', height: '0.9em' }} aria-hidden />
                {goal.toLocaleString('en-US')} is {goal - now} away
              </div>
            )}
          </div>
          <div ref={chartRef} className="moment-chart">
            {box.w > 0 && <SittingChart points={points} goal={goal} w={box.w} h={box.h} compact={compact} best={best} />}
          </div>
        </div>
        {offerAccount && (
          <Link
            to={`/signup?returnTo=${encodeURIComponent('/puzzles')}`}
            className="moment-offer"
            onClick={() => logGA4Event({ name: 'puzzle_moment_signup', params: { kind: moment.kind, rating: now } })}
          >
            <UserPlus style={{ width: '1em', height: '1em' }} aria-hidden />
            Create a free account to keep your {now.toLocaleString('en-US')} rating.
          </Link>
        )}
      </div>
    </>
  );
}

/**
 * The rating line in the homepage's gold style. `goal` (v2's next round rating) is optional: the day's graph and
 * summary (#418 v3) draw none, since a goal line on a down day reads as a reproach. `label` is the chart's spoken name.
 */
export function SittingChart({ points, goal = null, w, h, compact, best = false, label, endLabel }: {
  points: number[]; goal?: number | null; w: number; h: number; compact: boolean; best?: boolean; label?: string; endLabel?: string;
}) {
  const gradientId = `moment-area-${useId().replace(/:/g, '')}`;
  const PX = compact ? 6 : 10, TOP = compact ? 6 : 12, BOTTOM = compact ? 4 : 16;
  const max = Math.max(goal ?? -Infinity, ...points);
  // a floor on the range, so +2 cannot look like +100
  const span = Math.max(60, max - Math.min(...points));
  const lo = Math.min(Math.min(...points), max - span);
  const y = (r: number) => TOP + (1 - (r - lo) / (max - lo)) * (h - TOP - BOTTOM);
  const x = (i: number) => PX + (i * (w - 2 * PX)) / (points.length - 1);
  const pts = points.map((r, i) => [x(i), y(r)] as [number, number]);
  const line = monotonePath(pts);
  const baseY = h - BOTTOM;
  const last = pts[pts.length - 1];
  const startY = y(points[0]);
  const goalY = goal == null ? null : y(goal);

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ width: w, height: h, overflow: 'visible' }} role="img"
      aria-label={label ?? `Your rating this sitting, from ${points[0]} to ${points[points.length - 1]}`}>
      <defs>
        <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.32" />
          <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* the goal: the next round rating (v2 only) */}
      {goalY != null && <line x1={PX} x2={w - PX} y1={goalY} y2={goalY} stroke="hsl(var(--link))" strokeWidth="1" strokeDasharray="4 4" opacity="0.7" />}
      {/* where the sitting started */}
      <line x1={PX} x2={w - PX} y1={startY} y2={startY} stroke="hsl(var(--border))" strokeWidth="1" />
      {!compact && (
        <>
          <text x={PX} y={h - 2} fontSize="11" fill="hsl(var(--foreground) / 0.7)">Start</text>
          <text x={w - PX} y={h - 2} fontSize="11" textAnchor="end" fill="hsl(var(--link))">{endLabel ?? (best ? 'Best' : 'Now')}</text>
        </>
      )}
      <path d={`${line} L${last[0]},${baseY} L${pts[0][0]},${baseY} Z`} fill={`url(#${gradientId})`} className="moment-area" />
      <path d={line} pathLength={1} className="moment-line v2-line-glow" fill="none" stroke="hsl(var(--primary))" strokeWidth={compact ? 1.75 : 2.25} strokeLinecap="round" />
      {pts.map(([px, py], i) => {
        const isLast = i === pts.length - 1;
        return (
          <g key={i} className="moment-dot" style={{ animationDelay: `${250 + (1100 * i) / (pts.length - 1)}ms` }}>
            {isLast && <circle cx={px} cy={py} r={compact ? 8 : 12} fill="hsl(var(--primary))" className="v2-pulse" opacity="0.3" />}
            {isLast && best && <circle cx={px} cy={py} r={compact ? 6 : 9} fill="none" stroke="hsl(var(--gold-top))" strokeWidth="1.5" />}
            <circle cx={px} cy={py} r={isLast ? (compact ? 4 : 5.5) : (compact ? 2 : 3)} fill="hsl(var(--gold-top))" className={isLast ? 'v2-dot-glow' : ''} />
          </g>
        );
      })}
    </svg>
  );
}

export default ProgressMomentCard;
