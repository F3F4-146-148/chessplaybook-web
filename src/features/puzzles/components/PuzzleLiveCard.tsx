import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, ChevronRight, Compass, Eye, Lightbulb, RotateCcw, Signal, Swords, Target, WifiOff, XCircle } from 'lucide-react';
import type { GameCardLines } from '../lib/gamePuzzleSource';
import { Action, LiveStatus } from './TrainerUI';
import { MasterPortrait } from '@/components/master/MasterPortrait';
import { MASTER_LIVE } from '@/design/designFlags';
import { puzzleMasterMoment, puzzleVoiceLine } from './puzzleMasterMoment';
import { MasterVoiceButton } from '@/features/master/MasterVoiceButton';
import { preloadMasterLines, useMasterVoice } from '@/features/master/useMasterVoice';

/**
 * CARD 1 — what is happening on this position, and what to do about it.
 *
 * Written from the trainer's own card rather than lifted out of it, one rule at
 * a time. Every gate below is a defect that shipped once:
 *
 *   - the reveal row is keyed on `playing || failed`, and `failed` is TRANSIENT:
 *     auto-revert returns a solver to `playing` within 700ms, so a row that
 *     unmounted would flicker out and back at the exact moment a frustrated
 *     player is reaching for it. It is rendered and made `inert` instead.
 *   - `inert` ALONE, never with `aria-hidden`. Both were set together and Chrome
 *     refuses the second while the clicked button still holds focus ("Blocked
 *     aria-hidden on an element because its descendant retained focus"), which
 *     leaves the row exposed to assistive technology — the opposite of the
 *     intent. Found in the browser console, 2026-08-13.
 *   - the headline is REPLACED while exploring rather than joined by a second
 *     line: the slot reserves two lines, so writing into it costs nothing, and
 *     anything appended would grow the card.
 *   - difficulty is shown from the start (owner, 2026-08-06), reversing an
 *     earlier rule that withheld it. Recorded as a decision, not a slip.
 *   - signal bars, not a gauge: a gauge is an open arc and reads as a broken
 *     circle at this size.
 *
 * COLOUR LIVES ON THE MARK, NEVER ON THE SENTENCE. The status line used to render
 * in three different hues, one of them a raw Tailwind literal belonging to no
 * palette. The words are `text-foreground` and the icon carries good/bad, which
 * is also more accessible than a coloured sentence.
 */
export interface PuzzleLiveCardProps {
  status: string;
  message: string;
  rating?: number | null;
  prompt?: string | null;
  /**
   * "White to play and win a rook": the side and the goal, from SF (owner,
   * 2026-10-22). It is the starting headline (usePuzzle sets it as `message`),
   * so the detail row stays empty then; once the headline moves on ("Correct so
   * far", "White to move. Keep going.") the goal stays visible in the detail
   * row. When absent, the row keeps the neutral `prompt`.
   */
  opening?: string | null;
  isDailyPuzzle?: boolean;
  /**
   * "Missed on 3 Oct" on a puzzle a "Missed before" run is replaying (#116,
   * owner). After the first puzzle a replay looked exactly like ordinary new
   * puzzles; the badge sits where "Daily Puzzle" does, so it costs no height.
   */
  missedLabel?: string | null;
  exploring: boolean;
  isMidSolve: boolean;
  announcement?: string;
  loading: boolean;
  /** Inside a run this reads `Next Puzzle`; outside one, `New Puzzle`. */
  sessionId?: string | null;
  /**
   * The last draw asked for a filter and the corpus had nothing.
   *
   * SAID IN THE LINES THIS CARD ALREADY HAS, and the way out is the button that
   * is already there. A filtered request used to be answered with an unrelated
   * puzzle; the server now correctly serves nothing, and the page became a dead
   * end instead - no new position, a primary that appeared to do nothing, and a
   * cause the player cannot see because the filter is in a card they may never
   * have opened (2026-08-05). A card must not resize, so the message takes the
   * headline and the recovery takes the label.
   */
  filterFoundNothing?: boolean;
  onClearFilter?: () => void;
  /**
   * The last draw could not reach the API.
   *
   * THE FALLBACK USED TO SAY NOTHING AT ALL (2026-08-22). When the API is
   * unreachable the trainer serves five hardcoded puzzles, shuffled, and every
   * one of them looked exactly like the product working - so a dev backend that
   * had never bound its port produced a whole session of the same puzzles
   * repeating, reported as production being broken. Nothing was scored either,
   * and nothing said that.
   *
   * IT OUTRANKS `filterFoundNothing` because both cannot be true and the filter
   * line is the one that misleads: no request was made, so nothing "matched".
   * Same slots, same geometry, no block that comes and goes.
   */
  serverUnreachable?: boolean;
  /**
   * HOW THE RUN THAT JUST ENDED WENT (owner, 2026-08-16: *"the performance
   * should be on the live card"*).
   *
   * IT COSTS NO HEIGHT, which is why it can be here at all. The detail slot
   * under the headline holds the puzzle's prompt WHILE PLAYING and nothing
   * otherwise - and a run ends on a resolved puzzle, so the slot is empty at
   * exactly the moment this has something to say. Same line, same reserved
   * space, no block that comes and goes.
   *
   * REALIZED AGAINST EXPECTED, both derived by the server from the attempt log:
   * `realized` counts PARTIAL solving (3 correct moves of 5 is 0.6) and
   * `expected` is the Elo expectation of each puzzle against the rating the
   * player held immediately before that attempt. Null when the run had nothing
   * measurable in it, never 0.
   */
  runOutcome?: { rating: number; realized: number; total: number } | null;
  /**
   * The one reminder offer (owner, C0 2026-11-12), shown in the same empty slot as the run
   * outcome and for the same reason: after a SOLVE the slot holds nothing, so the offer
   * costs no height. The run's outcome wins when both apply; the offer is asked for again
   * at the next solve.
   */
  offer?: ReactNode;
  onNextPuzzle: () => void;
  onShowSolution: () => void;
  /**
   * Opens the explanation. Given only on a RESOLVED puzzle with an
   * explanation to fetch: it names the solution, so it must never be offered
   * while the puzzle is being played.
   */
  onExplain?: () => void;
  /** The puzzle on the board: the Master's line is picked by it, and a wrong move is remembered per puzzle. */
  puzzleId?: string | null;
  /**
   * A puzzle made from a game (#245 B4, D7): once it is solved or shown, the game in the chip row,
   * the move played in it on the line under the headline, and "See the game" in the reserved row
   * (such a puzzle has no explanation, so the row is free). Nothing while it is being solved.
   */
  gameLines?: GameCardLines | null;
}

export function PuzzleLiveCard({
  status, message, rating, prompt, opening = null, isDailyPuzzle = false, missedLabel = null,
  exploring, isMidSolve, announcement, loading, sessionId,
  filterFoundNothing = false, onClearFilter, runOutcome = null,
  serverUnreachable = false, offer = null,
  onNextPuzzle, onShowSolution, onExplain, puzzleId = null, gameLines = null,
}: PuzzleLiveCardProps) {
  /*
    A WRONG MOVE IS REMEMBERED FOR THE PUZZLE, because `failed` lasts 700 ms: auto-revert returns the status
    to `playing`, and the Master would turn back to "Take your time" while the attempt is already scored.
    Set during render (React's "adjust state when a prop changes" pattern), so there is no frame of the old face.
  */
  const [missed, setMissed] = useState<{ id: string | null; missed: boolean }>({ id: puzzleId, missed: false });
  if (missed.id !== puzzleId) setMissed({ id: puzzleId, missed: status === 'failed' });
  else if (status === 'failed' && !missed.missed) setMissed({ id: puzzleId, missed: true });

  const revealable = status === 'playing' || status === 'failed';
  /* `correct` or `solution`: resolved, and neither ever reverts. Disjoint from
     `revealable`, so the one slot never offers both. */
  const explainable = Boolean(onExplain) && (status === 'correct' || status === 'solution');
  const resolvedGame = (status === 'correct' || status === 'solution') && !exploring ? gameLines : null;
  const gameLink = !explainable ? resolvedGame?.href ?? null : null;
  const rowShown = revealable || explainable || gameLink != null;
  const statusIcon = status === 'correct'
    ? <CheckCircle2 className="w-[1em] h-[1em] text-success" />
    : status === 'failed'
      ? <XCircle className="w-[1em] h-[1em] text-destructive" />
      : status === 'solution'
        ? <Eye className="w-[1em] h-[1em] text-muted-foreground" />
        : null;

  const master = MASTER_LIVE
    ? puzzleMasterMoment({
      status, isMidSolve, exploring, missed: missed.missed,
      quiet: serverUnreachable || filterFoundNothing, puzzleId,
    })
    : null;
  const masterLine = master?.line ? <span className="master-line">{master.line}</span> : null;
  const detail = serverUnreachable
    ? 'These are offline practice puzzles, so nothing here is scored.'
    : filterFoundNothing
    ? 'Nothing in your rating range carries it. The board still has your last puzzle.'
    : status === 'playing'
      ? (opening
        ? (!isMidSolve && !exploring && message === opening ? masterLine : opening)
        : (prompt || 'Find the best move'))
      /*
        The slot is empty once a puzzle is resolved, which is exactly when
        a run has just ended.

        THE RATING IS THE FIGURE (owner, 2026-08-16: *"the rating
        performance is a rating"*), and the score is what it was computed
        from - a bare number with nothing behind it invites "performance at
        what?". Partial solving is why it can read 3.5 rather than 4.
      */
      : runOutcome
        ? `Run performance: ${runOutcome.rating}, scored ${
          runOutcome.realized.toFixed(1)} of ${runOutcome.total}`
        : resolvedGame?.played ?? (status === 'correct' ? offer : null) ?? masterLine;
  const headlineText = serverUnreachable
    ? 'Cannot reach the server'
    : filterFoundNothing
    ? 'Nothing matched that filter'
    : exploring
      ? 'Trying a variation'
      : isMidSolve
        ? 'Correct so far — keep going'
        : (message || 'Loading puzzle...');
  /*
    HE READS THE CARD ALOUD (#298, owner 2026-11-17: his lines, then the puzzle's goal and "Correct! Puzzle solved."
    and so on): the headline, then the line under it, each only if it was recorded (`puzzleCardSpeech.ts`; figures,
    errors and "Loading puzzle..." stay silent).
    - The goal ("White to play and mate", "White to move") only at the start: after a correct move it would grate,
      and while the solution plays out the card still shows it until "Solution shown." (measured: he read the
      whole goal again before it), so until the headline changes he waits. After a correct move mid-puzzle, only the
      headline.
    - A wrong move gets his face, never words (owner's rule, #186 D9): nothing while his face is serious.
    - Only while his speaker is on screen (`PuzzleMaster`: his face shown and big enough), so he never talks where
      he cannot be muted.
    Keyed by the puzzle, so the next puzzle's lines play even when their texts are the last one's.
  */
  const [faceShown, setFaceShown] = useState(false);
  const detailText = detail === masterLine ? master?.line ?? null : typeof detail === 'string' ? detail : null;
  const atStart = status === 'playing' && !isMidSolve && !exploring;
  const isGoal = headlineText === opening || /^(White|Black) to move$/.test(headlineText);
  /*
    SHOW SOLUTION: HE SAYS IT FIRST, THEN THE BOARD SHOWS IT (owner, 2026-11-17: "'Here's how it goes' needs to be
    said first and then show the solution"). The press starts his solution line; the solution plays out when he has
    finished, or after ANNOUNCE_MAX_MS whatever happens (a recording that never loads must not leave the button
    dead). With his voice off or his speaker hidden, the solution starts at once, as before. After that he says
    nothing more for this puzzle: never "Solution shown." (owner), never his line a second time.
  */
  const [announcing, setAnnouncing] = useState<string | null>(null);
  const isAnnouncing = announcing !== null && announcing === (puzzleId ?? '');
  const solutionLine = useMemo(
    () => puzzleVoiceLine(puzzleMasterMoment({ status: 'solution', isMidSolve: false, exploring: false, missed: false, quiet: false, puzzleId }).line),
    [puzzleId],
  );
  const reveal = useCallback(() => {
    setAnnouncing(null);
    onShowSolution();
  }, [onShowSolution]);
  const silent = !faceShown || !master || master.expression === 'serious' || (isGoal && !atStart) || status === 'solution';
  const sayDetail = !(status === 'playing' && (isMidSolve || exploring));
  const voiceLine = useMemo(
    () => (isAnnouncing && solutionLine ? [solutionLine]
      : silent ? null : [puzzleVoiceLine(headlineText), sayDetail ? puzzleVoiceLine(detailText) : null]
        .filter((l): l is NonNullable<typeof l> => l !== null)),
    [isAnnouncing, solutionLine, silent, headlineText, sayDetail, detailText, puzzleId], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const voice = useMasterVoice(voiceLine, { onEnd: isAnnouncing ? reveal : undefined });
  /* What he will say next for this puzzle is known now: loaded ahead, so he speaks the moment it happens (owner,
     2026-11-18: the waits before "Correct! Puzzle solved." and the solution line were too long). */
  useEffect(() => {
    if (!voice.on || !faceShown || !MASTER_LIVE) return;
    preloadMasterLines([
      puzzleVoiceLine('Correct so far — keep going'),
      puzzleVoiceLine('Correct! Puzzle solved.'),
      puzzleVoiceLine(puzzleMasterMoment({ status: 'correct', isMidSolve: false, exploring: false, missed: false, quiet: false, puzzleId }).line),
      solutionLine,
    ]);
  }, [voice.on, faceShown, puzzleId, solutionLine]);
  useEffect(() => {
    if (!isAnnouncing) return;
    const t = setTimeout(reveal, ANNOUNCE_MAX_MS);
    return () => clearTimeout(t);
  }, [isAnnouncing, reveal]);
  const onShowSolutionPressed = () => {
    if (isAnnouncing) return;
    if (voice.on && faceShown && solutionLine) setAnnouncing(puzzleId ?? '');
    else onShowSolution();
  };

  const statusRegion = (
      <LiveStatus
        chip={(
          /* `w-0 min-w-full`: as wide as the row and adding nothing to its minimum, so a long chip
             (a game's name, #245 B4) truncates inside the card. As `inline-flex` its nowrap text set
             the grid column's minimum and pushed the region 1.3px past the card at 800x600 (measured). */
          <span className="flex w-0 min-w-full items-center gap-[calc(var(--card-w,208px)*0.04)]">
            {isDailyPuzzle && status === 'playing' && (
              <span className="inline-flex items-center gap-[0.35em] font-medium text-link">
                <Target className="w-[1em] h-[1em]" />
                Daily Puzzle
              </span>
            )}
            {missedLabel && (
              <span className="inline-flex items-center gap-[0.35em] font-medium text-link">
                <RotateCcw className="w-[1em] h-[1em]" />
                {missedLabel}
              </span>
            )}
            {resolvedGame && (
              /* One line whatever the card's width: the chip row reserves one. The full text is the title. */
              <span className="inline-flex min-w-0 items-center gap-[0.35em] font-medium text-link" title={resolvedGame.game}>
                <Swords className="w-[1em] h-[1em] shrink-0" />
                <span className="truncate">{resolvedGame.game}</span>
              </span>
            )}
            {rating != null && (
              <span className="inline-flex items-center gap-[0.35em] tabular-nums">
                <Signal className="w-[1em] h-[1em]" />
                Difficulty {rating}
              </span>
            )}
          </span>
        )}
        headline={(
          <span className="inline-flex items-start gap-[0.35em] text-foreground">
            {serverUnreachable
              ? <WifiOff className="w-[1em] h-[1em] mt-[0.1em] shrink-0 text-muted-foreground" />
              : exploring
                ? <Compass className="w-[1em] h-[1em] mt-[0.1em] shrink-0 text-muted-foreground" />
                : isMidSolve
                  ? <CheckCircle2 className="w-[1em] h-[1em] mt-[0.1em] shrink-0 text-success" />
                  : statusIcon}
            <span>{headlineText}</span>
          </span>
        )}
        detail={detail}
        announce={announcement}
      />
  );

  return (
    <>
      {master ? (
        /* B1 (#186): his face in a column beside the status region, never under it. See `PuzzleMaster`. */
        <div className="master-row">
          <div className="master-row-status">{statusRegion}</div>
          <PuzzleMaster expression={master.expression} voice={voice} onShown={setFaceShown} />
        </div>
      ) : statusRegion}

      {/* `shrink-0`: a short card may squeeze the status region, never the
          actions. In every mode since F2 (it was columns-only, `cols:`, from the
          pre-Workspace page). */}
      <div className="live-actions shrink-0">
        {/* Same slot, same geometry: the recovery is the primary's LABEL, the
            way Start run becomes Stop run. Pressing New Puzzle again would ask
            the server the same impossible question. */}
        <Action
          tier="primary"
          onClick={filterFoundNothing && onClearFilter ? onClearFilter : onNextPuzzle}
          /*
            THE RECOVERY IS NEVER DISABLED, and it was - which made it
            unpressable in exactly the state it exists for. The disable guards
            against drawing twice while a puzzle is on its way; when the filter
            found nothing there is no puzzle and no draw in flight, so `status`
            sits at `loading`/`ready` for ever and the only way out of the dead
            end was itself dead. Found by the probe, not by reading it.

            `loading` still binds: while the recovery's own fetch is in flight,
            pressing again would issue a second draw.
          */
          disabled={filterFoundNothing
            ? loading
            : loading || status === 'loading' || status === 'ready'}
          icon={<ChevronRight className="w-[1em] h-[1em]" />}
        >
          {filterFoundNothing && onClearFilter
            ? 'Clear the filter'
            : sessionId ? 'Next Puzzle' : 'New Puzzle'}
        </Action>

        <div
          {...(!rowShown ? { inert: '' as unknown as boolean } : {})}
          className={`live-reveal-row flex items-center ${rowShown ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        >
          {/*
            THE SAME RESERVED SLOT, A DIFFERENT CONTROL ONCE RESOLVED (owner,
            2026-10-21). The row was empty after a solve or a reveal, so the
            explanation takes it and no card changes size.
          */}
          {explainable ? (
            <button
              type="button"
              onClick={onExplain}
              data-explain-trigger
              className="trainer-reveal flex-1 min-h-11 rounded-[0.4em] border border-border text-[length:var(--card-type,14px)] font-medium text-foreground transition-colors hover:bg-muted inline-flex items-center justify-center gap-[0.4em]"
            >
              <Lightbulb className="w-[1em] h-[1em]" />
              Explain solution
            </button>
          ) : gameLink ? (
            /* A new tab, so the puzzle, its solved line and the run stay where they were. */
            <a
              href={gameLink}
              target="_blank"
              rel="noopener"
              className="trainer-reveal flex-1 min-h-11 rounded-[0.4em] border border-border text-[length:var(--card-type,14px)] font-medium text-foreground transition-colors hover:bg-muted inline-flex items-center justify-center gap-[0.4em]"
            >
              <Swords className="w-[1em] h-[1em]" />
              See the game
            </a>
          ) : (
            /*
              44px, and it is the second place that number is a constant rather
              than a ratio. This control ENDS the attempt and the outcomes are not
              symmetrical (2026-08-13): revealing by accident costs the rating on
              this puzzle. It must not be easy to hit by mistake, nor so small it
              is hard to hit on purpose.
            */
            <button
              type="button"
              onClick={onShowSolutionPressed}
              disabled={isAnnouncing}
              className="trainer-reveal flex-1 min-h-11 rounded-[0.4em] border border-border text-[length:var(--card-type,14px)] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground inline-flex items-center justify-center gap-[0.4em]"
            >
              <Eye className="w-[1em] h-[1em]" />
              Show solution
            </button>
          )}
        </div>
      </div>
    </>
  );
}

/**
 * THE MASTER IN THE LIVE CARD (B1, #186): his face in a column BESIDE the status region, and his one short line
 * in the detail slot only when that slot is otherwise empty (the start of a puzzle, a solve, a wrong move, the
 * solution), so he never takes a line the card needs.
 *
 * NOT UNDER THE HEADLINE, as the mock-ups had him (measured, B1, 2026-11-16): the status region reserves the
 * tallest sentence it can show, so the space under it is only 26-51 px at 1024-1920 wide and 30 px on a phone.
 * Beside it, the region is narrowed by his column and may wrap one more line, which still ends above New Puzzle
 * at every size where he is shown, so the card and its buttons never move.
 *
 * Shown only in a live card at least 250 px wide (`index.css`, `.master-face`): at 800x600 the narrowed region
 * would push the buttons down, so there the card is exactly today's, his line included.
 *
 * His face is hidden from assistive technology (`MasterPortrait`): the headline is the card's message and is
 * announced; his face only shows a mood. His line is plain text in the detail slot. The speaker
 * (#298), beside his face, is a real button with a label: it turns his voice on and off here and on /play alike.
 */
/** The longest he may hold the solution back for his line (the lines are 1.5-2.7 s). */
const ANNOUNCE_MAX_MS = 6000;

/** The smallest face shown with the 24 px speaker beside it (45 px faces are the tightest cards). */
const SPEAKER_FACE_MIN = 50;

export function PuzzleMaster({ expression, voice, onShown }: {
  expression: Parameters<typeof MasterPortrait>[0]['expression'];
  voice: ReturnType<typeof useMasterVoice>;
  onShown: (shown: boolean) => void;
}) {
  /*
    Whether he may speak here: his column is on screen (CSS hides it in a card under 250 px wide) and his face is
    big enough to carry the speaker, which sits beside it at the top (owner, 2026-11-17: his face moves left to
    make room, so the speaker covers nothing of him). Faces are 51-81 px at most sizes; on phones held sideways and very short windows they are 45 px
    and the row too tight, so there it is not shown and he stays silent: he never talks where he
    cannot be muted.
  */
  const ref = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState(false);
  useEffect(() => {
    const el = ref.current;
    const card = el?.closest('.workspace-card');
    if (!el || !card) return;
    const check = () => {
      const ok = el.offsetWidth >= SPEAKER_FACE_MIN;
      setRoom(ok);
      onShown(ok);
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    ro.observe(card);
    return () => { ro.disconnect(); onShown(false); };
  }, [onShown]);
  return (
    <div ref={ref} className="master-face" data-master-face data-speaker={room ? '' : undefined}>
      {/* the v4 heads are drawn turned to his left, so they are mirrored to look at the board (owner, 2026-11-17) */}
      <MasterPortrait expression={expression} variant="head" facing="right" size={92} fluid speech={voice.speech} />
      {/* the same switch as /play's speaker (one choice for the whole site), beside his face at the top */}
      <MasterVoiceButton voice={voice} hidden={!room} className="master-voice" />
    </div>
  );
}
