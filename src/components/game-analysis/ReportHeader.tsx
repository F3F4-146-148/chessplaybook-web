/**
 * The Game report's scoreboard header (#374, plan B1): both players by name, each
 * player's accuracy in large figures and the result, with the Game rating in a ring
 * between them. On a phone, the two players side by side, then the ring.
 */
import type { Band, ReportPlayer, ReportView } from './reportView';

const ARC: Record<Band, string> = {
  best: 'stroke-move-best',
  excellent: 'stroke-move-excellent',
  inaccuracy: 'stroke-move-inaccuracy',
  mistake: 'stroke-move-mistake',
  blunder: 'stroke-move-blunder',
};

function Player({ player, side }: { player: ReportPlayer; side: 'white' | 'black' }) {
  const right = side === 'black';
  const chip = (
    <span
      aria-hidden
      className={`h-[13px] w-[13px] shrink-0 rounded-full border border-border-strong ${side === 'white' ? 'bg-board-ink-light' : 'bg-board-ink-dark'}`}
    />
  );
  return (
    <div className={`flex min-w-0 flex-col gap-0.5 ${right ? 'items-end text-right' : ''}`} data-report-player={side}>
      <div className="flex min-w-0 max-w-full items-center gap-1.5 text-[15px] font-semibold">
        {!right && chip}
        <span className="truncate" title={player.name}>{player.name}</span>
        {right && chip}
      </div>
      <div className="text-[30px] font-bold leading-none tabular-nums tracking-tight">
        {player.accuracy.toFixed(1)}
        <span className="ml-px text-[15px] font-semibold text-muted-foreground">%</span>
      </div>
      <div className="text-[11px] uppercase tracking-[0.07em] text-muted-foreground">
        <span className="sr-only">{side === 'white' ? 'White' : 'Black'}: </span>Accuracy · {player.outcome}
      </div>
    </div>
  );
}

function Ring({ rating, size }: { rating: ReportView['rating']; size: number }) {
  const r = size / 2 - 5;
  const c = 2 * Math.PI * r;
  const f = Math.max(0, Math.min(1, rating.value / 100));
  return (
    <div className="flex flex-col items-center" data-report-rating>
      <div
        className="relative grid place-items-center"
        style={{ width: size, height: size }}
        role="img"
        aria-label={`Game rating ${rating.value.toFixed(1)}, ${rating.label}`}
      >
        <svg width={size} height={size} className="absolute inset-0" aria-hidden>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" className="stroke-muted" strokeWidth={6} />
          <circle
            cx={size / 2} cy={size / 2} r={r} fill="none" className={ARC[rating.band]} strokeWidth={6} strokeLinecap="round"
            strokeDasharray={`${(c * f).toFixed(1)} ${c.toFixed(1)}`} transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </svg>
        <div className="text-center" aria-hidden>
          <div className="text-[26px] font-bold leading-none tabular-nums">{rating.rounded}</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">{rating.label}</div>
        </div>
      </div>
      <div className="mt-1 text-[9.5px] uppercase tracking-[0.08em] text-muted-foreground" aria-hidden>Game rating</div>
    </div>
  );
}

export function ReportHeader({ view }: { view: ReportView }) {
  return (
    <div className="grid grid-cols-2 items-center gap-x-3 gap-y-3 sm:grid-cols-[1fr_auto_1fr]" data-report-header>
      <Player player={view.white} side="white" />
      <div className="col-span-2 row-start-2 flex justify-center sm:col-span-1 sm:col-start-2 sm:row-start-1">
        <div className="sm:hidden"><Ring rating={view.rating} size={84} /></div>
        <div className="hidden sm:block"><Ring rating={view.rating} size={92} /></div>
      </div>
      <div className="col-start-2 row-start-1 sm:col-start-3"><Player player={view.black} side="black" /></div>
    </div>
  );
}
