import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useChrome } from '@/app/SiteShell';
import { ChessBoard } from '@/components/chess/ChessBoard';
import { BoardControls } from '@/components/chess/BoardControls';
import { useBoardTheme } from '@/hooks/useBoardTheme';
import { usePuzzleBoard } from '../hooks/usePuzzleBoard';
import { PuzzleLiveCard } from './PuzzleLiveCard';
import { AUTO_ADVANCE_AFTER_LINE_MS, AUTO_ADVANCE_MAX_MS, AUTO_ADVANCE_MS } from './puzzleCardVoice';
import { PuzzleSettingsCard } from './PuzzleSettingsCard';
import { PuzzleAppearanceCard } from './PuzzleAppearanceCard';
import { PuzzleStandingsCard } from './PuzzleStandingsCard';
import { AboutTrainerText, PuzzleAboutPanel } from './PuzzleAboutPanel';
import { ABOUT_TRAINER_TITLE } from '../aboutTrainer';
import { PuzzleAnalysisCard } from './PuzzleAnalysisCard';
import { PuzzleRunSetupCard } from './PuzzleRunSetupCard';
import { PuzzleTrainCard } from './PuzzleTrainCard';
import { ProgressMomentCard } from './ProgressMomentCard';
import { MASTER_VOICE_KEY } from '@/features/master/useMasterVoice';
import { PROGRESS_MOMENT_LIVE } from '@/design/designFlags';
import { MOMENT_AUTO_ADVANCE_MAX_MS, MOMENT_LOOK_MS } from '../lib/progressMoment';
import { usePuzzleSettings } from '../hooks/usePuzzleSettings';
import { usePuzzleRecord } from '../hooks/usePuzzleRecord';
import { usePuzzleRun } from '../hooks/usePuzzleRun';
import { resolveLinkedFilters, linkedRunGame, linkedRunSelection, linkedRunTheme } from '../lib/linkedFilters';
import { missedOnLabel } from '../services/trainingRecord';
import { usePlan } from '../hooks/usePlan';
import { usePlanOffer } from '../hooks/usePlanOffer';
import { PuzzlePlanCard } from './PuzzlePlanCard';
import { PuzzleExplanationPanel } from './PuzzleExplanationPanel';
import { fetchPuzzleExplanation, isGeneratedPuzzleId, type PuzzleExplanation } from '../services/PuzzleService';
import { gameCardLines } from '../lib/gamePuzzleSource';
import type { PlanItem } from '../services/PlanApi';
import { logGA4Event } from '@/services/analytics';
import { StatGrid } from './TrainerUI';
import { Workspace, type WorkspaceMode } from '@/components/workspace/Workspace';
import { slot, footSlot } from '@/components/workspace/slots';
import { isRatingProvisional } from '../lib/provisionalRating';
import SeoHead from '@/components/SeoHead';
import { useAuth } from '@/features/auth/AuthContext';
import { useReminderOffer } from '@/features/reminders/useReminderOffer';
import { layoutArm } from '../lib/layoutArm';
import { ReminderOfferLine } from '@/features/reminders/ReminderOfferLine';
import RouteHeading from '@/components/RouteHeading';
import { useVisitorCountry } from '@/features/premium/useVisitorCountry';
import { plansForCountry } from '@/features/premium/premiumPlans';
import { backLabel, whenBack, type DailyLimit } from '@/services/freePlanLimit';
import { usePuzzleAllowance } from '../services/puzzleAllowance';
import { usePuzzleToday } from '../services/puzzleToday';
import { TodayGraph } from './TodayGraph';
import { RecordFoot } from './RecordFoot';
import { DaySummaryCard } from './DaySummaryCard';
import { asDaySummary } from '../lib/daySummary';
import { CheckCircle2, Clock, History, Infinity as InfinityIcon, Minimize2, PieChart, Swords, TrendingUp, XCircle, Zap } from 'lucide-react';

/**
 * The address's query string, read once in state initialisers. Empty in the build's render (prerender plan B2a): the
 * built page is a first visit with a plain address, and the head check builds any other address from scratch.
 */
function addressSearch(): string {
  return typeof window === 'undefined' ? '' : window.location.search;
}

/**
 * THE PUZZLE TRAINER (`/puzzles`, v3), ON THE WORKSPACE.
 *
 * This component owns the trainer's state and wiring: the board and its draw,
 * the settings, the run, the plan, the record, auto-advance and focus mode.
 * It owns NO geometry. Since layout redesign C5b (2026-10-08) every size on the
 * page is the shared `Workspace`'s CSS (`src/components/workspace/`, spec
 * §3-§6): the board, the control strip, the two lanes, the card shares, each
 * card's type and the spacing inside it (`cardTypes.ts`, from declared content
 * heights). C5c deleted what used to do that here: a row observer, one observer
 * per card, and the constants they were tuned from, all of which the owner had
 * settled by measurement on 2026-08-15/16 and the Workspace now carries as
 * tokens (the strip's 6.54%, the 2 : 2 : 1 shares, v3's page air).
 *
 * The name is historical: this began as the empty layout milestone of
 * 2026-08-15 and became the page. `/dev/puzzles-layout` serves it too.
 */

export default function TrainerLayoutSkeleton() {
  /*
    THE BOARD IS REAL FROM HERE ON (2026-08-15). The geometry is unchanged and
    frozen; what was an empty box now holds the same board, the same control
    strip and the same rules the trainer already had. `useBoardTheme` is mounted
    HERE because `ChessBoard` writes `--cg-*` and decides how a board looks, and
    /puzzles never mounted it - which is the 08-07 bug where a signed-in player's
    cross-device theme never reached this page.
  */
  const [attemptRecordedFor, setAttemptRecordedFor] = useState<string | null>(null);
  /*
    THE SETTINGS AND THE RUN ARE READ BEFORE THE BOARD, because they are what the
    board's next draw asks for. A run's axes govern what is served or they are
    decoration (D4b), and the settings card's own filter governs it when there is
    no run - which is the precedence the old page uses and the reason its filter
    controls are not just a picture.
  */
  const settings = usePuzzleSettings();
  /* "Replay them" on the training record opens the run card on "Missed before" (#108). */
  const [linkedRun] = useState(() => linkedRunSelection(new URLSearchParams(addressSearch())));
  /* ...and a Patterns row's "Replay" limits that run to its pattern (#109). */
  const [linkedTheme] = useState(() => linkedRunTheme(new URLSearchParams(addressSearch())));
  /* ...and a Game report's "Solve them" starts a run of that game's puzzles (#510). */
  const [linkedGame] = useState(() => linkedRunGame(new URLSearchParams(addressSearch())));
  const run = usePuzzleRun(linkedRun, linkedTheme, linkedGame);
  /*
    A LINK THAT NAMES A FILTER WINS OVER THE REMEMBERED ONE (C9).

    "Train this" on the record page is that page's whole purpose: it has just
    told the player their endgames are behind, and the click has to land on
    endgames. The new page read only saved settings, so every one of those links
    was decorative - it would have served whatever the last session pinned.

    READ ONCE, at mount, and never written back: arriving with `?area=endgame`
    must not pin the trainer to endgames for ever. Same rule as the old page's,
    and it uses the same function so the two cannot drift.
  */
  /*
    THE LINK IS READ AT MOUNT; THE SAVED THEME IS READ EVERY TIME.

    Both were resolved together here, once, which made two things wrong at once.
    The saved theme was frozen at the value it held on the very first render - so
    changing the theme in Strength & themes updated the card and never reached a
    draw, and on a slow preference load it froze an empty string. And because
    `resolveLinkedFilters` falls back to the saved theme, a player who had simply
    SAVED one arrived with `draw.theme` set, which is what the daily puzzle skips
    on. A saved preference would have suppressed the daily puzzle for ever, where
    the old page skips it only for a filter that arrived in the URL
    (PuzzleTrainer.tsx:1147).

    So this holds the URL's answer only. The saved theme is applied at the draw,
    live, and `fromLink` is what the daily rule asks about.

    STATE, NOT A MEMO, BECAUSE THE PLAYER CAN SET IT ASIDE (C6, D27). As a memo
    the link was permanent for the visit: "Clear the filter" cleared one draw and
    the linked theme came back on the next, and the theme picker showed the
    saved theme while the linked one was being served. The picker now shows what
    is served, choosing a theme in it replaces the link, and clearing clears it.
    `fromLink` stays as it arrived: it answers how the visit STARTED.
  */
  const [linked, setLinked] = useState(() => {
    const params = new URLSearchParams(addressSearch());
    const fromUrl = resolveLinkedFilters(params, '');
    return { ...fromUrl, fromLink: Boolean(fromUrl.theme || fromUrl.area) };
  });
  /* `?daily=YYYY-MM-DD`, the reminder email's "Solve today's puzzle": read once, at mount. */
  const [dailyDate] = useState(() => {
    const asked = new URLSearchParams(addressSearch()).get('daily');
    return asked && /^\d{4}-\d{2}-\d{2}$/.test(asked) ? asked : null;
  });
  /*
    `?id=<puzzle id>` (#245 B3): one puzzle by link, read once at mount. The id leaves the address
    once the puzzle is open, through the router so its location stays true, and a reload then
    resumes that puzzle (or draws the next) instead of opening the link again.
  */
  const navigate = useNavigate();
  const [linkedPuzzleId] = useState(() => {
    const asked = new URLSearchParams(addressSearch()).get('id');
    return asked && /^[A-Za-z0-9_]{1,32}$/.test(asked) ? asked : null;
  });
  const dropLinkedPuzzleId = useCallback(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('id')) return;
    url.searchParams.delete('id');
    navigate(`${url.pathname}${url.search}${url.hash}`, { replace: true });
  }, [navigate]);
  const puzzle = usePuzzleBoard({
    linkedPuzzleId,
    onLinkedPuzzleOpened: dropLinkedPuzzleId,
    attemptRecordedFor,
    /* Only a filter that arrived in the URL skips the daily puzzle. */
    arrivedWithFilter: linked.fromLink,
    dailyDate,
    draw: run.draw ?? {
      /* Free solving: `adaptive` in auto mode, so the window is derived from the
         player's own attempt log server-side rather than from a streak counter
         that resets on every page load. A pinned preset beats a derived window,
         so the two are never sent together. */
      selection: settings.filterMode === 'auto' ? 'adaptive' : undefined,
      minRating: settings.filterMode === 'auto' ? undefined : settings.ratingRange.min,
      maxRating: settings.filterMode === 'auto' ? undefined : settings.ratingRange.max,
      /* The linked theme beats the saved one, and the saved one is read HERE so
         a change in Strength & themes reaches the next draw. The linked AREA has
         no picker at all, so a link is the only way it is ever set. */
      theme: linked.theme || settings.theme || undefined,
      area: linked.area || undefined,
    },
  });
  const { currentTheme, changeTheme } = useBoardTheme();
  /*
    FOCUS MODE HIDES THE RECORD COLUMN, which is what gives the board the room.
    Hidden, not unmounted: the column holds fetched state, and unmounting would
    re-read the record every time the mode is toggled. The row observer sees the
    width change and the board is recomputed from it, so no number here needs to
    know the mode exists.
  */
  const [focusMode, setFocusMode] = useState(false);
  /*
    FOCUS MODE IS COLUMNS-ONLY (owner, 2026-10-08, restoring v1's rule; spec
    *Focus mode*). Stacked, the board already has the window's width, and hiding
    the nav there buys nothing. The mode is the Workspace's answer, read from its
    container query; null until it has reported, which happens before paint.
    Leaving columns while focused leaves focus mode, as v1 did - not logged as a
    toggle, because nobody toggled it.
  */
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode | null>(null);
  /* Offered only where focus itself stays in columns: on a near-square window
     the nav's height is what tips it into stacked (`focusHolds`). */
  const canFocus = workspaceMode?.mode === 'columns' && workspaceMode.focusHolds;
  useEffect(() => {
    if (workspaceMode?.mode === 'stacked') setFocusMode(false);
  }, [workspaceMode]);
  /*
    WHICH CARDS A SOLVER EVER SEES (#521). Stacked, the lower cards are below the
    board and nobody knew whether phone visitors scroll to them. Each card is
    logged once per page load when half of it is on screen. The slot marker is
    `display: contents` (no box), so its card is what is observed. The board's
    marker has neither and is left out: it is always on screen.
  */
  const seenCards = useRef(new Set<string>());
  const cardLayout = workspaceMode?.mode;
  useEffect(() => {
    if (!cardLayout || typeof IntersectionObserver === 'undefined') return;
    const names = new Map<Element, string>();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const card = names.get(entry.target);
        if (!entry.isIntersecting || !card || seenCards.current.has(card)) continue;
        seenCards.current.add(card);
        observer.unobserve(entry.target);
        logGA4Event({ name: 'puzzle_card_seen', params: { card, layout: cardLayout } });
      }
    }, { threshold: 0.5 });
    document.querySelectorAll<HTMLElement>('[data-skeleton-card]').forEach((marker) => {
      const card = marker.dataset.skeletonCard;
      /* A lane's card, or a lane's foot (the analysis band, the appearance card). */
      const box = marker.closest('.workspace-card, .workspace-foot');
      if (!card || !box || seenCards.current.has(card)) return;
      names.set(box, card);
      observer.observe(box);
    });
    return () => observer.disconnect();
  }, [cardLayout]);
  /*
    FOCUS MODE HIDES THE SHELL, AND ASKS THE SHELL TO DO IT (#55).

    This used to be `{!focusMode && <Navigation />}` - a page deciding whether the
    site's chrome existed. The chrome is mounted once now, above every route, so
    the page states its intent and the shell acts on it. The setter restores it on
    unmount, so leaving focus mode by navigating away cannot hide the nav on the
    page after it.
  */
  const { setChromeHidden } = useChrome();
  useEffect(() => {
    setChromeHidden(focusMode);
    return () => setChromeHidden(false);
  }, [focusMode, setChromeHidden]);

  /* Escape leaves the mode. A full-screen state with only a mouse target is a
     trap for anyone driving the page from a keyboard. */
  /*
    BOTH EXITS ARE INSTRUMENTED, not just the toggle in the card.

    `PuzzleAppearanceCard` logs its own switch, so entering was counted and two
    of the three ways OUT were not - which makes exits undercount entries and
    the feature look stickier than it is. Same rule the old page follows: the
    mode is covered at all three call sites, because a zero has to be readable.
  */
  const leaveFocus = useCallback(() => {
    setFocusMode(false);
    logGA4Event({ name: 'focus_mode_toggled', params: { enabled: false, surface: 'puzzles' } });
  }, []);
  useEffect(() => {
    if (!focusMode) return;
    const onKey = (e: KeyboardEvent) => {
      /* With the explanation open, Escape closes that first. */
      if (e.key === 'Escape' && !document.querySelector('[data-workspace-overlay]')) leaveFocus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focusMode, leaveFocus]);
  /*
    A RUN'S OWN `rated` WINS while it is the run that served this puzzle, and
    the server enforces the same thing on the attempt - the page follows it so
    the two cannot disagree in front of the player.
  */
  const record = usePuzzleRecord(puzzle.puzzleState, {
    rated: puzzle.servedRunId && puzzle.servedRunId === run.session?.id
      ? run.session.rated
      : settings.rated,
    sessionId: puzzle.servedRunId,
    onResultRecorded: run.refresh,
    /* A puzzle restored from a previous visit whose attempt the server already
       has. Without it the rating moves twice for one solve. */
    alreadyReportedFor: puzzle.restoredReportedFor,
    /* And one restored already over is not counted into this sitting's record
       or announced to GA4 a second time. */
    restoredResolvedFor: puzzle.restoredResolvedFor,
    /* And a restored puzzle of any kind has no honest solve duration. */
    durationUnreliable: puzzle.restoredPuzzleId != null
      && puzzle.restoredPuzzleId === puzzle.puzzleState.puzzle?.id,
    /*
      THE ANTI-GRIND RULE, WHICH THE NEW PAGE WAS NOT APPLYING AT ALL.

      A pinned band more than 200 points from the player's own rating freezes the
      attempt - solving 800s at 1600 must not move a rating. The hook already
      took a `bandIsFarFromRating` flag and the page never passed one, so every
      such attempt was written RATED where the old page writes it frozen.

      The BAND is passed rather than the verdict, because the rating it is
      compared against lives inside this hook. Two owners of one number is how
      the displayed rating came to disagree with the server's on 08-05.
    */
    ratingBand: settings.filterMode === 'manual' ? settings.ratingRange : null,
  });
  /*
    WHAT THE LIVE REGION SAYS (B4), restored to what v1 said (C6, D27).

    The rating change is appended to the outcome rather than announced on its
    own: it arrives 100-300ms later, and two announcements for one event is the
    noise that makes people switch a live region off. The board hook cannot do
    this - the rating lives in the record - and its note that "this page does not
    report results yet" stopped being true when the page began reporting them.

    The two notices v1 announced through their own status blocks are spoken here
    too, since this is the card's only live region. Nothing matched outranks the
    outcome, because the board still shows the last puzzle, already resolved.
    Offline is spoken when the offline puzzle arrives, then outcomes as usual.
  */
  const ratingNote = record.lastSolveFrozen ? ' Practice mode.'
    : record.ratingDelta !== null
      ? ` ${record.ratingDelta >= 0 ? '+' : ''}${record.ratingDelta.toFixed(0)} rating.`
      : '';
  const outcome = puzzle.puzzleState.status === 'correct' || puzzle.puzzleState.status === 'failed'
    ? `${puzzle.announcement}${ratingNote}`
    : puzzle.announcement;
  const announcement = puzzle.filterFoundNothing
    ? 'Nothing matched that filter. The board still has your last puzzle.'
    : puzzle.serverUnreachable && !outcome
      ? 'Cannot reach the server. These are offline practice puzzles, so nothing here is scored.'
      : outcome;
  /*
    THE RESUME PAYLOAD MUST KNOW THE ATTEMPT WAS SCORED, or coming back to a
    resolved puzzle reports it a second time and moves the rating twice for one
    solve. Promised in the commit that added resume; paid here, in the commit
    that added reporting.
  */
  useEffect(() => { setAttemptRecordedFor(record.attemptRecordedFor); }, [record.attemptRecordedFor]);

  /*
    STARTING A RUN DRAWS ITS FIRST PUZZLE (owner, 2026-08-05, after driving the
    old page: pressing Start run and then having to press New Puzzle to actually
    begin reads as a broken start).

    Only on the transition INTO a run. Ending one leaves the board alone, because
    the player is then solving freely and nothing has been asked of them. The
    provenance rule is untouched - the run does not CLAIM the position that was
    already up, it serves one of its own.
  */
  const runId = run.running ? run.session?.id ?? null : null;
  const startedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!runId || startedRef.current === runId) return;
    startedRef.current = runId;
    /*
      UNLESS THE PUZZLE ON SCREEN IS ALREADY THIS RUN'S (Codex, 2026-08-16).

      A run is not only STARTED here - it is also DISCOVERED, because the session
      lookup is asynchronous and resolves after mount. So a player who reloads
      mid-run comes back to the puzzle they were working, this effect sees the
      run appear, and draws a new one over the top of it. Their position is gone
      and the attempt they were part-way through is abandoned.

      `servedRunId` is exactly the question to ask: it is the run that served the
      puzzle on the board, restored from the resume payload. When it matches,
      this run already has a puzzle up and there is nothing to draw.
    */
    if (puzzle.servedRunId === runId) return;
    void puzzle.nextPuzzle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  /* The attempt for the puzzle ON THE BOARD is already scored. */
  const attemptRecorded = record.attemptRecordedFor != null
    && record.attemptRecordedFor === puzzle.puzzleState.puzzle?.id;
  /*
    THE RUN STAYS ON SCREEN THROUGH THE ATTEMPT THAT ENDED IT. `status` flips to
    ended the moment the last attempt is recorded - which B1 does on the first
    wrong move - so without this the card would drop back to a chooser under a
    player still working the final puzzle. It acknowledges itself when that
    puzzle is RESOLVED.
  */
  /*
    A STOPPED RUN REPORTS ITSELF IMMEDIATELY; A COMPLETED ONE WAITS FOR THE
    PUZZLE THAT ENDED IT.

    The delay exists for one case: a run whose LAST attempt has landed while the
    player is still working that position - B1 records on the first wrong move,
    so the run is over server-side before it is over for them. Keying the whole
    thing on `attemptRecorded && resolved` also swallowed the other case, and the
    probe caught it: press Stop run on a puzzle you have not touched and the card
    said nothing at all. No "Run stopped", no count, no line - the player asks for
    the run to end and the page acknowledges nothing.

    An abandoned run has nothing to wait for. They pressed the button.
  */
  const stoppedByHand = run.session?.status === 'abandoned';
  const runOnScreen = run.running
    || (run.ended && !stoppedByHand && attemptRecorded && !puzzle.isResolved);
  const runFinished = run.ended
    && (stoppedByHand || (attemptRecorded && puzzle.isResolved));

  /*
    THE PAGE OWNS THE PLAN, not the card.

    Two things need it: the card that shows what today asks for, and the RUN
    card, which has to know whether the run it is describing belongs to a plan.
    Two `usePlan()` calls would be two lookups and two answers to one question.
  */
  /* The one offer, shown in the plan card's no-plan state (C6, owner). */
  const planOffer = usePlanOffer();
  const plan = usePlan({
    activeSessionId: run.running ? run.session?.id ?? null : null,
    /* A plan day is started through the PLAN's endpoint, so the run card finds
       out the same way it does after a reload: by asking. Without this a player
       who pressed Start this session had a run on the server and a chooser on
       screen. */
    onSessionStarted: run.reload,
  });

  /*
    Is the run on screen a plan session? Answered from the plan's own items,
    because the link IS `plan_items.session_id` - the session row knows nothing
    about plans, by design.
  */
  const planItemForRun = run.running && run.session
    ? plan.plan?.items.find(i => i.sessionId === run.session!.id) ?? null
    : null;

  /*
    AUTO-START NEXT, and every clause is a rule the owner set after testing
    Lichess's version (2026-08-06). The toggle has been on the settings card
    since the card was built and drove nothing at all, which is the same defect
    as the filters: a control that renders and does not act.

    ONLY ON A SOLVE. Not on a reveal - *"after asking to view the solution it
    doesn't continue automatically, you need to press"* - and not on a failure,
    because a wrong move does not end a puzzle here: it settles the score and
    hands the position straight back, so the player still has to find the move.
    So it checks `status === 'correct'` rather than reusing `isResolved`, which
    is `correct || solution`.

    IT CAN BE CANCELLED, and that is the clause the feature is not worth shipping
    without. The real cost of auto-advance is losing the moment right after a
    solve, which is often the most instructive one on the board. Any deliberate
    act during the wait calls it off and hands the button back.

    NOT AT THE END OF A RUN. A finished run stops at "Run complete"; sliding on
    into free solving would erase the boundary the run card exists to draw.

    NOT ON A RESTORED SOLVE. Coming back to a puzzle already solved would
    advance off it before it could be read, and the resume exists precisely so
    that line is still there. A REF, not state: the puzzle id goes null -> id on
    the mount that performs the restore, so a state flag keyed on the id is
    cleared a tick after being set.
  */
  /*
    THE ONE REMINDER OFFER (EMAIL_REMINDERS_IMPLEMENTATION_PLAN C2, owner C0): after a solve,
    in the live card's empty detail slot. While it is on screen it HOLDS auto-advance, like a
    deliberate act would: the offer is made once, ever, and a player with Auto next on would
    otherwise see it for 1.2 seconds and lose it.
  */
  const { user, isLoading: authLoading } = useAuth();
  /*
    #521 B: THE ASK (owner, 2026-11-26: a card where New Puzzle was). Shown when the server refused the last draw
    because today's free puzzles are used up. The button leads to the Premium page FIRST (owner, after research the
    same day: the plans, the annual saving and the one-year pass persuade more than a cold checkout), with the
    visitor's first plan for their country chosen (the country table, fetched only while the ask shows). There,
    "Sign in to buy" brings a guest back with the checkout opening by itself.
  */
  const allowance = usePuzzleAllowance(record.stats.solved + record.stats.failed);
  /* #418 v3 C1: today's rating line, re-read after each result like the allowance. */
  const todayLine = usePuzzleToday(record.stats.solved + record.stats.failed);
  /*
    #418 v3 C2: A RELOAD AT THE LIMIT. The page's first draw (the daily puzzle) is served, not refused (the allowance is
    charged at the first move), so nothing refused would bring the ask. When the server has recorded today's summary,
    no puzzle is left and no run holds today's pass, the day is over: the ask shows at once, with the summary.
  */
  const reloadLimit: DailyLimit | null = todayLine?.summary && allowance?.puzzle && allowance.puzzle.left === 0 && !allowance.runPass
    ? { feature: 'puzzle', limit: allowance.puzzle.limit, resetsAt: allowance.puzzle.resetsAt, daySummary: todayLine.summary }
    : null;
  const askLimit = puzzle.dailyLimit?.feature === 'puzzle' ? puzzle.dailyLimit : reloadLimit;
  const askCountry = useVisitorCountry(askLimit !== null);
  const askPlan = askLimit && askCountry !== undefined ? plansForCountry(askCountry)[0] ?? null : null;
  const ask = askLimit ? {
    /* "used": still true after a run that went past the 5 (Fable, Codex; owner, 2026-11-26). */
    title: `You've used today's ${askLimit.limit} free puzzles.`,
    /*
      WHEN THEY ARE BACK, in the visitor's own time (Fable, Codex: the day turns at Bucharest midnight, 03:30 in
      India, so "today's" alone can mislead). Information, never "come back tomorrow" (owner: it reads as go away).
      Then what stays unlimited, a game, as a way to stay (owner).

      THREE ROWS, ONE FACT EACH, AN ICON EACH (owner, 2026-11-26, option B of three tried on the real card: the
      paragraph broke its sentences mid-thought and the Master line read as a footnote). The rows sit tight
      (`gap-[0.12em]`): at 390 and 360 wide a looser gap pushed Try other lines 2-3px past the card (measured).
    */
    line: (
      <span className="flex flex-col gap-[0.12em]">
        <span className="ask-fact-premium flex items-start gap-[0.45em]">
          <InfinityIcon className="w-[1em] h-[1em] mt-[0.2em] shrink-0" aria-hidden />
          <span>Unlimited puzzles with Premium</span>
        </span>
        <span className="flex items-start gap-[0.45em]">
          <Clock className="w-[1em] h-[1em] mt-[0.2em] shrink-0" aria-hidden />
          <span>Free puzzles back {whenBack(askLimit.resetsAt)}</span>
        </span>
        <span className="flex items-start gap-[0.45em]">
          <Swords className="w-[1em] h-[1em] mt-[0.2em] shrink-0" aria-hidden />
          <span>
            <Link to="/play" className="text-link underline underline-offset-2">Play the Master</Link> meanwhile
          </span>
        </span>
      </span>
    ),
    spoken: `Unlimited puzzles with Premium. Free puzzles back ${whenBack(askLimit.resetsAt)}. Play the Master meanwhile.`,
    /* Owner, 2026-11-26: no price on the button (more presses); the checkout shows it. */
    buyLabel: 'See Premium',
    onBuy: () => {
      logGA4Event({ name: 'premium_link_clicked', params: { from: 'puzzle_ask' } });
      /* No plan while the country is still unknown: the page then chooses its own first card. */
      /* `from=puzzle_ask` (B3): the Premium page carries it through sign-in onto its Buy and checkout events. */
      navigate(askPlan ? `/premium?plan=${askPlan.key}&from=puzzle_ask` : '/premium?from=puzzle_ask');
    },
  } : null;
  /*
    #521 B: NO RUN STARTS AT THE LIMIT (Fable, Codex; owner, 2026-11-26): both Start buttons read "Back tomorrow"
    (or the hour), disabled, the opening trainer's pattern (#472). Known from a refused draw, or from the allowance
    read after each result (so right after a run that went past the 5, before any refusal).
  */
  const knownLimit: DailyLimit | null = askLimit ?? (allowance?.puzzle && allowance.puzzle.left === 0
    ? { feature: 'puzzle', limit: allowance.puzzle.limit, resetsAt: allowance.puzzle.resetsAt }
    : null);
  const runStartBlocked = knownLimit ? backLabel(knownLimit) : null;
  /* #521 B2: which arrangement the page shows ('b' the new one), the same for everyone (`layoutArm.ts`). */
  const [arm] = useState(layoutArm);
  /* #521 (owner, 2026-11-26): stacked, the new half puts the record above the settings; columns keep their order. */
  const recordFirstWhenStacked = (cards: ReactElement[]) => {
    if (arm !== 'b' || workspaceMode?.mode !== 'stacked') return cards;
    const at = cards.findIndex(c => c.key === 'record-merged');
    return at <= 0 ? cards : [cards[at], ...cards.slice(0, at), ...cards.slice(at + 1)];
  };
  const tryLines = useCallback(() => {
    logGA4Event({ name: 'puzzle_try_lines', params: { outcome: puzzle.puzzleState.status === 'correct' ? 'solved' : 'revealed' } });
    puzzle.stepTo(1);
  }, [puzzle]);
  /* The run setup card, in both halves; the new half's "What to train" card shows it to customise a run, during one,
     and with a finished run's result (#521). Not memoised: it reads the run and the puzzle on every render, as the
     inline element did. */
  const renderRunSetup = (onClose: (() => void) | undefined) => (
    <PuzzleRunSetupCard
      onClose={onClose}
      /* #521: the new half names the two lists Mode and Area (owner, 2026-11-26). */
      modeLabel={arm === 'b' ? 'Mode' : undefined}
      areaLabel={arm === 'b' ? 'Area' : undefined}
      options={run.options}
      areas={run.areas}
      selection={run.selection}
      /* #521: what a solver chooses to train, logged where the choice is made. */
      onSelectionChange={(value) => {
        logGA4Event({ name: 'puzzle_filter_changed', params: { kind: 'mode', value, surface: 'run_setup' } });
        run.setSelection(value);
      }}
      area={run.area}
      onAreaChange={(value) => {
        logGA4Event({ name: 'puzzle_filter_changed', params: { kind: 'area', value: value ?? 'all', surface: 'run_setup' } });
        run.setArea(value);
      }}
      total={run.total}
      onTotalChange={(value) => {
        logGA4Event({ name: 'puzzle_filter_changed', params: { kind: 'length', value: String(value), surface: 'run_setup' } });
        run.setTotal(value);
      }}
      running={runOnScreen}
      finished={runFinished}
      /* Stopped and completed are different sentences - see the card. */
      runStatus={run.session?.status}
      runSelection={run.session?.selection}
      runArea={run.session?.area ?? null}
      theme={run.theme}
      onThemeClear={() => run.setTheme(null)}
      runTheme={run.session?.theme ?? null}
      runTotal={run.session?.total}
      runRated={run.session?.rated}
      completed={run.session?.progress.completed ?? 0}
      /* The counter is pinned to the puzzle on screen. */
      puzzleId={puzzle.puzzleState.puzzle?.id ?? null}
      attemptRecorded={attemptRecorded}
      /* No number over a puzzle the run never served. */
      servedByRun={runOnScreen && puzzle.servedRunId === run.session?.id}
      busy={run.starting}
      loading={run.loading}
      onStart={input => run.startRun(input, settings.rated)}
      onStop={run.stopRun}
      startBlocked={runStartBlocked}
      /* A plan day says so, in the title and in the way out (D13). A
         review day is mixed. */
      planArea={planItemForRun
        ? (planItemForRun.kind === 'review' ? 'mixed' : planItemForRun.area)
        : null}
    />
  );
  const reminderOffer = useReminderOffer({
    status: puzzle.puzzleState.status,
    puzzleId: puzzle.puzzleState.puzzle?.id ?? null,
    signedIn: !!user,
    confirmedSolves: record.progress.totalSolved,
  });

  const autoAdvanceArmedAtRef = useRef(0);
  // the Master has a line still to say on the live card (#401 B4)
  const [voiceBusy, setVoiceBusy] = useState(false);
  /* A RETURNING PLAYER, for the Master's "Welcome back." (#401 C2): someone who solved on an earlier day. Read from
     the first last-played date this page sees (the browser's copy, then the server's), before today's first result
     overwrites it with today; fixed once known. */
  const returningRef = useRef<boolean | null>(null);
  if (returningRef.current === null && record.progress.lastPlayed) {
    returningRef.current = record.progress.totalSolved > 0
      && record.progress.lastPlayed < new Date().toISOString().split('T')[0];
  }
  const [autoAdvanceCancelled, setAutoAdvanceCancelled] = useState(false);
  const resumedResolvedIdRef = useRef<string | null>(null);
  useEffect(() => { setAutoAdvanceCancelled(false); }, [puzzle.puzzleState.puzzle?.id]);
  /* Captured before anything can advance: the first status this page ever sees
     for a puzzle is `correct` only when the puzzle was restored solved. */
  const firstStatusRef = useRef<string | null>(null);
  useEffect(() => {
    const id = puzzle.puzzleState.puzzle?.id ?? null;
    if (!id || firstStatusRef.current === id) return;
    firstStatusRef.current = id;
    if (puzzle.puzzleState.status === 'correct') resumedResolvedIdRef.current = id;
  }, [puzzle.puzzleState.puzzle?.id, puzzle.puzzleState.status]);

  const momentOnScreen = PROGRESS_MOMENT_LIVE && !!record.moment
    && record.moment.puzzleId === (puzzle.puzzleState.puzzle?.id ?? null) && puzzle.puzzleState.status === 'correct';
  const autoAdvanceArmed = settings.autoAdvance
    && !autoAdvanceCancelled
    && puzzle.puzzleState.status === 'correct'
    && resumedResolvedIdRef.current !== puzzle.puzzleState.puzzle?.id
    && !runFinished
    && !reminderOffer.visible
    && !puzzle.loading;

  useEffect(() => {
    if (!autoAdvanceArmed) return;
    const cancel = () => setAutoAdvanceCancelled(true);
    /* `pointerdown` and `keydown`, not `mousemove`: a cursor that happens to be
       over the board is not an intention, and cancelling on it would make the
       feature fail for anyone who solves with the mouse still on the piece they
       just moved. */
    window.addEventListener('pointerdown', cancel);
    window.addEventListener('keydown', cancel);
    autoAdvanceArmedAtRef.current = performance.now();
    return () => {
      window.removeEventListener('pointerdown', cancel);
      window.removeEventListener('keydown', cancel);
    };
  }, [autoAdvanceArmed]);
  /*
    THE NEXT PUZZLE WAITS FOR THE MASTER (#401 B4): 1.2 s after the solve cut his solved line on most solves
    (measured in the speech simulator: 16 of 21). It now moves on 1.2 s after the solve or a short pause after his
    line ends, whichever is later, and never later than AUTO_ADVANCE_MAX_MS after the solve (a recording that never
    loads must not hold the page).
  */
  useEffect(() => {
    if (!autoAdvanceArmed) return;
    const since = performance.now() - autoAdvanceArmedAtRef.current;
    /* #418: a moment holds the page longer (it is the point of it): until he has finished, plus MOMENT_LOOK_MS to
       look at the graph, never past its own cap. */
    const cap = momentOnScreen ? MOMENT_AUTO_ADVANCE_MAX_MS : AUTO_ADVANCE_MAX_MS;
    const after = momentOnScreen ? MOMENT_LOOK_MS : AUTO_ADVANCE_AFTER_LINE_MS;
    const wait = voiceBusy
      ? cap - since
      : Math.max(AUTO_ADVANCE_MS - since, since > AUTO_ADVANCE_MS ? Math.min(after, cap - since) : 0);
    const timer = window.setTimeout(() => { void puzzle.nextPuzzle(); }, Math.max(0, wait));
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoAdvanceArmed, voiceBusy, momentOnScreen]);

  /*
    THE EXPLANATION PANEL (owner, 2026-10-21): opened from the live card's
    reserved row once the puzzle is resolved, drawn over the activity lane so
    the board stays in view, and the board goes back to the position the
    explanation describes, `linePly[1]` (stepTo(1)).

    Open FOR A PUZZLE, so it closes by itself when the next one arrives. Fetched
    on open and kept for that puzzle, never prefetched: most puzzles are never
    explained, and the answer is cached at the edge for a day anyway.
  */
  const currentPuzzleId = puzzle.puzzleState.puzzle?.id ?? null;
  /* #418: the progress moment this solve brought, while its puzzle is on the board solved and not explored. Until
     the next puzzle starts it replaces "Set up a run"; the live card says it. */
  const shownMoment = PROGRESS_MOMENT_LIVE && record.moment && record.moment.puzzleId === currentPuzzleId
    && puzzle.puzzleState.status === 'correct' && !puzzle.exploreAt ? record.moment : null;
  /*
    #418 v3 C2: THE DAY'S SUMMARY, when a free player's puzzles for today are over: from a refused draw (the server
    replays it with every one) or from the result that ended the day, once that puzzle is no longer being solved (a
    miss is reported on the first wrong move, and the player is not interrupted while they keep working it).
  */
  const daySummary = PROGRESS_MOMENT_LIVE
    ? (asDaySummary(askLimit?.daySummary)
      ?? (record.daySummary && puzzle.puzzleState.status !== 'playing' ? record.daySummary : null)
      /* a reload: the first draw (the daily puzzle) is served, not refused, so the summary comes from today's line */
      ?? (!record.daySummary ? todayLine?.summary ?? null : null))
    : null;
  const momentPending = PROGRESS_MOMENT_LIVE && record.momentPendingFor != null && record.momentPendingFor === currentPuzzleId;
  /* #418 C6: measured once per moment; the next puzzle after it says how long it stayed and whether he had finished. */
  const momentShownRef = useRef<{ tryId: string; kind: string; at: number } | null>(null);
  useEffect(() => {
    if (!shownMoment || momentShownRef.current?.tryId === shownMoment.tryId) return;
    momentShownRef.current = { tryId: shownMoment.tryId, kind: shownMoment.kind, at: performance.now() };
    let voiceOn = false;
    try { voiceOn = window.localStorage.getItem(MASTER_VOICE_KEY) === '1'; } catch { /* unknown: off */ }
    logGA4Event({ name: 'puzzle_moment_shown', params: {
      kind: shownMoment.kind, why: shownMoment.why, returning: shownMoment.returning === true, voice_on: voiceOn, lines: shownMoment.lines.length,
    } });
  }, [shownMoment]);
  const nextPuzzleFromCard = useCallback(() => {
    const shown = momentShownRef.current;
    if (shownMoment && shown && shown.tryId === shownMoment.tryId) {
      logGA4Event({ name: 'puzzle_moment_next', params: { kind: shown.kind, ms_shown: Math.round(performance.now() - shown.at), finished: !voiceBusy } });
    }
    return puzzle.nextPuzzle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownMoment, voiceBusy, puzzle.nextPuzzle]);
  /* The game a puzzle made from a game came from (#245 B4); null for a corpus puzzle. */
  const gameLines = useMemo(() => gameCardLines(puzzle.puzzleState.puzzle), [puzzle.puzzleState.puzzle]);
  const [explain, setExplain] = useState<{ id: string; openedAt: number } | null>(null);
  const [fetchedExplanation, setFetchedExplanation] = useState<{ id: string; data: PuzzleExplanation } | null>(null);
  const explainOpen = explain != null && explain.id === currentPuzzleId && puzzle.isResolved;
  useEffect(() => {
    if (explain && explain.id !== currentPuzzleId) setExplain(null);
  }, [explain, currentPuzzleId]);

  const openExplanation = useCallback(() => {
    const id = currentPuzzleId;
    if (!id) return;
    setExplain({ id, openedAt: Date.now() });
    puzzle.stepTo(1);
    logGA4Event({
      name: 'puzzle_explanation_opened',
      params: {
        outcome: puzzle.puzzleState.status === 'correct' ? 'solved' : 'revealed',
        puzzle_rating: puzzle.puzzleState.puzzle?.rating ?? 0,
        in_run: puzzle.servedRunId != null,
      },
    });
    if (fetchedExplanation?.id === id && fetchedExplanation.data.status === 'ready') return;
    setFetchedExplanation(null);
    void fetchPuzzleExplanation(id).then((data) => {
      setFetchedExplanation({ id, data });
      logGA4Event({ name: 'puzzle_explanation_result', params: { status: data.status } });
    });
  }, [currentPuzzleId, fetchedExplanation, puzzle]);

  const closeExplanation = useCallback((via: 'close' | 'next_puzzle') => {
    if (!explain) return;
    logGA4Event({ name: 'puzzle_explanation_closed', params: { ms_open: Date.now() - explain.openedAt, via } });
    setExplain(null);
    /* Focus back to the control that opened it, which is uncovered again. */
    if (via === 'close') {
      requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-explain-trigger]')?.focus());
    }
  }, [explain]);

  useEffect(() => {
    if (!explainOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeExplanation('close'); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [explainOpen, closeExplanation]);

  /*
    "ABOUT THIS TRAINER" (prerender plan B3, owner 2026-11-19), over the context lane. Escape closes it, and focus goes
    back to the row that opened it.
  */
  const [aboutOpen, setAboutOpen] = useState(false);
  const closeAbout = useCallback(() => {
    setAboutOpen(false);
    requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-testid="go-to-about"]')?.focus());
  }, []);
  useEffect(() => {
    if (!aboutOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeAbout(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [aboutOpen, closeAbout]);

  const startPlanSession = useCallback(async (item: PlanItem) => {
    if (!await plan.start(item.id)) return;
    logGA4Event({
      name: 'plan_session_started',
      params: { area: item.area, total: item.total, kind: item.kind, surface: 'card' },
    });
  }, [plan]);


  /*
    ON THE WORKSPACE (layout redesign C5b, 2026-10-08).

    The page renders the shared `Workspace`: the board and its control strip in
    the centre, the live card, run setup and plan link in the activity lane with
    the analysis band as its foot, and the settings, the two record cards and the
    standings in the context lane with the appearance band as its foot. Every
    size is CSS (spec §3-§6): the board, the strip, the lanes, the card shares,
    the type and the spacing inside each card. Nothing here measures anything,
    which is what the geometry this replaced did with one observer for the row
    and one per card.

    Shares are the plan's (C5): v3's approved 231 : 252 : 101 is 2 : 2 : 1 in
    the `1 | 2 | 3` vocabulary, and the four record cards are equal. Focus mode
    is the Workspace's: the context lane goes and only the live card survives
    in the activity lane, with its foot, which is v3's own focus behaviour
    (owner, 2026-08-10, restored 2026-10-01).
  */
  const boardLabel = puzzle.puzzleState.puzzle && puzzle.puzzleState.status === 'playing'
    ? `Puzzle board. ${puzzle.puzzleState.puzzle.opening || puzzle.puzzleState.puzzle.prompt || 'Find the best move'}`
    : 'Puzzle board';

  return (
    /*
      `display: contents`: the page keeps its `main` landmark without adding a
      box between the page region and the Workspace, which fills the region.
    */
    <main className="contents">
      {/*
        THE SAME TWO TAGS THE CURRENT PAGE RENDERS, and they are not optional on
        a public route. `SeoHead` is the only thing that emits this route's
        title, description, canonical and Open Graph tags; `RouteHeading` is the
        page's only `<h1>`, `sr-only` because nothing may sit above the board
        (PRD 5.2). Both read `src/config/route-meta.json`.
      */}
      <SeoHead routeKey="puzzles" />
      {/*
        HOW IT WORKS, IN THE PAGE (B3): the same text the About panel shows, here for screen readers and search engines
        while the panel is closed (it is the built HTML's written content). Open, only the panel has it.
      */}
      <div className="sr-only">
        <RouteHeading routeKey="puzzles" />
        {!aboutOpen && <><h2>{ABOUT_TRAINER_TITLE}</h2><AboutTrainerText headingLevel="h3" /></>}
      </div>

      {/*
        THE WAY OUT, AND IT CANNOT LIVE IN THE LANE THE MODE HIDES (2026-08-15:
        *"the focus button doesn't work"*). The toggle is in the context lane's
        foot, which focus mode removes, so the exit is a fixed control with the
        shortcut named on it.
      */}
      {focusMode && (
        <button
          type="button"
          onClick={leaveFocus}
          className="surface-card fixed right-4 top-4 z-50 inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Minimize2 className="h-4 w-4" aria-hidden />
          Leave focus mode
          <kbd className="rounded border border-border px-1 text-[10px] text-muted-foreground">Esc</kbd>
        </button>
      )}

      <Workspace
        focus={focusMode}
        onModeChange={setWorkspaceMode}
        /* #521: on a phone the new half's cards are as tall as what they hold, not a share of the screen. */
        stackedFit={arm === 'b'}
        board={
          /*
            The wheel listener lives on this wrapper, so scrolling anywhere over
            the board steps the solved line. Coordinates are hidden under 480px
            by a container query on this slot (`index.css`): chessground draws
            them INSIDE the squares, so on a small board the file letters print
            over the back-rank pieces (2026-08-14). The board's size is CSS now,
            so the rule cannot be a prop.
          */
          <div
            ref={puzzle.attachWheel}
            onPointerDownCapture={puzzle.puzzleState.wrongMove ? puzzle.onBoardPointerDown : undefined}
            data-skeleton-card="board"
            className="w-full"
            role="group"
            aria-label={boardLabel}
          >
            <ChessBoard
              fen={puzzle.displayedFen}
              orientation={puzzle.displayedOrientation}
              dests={puzzle.boardDests}
              turnColor={puzzle.displayedTurnColor}
              movableColor={puzzle.isResolved ? 'both' : puzzle.puzzleState.movableColor}
              lastMove={puzzle.displayedLastMove}
              check={puzzle.displayedCheck}
              onMove={puzzle.onBoardMove}
              themeId={currentTheme.id}
              shapes={puzzle.wrongShapes}
              brushes={puzzle.boardBrushes}
              squareClasses={puzzle.wrongSquares}
            />
          </div>
        }
        toolbar={
          /*
            Navigation is ALWAYS SHOWN and usable only on a resolved attempt
            (PZ-043 A): mid-attempt, stepping back is an undo, which is what B1
            exists to prevent. History is enabled while EXPLORING too, because
            Back is the only way out of a "what if". The Workspace's toolbar slot
            stretches the bar to its row (2026-10-06).
          */
          <BoardControls
            historyDisabled={!puzzle.canReview && !puzzle.exploreAt}
            onFlip={puzzle.onFlip}
            onStart={() => puzzle.stepTo(0)}
            onBack={puzzle.onBack}
            onForward={() => puzzle.stepTo((puzzle.reviewIndex ?? puzzle.navCeiling) + 1)}
            onReset={puzzle.onReset}
          />
        }
        activity={{
          title: 'Puzzle',
          cards: [
            slot('live', 'puzzleLive', (
              <PuzzleLiveCard
                status={puzzle.puzzleState.status}
                lastMoveWrong={puzzle.puzzleState.lastMoveWrong}
                message={puzzle.puzzleState.message}
                rating={puzzle.puzzleState.puzzle?.rating}
                isDailyPuzzle={puzzle.isDaily}
                missedLabel={missedOnLabel(puzzle.puzzleState.puzzle?.missedAt)}
                prompt={puzzle.puzzleState.puzzle?.prompt}
                opening={puzzle.puzzleState.puzzle?.opening}
                exploring={Boolean(puzzle.exploreAt)}
                isMidSolve={puzzle.isMidSolve}
                puzzleId={puzzle.puzzleState.puzzle?.id ?? null}
                onVoiceBusyChange={setVoiceBusy}
                moment={shownMoment}
                momentPending={momentPending}
                playerRating={isRatingProvisional(record.progress) ? null : record.progress.estimatedRating}
                returning={returningRef.current === true}
                gameLines={gameLines}
                announcement={announcement}
                /* "Next Puzzle" inside a run, "New Puzzle" outside one. */
                sessionId={run.running ? run.session?.id ?? null : null}
                /*
                  Shown only once the run is OVER and only when the server could
                  measure it. Both numbers are the server's, derived from the
                  attempt log; the client counts nothing here.
                */
                runOutcome={runFinished
                  && run.session?.progress.performanceRating != null
                  && run.session?.progress.realizedScore != null
                  ? {
                    rating: run.session.progress.performanceRating,
                    realized: run.session.progress.realizedScore,
                    /* The attempts the figure is OVER, which is not always the
                       run's length: an unrated attempt is left out of both. */
                    total: run.session.progress.scoredAttempts,
                  }
                  : null}
                filterFoundNothing={puzzle.filterFoundNothing}
                serverUnreachable={puzzle.serverUnreachable}
                ask={ask}
                offer={reminderOffer.visible ? (
                  <ReminderOfferLine
                    state={reminderOffer.state}
                    signedIn={!!user}
                    onAccept={reminderOffer.accept}
                    onDismiss={reminderOffer.dismiss}
                  />
                ) : null}
                /*
                  Cleared AND redrawn in one act, with the cleared values passed
                  explicitly: this closure still holds the old filter.

                  THE THEME AND THE AREA, NOT THE STRENGTH (C6, D27). What found
                  nothing is the filter; a pinned band is the player's own choice
                  and v1 kept it. `nextPuzzle` lays these over the current draw,
                  so the band rides along untouched. The link goes too, or the
                  next draw would bring it straight back.
                */
                onClearFilter={() => {
                  setLinked(l => ({ ...l, theme: '', area: '' }));
                  settings.setTheme('');
                  void puzzle.nextPuzzle({ theme: undefined, area: undefined });
                }}
                loading={puzzle.loading}
                onNextPuzzle={nextPuzzleFromCard}
                onShowSolution={puzzle.puzzleActions.showSolution}
                /* Offline practice puzzles have no explanation to fetch. */
                /* A puzzle made from a game has no explanation (#245 B2): no button, so the
                   reserved row stays empty after the solve, as it does offline. */
                onExplain={puzzle.serverUnreachable || isGeneratedPuzzleId(currentPuzzleId) ? undefined : openExplanation}
                onTryLines={arm === 'b' ? tryLines : undefined}
              />
            ), 2, true),
            ...(arm === 'b' ? [
              /*
                #521 B2: the run setup and the plan card become one "What to train" card, three shares (theirs), so
                the live card keeps today's size. The progress moment (#418) keeps this slot.
              */
              slot('train', 'puzzleTrain', daySummary ? <DaySummaryCard summary={daySummary} offerAccount={!user && !authLoading} /> : shownMoment ? <ProgressMomentCard moment={shownMoment} offerAccount={!user && !authLoading} /> : (
                <PuzzleTrainCard
                  theme={linked.theme || settings.theme}
                  onThemeChange={(theme) => {
                    setLinked(l => ({ ...l, theme: '' }));
                    settings.setTheme(theme);
                  }}
                  filterMode={settings.filterMode}
                  onFilterModeChange={settings.setFilterMode}
                  ratingRange={settings.ratingRange}
                  onRatingRangeChange={settings.setRatingRange}
                  bandIsFarFromRating={record.bandIsFarFromRating}
                  options={run.options}
                  areas={run.areas}
                  selection={run.selection}
                  onSelectionChange={run.setSelection}
                  area={run.area}
                  onAreaChange={run.setArea}
                  onTotalChange={run.setTotal}
                  total={run.total}
                  startBlocked={runStartBlocked}
                  onStartRun={() => run.startRun({ total: run.total, selection: run.selection, area: run.selection === 'weak_areas' ? null : run.area }, settings.rated)}
                  busy={run.starting}
                  loading={run.loading}
                  runOnScreen={runOnScreen}
                  runFinished={runFinished}
                  hasPlan={plan.plan != null}
                  runSetup={renderRunSetup}
                  today={<TodayGraph line={todayLine} offerAccount={!user && !authLoading} />}
                />
              ), 3),
            ] : [
            slot('run-setup', 'puzzleRunSetup', daySummary ? <DaySummaryCard summary={daySummary} offerAccount={!user && !authLoading} /> : shownMoment ? <ProgressMomentCard moment={shownMoment} offerAccount={!user && !authLoading} /> : (
              renderRunSetup(undefined)
            ), 2),
            slot('plan-link', 'puzzlePlan', (
              <PuzzlePlanCard
                plan={plan.plan}
                activeItem={plan.activeItem}
                nextItem={plan.nextItem}
                nextDayTotal={plan.nextDayTotal}
                loading={plan.loading}
                busy={plan.busy}
                error={plan.error}
                /*
                  A RUN IN PROGRESS BLOCKS A PLAN DAY, and the card says so rather
                  than letting the server refuse after the click. What blocks is a
                  run belonging to something else, which is the server's 409.
                */
                blockedReason={run.running && planItemForRun == null
                  ? 'Finish or stop your current run first'
                  : null}
                onStart={startPlanSession}
                offer={planOffer.offer}
                onOfferShown={planOffer.onShown}
                onOfferAccept={planOffer.onAccept}
                onOfferDismiss={planOffer.onDismiss}
              />
            ), 1),
            ]),
          ],
          /*
            THE ANALYSIS BAND IS GATED ON `isResolved` AND NOTHING ELSE. `failed`
            is transient, so anything keyed on "not playing" would run the engine
            for a fraction of a second on every wrong move (B1). The engine
            follows the board; the link opens the position the solver was given,
            `linePly[1]` (owner, 2026-08-10).
          */
          foot: footSlot('analysis', (
            <PuzzleAnalysisCard
              enabled={puzzle.isResolved}
              fen={puzzle.displayedFen}
              linkFen={puzzle.linePly?.[1]?.fen}
              orientation={puzzle.displayedOrientation}
            />
          )),
          overlay: explainOpen ? {
            label: 'Explanation',
            content: (
              <PuzzleExplanationPanel
                explanation={fetchedExplanation?.id === currentPuzzleId ? fetchedExplanation.data : null}
                onClose={() => closeExplanation('close')}
                onNextPuzzle={() => { closeExplanation('next_puzzle'); void puzzle.nextPuzzle(); }}
                nextLabel={run.running ? 'Next Puzzle' : 'New Puzzle'}
                loading={puzzle.loading}
              />
            ),
          } : null,
        }}
        context={{
          title: 'Your record',
          cards: recordFirstWhenStacked([
            slot('settings', 'puzzleSettings', (
              <PuzzleSettingsCard
                rated={settings.rated}
                onRatedChange={settings.setRated}
                autoAdvance={settings.autoAdvance}
                onAutoAdvanceChange={settings.setAutoAdvance}
                /* The theme being SERVED, which a link can set; picking one
                   replaces the link (C6, D27). */
                theme={linked.theme || settings.theme}
                onThemeChange={(theme) => {
                  setLinked(l => ({ ...l, theme: '' }));
                  settings.setTheme(theme);
                }}
                filterMode={settings.filterMode}
                onFilterModeChange={settings.setFilterMode}
                ratingRange={settings.ratingRange}
                onRatingRangeChange={settings.setRatingRange}
                bandIsFarFromRating={record.bandIsFarFromRating}
                /* #521: the new half has the picker in its "What to train" card. */
                showPicker={arm !== 'b'}
              />
            )),
            /*
              THE TWO RECORD CARDS, with production's own stats, order and marks
              (owner, 2026-08-06). `null` renders a dash and never `0`: *we do not
              know yet* and *you scored nothing* are different sentences.
            */
            /*
              #521 B2: the new half has ONE record card, the same card type and grid as the two it replaces (so the
              type scale and the measured content stay), holding what a first visit needs. Accuracy is on the
              training record.
            */
            ...(arm === 'b' ? [
              slot('record-merged', 'puzzleRecordFull', (
                <>
                  <span className="card-label inline-flex items-center gap-[0.35em]">
                    <History className="w-[1em] h-[1em]" />
                    Your record
                  </span>
                  <div className="card-body">
                    <StatGrid
                      columns={2}
                      stats={[
                        {
                          label: 'Rating',
                          value: record.progress.estimatedRating,
                          icon: <TrendingUp className="w-[1em] h-[1em] text-muted-foreground" />,
                          delta: isRatingProvisional(record.progress) ? 'est.'
                            : record.lastSolveFrozen ? 'practice'
                              : record.ratingDelta !== null ? `${record.ratingDelta > 0 ? '+' : ''}${record.ratingDelta}` : null,
                        },
                        {
                          label: 'Accuracy',
                          icon: <PieChart className="w-[1em] h-[1em] text-muted-foreground" />,
                          value: record.progress.totalSolved + record.progress.totalFailed > 0
                            ? `${Math.round((record.progress.totalSolved / (record.progress.totalSolved + record.progress.totalFailed)) * 100)}%`
                            : null,
                        },
                        { label: 'Solved', value: record.progress.totalSolved, icon: <CheckCircle2 className="w-[1em] h-[1em] text-success" /> },
                        { label: 'Best streak', value: record.progress.bestStreak, icon: <Zap className="w-[1em] h-[1em] text-muted-foreground" /> },
                        /* #418 (owner, 2026-11-27): the server's session (back to a 30-minute gap), so a reload keeps it
                           and it counts the same puzzles as the performance below; the page's own count until read. */
                        { label: 'Session', value: todayLine?.session?.solved ?? record.stats.solved, icon: <Clock className="w-[1em] h-[1em] text-muted-foreground" /> },
                        { label: 'Streak', value: record.stats.streak, icon: <Zap className="w-[1em] h-[1em] text-muted-foreground" /> },
                      ]}
                    />
                    <RecordFoot
                      allowance={allowance ? allowance.puzzle : undefined}
                      session={todayLine?.session}
                      days={todayLine?.days}
                    />
                  </div>
                </>
              /* Two shares: the card replaces two, so settings and Go to keep today's height and type (one share made
                 every card taller and the settings rows wrapped out of their card at 948x947). Its own type,
                 `puzzleRecordFull`, holds six stats in two shares at the one-share cards' type. */
              ), 2),
            ] : [
              slot('record-session', 'puzzleRecord', (
              <>
                <span className="card-label inline-flex items-center gap-[0.35em]">
                  <Clock className="w-[1em] h-[1em]" />
                  This session
                </span>
                <div className="card-body">
                  <StatGrid
                    columns={2}
                    stats={[
                      { label: 'Solved', value: record.stats.solved, icon: <CheckCircle2 className="w-[1em] h-[1em] text-success" /> },
                      { label: 'Missed', value: record.stats.failed, icon: <XCircle className="w-[1em] h-[1em] text-destructive" /> },
                      { label: 'Streak', value: record.stats.streak, icon: <Zap className="w-[1em] h-[1em] text-muted-foreground" /> },
                      {
                        label: 'Accuracy',
                        icon: <PieChart className="w-[1em] h-[1em] text-muted-foreground" />,
                        value: record.stats.solved + record.stats.failed > 0
                          ? `${Math.round((record.stats.solved / (record.stats.solved + record.stats.failed)) * 100)}%`
                          : null,
                      },
                    ]}
                  />
                </div>
              </>
            )),
              slot('record-overall', 'puzzleRecord', (
              <>
                <span className="card-label inline-flex items-center gap-[0.35em]">
                  <History className="w-[1em] h-[1em]" />
                  Overall
                </span>
                <div className="card-body">
                  <StatGrid
                    columns={2}
                    stats={[
                      { label: 'Solved', value: record.progress.totalSolved, icon: <CheckCircle2 className="w-[1em] h-[1em] text-success" /> },
                      {
                        label: 'Rating',
                        value: record.progress.estimatedRating,
                        icon: <TrendingUp className="w-[1em] h-[1em] text-muted-foreground" />,
                        /* `est.` while the record is too thin to claim a rating,
                           `practice` when the last attempt was frozen (Codex,
                           2026-08-16). The delta slot costs no height. */
                        delta: isRatingProvisional(record.progress) ? 'est.'
                          : record.lastSolveFrozen ? 'practice'
                            : record.ratingDelta !== null ? `${record.ratingDelta > 0 ? '+' : ''}${record.ratingDelta}` : null,
                      },
                      /* 'Streak', not 'Best': the same measure as the session
                         card's over a different window. */
                      { label: 'Streak', value: record.progress.bestStreak, icon: <Zap className="w-[1em] h-[1em] text-muted-foreground" /> },
                      {
                        label: 'Accuracy',
                        icon: <PieChart className="w-[1em] h-[1em] text-muted-foreground" />,
                        value: record.progress.totalSolved + record.progress.totalFailed > 0
                          ? `${Math.round((record.progress.totalSolved / (record.progress.totalSolved + record.progress.totalFailed)) * 100)}%`
                          : null,
                      },
                    ]}
                  />
                </div>
              </>
            )),
            ]),
            slot('standings', 'puzzleStandings', (
              <PuzzleStandingsCard
                onAbout={() => {
                  logGA4Event({ name: 'puzzle_about_opened', params: { in_run: run.running } });
                  setAboutOpen(true);
                }}
              />
            )),
          ]),
          overlay: aboutOpen ? { label: ABOUT_TRAINER_TITLE, content: <PuzzleAboutPanel onClose={closeAbout} /> } : null,
          foot: footSlot('theme-focus', (
            <PuzzleAppearanceCard
              currentThemeId={currentTheme.id}
              onThemeChange={changeTheme}
              focusMode={focusMode}
              /* Columns only (owner, 2026-10-08): no toggle when stacked. */
              onToggleFocusMode={canFocus ? () => setFocusMode(f => !f) : undefined}
            />
          )),
        }}
      />
    </main>
  );
}
