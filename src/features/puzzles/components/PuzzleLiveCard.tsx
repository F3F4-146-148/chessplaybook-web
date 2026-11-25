import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, ChevronRight, Compass, Eye, Lightbulb, RotateCcw, Signal, Swords, Target, TrendingUp, WifiOff, XCircle } from 'lucide-react';
import type { GameCardLines } from '../lib/gamePuzzleSource';
import { Action, LiveStatus } from './TrainerUI';
import { MasterPortrait } from '@/components/master/MasterPortrait';
import { MASTER_LIVE } from '@/design/designFlags';
import { linesForPuzzle, linesToPreload, missedLineOn, noteLineReached, notePuzzleOutcome, puzzleMasterMoment, puzzleVoiceLine } from './puzzleMasterMoment';
import { ownLineUsed, puzzleCardSpeechTexts, puzzleCardTexts } from './puzzleCardVoice';
import { MasterVoiceButton } from '@/features/master/MasterVoiceButton';
import {
  loadPhrases, MOMENT_HOLD_MS, momentVoiceLines, phraseAt, phrasesOf, readingSteps, splitCaption,
  type ProgressMoment, type TimedPhrase,
} from '../lib/progressMoment';
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
  /** The last move played was wrong: the cross stays beside the headline until the next move (2026-11-22). */
  lastMoveWrong?: boolean;
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
  /** He has a line still to say (true) or has finished (false): auto-next waits for it (#401 B4). */
  onVoiceBusyChange?: (busy: boolean) => void;
  /** The player's rating, for "That was a hard one." (#401 C2). */
  playerRating?: number | null;
  /** The player solved on an earlier day than today, for "Welcome back." on the visit's first puzzle (#401 C2). */
  returning?: boolean;
  /**
   * The progress moment this solve brought (#418): he says its lines instead of his ordinary solved line, and the
   * line under the headline shows what he is saying, one phrase at a time. Only on the solved puzzle it belongs to.
   */
  moment?: ProgressMoment | null;
  /** This clean solve is still waiting for the server's answer: his ordinary line waits up to MOMENT_HOLD_MS. */
  momentPending?: boolean;
}

export function PuzzleLiveCard({
  status, lastMoveWrong = false, message, rating, prompt, opening = null, isDailyPuzzle = false, missedLabel = null,
  exploring, isMidSolve, announcement, loading, sessionId,
  filterFoundNothing = false, onClearFilter, runOutcome = null,
  serverUnreachable = false, offer = null,
  onNextPuzzle, onShowSolution, onExplain, puzzleId = null, gameLines = null, onVoiceBusyChange,
  playerRating = null, returning = false, moment = null, momentPending = false,
}: PuzzleLiveCardProps) {
  /*
    A WRONG MOVE IS REMEMBERED FOR THE PUZZLE, because `failed` lasts 700 ms: auto-revert returns the status
    to `playing`, and the Master would turn back to "Take your time" while the attempt is already scored.
    Set during render (React's "adjust state when a prop changes" pattern), so there is no frame of the old face.
  */
  const [missed, setMissed] = useState<{ id: string | null; missed: boolean }>({ id: puzzleId, missed: false });
  if (missed.id !== puzzleId) setMissed({ id: puzzleId, missed: status === 'failed' });
  else if (status === 'failed' && !missed.missed) setMissed({ id: puzzleId, missed: true });
  /* A VARIATION WAS ENTERED on this solved puzzle: leaving it brings back "Correct! Puzzle solved." on the card, and
     he must not say his solved line again (#401 B2c; the simulator found him repeating it). Same pattern as `missed`. */
  const [explored, setExplored] = useState<{ id: string | null; explored: boolean }>({ id: puzzleId, explored: false });
  if (explored.id !== puzzleId) setExplored({ id: puzzleId, explored: exploring });
  else if (exploring && !explored.explored) setExplored({ id: puzzleId, explored: true });
  /* HOW LONG THE SOLVE TOOK, for "Quick!" (#401 C2): from the first render of the puzzle being played to the first
     render of it solved, fixed then so his line never changes. A puzzle restored already solved has no start: never
     quick. Same render-time pattern as `missed`, so the solved line is right on its first frame. */
  const [timing, setTiming] = useState<{ id: string | null; startedAt: number | null; solveMs: number | null }>(
    { id: puzzleId, startedAt: status === 'playing' ? performance.now() : null, solveMs: null },
  );
  if (timing.id !== puzzleId) setTiming({ id: puzzleId, startedAt: status === 'playing' ? performance.now() : null, solveMs: null });
  else if (timing.startedAt === null && status === 'playing') setTiming({ ...timing, startedAt: performance.now() });
  else if (status === 'correct' && timing.solveMs === null && timing.startedAt !== null) setTiming({ ...timing, solveMs: performance.now() - timing.startedAt });
  // the wrong-move line's switch (#401 C2b), read once
  const [sayMissed] = useState(() => MASTER_LIVE && typeof window !== 'undefined' && missedLineOn());

  const revealable = status === 'playing' || status === 'failed';
  /* `correct` or `solution`: resolved, and neither ever reverts. Disjoint from
     `revealable`, so the one slot never offers both. */
  const explainable = Boolean(onExplain) && (status === 'correct' || status === 'solution');
  const resolvedGame = (status === 'correct' || status === 'solution') && !exploring ? gameLines : null;
  const gameLink = !explainable ? resolvedGame?.href ?? null : null;
  const rowShown = revealable || explainable || gameLink != null;
  const statusIcon = status === 'correct'
    ? <CheckCircle2 className="w-[1em] h-[1em] text-success" />
    : status === 'failed' || (lastMoveWrong && status === 'playing')
      ? <XCircle className="w-[1em] h-[1em] text-destructive" />
      : status === 'solution'
        ? <Eye className="w-[1em] h-[1em] text-muted-foreground" />
        : null;

  // his lines for this puzzle, chosen once and kept (#401 B1); a run's first puzzle always gets his start line (B3)
  const lines = MASTER_LIVE && puzzleId
    ? linesForPuzzle(puzzleId, { runKey: sessionId ?? 'free', puzzleRating: rating, playerRating, returning })
    : null;
  const master = MASTER_LIVE
    ? puzzleMasterMoment({
      status, isMidSolve, exploring, missed: missed.missed,
      quiet: serverUnreachable || filterFoundNothing, puzzleId, solveMs: timing.solveMs, sayMissed,
    }, lines)
    : null;
  // how the puzzle ended, for "Three in a row." on a later one (#401 C2): a miss or a shown solution ends the run
  useEffect(() => {
    if (!puzzleId || !MASTER_LIVE) return;
    if (status === 'correct') notePuzzleOutcome(puzzleId, missed.missed ? 'broken' : 'clean');
    else if (status === 'failed' || status === 'solution') notePuzzleOutcome(puzzleId, 'broken');
  }, [puzzleId, status, missed.missed]);
  /*
    THE PROGRESS MOMENT (#418, analysis 3.7). On a clean solve his ordinary solved line waits up to MOMENT_HOLD_MS
    for the result's answer: when it brings a moment he says the moment instead (the ordinary line was never
    started, so nothing collides); when it is late, fails or brings none, his ordinary line as always. The moment
    lasts while the solved puzzle is on the board and not being explored.
  */
  const [holdOver, setHoldOver] = useState<string | null>(null);
  useEffect(() => {
    if (!momentPending || !puzzleId) return;
    const t = setTimeout(() => setHoldOver(puzzleId), MOMENT_HOLD_MS);
    return () => clearTimeout(t);
  }, [momentPending, puzzleId]);
  const activeMoment = moment && moment.puzzleId === puzzleId && status === 'correct' && !exploring ? moment : null;
  const holding = !activeMoment && momentPending && status === 'correct' && !exploring && holdOver !== puzzleId;
  const momentLines = useMemo(() => (activeMoment ? momentVoiceLines(activeMoment) : null), [activeMoment]);
  /* Each recording's phrases with their times, for the captions while he speaks. */
  const [phrases, setPhrases] = useState<Record<string, TimedPhrase[]>>({});
  useEffect(() => {
    if (!activeMoment) return;
    let live = true;
    for (const l of activeMoment.lines) {
      void loadPhrases(l.key).then((p) => { if (live) setPhrases((x) => (x[l.key] ? x : { ...x, [l.key]: p })); });
    }
    return () => { live = false; };
  }, [activeMoment]);
  /* The caption is recomputed a few times a second while the moment shows (it follows the audio's clock). */
  const [, setCaptionTick] = useState(0);
  useEffect(() => {
    if (!activeMoment) return;
    const t = setInterval(() => setCaptionTick((n) => n + 1), 100);
    return () => clearInterval(t);
  }, [activeMoment]);
  /* How many characters one line of the caption holds: the status column's width over the caption's font (italic
     text averages about half an em a character; 0.56 leaves a margin). Measured, so a caption is one line at every
     window and the card never grows (C7). */
  const statusRef = useRef<HTMLDivElement>(null);
  const [lineChars, setLineChars] = useState(40);
  useEffect(() => {
    const el = statusRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const px = parseFloat(getComputedStyle(el).fontSize) || 16;
      setLineChars(Math.max(14, Math.floor(el.clientWidth / (px * 0.56))));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [activeMoment]);
  /* ON A PHONE THE MOMENT CARD IS BELOW THE BOARD (C5): while it is off screen a "Your progress" link in the chip row
     scrolls to it. Never an unasked scroll. */
  const [momentOffScreen, setMomentOffScreen] = useState(false);
  useEffect(() => {
    if (!activeMoment || typeof IntersectionObserver === 'undefined') { setMomentOffScreen(false); return; }
    let io: IntersectionObserver | null = null;
    const raf = requestAnimationFrame(() => {
      const el = document.querySelector('.moment-body');
      if (!el) return;
      io = new IntersectionObserver(([e]) => setMomentOffScreen(!e.isIntersecting), { threshold: 0.3 });
      io.observe(el);
    });
    return () => { cancelAnimationFrame(raf); io?.disconnect(); };
  }, [activeMoment]);
  const lastLineRef = useRef(0);
  const lastCaptionRef = useRef<string | null>(null);
  const [reading, setReading] = useState<{ tryId: string; from: number; startedAt: number } | null>(null);
  // filled in below, once the voice is known; the caption reads them through refs on the next tick
  const speakingRef = useRef<{ speaking: boolean; lineIndex: number | null; time: number | null }>({ speaking: false, lineIndex: null, time: null });
  let caption: string | null = null;
  let readingBusy = false;
  if (activeMoment) {
    const sp = speakingRef.current;
    if (sp.speaking) {
      if (sp.lineIndex !== null && sp.time !== null) {
        const l = activeMoment.lines[sp.lineIndex];
        lastLineRef.current = sp.lineIndex;
        caption = (l && (phraseAt(phrases[l.key] ?? [], sp.time, lineChars) ?? splitCaption(phrasesOf(l.text)[0] ?? '', lineChars)[0])) ?? null;
      }
      caption = caption ?? lastCaptionRef.current ?? splitCaption(phrasesOf(activeMoment.lines[0].text)[0] ?? '', lineChars)[0] ?? null;
    } else if (reading && reading.tryId === activeMoment.tryId) {
      const steps = readingSteps(activeMoment, reading.from, lineChars);
      let t = performance.now() - reading.startedAt;
      let i = 0;
      while (i < steps.length - 1 && t >= steps[i].ms) { t -= steps[i].ms; i += 1; }
      caption = steps[i]?.text ?? lastCaptionRef.current;
      readingBusy = i < steps.length - 1 || t < (steps[i]?.ms ?? 0);
    } else {
      caption = lastCaptionRef.current ?? splitCaption(phrasesOf(activeMoment.lines[0].text)[0] ?? '', lineChars)[0] ?? null;
      readingBusy = true;
    }
    lastCaptionRef.current = caption;
  } else {
    lastCaptionRef.current = null;
    lastLineRef.current = 0;
  }
  // the two text rows (headline, the line under it): one rule, shared with the speech simulator (#401 A1)
  const { headline: headlineText, detail: cardDetail } = puzzleCardTexts({
    status, message, opening, prompt, isMidSolve, exploring, serverUnreachable, filterFoundNothing, runOutcome,
    playedLine: resolvedGame?.played, hasOffer: offer != null,
    masterLine: activeMoment ? caption : holding ? null : master?.line ?? null,
  });
  const detail: ReactNode = cardDetail.kind === 'text' ? cardDetail.text
    : cardDetail.kind === 'master' ? <span className="master-line">{cardDetail.text}</span>
      : cardDetail.kind === 'offer' ? offer
        : null;
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
    () => puzzleVoiceLine(lines?.solution ?? null),
    [lines],
  );
  const reveal = useCallback(() => {
    setAnnouncing(null);
    onShowSolution();
  }, [onShowSolution]);
  const spoken = puzzleCardSpeechTexts({
    status, isMidSolve, exploring, opening, headline: headlineText, detail: cardDetail, faceShown,
    expression: master?.expression ?? null, ownLine: master?.line ?? null, explored: explored.explored,
  });
  const spokenKey = spoken ? spoken.join('\n') : null; // a stable memo key: a re-render must never restart him
  /* His line counts as used once it is shown or said, voice on or off (#401 B1): it is also text on the card, and
     most visitors have the voice off. A chosen line that is neither (no known goal: the card shows the prompt)
     does not count. */
  const usedLine = MASTER_LIVE && ownLineUsed(master?.line ?? null, cardDetail, spoken) ? master?.line ?? null : null;
  useEffect(() => {
    if (puzzleId && usedLine) noteLineReached(puzzleId, usedLine);
  }, [puzzleId, usedLine]);
  const voiceLine = useMemo(
    () => (momentLines ? momentLines
      : holding ? null
        : isAnnouncing && solutionLine ? [solutionLine]
          : spoken === null ? null : spoken.map(puzzleVoiceLine)
            .filter((l): l is NonNullable<typeof l> => l !== null)),
    [momentLines, holding, isAnnouncing, solutionLine, spokenKey, puzzleId], // eslint-disable-line react-hooks/exhaustive-deps
  );
  /*
    WHETHER HE STILL HAS SOMETHING TO SAY (#401 B4): "Start next puzzle immediately" moved on 1.2 s after a solve and
    cut his solved line on most solves (measured: 16 of 21). The trainer now waits for this to turn false (capped).
    `onEnd` fires when he has said the whole queue or could not say it, never when a new queue cut him.
  */
  const [doneLine, setDoneLine] = useState<typeof voiceLine>(null);
  const onVoiceEnd = useCallback(() => {
    setDoneLine(voiceLine);
    if (isAnnouncing) reveal();
  }, [voiceLine, isAnnouncing, reveal]);
  const voice = useMasterVoice(voiceLine, { onEnd: onVoiceEnd });
  /*
    WHO SHOWS THE MOMENT'S WORDS: his voice while it is on and his face is shown (the caption follows the recording's
    clock), otherwise the reading pace. Muting him mid-moment switches to the reading pace from the line he was on;
    a moment he has already said in full is not read again.
  */
  const momentDone = !!activeMoment && doneLine === voiceLine && voiceLine === momentLines;
  const momentSpoken = !!activeMoment && voice.on && faceShown && !momentDone;
  speakingRef.current = {
    speaking: momentSpoken,
    lineIndex: voice.lineIndex,
    time: voice.speech ? voice.speech.audio.currentTime : null,
  };
  /* The last line of the moment he actually said (a recording playing): a line whose recording failed to load is
     skipped by the voice, so "done" alone does not mean every line was heard (owner, 2026-11-22: the graph came and
     he said nothing; the captions froze on the first phrase). */
  const heardRef = useRef<{ tryId: string | null; max: number }>({ tryId: null, max: -1 });
  if (activeMoment && heardRef.current.tryId !== activeMoment.tryId) heardRef.current = { tryId: activeMoment.tryId, max: -1 };
  if (momentSpoken && voice.speech && voice.lineIndex !== null) heardRef.current.max = Math.max(heardRef.current.max, voice.lineIndex);
  const momentSaid = momentDone && heardRef.current.max === (activeMoment?.lines.length ?? 0) - 1;
  useEffect(() => {
    if (!activeMoment || momentSpoken || momentSaid) return;
    // muted mid-moment: on from the line he was on; recordings that failed: on from the first line not heard
    const from = momentDone ? heardRef.current.max + 1 : lastLineRef.current;
    setReading((r) => (r && r.tryId === activeMoment.tryId ? r : { tryId: activeMoment.tryId, from, startedAt: performance.now() }));
  }, [activeMoment, momentSpoken, momentSaid, momentDone]);
  if (momentSaid) readingBusy = false;
  const voiceBusy = voice.on && faceShown && !!voiceLine && voiceLine.length > 0 && doneLine !== voiceLine;
  // the moment read at reading pace, and the brief wait for the answer, hold Auto next too (#418)
  const busy = voiceBusy || readingBusy || holding;
  useEffect(() => { onVoiceBusyChange?.(busy); }, [busy, onVoiceBusyChange]);
  /* What he will say next for this puzzle is known now: loaded ahead, so he speaks the moment it happens (owner,
     2026-11-18: the waits before "Correct! Puzzle solved." and the solution line were too long). */
  useEffect(() => {
    if (!voice.on || !faceShown || !MASTER_LIVE) return;
    // the lines the rest of this puzzle may need, the reactive ones included (#401 C2)
    preloadMasterLines(lines ? linesToPreload(lines, missed.missed).map(puzzleVoiceLine) : []);
  }, [voice.on, faceShown, lines, missed.missed, solutionLine]);
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
            {activeMoment && momentOffScreen && (
              <button
                type="button"
                className="ms-auto inline-flex items-center gap-[0.3em] font-medium text-link"
                onClick={() => document.querySelector('.moment-body')?.closest('.workspace-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
              >
                <TrendingUp className="w-[1em] h-[1em]" aria-hidden />
                Your progress
              </button>
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
          <div ref={statusRef} className="master-row-status">{statusRegion}</div>
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
