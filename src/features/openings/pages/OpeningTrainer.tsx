import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { Key } from '@lichess-org/chessground/types';
import { BookOpen, Check, ChevronRight, CornerUpLeft, Dumbbell, Eye, Flag, GraduationCap, Library, Lightbulb, ListTree, Minimize2, Pause, Play, RotateCcw, Route, Square } from 'lucide-react';
import { Workspace, WorkspaceList, type WorkspaceMode } from '@/components/workspace/Workspace';
import { slot, footSlot } from '@/components/workspace/slots';
import { ChessBoard } from '@/components/chess/ChessBoard';
import { BoardControls } from '@/components/chess/BoardControls';
import { GameMoveList } from '@/components/chess/GameMoveList';
import { useBoardStepInput } from '@/components/chess/useBoardStepInput';
import { useChrome } from '@/app/SiteShell';
import { useBoardTheme } from '@/hooks/useBoardTheme';
import { PuzzleAppearanceCard } from '@/features/puzzles/components/PuzzleAppearanceCard';
import { PuzzleAnalysisCard } from '@/features/puzzles/components/PuzzleAnalysisCard';
import { useLearningWalk } from '../hooks/useLearningWalk';
import { useTrainingWalk } from '../hooks/useTrainingWalk';
import { useTrainingSession } from '../hooks/useTrainingSession';
import { linesInScope, linesFrom, makeTrainedCheck, progress, type ScopeProgress } from '../training/trainingLines';
import { useAuth } from '@/features/auth/AuthContext';
import { useOutsideGrade } from '../hooks/useOutsideGrade';
import { ReasonList } from '../components/ReasonList';
import { PuzzleMaster } from '@/features/puzzles/components/PuzzleLiveCard';
import { OPENINGS_VOICE_KEY, useMasterVoice } from '@/features/master/useMasterVoice';
import { MASTER_LIVE } from '@/design/designFlags';
import { useReasonVoice } from '../reasonVoice';
import { boardMarks, NO_MARKS, reasonBrushes } from '../reasonBoardMarks';
import { MoveMarker, MOVE_ROW_RULE } from '../components/MoveMarker';
import { buildPositionHref } from '@/lib/positionDeepLink';
import { applyMove, positionFromFen } from '@/components/chess/chessLogic';
import { fetchRepertoires, type RepertoireListing, type TrainingScope } from '../services/openingsApi';
import { REPERTOIRE_SUITS, WRITTEN_STARTERS, WELCOME_END, WELCOME_GOALS, WELCOME_INTRO, readLastRepertoire, welcomeTexts, writeLastRepertoire, type WelcomeGoal } from '../welcome';

/** What the Master says on the welcome (#337), one stable list. */
const WELCOME_TEXTS = welcomeTexts();
import { logGA4Event } from '@/services/analytics';
import { backLabel, dailyLimitMessage, limitApplies } from '@/services/freePlanLimit';
import SeoHead from '@/components/SeoHead';
import RouteHeading from '@/components/RouteHeading';

/**
 * The opening trainer's learning mode (opening trainer plan D2-D3).
 *
 * Product description F1: the board and its controls in the centre, cards in a lane on each side.
 * - Right (activity) lane: the explanation of the last move first, because on a phone the lane's top card sits
 *   directly under the board and the explanation is what learning mode is for (F4); then the book moves of the
 *   position (F5) with Next: at our turn the repertoire's move, the other book moves listed as "also theory" (R1); at
 *   the opponent's turn every reply, each one playable.
 * - Left (context) lane, the narrow one: the repertoire, then the line played as a vertical list (F6; D5 makes it the
 *   line from its junction), and the appearance card at its foot as on every board page.
 *
 * Everything shown comes from `GET /api/openings/position`; nothing is computed here (owner, 2026-11-05).
 * At `/openings` (plan F2; dev-only at `/dev/openings` until then). `?repertoire=` picks a starter.
 */

/** E7 v1 (owner, 2026-11-11): what a session trains, on the D4 main / secondary flags. */
const SCOPES: ReadonlyArray<{ id: TrainingScope; label: string }> = [
  { id: 'main', label: 'Main lines' },
  { id: 'secondary', label: 'Sidelines' },
  { id: 'both', label: 'All lines' },
];
const NO_PATHS: string[] = [];

/** Scroll a row into view inside its scrolling list only (scrollIntoView would also scroll the page). */
function scrollChosenIntoList(el: HTMLElement | null) {
  if (!el) return;
  const list = el.closest('[data-workspace-list]') as HTMLElement | null;
  if (!list) return;
  const top = el.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop;
  if (top < list.scrollTop || top + el.offsetHeight > list.scrollTop + list.clientHeight) {
    list.scrollTop = Math.max(0, top - (list.clientHeight - el.offsetHeight) / 2);
  }
}

/** A move with no reason found (#173): one true line rather than an empty card (owner, 2026-11-10). */
const NO_REASON = 'A book move here.';

/** A book move is played in some games, so a share that rounds to 0 reads "under 1%", never "0%". */
const pct = (share: number) => (share > 0 && share < 0.005 ? 'under 1%' : `${Math.round(share * 100)}%`);
/** The evaluation after a move, White's point of view, as the analysis card prints it (+0.15, M3, M-3). */
const evalText = (m: { cp?: number | null; mate?: number | null }) => {
  if (m.mate != null) return m.mate > 0 ? `M${m.mate}` : `M-${Math.abs(m.mate)}`;
  if (m.cp == null) return null; // missing (an older response or side table): the share alone
  return m.cp > 0 ? `+${(m.cp / 100).toFixed(2)}` : (m.cp / 100).toFixed(2);
};
/** A move's share of the GM games, then its evaluation (owner, 2026-11-13: the evaluation on every move, not the
 *  word "engine"); an engine move, which no GM game played, has the evaluation alone. */
const gamesShare = (m: { share: number; games: number; cp?: number | null; mate?: number | null }, ofGames = '') =>
  [m.games > 0 ? `${pct(m.share)}${ofGames}` : null, evalText(m)].filter(Boolean).join(' · ') || 'engine';

/** A line as chess books write it: "1.e4 e6 2.Nf3", with "1...e5" only when it starts on Black's move. */
function lineText(sans: string[], startPly = 0): string {
  return sans.map((san, i) => {
    const ply = startPly + i;
    if (ply % 2 === 0) return `${Math.floor(ply / 2) + 1}.${san}`;
    return i === 0 ? `${Math.floor(ply / 2) + 1}...${san}` : san;
  }).join(' ');
}

/** "9.Ne5" or "9...Nf6", from the half-moves played before it since the start of the game. */
function numbered(pliesBefore: number, san: string): string {
  const n = Math.floor(pliesBefore / 2) + 1;
  return pliesBefore % 2 === 0 ? `${n}.${san}` : `${n}...${san}`;
}

function Muted({ children }: { children: string }) {
  return <p className="text-[0.92em] text-muted-foreground">{children}</p>;
}

export default function OpeningTrainer() {
  const [params, setParams] = useSearchParams();
  /*
    #337 (owner, 2026-11-18): a first visit opens on the welcome (the goals of the opening), not on the London; the
    player then chooses an opening. A returning player goes straight to the last one used, and a link naming one
    opens it. `?welcome=1` brings the welcome back ("The goals of the opening"). The London is still loaded behind
    the welcome, so choosing it is immediate.
  */
  const paramRepertoire = params.get('repertoire');
  const [lastRepertoire] = useState(readLastRepertoire);
  const repertoireId = paramRepertoire || lastRepertoire || 'london';
  useEffect(() => { if (paramRepertoire) writeLastRepertoire(paramRepertoire); }, [paramRepertoire]);
  // D6: the ready-made repertoires to choose from (the starters), from the server.
  const [starters, setStarters] = useState<RepertoireListing[] | null>(null);
  useEffect(() => {
    const ctrl = new AbortController();
    fetchRepertoires(ctrl.signal).then(setStarters).catch(() => { if (!ctrl.signal.aborted) setStarters([]); });
    return () => ctrl.abort();
  }, []);
  const walk = useLearningWalk(repertoireId);
  /*
    E2a: Learn and Train on one page, for the repertoire chosen (`?mode=train`). Each mode keeps its own state, so
    switching back finds learning where it was left.
  */
  const training = params.get('mode') === 'train';
  /** #337: the welcome, in learning mode only, before an opening is chosen (or when asked for again). */
  const welcome = !training && (params.get('welcome') === '1' || (!paramRepertoire && !lastRepertoire));
  /*
    E7 (owner, 2026-11-11): "Train from here" in learning mode trains only the lines through that position. The
    address carries it (`from=`, UCI moves from the repertoire's root), so a reload keeps it.
  */
  const fromParam = params.get('from');
  const from = useMemo(
    () => (fromParam ? fromParam.split(',').filter((u) => /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(u)) : NO_PATHS),
    [fromParam],
  );
  // E5: the session (Start, Pause, Stop, Resume, Reset) and its saved progress; the walk plays inside it.
  const sess = useTrainingSession(repertoireId, training, from);
  /** #338: the mistakes, the positions whose latest result is not right first time, over the whole repertoire. */
  const mistakesHere = sess.mistakes;
  /** #339: the positions due for review now. */
  const dueNow = sess.due;
  /*
    #472: after the free plan refuses a new session, Start says when it is back ("Back tomorrow") and is disabled; with
    a paused session, Start new leaves the row and Resume (free for today's session) takes it. The dialog has said it in
    full: a line in the card cut its buttons off at most window sizes (measured, scripts/verify-session-card-limit.mjs).
  */
  const refusedLimit = limitApplies(sess.refused?.limit ?? null) ? sess.refused!.limit : null;
  const refusedResume = !!refusedLimit && !!sess.refused?.resume;
  const focusKeys = useMemo(
    () => (sess.focus === 'mistakes' ? mistakesHere.map((m) => m.key) : sess.focus === 'review' ? dueNow.map((d) => d.key) : null),
    [sess.focus, mistakesHere, dueNow],
  );
  /** #339: "later today", "tomorrow", "in 3 days", by the visitor's own calendar. */
  const reviewWhen = (iso: string) => {
    const day = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000;
    const n = day(new Date(iso)) - day(new Date());
    return n <= 0 ? 'later today' : n === 1 ? 'tomorrow' : `in ${n} days`;
  };
  // none left and nothing running: the choice goes back to the lines under it (the row is gone, Start would be dead)
  useEffect(() => {
    if (!sess.session && ((sess.focus === 'mistakes' && mistakesHere.length === 0) || (sess.focus === 'review' && dueNow.length === 0))) sess.setScope(sess.scope);
  }, [sess.session, sess.focus, mistakesHere.length, dueNow.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const train = useTrainingWalk(repertoireId, training, {
    session: sess.session,
    scope: sess.scope,
    startLine: from,
    cleanPaths: sess.state?.cleanPaths ?? NO_PATHS,
    onMove: sess.recordMove,
    onLineEnd: sess.recordLine,
    focusKeys,
  });
  const { user } = useAuth();
  /** Lines trained, per scope, over the whole repertoire (owner, 2026-11-19: never only from the position). */
  const scopeProgress = useMemo(() => {
    if (!train.data) return null;
    const out = {} as Record<TrainingScope, ScopeProgress>;
    // the clean lines' own check: in a mistakes session the walk's `isTrained` answers another question (#338)
    const trained = makeTrainedCheck(sess.state?.cleanPaths ?? NO_PATHS);
    for (const { id } of SCOPES) out[id] = progress(linesInScope(train.data, id), trained);
    return out;
  }, [train.data, sess.state?.cleanPaths]);
  /** E7: the lines of each scope through the position chosen to start from (none: the first line has nowhere to go). */
  const fromLines = useMemo(() => {
    if (!train.data || !from.length) return null;
    const out = {} as Record<TrainingScope, number>;
    for (const { id } of SCOPES) out[id] = linesFrom(linesInScope(train.data, id), from).length;
    return out;
  }, [train.data, from]);
  /** #338: a mistake as the card says it ("6.Nd2, needed a hint"). */
  const mistakeLabel = (m: { line: string[]; move: string; outcome: string }) => {
    const sans = m.line.length ? sansOf(m.line) : [];
    const san = sans.length === m.line.length && sans.length ? numbered(rootPliesT + sans.length - 1, sans[sans.length - 1]) : m.move;
    const how = m.outcome === 'with_help' ? 'needed a hint' : m.outcome === 'after_retry' ? 'needed another try' : 'was shown';
    return { san, how };
  };
  /** SAN of moves from the repertoire's root, as the book has them (for labels). */
  const sansOf = (ucis: string[]) => {
    const d = train.data;
    if (!d) return [] as string[];
    const out: string[] = [];
    let key = d.repertoire.rootKey;
    for (const u of ucis) {
      const x = d.positions[key]?.m.find((m) => m.uci === u);
      if (!x) break;
      out.push(x.san);
      key = x.child;
    }
    return out;
  };
  const rootPliesT = train.data?.repertoire.rootLine.length ?? 0;
  /** "1.e4 c5 2.Nf3", the position trained from; null for the whole repertoire. */
  const fromLabel = (ucis: string[]) => (ucis.length ? lineText(sansOf(ucis), rootPliesT) : null);
  const leaveFrom = () => setParams((prev) => { const n = new URLSearchParams(prev); n.delete('from'); return n; });
  const scopeLabel = (id: TrainingScope) => SCOPES.find((x) => x.id === id)!.label;
  const [confirmReset, setConfirmReset] = useState(false);
  useEffect(() => { setConfirmReset(false); }, [repertoireId, training, sess.session?.id]);
  const setMode = (mode: 'learn' | 'train') => setParams((prev) => {
    const n = new URLSearchParams(prev);
    if (mode === 'train') n.set('mode', 'train'); else { n.delete('mode'); n.delete('from'); }
    return n;
  });
  const { currentTheme, changeTheme } = useBoardTheme();
  const view = walk.shown;
  const rep = view?.repertoire;
  const [flipped, setFlipped] = useState(false);
  const orientation = (rep?.side === 'black') !== flipped ? 'black' : 'white';

  // Focus mode: as every Workspace page has it (columns only, and only while it would stay columns).
  const [focusMode, setFocusMode] = useState(false);
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode | null>(null);
  /** The Session card gets the larger share only in training, stacked (a phone): see the Repertoire card's comment. */
  const sessionTall = training && workspaceMode?.mode === 'stacked';
  const canFocus = workspaceMode?.mode === 'columns' && workspaceMode.focusHolds;
  useEffect(() => {
    if (workspaceMode?.mode === 'stacked') setFocusMode(false);
  }, [workspaceMode]);
  const { setChromeHidden } = useChrome();
  useEffect(() => {
    setChromeHidden(focusMode);
    return () => setChromeHidden(false);
  }, [focusMode, setChromeHidden]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && focusMode) setFocusMode(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [focusMode]);


  const rootPlies = rep?.rootLine.length ?? 0;
  const last = walk.lastMove;
  const lastUci = walk.viewPly > 0 ? walk.line[walk.viewPly - 1] : null;
  const ours = view?.position.toMove === 'ours';
  const chosen = view?.moves.find((m) => m.chosen) ?? null;
  const alternative = ours ? view!.moves.find((m) => !!m.alternative) ?? null : null;
  const alsoTheory = ours ? view!.moves.filter((m) => !m.chosen && !m.alternative) : [];
  const atLatest = walk.viewPly === walk.line.length;
  /** D9: the junction the board is at or last passed (0 for the start), marked in the left lane's junction row. */
  const atJunction = [0, ...walk.junctionPlies].filter((p) => p <= walk.viewPly).pop() ?? 0;

  const positionName = view?.position.name ?? null;

  /*
    D6 (F12): a repertoire that starts after other moves has them played on the board first, half a second each, then
    the walk starts at its root. Next or any other step skips the rest.
  */
  const [intro, setIntro] = useState<{ id: string; step: number } | null>(null);
  const rootFens = rep?.rootFens ?? [];
  useEffect(() => {
    // not behind the welcome: it starts when the opening is chosen (#337)
    if (welcome || !rep || rep.id !== repertoireId || !rep.rootFens.length) return;
    setIntro({ id: rep.id, step: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rep?.id, welcome]);
  const introRunning = !!intro && intro.id === rep?.id && intro.step <= rootFens.length && walk.viewPly === 0 && walk.line.length === 0;
  const introDone = () => setIntro((i) => (i ? { ...i, step: rootFens.length + 1 } : i));
  const introStep = introRunning ? intro!.step : null;
  const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  /*
    THE STARTING POSITION BEFORE HE SPEAKS (owner, 2026-11-18: "the moves e4 e6 are already on the board when the
    Master starts talking, so his words don't match the moves"). Between the opening loading and its introduction
    starting (an effect, after a paint), the board would show the opening's own root (1.e4 e6 already played): it
    shows the starting position instead, as the introduction will.
  */
  const introPending = !training && !welcome && !!rep && rep.id === repertoireId && rootFens.length > 0
    && (!intro || intro.id !== rep.id) && walk.viewPly === 0 && walk.line.length === 0;
  const boardFen = introPending ? START
    : introStep !== null && introStep < rootFens.length
      ? (introStep === 0 ? START : rootFens[introStep - 1])
      : view?.position.fen ?? START;
  const introUci = introStep !== null && introStep > 0 && introStep <= rootFens.length ? rep!.rootLine[introStep - 1] : null;
  const shownUci = introStep !== null ? introUci : lastUci;
  const boardLast = shownUci ? [shownUci.slice(0, 2) as Key, shownUci.slice(2, 4) as Key] : undefined;
  const next = () => { introDone(); walk.next(); };
  /*
    THE LINE SHOWN DURING THE INTRODUCTION (owner, 2026-11-18: "for beginners it is very hard, they don't visualize
    the board yet"): while he reads the introduction, the board plays the repertoire's first moves (its `introLine`,
    the owner's approved line), about one a second, then goes back to the starting position when he finishes.
    `ply` is how many of its moves are on the board; the analysis card stays on the real position.
  */
  const [demo, setDemo] = useState<{ id: string; ply: number; done: boolean } | null>(null);
  const demoLine = rep?.introLine ?? [];
  const demoOn = !training && !!demo && demo.id === rep?.id && !demo.done && demo.ply > 0 && walk.viewPly === 0 && walk.line.length === 0;
  const demoFen = demoOn ? demoLine[demo!.ply - 1].fen : null;
  const demoUci = demoOn ? demoLine[demo!.ply - 1].uci : null;

  /*
    Learning (owner, 2026-11-11): the board takes a move by mouse, as the card's row (or Next) would play it. At our turn
    only the repertoire's move and a marked alternative; at the opponent's (owner, 2026-11-12) any reply the card lists,
    the covered ones. Learning mode shows them all, so the board judges no other move. While the next position loads,
    the board keeps the move played instead of snapping back.
  */
  const [learnPending, setLearnPending] = useState<{ from: string; fen: string; move: string } | null>(null);
  const viewKey = view?.position.key ?? null;
  useEffect(() => { setLearnPending(null); }, [viewKey]);
  const boardMoves = useMemo(
    () => (ours ? [chosen, alternative] : walk.order).filter((m): m is NonNullable<typeof m> => !!m),
    [ours, chosen, alternative, walk.order],
  );
  const learnMovable = !training && !welcome && !!view && boardMoves.length > 0 && !walk.lineEnds && !walk.loading
    && introStep === null && !learnPending;
  const learnDests = useMemo(() => {
    const d = new Map<Key, Key[]>();
    for (const m of learnMovable ? boardMoves : []) {
      const from = m.move.slice(0, 2) as Key;
      d.set(from, [...(d.get(from) ?? []), m.move.slice(2, 4) as Key]);
    }
    return d;
  }, [learnMovable, boardMoves]);
  const learnTurn = view?.position.fen.split(' ')[1] === 'b' ? 'black' : 'white';
  const learnMove = (orig: Key, dest: Key) => {
    const m = boardMoves.find((x) => x.move.slice(0, 4) === `${orig}${dest}`);
    if (!m) return;
    introDone();
    const pos = view ? positionFromFen(view.position.fen) : null;
    const after = pos ? applyMove(pos, m.move) : null;
    if (after) setLearnPending({ from: view!.position.key, fen: after.fen, move: m.move });
    // Forward through a move already in the line keeps the rest of it, as Next does; otherwise play it.
    if (walk.viewPly < walk.line.length && walk.line[walk.viewPly] === m.move) walk.goTo(walk.viewPly + 1);
    else walk.play(m.move);
  };
  // the welcome shows the starting position, with each goal's marks (#337)
  const learnFen = welcome ? START : demoFen ?? (learnPending && learnPending.from === viewKey ? learnPending.fen : boardFen);
  const learnLast = welcome ? undefined : demoUci ? [demoUci.slice(0, 2) as Key, demoUci.slice(2, 4) as Key]
    : learnPending && learnPending.from === viewKey
      ? [learnPending.move.slice(0, 2) as Key, learnPending.move.slice(2, 4) as Key] : boardLast;

  // Training (E2): the board shows the position, or the player's move while the trainer answers it.
  const tStatus = train.status;
  const attempted = tStatus.kind === 'other-book' ? tStatus.played.uci : tStatus.kind === 'outside' ? tStatus.uci : null;
  const tAfter = attempted && train.board ? applyMove(train.board, attempted) : null;
  const tFen = tAfter?.fen ?? train.here?.p.f ?? START;
  const tLastUci = attempted ?? train.last?.uci ?? null;
  const tLast = tLastUci ? [tLastUci.slice(0, 2) as Key, tLastUci.slice(2, 4) as Key] : undefined;
  /* Owner, 2026-11-11: after Reveal the move is played on the board as well as with the button (an arrow shows it). */
  const canPlay = training && (tStatus.kind === 'your-move' || tStatus.kind === 'revealed') && !!train.board;
  const revealShapes = tStatus.kind === 'revealed'
    ? [{ orig: tStatus.chosen.uci.slice(0, 2) as Key, dest: tStatus.chosen.uci.slice(2, 4) as Key, brush: 'green' }]
    : [];
  const tRep = train.data?.repertoire;
  const tRootPlies = tRep?.rootLine.length ?? 0;
  const tOrientation = (tRep?.side ?? rep?.side) === 'black' ? (flipped ? 'white' : 'black') : (flipped ? 'black' : 'white');
  const tLastExpl = train.last ? train.explanation(train.last.explanation) : null;
  const tLastLabel = train.last ? numbered(tRootPlies + train.line.length - 1, train.last.san) : null;
  /** E5: the moves of the line just ended that were not right first time, as one sentence. */
  const missedText = (() => {
    const parts = train.line.flatMap((m, i) => {
      if (!m.ours || !m.outcome || m.outcome === 'first_time') return [];
      const label = numbered(tRootPlies + i, m.san);
      return [m.outcome === 'revealed' ? `${label} was shown` : m.outcome === 'with_help' ? `${label} needed a hint` : `${label} needed another try`];
    });
    if (!parts.length) return '';
    // Named only up to three: a longer list does not fit the card (measured 2026-11-11, every move revealed).
    if (parts.length > 3) {
      const ours = train.line.filter((m) => m.ours && m.outcome).length;
      return `${parts.length} of your ${ours} moves were not right first time.`;
    }
    const joined = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
    return `${joined.charAt(0).toUpperCase()}${joined.slice(1)}.`;
  })();
  /** E4: a hint is on screen at our turn; the card then holds the hints alone (owner). */
  const showingHints = (tStatus.kind === 'your-move' || tStatus.kind === 'outside') && train.hints.length > 0;
  const tShowReasons = !showingHints && !!train.last && (tStatus.kind === 'your-move' || tStatus.kind === 'right' || tStatus.kind === 'their-move' || tStatus.kind === 'line-end');

  /*
    THE MASTER IN WHY THIS MOVE (#309, owner 2026-11-17): his face at the card's top right, as on the puzzles card,
    and he reads the reasons of the move on the board, "almost like a coach staying on the side and teaching you".
    A new move stops him and he starts on its reasons. A move outside the book or another book move gets his face,
    never words (the /play and puzzles rule, #186 D9). He speaks only while his speaker is on screen (his face shown
    and big enough: `PuzzleMaster`), so he never talks where he cannot be muted.
  */
  const [faceShown, setFaceShown] = useState(false);
  const masterExpression = training
    ? (tStatus.kind === 'outside' || tStatus.kind === 'other-book' ? 'serious'
      : tStatus.kind === 'right' || (tStatus.kind === 'line-end' && train.lineResult === true) ? 'pleased'
      : showingHints ? 'thinking' : 'presenting')
    // he explains the opponent's moves too, so the same face as for ours (owner, 2026-11-18: not the thinking pose)
    : 'presenting';
  const reasonTexts = training ? (tShowReasons ? (tLastExpl?.r ?? []).map((r) => r.t) : null)
    : (last ? (last.explanation ?? []).map((r) => r.text) : null);
  // he says the move first, as on /play (owner, 2026-11-18, "by colour": "White pushes the pawn to d4"), then its reasons
  const moveSaid = reasonTexts === null ? null : (training ? train.last?.said : last?.said) ?? null;
  // then the named variation the move reaches, if any ("This is the French Defense.", owner 2026-11-18)
  const variationSaid = reasonTexts === null ? null : (training ? train.last?.announce : last?.announce) ?? null;
  const spokenFirst = [moveSaid, variationSaid].filter((x): x is string => !!x);
  /*
    THE INTRODUCTION (owner, 2026-11-18): before the first move of learning mode he says the starting moves, each as
    the board plays it ("White pushes the pawn to e4."), then introduces the repertoire (backend
    config/repertoireIntros.json). Without his voice the board plays them half a second apart, as before (D6).
  */
  const atStart = !training && !welcome && !!rep && !!view && walk.viewPly === 0 && walk.line.length === 0;
  const rootSaid = rep?.rootSaid ?? [];
  /*
    ONE TELLING OF THE STARTING MOVES (owner, 2026-11-18: the French's e4 and e6 were said one by one, then the
    introduction "The French Defense starts with 1.e4 e6" was read with them already on the board). An introduction
    names its starting moves itself, so with one he says only the introduction: the board stays at the starting
    position and the introduction's line plays from move 1 while he reads, then the board settles on the opening's
    own position. The moves one by one are said only for an opening without an introduction.
  */
  const rootSpoken = rep?.intro ? [] : rootSaid;
  // sentence by sentence where the server has them (each its own recording, so the moves follow his words)
  const introParts = rep?.introParts?.length ? rep.introParts : null;
  const introSaid = introParts ? introParts.map((p) => p.text) : rep?.intro ? [rep.intro] : [];
  const introTexts = atStart && rootSpoken.every(Boolean) ? [...rootSpoken, ...introSaid] : null;
  /*
    QUIET IN TRAINING (#336, owner 2026-11-18: "a bit annoying to have The Master start talking after you make the
    moves"). Training is recall: after a move he says nothing (the reasons stay on the card and their marks on the
    board). He speaks when a hint appears, the newest one, because a hint is help the player asked for (or waited a
    minute for). Learning mode keeps him reading every move. His face is always there (owner: "his primary role is
    to make the site more lively"); the trainer has its own voice switch (`OPENINGS_VOICE_KEY`).
  */
  const hintSaid = training && showingHints ? [train.hints[train.hints.length - 1]] : null;
  const sayTexts = !faceShown ? null
    : welcome ? WELCOME_TEXTS
    : introTexts?.length ? introTexts
    : training ? hintSaid
    : reasonTexts === null ? null : [...spokenFirst, ...reasonTexts];
  const sayId = welcome ? 'w' : introTexts?.length ? `i:${rep!.id}`
    : training ? `h:${train.line.length}:${tLastLabel ?? ''}:${train.hints.length}` : `l:${walk.viewPly}:${walk.line.slice(0, walk.viewPly).join(' ')}`;
  const reasonLines = useReasonVoice(sayTexts?.length ? sayId : null, sayTexts);
  /*
    The starting moves follow his voice: move i is played as he starts its sentence. The board waits at the starting
    position until he does, however long his first recording takes to arrive (owner, 2026-11-18: his words must match
    the moves; a 3 s timer had played them ahead of him when a recording was slow). They are played half a second
    apart only without his voice: off, or when he gave up before his first line (`onEnd` with nothing said: the
    browser could not play it at all). Next, or a press on the board, skips the introduction.
  */
  const [introStalled, setIntroStalled] = useState(false);
  /** Whether he has started a line of this opening's introduction (a give-up before that falls back to the timer). */
  const introSpoke = useRef(false);
  useEffect(() => { introSpoke.current = false; }, [rep?.id]);
  const voice = useMasterVoice(reasonLines, {
    voiceKey: OPENINGS_VOICE_KEY,
    onEnd: () => {
      if (!introRunning) return;
      if (!introSpoke.current && intro!.step === 0) setIntroStalled(true);
      // he has read the introduction: the board settles on the opening's own position (after its line, if any)
      else if (!rootSpoken.length) introDone();
    },
  });
  if (introRunning && voice.lineIndex !== null) introSpoke.current = true;
  const introByVoice = MASTER_LIVE && voice.on && faceShown && !!introTexts?.length && !introStalled;
  useEffect(() => {
    // only when he says the moves one by one (an opening without an introduction)
    if (!introRunning || !introByVoice || voice.lineIndex === null || !rootSpoken.length) return;
    const step = Math.min(voice.lineIndex + 1, rootFens.length);
    setIntro((i) => (i && i.step < step ? { ...i, step } : i));
  }, [introRunning, introByVoice, voice.lineIndex, rootFens.length, rootSpoken.length]);
  useEffect(() => {
    if (!introRunning || introByVoice) return;
    const t = setTimeout(() => setIntro((i) => (i ? { ...i, step: i.step + 1 } : i)), intro!.step === 0 ? 400 : 500);
    return () => clearTimeout(t);
  }, [introRunning, introByVoice, intro]);
  // the introduction's line plays while he reads the introduction, a move about every 0.9 s, and stays until he has
  // finished. Only with his voice: without it nobody is reading, and the board is the player's from the start (a
  // line playing on its own made a move on the board miss). A press on the board ends it at once.
  const introSaying = introByVoice && voice.lineIndex !== null && voice.lineIndex >= rootSpoken.length;
  /*
    THE MOVES FOLLOW HIS WORDS (owner, 2026-11-18: "the first few moves are made very fast, they don't follow the
    read"). With the introduction in sentences, the board plays up to the moves of the sentence he is saying, spaced
    across it; after his last sentence it plays any left. Without sentences, the whole line at the old pace.
  */
  const partSaying = introSaying && introParts ? voice.lineIndex! - rootSpoken.length : null;
  const demoTarget = !introParts || !introSaying ? demoLine.length
    : introParts.slice(0, (partSaying ?? 0) + 1).reduce((a, p) => a + p.plies, 0);
  useEffect(() => {
    if (!atStart || !rep || !demoLine.length) { if (!atStart) setDemo(null); return; }
    if (demo && demo.id === rep.id) return;
    if (introSaying) setDemo({ id: rep.id, ply: 0, done: false });
  }, [atStart, rep, demoLine.length, demo, introSaying]);
  const endDemo = () => { if (demoOn) setDemo((d) => (d ? { ...d, done: true } : d)); };
  useEffect(() => {
    if (!demo || demo.done || !atStart || demo.id !== rep?.id) return;
    if (demo.ply < Math.min(demoTarget, demoLine.length)) {
      const t = setTimeout(() => setDemo((d) => (d ? { ...d, ply: d.ply + 1 } : d)), demo.ply === 0 ? 600 : introParts ? 700 : 900);
      return () => clearTimeout(t);
    }
    if (demo.ply < demoLine.length) return; // the next sentence brings the next moves
    if (introSaying) return; // he is still reading: the line stays on the board until he finishes
    const t = setTimeout(() => setDemo((d) => (d ? { ...d, done: true } : d)), 600);
    return () => clearTimeout(t);
  }, [demo, atStart, rep?.id, demoLine.length, introSaying, demoTarget, introParts]);
  /*
    WHAT HE IS TALKING ABOUT, ON THE BOARD (#324, owner 2026-11-17 and 11-18): the reason he is saying, or the one the
    player pressed, is marked in the list and its marks are drawn on the board in its kind's colour. A press on the
    selected reason clears it; a new move clears the selection. The marks come from the server with each reason.
  */
  const [picked, setPicked] = useState<{ id: string; i: number } | null>(null);
  const shownReasons: Array<{ key: string; marks: string }> = welcome
    ? WELCOME_GOALS.map((g) => ({ key: g.key, marks: g.marks }))
    : training
    ? (tShowReasons ? (tLastExpl?.r ?? []).map((r, i) => ({ key: r.k, marks: train.last?.marks?.[i] ?? '' })) : [])
    : (last?.explanation ?? []).map((r) => ({ key: r.key, marks: r.marks ?? '' }));
  // the queue starts with the move (and the variation), so his line i is reason i - that many; none is marked before
  // in training he says hints, not reasons, so no reason is marked as being said
  // on the welcome his line 0 is the intro, so goal i is his line i + 1 (#337)
  const saying = training || voice.lineIndex === null ? null : voice.lineIndex - (welcome ? 1 : spokenFirst.length);
  const activeReason = picked && picked.id === sayId ? picked.i : saying !== null && saying >= 0 ? saying : null;
  const active = activeReason !== null && activeReason < shownReasons.length ? shownReasons[activeReason] : null;
  // explaining the opponent's move, its idea is their plan (blue, as Chess.com's coach)
  const theirMove = training ? train.last?.ours === false : !!last && !last.ours;
  // the marks in the colour of the side that made the move explained (owner, 2026-11-18: White blue, Black red)
  const mover: 'white' | 'black' = welcome ? 'white' : (rep?.side === 'black') !== theirMove ? 'black' : 'white';
  const marks = useMemo(() => (active ? boardMarks(active.marks, mover) : NO_MARKS), [active?.marks, mover]); // eslint-disable-line react-hooks/exhaustive-deps
  const brushes = useMemo(() => reasonBrushes(), []);
  const pickReason = (i: number) => setPicked((p) => (p && p.id === sayId && p.i === i ? { id: sayId, i: -1 } : { id: sayId, i }));
  // E3: a move outside the book is graded by the browser engine (F7), from the position before it to the one after.
  const outside = useOutsideGrade(
    tStatus.kind === 'outside' ? train.here?.p.f ?? null : null,
    tStatus.kind === 'outside' ? tAfter?.fen ?? null : null,
  );
  const gradeText = outside.grade === 'playable'
    ? 'It is playable, but it is not theory.'
    : outside.grade === 'inaccuracy'
      ? 'It is an inaccuracy, and it is not theory.'
      : outside.grade === 'mistake'
        ? 'It is a mistake, and it is not theory.'
        : outside.failed ? 'The engine could not judge it.' : 'Checking the move.';

  // Arrow keys and the wheel: back, and forward as Next (through the moves played, then the next one).
  const attachWheel = useBoardStepInput({ enabled: !!view && !training && !welcome, onBack: walk.back, onForward: next });

  /** E2a: the switch between the two modes, at the top of the Repertoire card. */
  const modeSwitch = (
    <div className="mb-[0.3em] grid grid-cols-2 gap-[0.3em]" role="radiogroup" aria-label="Mode">
      {([['learn', 'Learn', GraduationCap], ['train', 'Train', Dumbbell]] as const).map(([m, label, Icon]) => {
        const on = (m === 'train') === training;
        return (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => { if (!on) setMode(m); }}
            className={`card-btn text-[0.92em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${on ? 'card-btn-primary' : ''}`}
          >
            <Icon aria-hidden />
            {label}
          </button>
        );
      })}
    </div>
  );

  /* E2: training's two cards. The reasons of a move appear only once it is played (Q13, E0). */
  const trainingCards = [
    slot('opening-explanation', 'list', (
      <>
        <span className="card-label inline-flex items-center gap-[0.35em]">
          <BookOpen className="text-link" aria-hidden />
          {showingHints ? 'Your move' : 'Why this move'}
        </span>
        <div className="card-body">
          <div className="master-row">
          <div className="master-row-status flex flex-col gap-[calc(var(--card-air)*2)]">
          {tStatus.kind === 'loading' ? (
            <Muted>Loading the repertoire.</Muted>
          ) : tStatus.kind === 'error' ? (
            <Muted>The repertoire could not be loaded.</Muted>
          ) : (
            <>
              {/*
                E5 (owner, 2026-11-11): at the end of a line, whether it is trained, and if not which moves were not
                right first time; in the large card, as the hints are, because the Training card is too small on a phone.
              */}
              {tStatus.kind === 'line-end' && (train.lineResult === true || train.lineResult === false) && (
                <div className="flex flex-col gap-[0.35em] rounded-md border-l-[3px] border-primary bg-muted/60 px-[0.8em] py-[0.6em]" aria-live="polite">
                  {train.lineResult ? (
                    <>
                      <span className="inline-flex items-center gap-[0.4em] font-semibold text-link">
                        <Check aria-hidden />
                        Line trained
                      </span>
                      <p className="text-foreground">Every move was right first time.</p>
                    </>
                  ) : (
                    <>
                      <span className="inline-flex items-center gap-[0.4em] font-semibold text-link">
                        <RotateCcw aria-hidden />
                        This line will come back
                      </span>
                      <p className="text-foreground">{missedText || 'Not every move was right first time.'}</p>
                    </>
                  )}
                </div>
              )}
              {tStatus.kind === 'idle' && (
                <p className="text-foreground">
                  {tRep?.rootSan.length ? `${tRep.name}, after ${lineText(tRep.rootSan)}. ` : `${tRep?.name ?? ''}. `}
                  Choose what to train in the Session card, then press {sess.resumable ? 'Resume or Start' : 'Start'}.
                </p>
              )}
              {/*
                #338: THE RECAP. After a session, the positions it got wrong and has not put right, each as the card says
                it, and one press to train them (a session, the free plan's one a day). In this card, idle after a session:
                the Session card has no room for it beside the choices (measured: it overlapped them at 300px).
              */}
              {tStatus.kind === 'idle' && !sess.resumable && sess.recap && sess.recap.length > 0 && (
                <div className="flex min-h-0 flex-col gap-[0.3em] rounded-md border-l-[3px] border-primary bg-muted/60 px-[0.6em] py-[0.4em]">
                  <span className="text-[0.86em] font-semibold text-foreground">
                    {sess.recap.length === 1 ? 'This position needs work' : `These ${sess.recap.length} positions need work`}
                  </span>
                  <WorkspaceList label="Positions that need work">
                    <ul className="flex flex-col gap-[0.1em] text-[0.86em]">
                      {sess.recap.map((m) => {
                        const l = mistakeLabel(m);
                        return (
                          <li key={m.key} className="flex items-baseline justify-between gap-[0.5em]">
                            <span className="font-medium text-foreground">{l.san}</span>
                            <span className="text-muted-foreground">{l.how}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </WorkspaceList>
                  <button type="button" onClick={sess.startMistakes} disabled={sess.busy} className="card-btn card-btn-primary w-full text-[0.92em] disabled:opacity-50">
                    <Play aria-hidden />
                    Train them now
                  </button>
                </div>
              )}
              {tStatus.kind === 'other-book' && (
                <p className="text-foreground">{tStatus.played.san} is theory, but not this repertoire's line. The repertoire plays {tStatus.chosen.san}.</p>
              )}
              {tStatus.kind === 'outside' && (
                <>
                  <p className="text-foreground">That move is not in the book.</p>
                  <p className={outside.grade ? 'text-foreground' : 'text-muted-foreground'} aria-live="polite">{gradeText}</p>
                </>
              )}
              {tStatus.kind === 'revealed' && (
                <>
                  <p className="text-foreground">The repertoire plays {tStatus.chosen.san}.</p>
                  <Muted>Play it on the board.</Muted>
                </>
              )}
              {tStatus.kind === 'your-move' && !train.last && (
                <p className="text-foreground">
                  {tRep?.rootSan.length ? `${tRep.name}, after ${lineText(tRep.rootSan)}. ` : `${tRep?.name ?? ''}. `}
                  Play the repertoire's move.
                </p>
              )}
              {/*
                E4: the hints for the move to find, least pointing first; quiet, nothing on the board moves. Owner,
                2026-11-10: the first look was not visible enough beside the opponent's reasons, so once a hint is
                shown the card holds the hints alone, with an accent edge and a larger type.
              */}
              {showingHints && (
                <div className="flex flex-col gap-[0.5em] rounded-md border-l-[3px] border-primary bg-muted/60 px-[0.8em] py-[0.6em]" aria-live="polite">
                  <span className="inline-flex items-center gap-[0.4em] font-semibold text-link">
                    <Lightbulb aria-hidden />
                    {train.hints.length > 1 ? 'Hints' : 'Hint'}
                  </span>
                  <ul className="flex flex-col gap-[0.5em]">
                    {train.hints.map((h, i) => (
                      <li key={i} className="text-[1.08em] font-medium leading-snug text-foreground">{h}</li>
                    ))}
                  </ul>
                </div>
              )}
              {tShowReasons && train.last && (
                <p className="flex items-baseline gap-[0.5em]">
                  <span className="font-semibold text-foreground">{tLastLabel}</span>
                  <span className="text-[0.86em] text-muted-foreground">
                    {train.last.ours ? (tStatus.kind === 'right' || tStatus.kind === 'their-move' ? 'Right, your move' : 'Your move') : 'Their move'}
                  </span>
                </p>
              )}
            </>
          )}
          </div>
          {MASTER_LIVE && <PuzzleMaster expression={masterExpression} voice={voice} onShown={setFaceShown} />}
          </div>
          {tShowReasons && (
            <div className="flex min-h-0 flex-1 flex-col">
              <WorkspaceList label="Reasons for the move">
                <ReasonList reasons={(tLastExpl?.r ?? []).map((r) => ({ key: r.k, text: r.t }))} empty={NO_REASON} active={activeReason} onSelect={pickReason} />
              </WorkspaceList>
            </div>
          )}
        </div>
      </>
    ), 2, true),
    slot('opening-moves', 'openingMoves', (
      <>
        <span className="card-label inline-flex items-center gap-[0.35em]">
          <ListTree aria-hidden />
          Training
        </span>
        <div className="card-body">
          {tStatus.kind === 'idle' && <Muted>No session is running.</Muted>}
          {tStatus.kind === 'your-move' && <Muted>Your turn. Move a piece on the board.</Muted>}
          {tStatus.kind === 'their-move' && <Muted>Their reply comes next.</Muted>}
          {tStatus.kind === 'right' && (
            <Muted>{tStatus.move.flag === 2 ? 'Right, the playable alternative. Their reply comes next.' : 'Right. Their reply comes next.'}</Muted>
          )}
          {tStatus.kind === 'line-end' && (
            /*
              E5 (owner, 2026-11-11): the end of a line is said first, with why it ended ("I'm guessing the line is ending
              but it is not obvious"); then whether it is trained, and if not, which moves were not right first time.
            */
            <div className="flex flex-col gap-[0.4em]" aria-live="polite">
              <p className="text-foreground">
                <Flag className="mr-[0.35em] inline text-link" aria-hidden />
                <span className="font-semibold">End of the line.</span>{' '}
                <span className="text-muted-foreground">
                  {train.here?.endReason === 'repetition'
                    ? 'The position repeats one from earlier in the line.'
                    : train.here?.endReason === 'scope' ? 'The main line ends here; the sidelines go further.' : 'The book ends here.'}
                </span>
              </p>
            </div>
          )}
          <div className="mt-auto flex flex-col gap-[0.4em]">
            {tStatus.kind === 'your-move' && (
              <div className="grid grid-cols-2 gap-[0.4em]">
                <button type="button" onClick={train.hint} disabled={!train.moreHints} className="card-btn w-full disabled:opacity-50">
                  <Lightbulb aria-hidden />
                  {train.hints.length ? 'Another hint' : 'Hint'}
                </button>
                <button type="button" onClick={train.reveal} className="card-btn w-full">
                  <Eye aria-hidden />
                  Reveal
                </button>
              </div>
            )}
            {tStatus.kind === 'other-book' && (
              <>
                <button type="button" onClick={train.playChosen} className="card-btn card-btn-primary w-full">Continue with {tStatus.chosen.san}</button>
                <button type="button" onClick={train.tryAgain} className="card-btn w-full"><RotateCcw aria-hidden />Try again</button>
              </>
            )}
            {tStatus.kind === 'outside' && (
              <>
                <button type="button" onClick={train.tryAgain} className="card-btn card-btn-primary w-full"><RotateCcw aria-hidden />Try again</button>
                <button type="button" onClick={train.reveal} className="card-btn w-full"><Eye aria-hidden />Reveal the move</button>
                {/* F7: analyse the move, or play on from it against the engine (E3b), each in a new tab; the trainer
                    waits here. One row, so the card keeps its rows. */}
                {tAfter && (
                  <div className="grid grid-cols-2 gap-[0.4em]">
                    <a
                      href={buildPositionHref('/analysis', tAfter.fen, tOrientation, 'opening')}
                      target="chessplaybook-analysis"
                      className="card-row justify-center text-[0.86em] text-link hover:underline"
                    >
                      Analyse it
                    </a>
                    <a
                      href={buildPositionHref('/play', tAfter.fen, tOrientation, 'opening')}
                      target="chessplaybook-play"
                      className="card-row justify-center text-[0.86em] text-link hover:underline"
                    >
                      Play on
                    </a>
                  </div>
                )}
              </>
            )}
            {tStatus.kind === 'revealed' && (
              <button type="button" onClick={train.playChosen} className="card-btn card-btn-primary w-full">Play {tStatus.chosen.san}</button>
            )}
            {tStatus.kind === 'line-end' && (
              <button type="button" onClick={train.nextLine} className="card-btn card-btn-primary w-full">Next line<ChevronRight aria-hidden /></button>
            )}
          </div>
        </div>
      </>
    )),
  ];

  return (
    <>
      <SeoHead routeKey="openings" />
      <div className="sr-only"><RouteHeading routeKey="openings" /></div>
      {focusMode && (
        <button
          type="button"
          onClick={() => setFocusMode(false)}
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
        board={
          <div ref={attachWheel} data-skeleton-card="board" className="w-full" role="group" aria-label="Opening trainer board" onPointerDownCapture={endDemo}>
            {training ? (
              <ChessBoard
                fen={tFen}
                orientation={tOrientation}
                lastMove={tLast}
                /* Never view-only: ChessBoard reads draggability when it mounts, and this board mounts while the
                   repertoire loads. Off our turn it simply has no legal moves to offer. */
                viewOnly={false}
                dests={canPlay ? train.board!.dests : new Map()}
                turnColor={train.board?.turnColor}
                movableColor={canPlay ? train.board!.turnColor : undefined}
                onMove={canPlay ? train.playerMove : undefined}
                shapes={[...revealShapes, ...marks.shapes]}
                brushes={brushes}
                squareClasses={marks.squares}
                className="reason-marks-board"
                themeId={currentTheme.id}
              />
            ) : (
              <ChessBoard
                fen={learnFen}
                orientation={orientation}
                lastMove={learnLast}
                viewOnly={false}
                dests={learnDests}
                turnColor={learnTurn}
                movableColor={learnMovable ? learnTurn : undefined}
                onMove={learnMovable ? learnMove : undefined}
                shapes={marks.shapes}
                brushes={brushes}
                squareClasses={marks.squares}
                className="reason-marks-board"
                themeId={currentTheme.id}
              />
            )}
          </div>
        }
        toolbar={
          <BoardControls
            onStart={walk.toStart}
            onBack={walk.back}
            onForward={next}
            onReset={walk.toEnd}
            onFlip={() => setFlipped((f) => !f)}
            historyDisabled={!view || training || welcome}
          />
        }
        activity={training ? {
          title: 'Training',
          cards: trainingCards,
          // The engine would show the move to find: it waits for the end of the line (E2).
          foot: footSlot('analysis', (
            <PuzzleAnalysisCard enabled={tStatus.kind === 'line-end'} fen={tFen} orientation={tOrientation} surface="opening_trainer" />
          )),
        } : {
          title: 'Learning',
          cards: [
            slot('opening-explanation', 'list', (
              <>
                <span className="card-label inline-flex items-center gap-[0.35em]">
                  <BookOpen className="text-link" aria-hidden />
                  {welcome ? 'The goals of the opening' : 'Why this move'}
                </span>
                <div className="card-body">
                  <div className="master-row">
                    <div className="master-row-status flex flex-col gap-[calc(var(--card-air)*2)]">
                      {welcome ? (
                        <p className="text-foreground">{WELCOME_INTRO}</p>
                      ) : !view ? (
                        <Muted>{walk.error ? 'This position could not be loaded.' : 'Loading the repertoire.'}</Muted>
                      ) : !last ? (
                        <>
                          <p className="text-foreground">
                            {rep!.intro
                              ? rep!.intro
                              : rep!.rootSan.length
                                ? `${rep!.name} starts after ${lineText(rep!.rootSan)}.`
                                : `${rep!.name} starts from the first move.`}
                          </p>
                          <Muted>Press Next to play the first move. Its reasons appear here.</Muted>
                        </>
                      ) : (
                        <>
                          <p className="flex items-baseline gap-[0.5em]">
                            <span className="font-semibold text-foreground">{numbered(rootPlies + walk.viewPly - 1, last.san)}</span>
                            <span className="text-[0.86em] text-muted-foreground">{last.ours ? 'Your move' : 'Their move'}</span>
                          </p>
                          {positionName && <p className="text-[0.86em] leading-snug text-muted-foreground">{positionName}</p>}
                        </>
                      )}
                    </div>
                    {MASTER_LIVE && <PuzzleMaster expression={masterExpression} voice={voice} onShown={setFaceShown} />}
                  </div>
                  {welcome && (
                    /* #337: the goals, in the reasons' own list (marker, divider, press to draw), then the invitation */
                    <div className="flex min-h-0 flex-1 flex-col gap-[calc(var(--card-air)*2)]">
                      <WorkspaceList label="The goals of the opening">
                        <ReasonList reasons={WELCOME_GOALS as WelcomeGoal[]} empty="" active={activeReason} onSelect={pickReason} />
                      </WorkspaceList>
                    </div>
                  )}
                  {!welcome && view && last && (
                    <div className="flex min-h-0 flex-1 flex-col">
                      <WorkspaceList label="Reasons for the move">
                        <ReasonList reasons={last.explanation ?? []} empty={NO_REASON} active={activeReason} onSelect={pickReason} />
                      </WorkspaceList>
                    </div>
                  )}
                </div>
              </>
            ), 2, true),
            slot('opening-moves', 'openingMoves', (
              <>
                <span className="card-label inline-flex items-center gap-[0.35em]">
                  <ListTree aria-hidden />
                  {welcome ? 'Your first move' : ours ? 'Your move here' : 'Their replies'}
                  {!welcome && view?.position.junction && !walk.lineEnds && (
                    <span className="ml-[0.4em] rounded-full bg-muted px-[0.6em] text-[0.8em] normal-case tracking-normal text-foreground">Junction</span>
                  )}
                </span>
                <div className="card-body">
                  {welcome ? (
                    /* the welcome's closing line (#337), where the player's next step is */
                    <p className="text-foreground">{WELCOME_END}</p>
                  ) : walk.error && !view ? (
                    <button type="button" onClick={walk.retry} className="card-btn w-full text-[0.92em]">Try again</button>
                  ) : !view ? null : walk.lineEnds ? (
                    <div className="flex flex-col gap-[0.4em]">
                      <p className="text-foreground">
                        {walk.repetition
                          ? 'This position came up earlier in the line. The moves repeat, so the line ends here.'
                          : walk.coveredBefore
                          ? 'You have covered this position already, through another move order.'
                          : 'The book ends here. This line is done.'}
                      </p>
                      {walk.complete && (
                        <Muted>You have played through the whole repertoire.</Muted>
                      )}
                    </div>
                  ) : (
                    <div className="flex min-h-0 flex-1 flex-col">
                      <WorkspaceList label="Book moves">
                        {ours ? (
                          <div className="flex flex-col gap-[0.3em]">
                            {chosen && (
                              /* Owner, 2026-11-12: the move is played by clicking it here too, as the replies are. */
                              <button
                                type="button"
                                onClick={() => {
                                  introDone();
                                  if (!atLatest && walk.line[walk.viewPly] === chosen.move) walk.goTo(walk.viewPly + 1);
                                  else walk.play(chosen.move);
                                }}
                                aria-label={`Play ${chosen.san}`}
                                className={`card-row group w-full justify-between rounded px-[0.3em] py-[0.4em] text-left hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${MOVE_ROW_RULE}`}
                              >
                                <span className="inline-flex min-w-0 items-center gap-[0.5em]">
                                  <MoveMarker role="chosen" />
                                  <span className="font-semibold text-foreground">{chosen.san}</span>
                                </span>
                                <span className="inline-flex items-center gap-[0.3em]">
                                  <span className="tabular-nums">{gamesShare(chosen, ' of games')}</span>
                                  <ChevronRight className="opacity-40 group-hover:opacity-100" aria-hidden />
                                </span>
                              </button>
                            )}
                            {alternative && (
                              /* #179: where the chosen line repeats a position, a playable move that avoids it. */
                              <>
                                <span className={`move-group-label px-[0.3em] pt-[0.5em] text-[0.86em] text-muted-foreground ${MOVE_ROW_RULE}`}>Also playable: avoids a repetition later in the line</span>
                                <button
                                  type="button"
                                  onClick={() => walk.play(alternative.move)}
                                  aria-label={`Play ${alternative.san}`}
                                  className={`card-row group w-full justify-between rounded px-[0.3em] py-[0.4em] text-left hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${MOVE_ROW_RULE}`}
                                >
                                  <span className="inline-flex min-w-0 items-center gap-[0.5em]">
                                    <MoveMarker role="alternative" />
                                    <span className={walk.isMoveDone(alternative) ? 'text-muted-foreground line-through' : 'font-medium text-foreground'}>{alternative.san}</span>
                                    {walk.isMoveDone(alternative) && <Check className="text-success" aria-label="done" />}
                                  </span>
                                  <span className="inline-flex items-center gap-[0.3em]">
                                    <span className="tabular-nums">{gamesShare(alternative)}</span>
                                    <ChevronRight className="opacity-40 group-hover:opacity-100" aria-hidden />
                                  </span>
                                </button>
                              </>
                            )}
                            {alsoTheory.length > 0 && (
                              <>
                                <span className={`move-group-label px-[0.3em] pt-[0.5em] text-[0.86em] text-muted-foreground ${MOVE_ROW_RULE}`}>Also theory, not in this repertoire</span>
                                {alsoTheory.map((m) => (
                                  <span key={m.move} className={`card-row justify-between px-[0.3em] py-[0.35em] text-[0.92em] text-muted-foreground ${MOVE_ROW_RULE}`}>
                                    <span className="inline-flex min-w-0 items-center gap-[0.5em]">
                                      <MoveMarker role="other" />
                                      <span>{m.san}</span>
                                    </span>
                                    <span className="tabular-nums">{gamesShare(m)}</span>
                                  </span>
                                ))}
                              </>
                            )}
                          </div>
                        ) : (
                          <div className="flex flex-col">
                            {/* D9 (owner: "jump to another reply"): every row plays its reply; say so where it matters. */}
                            {view.position.junction && (
                              <span className="move-group-label mb-[0.2em] px-[0.3em] text-[0.86em] text-muted-foreground">Choose a reply, or press Next.</span>
                            )}
                            {walk.order.map((m) => {
                              const isDone = walk.isMoveDone(m);
                              // The reply already next in the line steps forward into it rather than replaying it.
                              const isNextInLine = !atLatest && walk.line[walk.viewPly] === m.move;
                              return (
                                <button
                                  key={m.move}
                                  type="button"
                                  onClick={() => (isNextInLine ? walk.goTo(walk.viewPly + 1) : walk.play(m.move))}
                                  aria-label={`Play ${m.san}`}
                                  className={`card-row group w-full justify-between rounded px-[0.3em] py-[0.4em] text-left hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${MOVE_ROW_RULE}`}
                                >
                                  <span className="inline-flex min-w-0 items-center gap-[0.5em]">
                                    <MoveMarker role={m.main === false ? 'sideline' : 'main'} />
                                    <span className={isDone ? 'text-muted-foreground line-through' : 'font-medium text-foreground'}>{m.san}</span>
                                    {isDone && <Check className="text-success" aria-label="done" />}
                                    {m.main === false && <span className="text-[0.8em] text-muted-foreground">sideline</span>}
                                  </span>
                                  <span className="inline-flex items-center gap-[0.3em]">
                                    <span className="tabular-nums">{gamesShare(m)}</span>
                                    <ChevronRight className="opacity-40 group-hover:opacity-100" aria-hidden />
                                  </span>
                                </button>
                              );
                            })}
                            {walk.uncovered.length > 0 && (
                              <>
                                <span className={`move-group-label px-[0.3em] pt-[0.5em] text-[0.86em] text-muted-foreground ${MOVE_ROW_RULE}`}>Also theory, rarely played, not in this repertoire</span>
                                {walk.uncovered.map((m) => (
                                  <span key={m.move} className={`card-row justify-between px-[0.3em] py-[0.35em] text-[0.92em] text-muted-foreground ${MOVE_ROW_RULE}`}>
                                    <span className="inline-flex min-w-0 items-center gap-[0.5em]">
                                      <MoveMarker role="other" />
                                      <span>{m.san}</span>
                                    </span>
                                    <span className="tabular-nums">{gamesShare(m)}</span>
                                  </span>
                                ))}
                              </>
                            )}
                          </div>
                        )}
                      </WorkspaceList>
                    </div>
                  )}
                  {welcome ? null : walk.lineEnds && !walk.complete ? (
                    /* Q15: at the end of a line the board stays; this goes back to the junction with work left. */
                    <button
                      type="button"
                      onClick={walk.backToJunction}
                      className="card-btn card-btn-primary mt-auto w-full"
                    >
                      <CornerUpLeft aria-hidden />
                      {walk.backTarget ? 'Back to the junction' : 'Back to the start'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={next}
                      disabled={!walk.canNext}
                      className="card-btn card-btn-primary mt-auto w-full disabled:opacity-50"
                    >
                      Next
                      <ChevronRight aria-hidden />
                    </button>
                  )}
                </div>
              </>
            )),
          ],
          /*
            D8 (owner, D7): the engine's line for the position on the board, as /puzzles shows it, and Full analysis
            in a new tab. The one calculation in the browser the product allows (F7), and the answer at the end of a
            line where the book stops (#174).
          */
          foot: footSlot('analysis', (
            <PuzzleAnalysisCard enabled={!!view} fen={boardFen} orientation={orientation} surface="opening_trainer" />
          )),
        }}
        context={{
          title: 'Repertoire',
          cards: [
            slot('opening-repertoire', 'text', (
              <>
                <span className="card-label inline-flex items-center gap-[0.35em]">
                  <Library aria-hidden />
                  Repertoire
                </span>
                <div className="card-body">
                  {modeSwitch}
                  {/* B1a: until the server's list arrives, the openings as written (WRITTEN_STARTERS), never "Loading." */}
                  {(
                    /*
                      D6: the starters to choose from; the one being learned is marked. The list scrolls inside the card
                      (owner, 2026-11-11): at 800x600 and on phones the third row fell 22-37px below the card's edge,
                      and more repertoires are coming. The chosen one is scrolled into view, within the list only.
                    */
                    <div className="flex min-h-0 flex-1 flex-col">
                    {welcome && <span className="mb-[0.2em] px-[0.5em] text-[0.86em] font-semibold text-foreground">Choose an opening</span>}
                    <WorkspaceList label="Repertoires">
                    <div className="flex flex-col gap-[0.15em]" role="radiogroup" aria-label="Choose a repertoire">
                      {(starters ?? WRITTEN_STARTERS).map((s) => {
                        // nothing is chosen on the welcome (#337)
                        const on = !welcome && s.id === repertoireId;
                        const suits = REPERTOIRE_SUITS[s.id];
                        return (
                          <button
                            key={s.id}
                            type="button"
                            role="radio"
                            aria-checked={on}
                            ref={on ? scrollChosenIntoList : undefined}
                            /* The mode is kept: choosing a repertoire while training goes on training (owner, 2026-11-10). */
                            onClick={() => {
                              if (on) return;
                              logGA4Event({ name: 'opening_repertoire_chosen', params: { repertoire: s.id, from_welcome: welcome } });
                              setParams((prev) => { const n = new URLSearchParams(prev); n.set('repertoire', s.id); n.delete('from'); n.delete('welcome'); return n; });
                            }}
                            /* Selected as the active mode button is (owner: "needs to be clearly selected"). */
                            /* Each text sets its own colour: `.card-row` colours the row muted, and that beat a colour on the
                               button, so the chosen name printed muted on gold (owner, 2026-11-10). */
                            className={`flex w-full flex-col rounded px-[0.5em] py-[0.3em] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${on ? 'bg-primary' : 'hover:bg-muted'}`}
                          >
                            {/* The name wraps rather than ending in "..." (G1, 2026-11-23: "Caro-Kann Def..." beside "Black"
                                at 1920x947); the side stays on the first line. */}
                            <span className="card-row w-full items-start justify-between gap-[0.5em]" style={{ whiteSpace: 'normal' }}>
                              <span className={on ? 'font-medium text-primary-foreground' : 'text-foreground'}>{s.name}</span>
                              <span className={`shrink-0 text-[0.86em] leading-[1.6] ${on ? 'text-primary-foreground' : 'text-muted-foreground'}`}>{s.side === 'white' ? 'White' : 'Black'}</span>
                            </span>
                            {/* who it suits (#337), the one line under its name */}
                            {suits && <span className={`text-[0.8em] leading-snug ${on ? 'text-primary-foreground' : 'text-muted-foreground'}`}>{suits}</span>}
                          </button>
                        );
                      })}
                    </div>
                    </WorkspaceList>
                    {/* #337: the welcome again, on request (learning only: training has no welcome) */}
                    {!welcome && !training && (
                      <button
                        type="button"
                        onClick={() => setParams((prev) => { const n = new URLSearchParams(prev); n.set('welcome', '1'); n.delete('repertoire'); n.delete('from'); return n; })}
                        className="mt-auto self-start px-[0.5em] pt-[0.3em] text-[0.86em] text-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        The goals of the opening
                      </button>
                    )}
                    </div>
                  )}
                </div>
              </>
              /* #337 (owner, 2026-11-18, and again 2026-11-19): the Repertoire card has 2 shares to the line's 1 in
                 BOTH modes (room for more openings; the Current line card used ~130 of its 400px at 1536x746). The
                 Session card fits in 1 because its choices and its move list scroll inside it (#339); the openings
                 list scrolls inside its card. Stacked (a phone) in training is the one exception, 1 to 2: there a
                 guest's sign-in note, Start and Reset after a session need 31px more than a third of the lane. */
            ), sessionTall ? 1 : 2),
            slot('opening-line', 'text', (
              <>
                <span className="card-label inline-flex items-center gap-[0.35em]">
                  <Route aria-hidden />
                  {training ? 'Session' : 'Current line'}
                </span>
                <div className="card-body">
                  {training ? (
                    /*
                      E5 (Q16, owner 2026-11-11): the session. Before Start: what to train (E7), the progress per scope,
                      Start or Resume, and Reset. During it: the progress, the line played as text (stepping back would be
                      an undo, which training has none of), Pause (keeps the line) and Stop.
                    */
                    !train.data || !sess.state ? (
                      sess.loadError
                        ? <button type="button" onClick={sess.retry} className="card-btn w-full text-[0.92em]">Try again</button>
                        : <Muted>Loading.</Muted>
                    ) : sess.session ? (
                      <>
                        {fromLabel(train.fromLine) && (
                          <p className="truncate text-[0.92em] text-foreground">From {fromLabel(train.fromLine)}</p>
                        )}
                        {sess.session.focus === 'review' ? (
                          /* #339: a session of the positions due for review, until none is left */
                          <p className="text-[0.92em] text-muted-foreground">
                            {dueNow.length
                              ? `Review: ${dueNow.length} ${dueNow.length === 1 ? 'position' : 'positions'} left`
                              : "Today's review is done."}
                          </p>
                        ) : sess.session.focus === 'mistakes' ? (
                          /* #338: a session of only the mistakes, until none is left */
                          <p className="text-[0.92em] text-muted-foreground">
                            {mistakesHere.length
                              ? `My mistakes: ${mistakesHere.length} ${mistakesHere.length === 1 ? 'position' : 'positions'} left`
                              : 'All your mistakes are put right.'}
                          </p>
                        ) : scopeProgress && (
                          <p className="text-[0.92em] text-muted-foreground">
                            {scopeLabel(sess.session.scope)}: {scopeProgress[sess.session.scope].trained} of {scopeProgress[sess.session.scope].total} trained
                          </p>
                        )}
                        {train.line.length === 0 ? (
                          <Muted>The moves you play appear here.</Muted>
                        ) : (
                          <div className="flex min-h-0 flex-1 flex-col">
                            <WorkspaceList label="Current line">
                              <GameMoveList
                                moves={train.line.map((m) => m.san)}
                                startFen={train.data.positions[train.data.repertoire.rootKey]?.f}
                                currentMoveIndex={train.line.length - 1}
                                scrolls={false}
                                className="text-[0.92em]"
                              />
                            </WorkspaceList>
                          </div>
                        )}
                        {sess.saveError && <p className="text-[0.86em] text-destructive">{sess.saveError}</p>}
                        <div className="mt-auto grid grid-cols-2 gap-[0.4em]">
                          <button type="button" onClick={() => sess.pause(train.ucis)} disabled={sess.busy} className="card-btn w-full disabled:opacity-50">
                            <Pause aria-hidden />
                            Pause
                          </button>
                          <button type="button" onClick={sess.stop} disabled={sess.busy} className="card-btn w-full disabled:opacity-50">
                            <Square aria-hidden />
                            Stop
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        {fromLabel(from) && (
                          <div className="flex items-baseline justify-between gap-[0.5em]">
                            <span className="min-w-0 truncate text-[0.92em] text-foreground">From {fromLabel(from)}</span>
                            <button type="button" onClick={leaveFrom} className="shrink-0 text-[0.86em] text-link hover:underline">Whole repertoire</button>
                          </div>
                        )}
                        <span className="text-[0.86em] text-muted-foreground">Lines trained</span>
                        {/* the choices scroll inside the card when it is short (a phone, with the sign-in note): #339 */}
                        <WorkspaceList>
                        <div className="flex flex-col gap-[0.15em]" role="radiogroup" aria-label="What to train">
                          {SCOPES.map(({ id, label }) => {
                            const on = !sess.focus && id === sess.scope;
                            const pr = scopeProgress?.[id];
                            return (
                              <button
                                key={id}
                                type="button"
                                role="radio"
                                aria-checked={on}
                                onClick={() => sess.setScope(id)}
                                className={`card-row w-full justify-between rounded px-[0.5em] py-[0.2em] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${on ? 'bg-primary' : 'hover:bg-muted'}`}
                              >
                                <span className={on ? 'font-medium text-primary-foreground' : 'text-foreground'}>{label}</span>
                                {pr && (
                                  <span className={`text-[0.86em] tabular-nums ${on ? 'text-primary-foreground' : 'text-muted-foreground'}`}>
                                    {pr.trained} of {pr.total}
                                  </span>
                                )}
                              </button>
                            );
                          })}
                          {/* #338 (owner, 2026-11-19): train only the positions not yet right first time */}
                          {mistakesHere.length > 0 && (
                            <button
                              type="button"
                              role="radio"
                              aria-checked={sess.focus === 'mistakes'}
                              onClick={sess.chooseMistakes}
                              className={`card-row w-full justify-between rounded px-[0.5em] py-[0.2em] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${sess.focus === 'mistakes' ? 'bg-primary' : 'hover:bg-muted'}`}
                            >
                              <span className={sess.focus === 'mistakes' ? 'font-medium text-primary-foreground' : 'text-foreground'}>My mistakes</span>
                              <span className={`text-[0.86em] tabular-nums ${sess.focus === 'mistakes' ? 'text-primary-foreground' : 'text-muted-foreground'}`}>
                                {mistakesHere.length} {mistakesHere.length === 1 ? 'position' : 'positions'}
                              </span>
                            </button>
                          )}
                          {/*
                            #339 (owner, 2026-11-19): spaced review. Each position comes back after 1, 3, 7, 16, 35 and
                            75 days when right first time, after a day when not; chosen when some are due, else it says
                            when the next one is.
                          */}
                          {(dueNow.length > 0 || sess.nextReviewAt) && (
                            <button
                              type="button"
                              role="radio"
                              aria-checked={sess.focus === 'review'}
                              disabled={dueNow.length === 0}
                              onClick={sess.chooseReview}
                              className={`card-row w-full justify-between rounded px-[0.5em] py-[0.2em] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${sess.focus === 'review' ? 'bg-primary' : dueNow.length ? 'hover:bg-muted' : ''}`}
                            >
                              <span className={sess.focus === 'review' ? 'font-medium text-primary-foreground' : dueNow.length ? 'text-foreground' : 'text-muted-foreground'}>
                                {dueNow.length ? 'Due for review' : 'Review'}
                              </span>
                              <span className={`text-[0.86em] tabular-nums ${sess.focus === 'review' ? 'text-primary-foreground' : 'text-muted-foreground'}`}>
                                {dueNow.length
                                  ? `${dueNow.length} ${dueNow.length === 1 ? 'position' : 'positions'}`
                                  : `next ${reviewWhen(sess.nextReviewAt!)}`}
                              </span>
                            </button>
                          )}
                        </div>
                        </WorkspaceList>
                        {sess.resumable && (
                          <Muted>{`You paused in ${scopeLabel(sess.resumable.scope)}, ${sess.resumable.currentLine.length} moves into a line.`}</Muted>
                        )}
                        {!sess.focus && fromLines && fromLines[sess.scope] === 0 && !sess.resumable && (
                          <Muted>{`No ${sess.scope === 'both' ? 'lines' : scopeLabel(sess.scope).toLowerCase()} go through this position.${sess.scope === 'both' ? '' : ' Choose another set of lines.'}`}</Muted>
                        )}
                        {/* Soft accounts: offered when progress has just been saved, never blocking. */}
                        {sess.justEnded && !user && (
                          <p className="text-[0.86em] text-foreground">
                            Your progress lives on this device.{' '}
                            <Link to={`/login?returnTo=${encodeURIComponent(`/openings?mode=train&repertoire=${repertoireId}`)}`} className="text-link hover:underline">Sign in</Link>
                            {' '}and it follows you.
                          </p>
                        )}
                        {sess.loadError && (
                          <p className="text-[0.86em] text-destructive">
                            Your saved progress could not be loaded. You can still train.{' '}
                            <button type="button" onClick={sess.retry} className="text-link hover:underline">Try again</button>
                          </p>
                        )}
                        {sess.saveError && <p className="text-[0.86em] text-destructive">{sess.saveError}</p>}
                        <div className="mt-auto flex flex-col gap-[0.4em]">
                          {sess.resumable && refusedLimit ? (
                            /*
                              #472 (owner, 2026-11-25): after a refusal the refused "Start new" leaves the row (a half-width
                              "Back tomorrow" wrapped at most window sizes) and Resume, still free, takes it whole. A Resume
                              refused too (a session paused on an earlier day) leaves one disabled "Back tomorrow".
                            */
                            <button
                              type="button"
                              onClick={sess.resume}
                              disabled={sess.busy || refusedResume}
                              aria-label={refusedResume ? dailyLimitMessage(refusedLimit) : undefined}
                              title={refusedResume ? dailyLimitMessage(refusedLimit) : undefined}
                              className="card-btn card-btn-primary w-full disabled:opacity-50"
                            >
                              {refusedResume ? backLabel(refusedLimit) : <><Play aria-hidden />Resume</>}
                            </button>
                          ) : sess.resumable ? (
                            <div className="grid grid-cols-2 gap-[0.4em]">
                              <button type="button" onClick={sess.resume} disabled={sess.busy} className="card-btn card-btn-primary w-full disabled:opacity-50">
                                <Play aria-hidden />
                                Resume
                              </button>
                              <button type="button" onClick={sess.start} disabled={sess.busy} className="card-btn w-full disabled:opacity-50">
                                Start new
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={sess.start}
                              aria-label={refusedLimit ? dailyLimitMessage(refusedLimit) : undefined}
                              title={refusedLimit ? dailyLimitMessage(refusedLimit) : undefined}
                              disabled={sess.busy || !!refusedLimit || (sess.focus === 'mistakes' ? mistakesHere.length === 0 : sess.focus === 'review' ? dueNow.length === 0 : !!(fromLines ? fromLines[sess.scope] === 0 : scopeProgress && scopeProgress[sess.scope].total === 0))}
                              className="card-btn card-btn-primary w-full disabled:opacity-50"
                            >
                              {refusedLimit ? backLabel(refusedLimit) : <><Play aria-hidden />Start</>}
                            </button>
                          )}
                          {confirmReset ? (
                            <div className="flex items-center justify-between gap-[0.4em] text-[0.86em]">
                              <span className="text-foreground">{from.length ? 'Reset the progress from this position?' : "Reset this repertoire's progress?"}</span>
                              <span className="inline-flex gap-[0.6em]">
                                <button type="button" onClick={() => { setConfirmReset(false); sess.reset(); }} className="text-link hover:underline">Reset</button>
                                <button type="button" onClick={() => setConfirmReset(false)} className="text-muted-foreground hover:text-foreground">Keep</button>
                              </span>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmReset(true)}
                              disabled={sess.busy || sess.state.linesPlayed === 0}
                              className="card-row justify-center text-[0.86em] text-link hover:underline disabled:pointer-events-none disabled:text-muted-foreground"
                            >
                              Reset progress
                            </button>
                          )}
                        </div>
                      </>
                    )
                  ) : walk.line.length === 0 ? (
                    <Muted>The moves you play through appear here.</Muted>
                  ) : (
                    <div className="flex min-h-0 flex-1 flex-col">
                      {/*
                        F6: the line from its junction, not the whole game. D9 (owner: "go to a junction above"): the
                        junctions on the line, each one a jump; the one the list starts from is marked. Going there keeps
                        the line, so forward still works, and choosing another reply there starts a new one. The junction the board is at
                        or last passed is marked.
                      */}
                      <nav aria-label="Junctions on this line" className="mb-[0.3em] flex flex-wrap items-center gap-x-[0.35em] gap-y-[0.15em] text-[0.86em]">
                        <span className="text-muted-foreground">Junctions:</span>
                        {[0, ...walk.junctionPlies.filter((p) => p > 0)].map((p) => {
                          const on = p === atJunction;
                          const label = p === 0 ? 'Start' : numbered(rootPlies + p - 1, walk.sans[p - 1]);
                          return (
                            <button
                              key={p}
                              type="button"
                              onClick={() => walk.goTo(p)}
                              aria-current={on ? 'step' : undefined}
                              className={`rounded px-[0.3em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${on ? 'bg-muted font-semibold text-foreground' : 'text-link hover:underline'}`}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </nav>
                      <WorkspaceList label="Current line">
                        <GameMoveList
                          moves={walk.lineFrom.sans}
                          startFen={walk.lineFrom.fen ?? undefined}
                          currentMoveIndex={walk.viewPly - walk.lineFrom.ply - 1}
                          onMoveClick={(i) => walk.goTo(walk.lineFrom.ply + i + 1)}
                          scrolls={false}
                          className="text-[0.92em]"
                        />
                      </WorkspaceList>
                    </div>
                  )}
                  {/* E7 (owner, 2026-11-11): train only the lines through the position on the board. */}
                  {!training && walk.viewPly > 0 && (
                    <button
                      type="button"
                      onClick={() => setParams((prev) => {
                        const n = new URLSearchParams(prev);
                        n.set('mode', 'train');
                        n.set('from', walk.line.slice(0, walk.viewPly).join(','));
                        return n;
                      })}
                      className="card-btn mt-auto w-full"
                    >
                      <Dumbbell aria-hidden />
                      Train from here
                    </button>
                  )}
                </div>
              </>
              /* #337: 1 share, 2 only in training on a phone (the Repertoire card's comment above says why) */
            ), sessionTall ? 2 : 1),
          ],
          foot: footSlot('theme-focus', (
            <PuzzleAppearanceCard
              currentThemeId={currentTheme.id}
              onThemeChange={changeTheme}
              analyticsSurface="opening_trainer"
              focusMode={focusMode}
              onToggleFocusMode={canFocus ? () => setFocusMode((value) => !value) : undefined}
            />
          )),
        }}
      />
    </>
  );
}
