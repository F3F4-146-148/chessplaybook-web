import { useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { CalendarCheck, UserPlus, Volume2, VolumeX } from 'lucide-react';
import { logGA4Event } from '@/services/analytics';
import { useMasterVoice } from '@/features/master/useMasterVoice';
import { SittingChart, useBox } from './ProgressMomentCard';
import { RatingChange } from './RatingChange';
import { daySummaryVoiceLines, type DaySummary } from '../lib/daySummary';

/**
 * THE DAY'S SUMMARY (#418 v3 C2, owner 2026-11-27): when a free player's puzzles for the day are over, this card takes
 * the "What to train" slot, on every window (it replaces the card, so it needs no extra room).
 *
 * - Today's rating and its SIGNED change, the day's graph; no trophy and no goal line (the reviews: v2's card printed
 *   an up arrow and "+{gain}", which reads "+-12" on a down day, the commoner day).
 * - The Master's lines (server-composed, `dayEndCompose.ts`) as text in this card, all readable at once, the one he is
 *   saying marked while his voice plays (when it is on). They live HERE, not in the live card: the live card shows
 *   the ask at the same time (owner: the same screen), and the ask replaces that card's captions and his face.
 * - A guest is offered an account, in v2's words (owner).
 * - Shown however the day's last puzzle ended; kept through the ask and a reload (the server replays it with every
 *   refused puzzle).
 */

let shownDay: string | null = null;

export function DaySummaryCard({ summary, offerAccount = false }: { summary: DaySummary; offerAccount?: boolean }) {
  const points = summary.points;
  const hasGraph = points.length >= 2;
  const now = hasGraph ? points[points.length - 1] : null;
  const [chartRef, box] = useBox<HTMLDivElement>();
  /* Keyed by what the summary SAYS, never by the object (owner, 2026-11-27: he started again on every move stepped
     through after the ask). Under the ask the page rebuilds the summary from the refused puzzle's answer on every
     render, and the voice starts over on any new value: so an equal summary must give the same lines. */
  const linesKey = `${summary.day}|${summary.lines.map((l) => l.key).join(',')}`;
  const lines = useMemo(() => daySummaryVoiceLines(summary), [linesKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const voice = useMasterVoice(lines);
  const cardRef = useRef<HTMLDivElement>(null);

  /* GA4 when the card is actually seen, once a day per tab (the reviews: v2 logged on mount). */
  useEffect(() => {
    const el = cardRef.current;
    if (!el || shownDay === summary.day) return;
    const fire = () => {
      if (shownDay === summary.day) return;
      shownDay = summary.day;
      logGA4Event({ name: 'puzzle_moment_shown', params: {
        kind: 'day_end', why: summary.shape, returning: false, voice_on: voice.on, lines: summary.lines.length,
      } });
    };
    if (typeof IntersectionObserver === 'undefined') { fire(); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { fire(); io.disconnect(); } }, { threshold: 0.5 });
    io.observe(el);
    return () => io.disconnect();
  }, [summary.day, summary.shape, summary.lines.length, voice.on]);

  return (
    <>
      <span className="card-label inline-flex items-center gap-[0.35em]">
        <CalendarCheck />
        {summary.heading}
        <button
          type="button"
          onClick={voice.toggle}
          className="ml-auto text-muted-foreground hover:text-foreground"
          aria-label={voice.on ? 'Mute the Master' : 'Hear the Master'}
          data-testid="day-summary-voice"
        >
          {voice.on ? <Volume2 className="w-[1em] h-[1em]" /> : <VolumeX className="w-[1em] h-[1em]" />}
        </button>
      </span>
      <div ref={cardRef} className="card-body" data-testid="day-summary" data-day-shape={summary.shape}>
        {now != null && (
          <div className="flex items-baseline gap-[0.5em] text-[length:var(--card-type,14px)]">
            <span className="text-muted-foreground">Today</span>
            <span className="font-semibold tabular-nums">{now}</span>
            <RatingChange points={points} />
            <span className="ml-auto text-muted-foreground tabular-nums">
              {summary.solved} of {summary.attempts} solved
            </span>
          </div>
        )}
        {hasGraph && (
          <div ref={chartRef} className="card-fill relative min-h-[3em]">
            {box.w > 0 && box.h > 0 && (
              <div className="absolute inset-0">
                <SittingChart points={points} w={box.w} h={box.h} compact={box.h < 70}
                  label={`Your rating today, from ${points[0]} to ${now}`} />
              </div>
            )}
          </div>
        )}
        <div className="flex flex-col gap-[0.2em] text-[length:var(--card-type,14px)]" data-testid="day-summary-lines">
          {summary.lines.map((l, i) => (
            <p key={l.key} className={voice.speaking && voice.lineIndex === i ? 'text-foreground' : 'text-foreground/85'}>
              {l.text}
            </p>
          ))}
        </div>
        {offerAccount && now != null && (
          <Link
            to={`/signup?returnTo=${encodeURIComponent('/puzzles')}`}
            className="moment-offer"
            onClick={() => logGA4Event({ name: 'puzzle_moment_signup', params: { kind: 'day_end', rating: now } })}
          >
            <UserPlus style={{ width: '1em', height: '1em' }} aria-hidden />
            Create a free account to keep your {now} rating.
          </Link>
        )}
      </div>
    </>
  );
}

export default DaySummaryCard;
