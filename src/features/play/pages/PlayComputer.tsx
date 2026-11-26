import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import type { Color, Key } from '@lichess-org/chessground/types';
import { parseSan } from 'chessops/san';
import { makeUci } from 'chessops/util';
import { ChevronDown, ChevronRight, Minimize2, Radio, Swords, Trophy, CircleUserRound } from 'lucide-react';

import { ChessBoard } from '@/components/chess/ChessBoard';
import { BoardControls } from '@/components/chess/BoardControls';
import { GameMoveList } from '@/components/chess/GameMoveList';
import { GameReviewActions } from '@/components/game-viewer/GameReviewActions';
import { parseGame } from '@/lib/game/gameModel';
import type { ChessGame } from '@/types/chess';
import { Workspace, WorkspaceList, type WorkspaceMode } from '@/components/workspace/Workspace';
import { slot, footSlot } from '@/components/workspace/slots';
import { useAnchoredPopover } from '@/components/workspace/useAnchoredPopover';
import { PlayerCard, PLAYER_CLOCK_CLASS } from '@/components/chess/PlayWorkspaceCards';
import { useChrome } from '@/app/SiteShell';
import SeoHead from '@/components/SeoHead';
import RouteHeading from '@/components/RouteHeading';
import { useBoardTheme } from '@/hooks/useBoardTheme';
import { positionFromFen, applyMove, isPromotion, toUci } from '@/components/chess/chessLogic';
import type { ChessPosition } from '@/components/chess/chessLogic';
import { PuzzleAppearanceCard } from '@/features/puzzles/components/PuzzleAppearanceCard';
import { PuzzleAnalysisCard } from '@/features/puzzles/components/PuzzleAnalysisCard';
import { ChessClock } from '@/features/online/components/ChessClock';
import { soundService } from '@/services/SoundService';
import { useComputerGame } from '../hooks/useComputerGame';
import { readPositionDeepLink } from '@/lib/positionDeepLink';
import { defaultLevelId, findLevel, playLevels, type PlayLevel } from '../services/playLevels';
import { MAIA_LIVE, MASTER_LIVE } from '@/design/designFlags';
import { MasterStrip } from '../components/MasterStrip';
import { GUIDED_INVITATION, GuidedPlayBlock, GuidedSwitchRow, readGuidedMock } from '../components/GuidedMock';
import { ENGINE_BUSY_LINE, useGuidedGame } from '../guided/useGuidedGame';
import type { Guide } from '../hooks/useComputerGame';
import { logGA4Event } from '@/services/analytics';
import { GamePgnActions } from '@/features/games/GamePgnActions';
import { buildGamePgn, gamePgnFileName } from '@/features/games/gamePgn';
import { fetchStoredGamePgn } from '@/features/games/storedGame';
import { useAuth } from '@/features/auth/AuthContext';
import { useMasterVoice } from '@/features/master/useMasterVoice';
import { chosenEventLine } from '@/features/master/eventLines';
import type { MasterExpression } from '@/components/master/masterAssets';

const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const TIME_CONTROLS = [
  { id: 'unlimited', label: 'Unlimited', initial: null, increment: 0 },
  { id: '3+0', label: '3+0', initial: 180, increment: 0 },
  { id: '5+0', label: '5+0', initial: 300, increment: 0 },
  { id: '10+0', label: '10+0', initial: 600, increment: 0 },
  { id: '15+10', label: '15+10', initial: 900, increment: 10 },
] as const;

interface HistoryEntry {
  fen: string;
  lastMove?: Key[];
  turnColor: Color;
  isCheck: boolean;
}

/** The levels of this build (MASTER_CHARACTER_IMPLEMENTATION_PLAN D3): today's eight while MAIA_LIVE is off. */
const LEVELS = playLevels(MAIA_LIVE);

/** "Level 4 · Intermediate" as today; "The Master · 1400" for his levels. */
function levelLabel(level: PlayLevel): string {
  return level.kind === 'master' ? `The Master · ${level.approxRating}` : `Level ${level.stockfish.level} · ${level.name}`;
}

/** The short form on the game card: "Level 4" as today, "The Master 1400" for his. */
function levelShort(level: PlayLevel): string {
  return level.kind === 'master' ? `The Master ${level.approxRating}` : `Level ${level.stockfish.level}`;
}

function EngineLevelPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { open, setOpen, triggerRef, panelRef: menuRef, style: position, room } = useAnchoredPopover({ matchWidth: true });
  const selected = findLevel(LEVELS, value);

  return (
    <div className="flex flex-col" style={{ gap: 'var(--card-air)' }}>
      <span className="text-[0.8em] uppercase tracking-wide text-muted-foreground">Engine level</span>
      <button ref={triggerRef} type="button" onClick={() => setOpen(current => !current)} aria-expanded={open} aria-haspopup="listbox" className="flex w-full items-center justify-between rounded-[0.4em] border border-border bg-accent/20 px-[0.6em] py-[0.3em] text-left text-[0.92em] font-semibold text-foreground transition-colors hover:border-primary/50 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20">
        <span className="truncate">{levelLabel(selected)}</span><ChevronDown className={`shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {open && createPortal(
        <div ref={menuRef} role="listbox" aria-label="Engine level" className="fixed z-[100] overflow-y-auto rounded-lg border border-border bg-card p-1 shadow-2xl thin-scroll" style={{ ...position, maxHeight: Math.min(320, room) }}>
          {LEVELS.map((level, i) => (
            <div key={level.id}>
              {/* With the Master: a heading over his levels, and over the computer's strong ones after them. */}
              {level.kind === 'master' && LEVELS[i - 1]?.kind !== 'master' && (
                <div role="presentation" className="px-3 pb-1 pt-2 text-[0.7rem] uppercase tracking-wide text-muted-foreground">The Master, plays like a person</div>
              )}
              {level.kind === 'stockfish' && LEVELS[i - 1]?.kind === 'master' && (
                <div role="presentation" className="px-3 pb-1 pt-2 text-[0.7rem] uppercase tracking-wide text-muted-foreground">The computer</div>
              )}
              <button type="button" role="option" aria-selected={level.id === value} onClick={() => { onChange(level.id); setOpen(false); }} className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-accent/60 ${level.id === value ? 'bg-primary/10 text-link' : ''}`}>
                <span className="font-medium">{levelLabel(level)}</span>
                {/* his rows already name the rating ("The Master · 1400") */}
                {level.kind === 'stockfish' && <span className="ml-3 text-xs text-muted-foreground">~{level.approxRating}</span>}
              </button>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}

function buildHistory(moves: string[], startFen = STARTING_FEN): HistoryEntry[] {
  let position = positionFromFen(startFen);
  if (!position) return [];
  const history: HistoryEntry[] = [{
    fen: startFen,
    turnColor: position.turnColor,
    isCheck: position.isCheck,
  }];
  for (const san of moves) {
    const move = parseSan(position.chess, san);
    if (!move) break;
    const uci = makeUci(move);
    const next = applyMove(position, uci);
    if (!next) break;
    position = next;
    history.push({
      fen: next.fen,
      lastMove: [uci.slice(0, 2) as Key, uci.slice(2, 4) as Key],
      turnColor: next.turnColor,
      isCheck: next.isCheck,
    });
  }
  return history;
}

export function PlayComputer() {
  const navigate = useNavigate();
  const location = useLocation();
  /*
    A POSITION TO PLAY ON FROM (opening trainer E3b, F7): `?fen=...&orientation=...`, as /analysis takes it. The
    trainer opens it in a new tab after a move outside the book. Without it, /play is unchanged.
  */
  const fromPosition = useMemo(() => readPositionDeepLink(location.search).value, [location.search]);
  /* #428 A4: the guided game's DEV-only mock (`?guidedMock=1` or `=warn`); null in a production build. */
  const guidedMock = useMemo(() => readGuidedMock(location.search), [location.search]);
  /* The switch is ON by default (owner, 2026-11-26) and remembered per browser once changed (analysis 4.2). */
  const [guidedOn, setGuidedOnState] = useState(() => { if (guidedMock === 'warn') return true; try { return localStorage.getItem('cp_guided_on') !== '0'; } catch { return true; } });
  const setGuidedOn = (on: boolean) => { setGuidedOnState(on); try { localStorage.setItem('cp_guided_on', on ? '1' : '0'); } catch { /* private window */ } };
  /* In a guided game the move list starts collapsed, remembered per browser (owner, 2026-11-26: beginners do not read
     the notation yet, "point the squares"), so his speech area can take the card. */
  const [guidedMovesOpen, setGuidedMovesOpen] = useState(() => { try { return localStorage.getItem('cp_guided_moves_open') === '1'; } catch { return false; } });
  const toggleGuidedMoves = () => setGuidedMovesOpen((o) => { try { localStorage.setItem('cp_guided_moves_open', o ? '0' : '1'); } catch { /* private window */ } return !o; });
  const startFen = fromPosition?.fen ?? STARTING_FEN;
  const startTurn: Color = positionFromFen(startFen)?.turnColor ?? 'white';
  /* #428 B4: the guided game's guide, given to the computer game; a ref, since the two hooks need each other */
  const guideRef = useRef<Guide | null>(null);
  const [gameState, actions] = useComputerGame({ guideRef });
  const { timeout } = actions;
  const [selectedColor, setSelectedColor] = useState<Color>(fromPosition?.orientation ?? 'white');
  useEffect(() => { if (fromPosition) setSelectedColor(fromPosition.orientation); }, [fromPosition]);
  const [activeColor, setActiveColor] = useState<Color>('white');
  const [selectedLevelId, setSelectedLevelId] = useState(() => defaultLevelId(MAIA_LIVE));
  const [selectedTimeControl, setSelectedTimeControl] = useState<(typeof TIME_CONTROLS)[number]>(TIME_CONTROLS[0]);
  const [activeTimeControl, setActiveTimeControl] = useState<(typeof TIME_CONTROLS)[number]>(TIME_CONTROLS[0]);
  const [whiteMs, setWhiteMs] = useState<number | null>(null);
  const [blackMs, setBlackMs] = useState<number | null>(null);
  const previousPlyRef = useRef(0);
  const [focusMode, setFocusMode] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(soundService.enabled);
  const [viewPly, setViewPly] = useState<number | null>(null);
  const [reviewPosition, setReviewPosition] = useState<{ position: ChessPosition; lastMove: Key[] } | null>(null);
  /*
    THE WORKSPACE SIZES EVERYTHING (layout redesign D1). The tier widths, the
    board chrome, `useBoardSize`, `useNavTotal` and `layoutMode` are gone: the
    board and the lanes are CSS from the layout tokens, as on /puzzles.

    FOCUS MODE IS COLUMNS-ONLY and offered only where focus itself stays columns
    (owner, 2026-10-08; the rule /puzzles follows): the Workspace reports its
    mode from its container query, and stacking leaves focus mode.
  */
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode | null>(null);
  const canFocus = workspaceMode?.mode === 'columns' && workspaceMode.focusHolds;
  useEffect(() => {
    if (workspaceMode?.mode === 'stacked') setFocusMode(false);
  }, [workspaceMode]);
  /* Focus mode asks the shell to hide the nav, and gives it back on unmount. */
  const { setChromeHidden } = useChrome();
  useEffect(() => {
    setChromeHidden(focusMode);
    return () => setChromeHidden(false);
  }, [focusMode, setChromeHidden]);
  const { currentTheme, changeTheme } = useBoardTheme();
  const [gameStartFen, setGameStartFen] = useState(startFen);
  const history = useMemo(() => buildHistory(gameState.sanMoves, gameStartFen), [gameState.sanMoves, gameStartFen]);
  const latestPly = history.length - 1;
  const currentPly = viewPly ?? latestPly;
  const historyEntry = viewPly === null ? null : history[currentPly];
  const levelInPlay: PlayLevel = gameState.gameStatus !== 'idle' && gameState.level ? gameState.level : findLevel(LEVELS, selectedLevelId);
  const isEnded = gameState.gameStatus === 'ended';

  useEffect(() => {
    if (viewPly !== null && viewPly >= latestPly) setViewPly(null);
  }, [latestPly, viewPly]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && focusMode) setFocusMode(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [focusMode]);

  useEffect(() => {
    if (gameState.gameStatus !== 'playing' || activeTimeControl.initial === null) return;
    const timer = window.setInterval(() => {
      const update = gameState.turnColor === 'white' ? setWhiteMs : setBlackMs;
      update(current => {
        if (current === null) return null;
        const next = Math.max(0, current - 250);
        if (next === 0) timeout(gameState.turnColor);
        return next;
      });
    }, 250);
    return () => window.clearInterval(timer);
  }, [activeTimeControl.initial, gameState.gameStatus, gameState.turnColor, timeout]);

  useEffect(() => {
    const ply = gameState.sanMoves.length;
    if (ply <= previousPlyRef.current || activeTimeControl.increment === 0) {
      previousPlyRef.current = ply;
      return;
    }
    // The side that just moved: from a position Black may move first.
    const firstMover = positionFromFen(gameStartFen)?.turnColor ?? 'white';
    const mover = ply % 2 === 1 ? firstMover : (firstMover === 'white' ? 'black' : 'white');
    const add = activeTimeControl.increment * 1000;
    (mover === 'white' ? setWhiteMs : setBlackMs)(current => current === null ? null : current + add);
    previousPlyRef.current = ply;
  }, [activeTimeControl.increment, gameState.sanMoves.length, gameStartFen]);

  /* which wording of the Master's start and end lines this game uses, drawn when it starts so it never changes mid-game */
  const [linePick, setLinePick] = useState(0);
  /* whether he has said a move this game: from then on "Good luck" is over (see `opening` below) */
  const [heSpoke, setHeSpoke] = useState(false);
  const startGame = (color = selectedColor, levelId = selectedLevelId) => {
    setLinePick(Math.floor(Math.random() * 1000));
    setHeSpoke(false);
    setSelectedColor(color);
    setActiveColor(color);
    setSelectedLevelId(levelId);
    const initialMs = selectedTimeControl.initial === null ? null : selectedTimeControl.initial * 1000;
    setActiveTimeControl(selectedTimeControl);
    setWhiteMs(initialMs);
    setBlackMs(initialMs);
    previousPlyRef.current = 0;
    setViewPly(null);
    setReviewPosition(null);
    setGameStartFen(startFen);
    const chosen = findLevel(LEVELS, levelId);
    logGA4Event({ name: 'computer_game_started', params: { opponent: chosen.kind === 'master' ? 'master' : 'stockfish', level: chosen.approxRating, color, from_position: Boolean(fromPosition) } });
    // #416: the clock is stored with the finished game (no clock: 0 and 0).
    const clock = selectedTimeControl.initial === null ? { initial: 0, increment: 0 } : { initial: selectedTimeControl.initial, increment: selectedTimeControl.increment };
    actions.startGame(color, chosen, fromPosition ? startFen : undefined, clock);
  };

  const challengeFriend = () => navigate('/play-online?setup=friend');

  const reviewMove = (orig: Key, dest: Key) => {
    if (!isEnded) return;
    const base = reviewPosition?.position ?? positionFromFen(historyEntry?.fen ?? gameState.fen);
    if (!base) return;
    const promotion = isPromotion(base, orig, dest) ? 'q' : undefined;
    const next = applyMove(base, toUci(orig, dest, promotion));
    if (next) setReviewPosition({ position: next, lastMove: [orig, dest] });
  };

  // Before a game the board shows where it will start: the position link's, else the initial position.
  const boardFen = reviewPosition?.position.fen ?? historyEntry?.fen ?? (gameState.position ? gameState.fen : startFen);
  const boardOrientation: Color = fromPosition && gameState.gameStatus === 'idle' ? selectedColor : gameState.playerColor;
  const boardTurn = reviewPosition?.position.turnColor ?? historyEntry?.turnColor ?? gameState.turnColor;
  const boardCheck = reviewPosition?.position.isCheck ?? historyEntry?.isCheck ?? gameState.isCheck;
  const boardLastMove = reviewPosition?.lastMove ?? historyEntry?.lastMove ?? gameState.lastMove;
  const canMove = gameState.gameStatus === 'playing' && viewPly === null;

  /*
    THE FINISHED GAME'S REPORT (owner, 2026-11-19, as on /play-online #359): the champion viewer's Game report
    and Explain position. The model is built from the moves as a PGN (with the start position's [FEN] for a
    game from a position, where the row offers Explain position only, D36). It reads the GAME's position at
    the viewed move, never a what-if move made on the board after the game.
  */
  /* The score for the move list's result line: "White wins ...", "Black wins ...", else a draw. */
  const resultScore: '1-0' | '0-1' | '1/2-1/2' | null = !isEnded || !gameState.gameResult ? null
    : gameState.gameResult.startsWith('White') ? '1-0' : gameState.gameResult.startsWith('Black') ? '0-1' : '1/2-1/2';
  const finishedGame = useMemo(() => {
    if (!isEnded || !gameState.gameResult || gameState.sanMoves.length === 0) return null;
    const fenTags = gameStartFen === STARTING_FEN ? '' : `[SetUp "1"]
[FEN "${gameStartFen}"]

`;
    const parsed = parseGame(fenTags + gameState.sanMoves.join(' '));
    if (!parsed.ok || parsed.game.plies.length !== gameState.sanMoves.length) return null;
    const winner: 'white' | 'black' | 'draw' = resultScore === '1-0' ? 'white' : resultScore === '0-1' ? 'black' : 'draw';
    const engine = levelInPlay.kind === 'master' ? 'The Master' : `Stockfish Level ${levelInPlay.stockfish.level}`;
    const metadata: ChessGame = {
      playerName: '',
      white: gameState.playerColor === 'white' ? 'Player' : engine,
      black: gameState.playerColor === 'white' ? engine : 'Player',
      result: resultScore ?? '1/2-1/2',
      event: `Chess Playbook, ${levelShort(levelInPlay)}`, site: 'chessplaybook.com', date: '',
    };
    return { plies: parsed.game.plies, startFen: parsed.game.startFen, metadata, winner };
  }, [isEnded, gameState.gameResult, gameState.sanMoves, gameState.playerColor, gameStartFen, levelInPlay, resultScore]);
  // The move list shows and sets the VIEWED move, as the step buttons do (D30): ply k is
  // the position after move k-1 in the list's 0-based count, ply 0 the start.
  const jumpToMove = (moveIndex: number) => {
    setReviewPosition(null);
    const ply = moveIndex + 1;
    setViewPly(ply >= latestPly ? null : ply);
  };
  const displayColor = gameState.gameStatus === 'idle' ? selectedColor : activeColor;
  const playerClockMs = displayColor === 'white' ? whiteMs : blackMs;
  const opponentColor: Color = displayColor === 'white' ? 'black' : 'white';
  const opponentClockMs = opponentColor === 'white' ? whiteMs : blackMs;

  const timeControl = gameState.gameStatus === 'idle' ? selectedTimeControl : activeTimeControl;

  /*
    #416: COPY AND DOWNLOAD THE GAME, at any time against the computer. While it is played (or before the
    server has it) the PGN is built here with the server's own tags (gamePgn.test.ts holds the two builders
    together); once the game is stored, the server's PGN, which has the player's public name.
  */
  const { user } = useAuth();
  const botName = levelInPlay.kind === 'master' ? `Chess Playbook Master (${levelInPlay.approxRating})` : `Stockfish level ${levelInPlay.stockfish.level}`;
  const personName = user?.username || 'Player';
  const pgnWhite = gameState.playerColor === 'white' ? personName : botName;
  const pgnBlack = gameState.playerColor === 'white' ? botName : personName;
  const gameMode = levelInPlay.kind === 'master' ? 'master' as const : 'stockfish' as const;
  const pgnNow = async (): Promise<string> => {
    const saved = gameState.savedGame;
    if (saved?.status === 'saved' && saved.id) {
      try { return await fetchStoredGamePgn(saved.id); } catch { /* the browser's copy below */ }
    }
    const clock = activeTimeControl.initial === null ? { initial: 0, increment: 0 } : activeTimeControl;
    return buildGamePgn({
      white: { username: pgnWhite, rating: gameState.playerColor === 'white' ? null : levelInPlay.approxRating },
      black: { username: pgnBlack, rating: gameState.playerColor === 'white' ? levelInPlay.approxRating : null },
      result: resultScore ?? '*',
      endReason: /on time/.test(gameState.gameResult ?? '') ? 'timeout' : '',
      sanMoves: gameState.sanMoves,
      timeControlInitial: clock.initial ?? 0,
      timeControlIncrement: clock.increment,
      playedAt: new Date(),
      mode: gameMode,
      startFen: gameStartFen === STARTING_FEN ? null : gameStartFen,
    });
  };
  /*
    THE MASTER ON THE CARD (#186 D4): only while MASTER_LIVE is on and he is the opponent. His line follows the
    game; D6 replaces "Your move." with the sentence that says the move he just played.
  */
  const masterHere = MASTER_LIVE && levelInPlay.kind === 'master';
  /* #428 B: a guided game, behind the DEV switch (`?guidedMock`) until Phase D ships it */
  const guided = useGuidedGame({ enabled: guidedMock !== null && guidedOn && masterHere && !fromPosition, guideRef, game: gameState, actions });
  /* The end of a game, once (D10). */
  const reportedEndRef = useRef(false);
  useEffect(() => {
    if (gameState.gameStatus !== 'ended') { reportedEndRef.current = false; return; }
    if (reportedEndRef.current || !gameState.level) return;
    reportedEndRef.current = true;
    const text = gameState.gameResult ?? '';
    const result = text.startsWith('Draw') ? 'draw' : text.startsWith(activeColor === 'white' ? 'White' : 'Black') ? 'win' : 'loss';
    logGA4Event({ name: 'computer_game_finished', params: {
      opponent: gameState.level.kind === 'master' ? 'master' : 'stockfish',
      level: gameState.level.approxRating,
      result,
      moves: gameState.sanMoves.length,
      master_fell_back: gameState.masterFellBack,
    } });
  }, [gameState.gameStatus, gameState.gameResult, gameState.level, gameState.sanMoves.length, gameState.masterFellBack, activeColor]);
  /* re-render once the reaction's 1.2 s are over, so the thinking face takes over even if nothing else changes */
  const [reactionNow, setReactionNow] = useState(() => Date.now());
  useEffect(() => {
    const r = gameState.masterReaction;
    setReactionNow(Date.now());
    if (!r) return;
    const t = setTimeout(() => setReactionNow(Date.now()), Math.max(0, r.at + 1250 - Date.now()));
    return () => clearTimeout(t);
  }, [gameState.masterReaction]);
  /*
    HIS WORDS AT THE START AND END (owner, 2026-11-16): one of a few fixed lines (`eventLines.json`), spoken as well
    as shown. At the start "Good luck" until his first move gives him a move to say; at the end the result's line.
    Memoised so a re-render never restarts the recording (the voice plays each new line object once).
  */
  const playerWon = (gameState.gameResult ?? '').startsWith(activeColor === 'white' ? 'White' : 'Black');
  const endEvent = gameState.gameStatus !== 'ended' ? null
    : (gameState.gameResult ?? '').startsWith('Draw') ? 'draw' : playerWon ? 'win' : 'loss';
  const startLine = useMemo(() => chosenEventLine('start', linePick), [linePick]);
  /*
    "Good luck" is for BEFORE his first move only. Each move of his clears his last sentence while the server
    answers with the new one; falling back to the start line in that gap replayed its first syllable before every
    move (owner on staging, 2026-11-16: "Goo", then the move; invisible locally, where the answer takes ~5 ms).
    In the gap he now says nothing and the card shows an ellipsis.
  */
  useEffect(() => {
    if (gameState.masterLine) setHeSpoke(true);
  }, [gameState.masterLine]);
  const opening = heSpoke ? null : startLine;
  const lineNow = gameState.masterLine?.text ?? opening?.text ?? '…';
  const endLine = useMemo(() => (endEvent ? chosenEventLine(endEvent, linePick) : null), [endEvent, linePick]);
  /*
    HE TAKES A MOMENT AT THE END TOO (owner, 2026-11-16: after a mate "Well done, you beat me!" came instantly).
    The end line waits a pause like his move's, and never cuts off what he is saying: when his own move ends the
    game, "... Checkmate." is said first. Until then the card keeps his last line.
  */
  const [endPaused, setEndPaused] = useState(false);
  const [endReady, setEndReady] = useState(false);
  useEffect(() => {
    setEndPaused(false);
    setEndReady(false);
    if (!endEvent) return;
    const t = setTimeout(() => setEndPaused(true), endEvent === 'win' ? 1500 : 1800);
    return () => clearTimeout(t);
  }, [endEvent]);
  const spokenLine = !masterHere ? null
    : gameState.gameStatus === 'playing' ? gameState.masterLine ?? opening
    : gameState.gameStatus === 'ended' ? (endReady ? endLine : gameState.masterLine)
    : null;
  const voice = useMasterVoice(spokenLine);
  useEffect(() => {
    if (endPaused && !endReady && !voice.speaking) setEndReady(true);
  }, [endPaused, endReady, voice.speaking]);
  const stacked = workspaceMode?.mode === 'stacked';
  const master: { expression: MasterExpression; line: string } = (() => {
    if (gameState.gameStatus === 'idle') return { expression: 'presenting', line: 'Shall we play a game?' };
    if (gameState.gameStatus === 'playing') {
      if (gameState.isThinking) {
        // his face at your move first (D9: a face, never words), then he thinks
        const r = gameState.masterReaction;
        const fresh = r && reactionNow - r.at < 1200;
        // before his first move the card keeps his "Good luck", which he is saying
        return { expression: fresh ? r.expression : 'thinking', line: opening ? opening.text : 'Let me think…' };
      }
      // after his move, he says what he played (D6); before it, his "Good luck"
      return { expression: 'presenting', line: lineNow };
    }
    if (!endReady) {
      // the pause before his end line: ONE face, his final one at once when you beat him (owner, 2026-11-16: the
      // faces changed three times before the line); when his own move ended it, the face he says his move with.
      // His last line stays on the card.
      return { expression: endEvent === 'win' ? 'surprised' : 'presenting', line: lineNow };
    }
    const line = endLine?.text ?? '';
    if (endEvent === 'draw') return { expression: 'presenting', line };
    return playerWon ? { expression: 'surprised', line } : { expression: 'pleased', line };
  })();
  /* The two ways off this page, offered on the idle card and again when a game ends. */
  const otherWays = (
    <div className="grid grid-cols-2" style={{ gap: 'calc(var(--card-air) * 2)' }}>
      <button type="button" onClick={challengeFriend} className="card-btn px-[0.5em] text-[0.86em] text-muted-foreground hover:text-foreground">
        <span className="truncate">Challenge a friend</span>
      </button>
      <button type="button" onClick={() => navigate('/play-online')} className="card-btn px-[0.5em] text-[0.86em] text-muted-foreground hover:text-foreground">
        <span className="truncate">Play online</span>
      </button>
    </div>
  );

  return (
    <main className="contents">
      {/* Both read `src/config/route-meta.json`; the `<h1>` is `sr-only` because
          nothing may sit above the board (PRD 5.2). */}
      <SeoHead routeKey="play" />
      <div className="sr-only"><RouteHeading routeKey="play" /></div>

      {/* The toggle lives in the context lane's foot, which focus mode removes,
          so the exit is a fixed control with the shortcut named on it. */}
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
          <div data-skeleton-card="board" className="w-full" role="group" aria-label="Chess board, playing against the computer">
            <ChessBoard fen={boardFen} orientation={boardOrientation} dests={canMove ? gameState.dests : reviewPosition?.position.dests} turnColor={boardTurn} movableColor={canMove ? gameState.movableColor : isEnded ? boardTurn : undefined} lastMove={boardLastMove} check={boardCheck ? boardTurn : undefined} onMove={canMove ? actions.onMove : reviewMove} themeId={currentTheme.id} dragDistance={7} autoDragDistance={false} />
          </div>
        }
        toolbar={
          <BoardControls onStart={() => { setReviewPosition(null); setViewPly(0); }} onBack={() => { setReviewPosition(null); setViewPly(Math.max(0, currentPly - 1)); }} onForward={() => { setReviewPosition(null); setViewPly(currentPly + 1 >= latestPly ? null : currentPly + 1); }} onReset={() => { setReviewPosition(null); setViewPly(null); }} onFlip={actions.flipBoard} historyDisabled={history.length <= 1} />
        }
        activity={{
          title: 'Game',
          cards: [
            /*
              THE GAME CARD, KEPT IN FOCUS MODE. Its phase changes what it holds
              (an invitation to start, the moves, the result) but never its size:
              the move list takes whatever height is left and scrolls inside a
              `WorkspaceList`, the one scroller a card may hold (spec §5).
            */
            slot('play-live', 'playLive', (
              <div className="card-body">
                {/* A guided game hides the two header rows while it is played (analysis 4.2: the button row and the speech block need the room). */}
                {!(guidedMock && guidedOn && masterHere && gameState.gameStatus !== 'idle') && (
                <>
                <span className="card-row">
                  <Swords className="shrink-0 text-link" />
                  {/* his levels name him, the Stockfish levels stay "computer" (owner, 2026-11-17: only 5 of the 9 levels are him) */}
                  <span className="truncate font-semibold text-foreground">{levelInPlay.kind === 'master' ? 'Play the Master' : 'Play computer'}</span>
                  <span className="ml-auto shrink-0 text-[0.8em] text-success">Engine {gameState.isEngineReady ? 'ready' : 'loading'}</span>
                </span>
                <span className="card-row text-[0.86em]">{levelShort(levelInPlay)} · {timeControl.label}</span>
                </>
                )}
                {gameState.gameStatus === 'idle' ? (
                  <>
                  {/* #428: the switch at the top of the card, above his invitation (owner, 2026-11-26) */}
                  {guidedMock && masterHere && !fromPosition && <GuidedSwitchRow checked={guidedOn} onChange={setGuidedOn} />}
                  {masterHere && !stacked && <MasterStrip variant="invitation" stacked={false} expression={master.expression} line={guidedMock && guidedOn ? GUIDED_INVITATION : master.line} />}
                  <div className="ws-push-end flex flex-col" style={{ gap: 'calc(var(--card-air) * 2)' }}>
                    <button type="button" onClick={() => startGame()} disabled={!gameState.isEngineReady} className="card-btn card-btn-primary w-full disabled:opacity-50">
                      {!gameState.isEngineReady ? 'Loading engine…' : fromPosition ? 'Play from this position' : 'New game'}
                    </button>
                    {otherWays}
                  </div>
                  {masterHere && stacked && <MasterStrip variant="invitation" stacked expression={master.expression} line={guidedMock && guidedOn ? GUIDED_INVITATION : master.line} />}
                  </>
                ) : (
                  <>
                    {masterHere && <MasterStrip variant="strip" stacked={stacked} expression={master.expression} line={master.line} voice={voice} />}
                    {guidedMock && guidedOn && masterHere && <GuidedPlayBlock warning={guided.warning} sampleWarning={guidedMock === 'warn' && !guided.warning} takebacksLeft={guided.takebacksLeft} onTakeBack={guided.takeBack} onPlayOn={guided.playOn} notice={guided.enginePaused ? ENGINE_BUSY_LINE : null} />}
                    <span className="card-row justify-between text-[0.8em] uppercase tracking-wide">
                      {guidedMock && guidedOn && masterHere ? (
                        <button type="button" onClick={toggleGuidedMoves} aria-expanded={guidedMovesOpen} aria-controls="guided-moves" className="inline-flex items-center gap-[0.3em] uppercase tracking-wide hover:text-foreground" data-guided="moves-toggle">
                          {guidedMovesOpen ? <ChevronDown className="shrink-0" aria-hidden /> : <ChevronRight className="shrink-0" aria-hidden />}
                          Moves
                        </button>
                      ) : (
                        <span>Moves</span>
                      )}
                      {/* No position label (owner: "Latest position" removed 2026-10-08,
                          "Move N" removed 2026-10-10): the list marks the move shown. */}
                      {/* #416: Copy and Download, at any time against the computer, in the row's empty right side. */}
                      {gameState.sanMoves.length > 0 && (
                        <GamePgnActions
                          pgn={pgnNow}
                          fileName={gamePgnFileName(pgnWhite, pgnBlack, new Date())}
                          mode={gameMode}
                          surface="play_computer"
                          /* Share only once the game is stored: a link needs the server's id (owner: after the game ends). */
                          shareId={gameState.savedGame?.status === 'saved' ? gameState.savedGame.id : null}
                        />
                      )}
                    </span>
                    {/* #428: in a guided game the moves get a constant 2 of 5 shares of the free height, his speech area 3 (owner, 2026-11-26) */}
                    <div id="guided-moves" className={`${guidedMock && guidedOn && masterHere && !guidedMovesOpen ? 'hidden' : 'flex'} min-h-0 flex-col ${guidedMock && guidedOn && masterHere ? 'flex-[2_1_0%]' : 'flex-1'}`}>
                      <WorkspaceList label="Moves">
                        {/* The result below the last move, as on /play-online (owner, 2026-11-19): 1-0, 0-1 or 1/2-1/2. */}
                        <GameMoveList
                          moves={gameState.sanMoves}
                          startFen={gameStartFen === STARTING_FEN ? undefined : gameStartFen}
                          currentMoveIndex={currentPly - 1}
                          onMoveClick={jumpToMove}
                          scrolls={false}
                          className="text-[0.92em]"
                          result={resultScore ?? undefined}
                        />
                      </WorkspaceList>
                    </div>
                    {gameState.gameStatus === 'playing' && (
                      <button type="button" onClick={actions.resign} className="card-btn w-full border border-destructive/50 text-destructive" style={{ background: 'transparent' }}>
                        Resign
                      </button>
                    )}
                    {isEnded && (
                      <>
                        {finishedGame && (
                          <GameReviewActions
                            fen={historyEntry?.fen ?? gameState.fen}
                            startFen={finishedGame.startFen}
                            plies={finishedGame.plies}
                            ply={currentPly - 1}
                            onGoTo={jumpToMove}
                            metadata={finishedGame.metadata}
                            gameResult={finishedGame.winner}
                            puzzles={{ perspective: gameState.playerColor }}
                          />
                        )}
                        <button type="button" onClick={() => startGame()} className="card-btn card-btn-primary w-full">{fromPosition ? 'Play this position again' : 'New game'}</button>
                        {otherWays}
                      </>
                    )}
                  </>
                )}
              </div>
            ), 1, true),
          ],
          foot: footSlot('analysis', (
            <PuzzleAnalysisCard enabled={isEnded} fen={boardFen} orientation={gameState.playerColor} surface="play_computer" />
          )),
        }}
        context={{
          title: 'Game setup',
          cards: [
            slot('play-settings', 'playSettings', (
              <>
                <span className="card-label inline-flex items-center gap-[0.35em]">
                  <Swords className="text-link" />
                  Game settings
                </span>
                <div className="card-body">
                  <EngineLevelPicker value={selectedLevelId} onChange={setSelectedLevelId} />
                  {/* Label over its control, as the engine level above it: on one
                      row, at 18px type in the 240px lane, the label truncated to
                      "TIME CONT..." (D1, 1920x947). */}
                  <div className="flex flex-col" style={{ gap: 'var(--card-air)' }}>
                    <label className="text-[0.8em] uppercase tracking-wide text-muted-foreground" htmlFor="computer-time-control">Time control</label>
                    <select id="computer-time-control" value={selectedTimeControl.id} onChange={event => setSelectedTimeControl(TIME_CONTROLS.find(control => control.id === event.target.value) ?? TIME_CONTROLS[0])} className="w-full rounded-[0.4em] border border-border bg-transparent px-[0.6em] py-[0.3em] text-[0.92em] text-foreground">
                      {TIME_CONTROLS.map(control => <option className="bg-card" key={control.id} value={control.id}>{control.label}</option>)}
                    </select>
                  </div>
                  <span className="card-row text-[0.8em] uppercase tracking-wide">Play as</span>
                  <div className="grid grid-cols-2" style={{ gap: 'calc(var(--card-air) * 2)' }}>
                    {(['white', 'black'] as Color[]).map(color => (
                      <button key={color} type="button" onClick={() => setSelectedColor(color)} aria-pressed={selectedColor === color} className={`rounded-[0.3em] border px-[0.5em] py-[0.2em] text-[0.86em] capitalize ${selectedColor === color ? 'border-primary bg-primary/10 text-link' : 'border-border text-muted-foreground'}`}>
                        {color}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            /* Share 2: it holds the most rows in the lane. At an equal share its
               type fell under the other titles' and at 800x600 its rows overlapped. */
            ), 2),
            slot('play-opponent', 'playPlayer', (
              <PlayerCard
                icon={<CircleUserRound />}
                label="Opponent"
                name={levelInPlay.kind === 'master' ? 'The Master' : `Stockfish Level ${levelInPlay.stockfish.level}`}
                detail={levelInPlay.kind === 'master' ? `Rating ~${levelInPlay.approxRating}` : `${levelInPlay.name} · Rating ~${levelInPlay.approxRating}`}
                status={gameState.isThinking ? 'Thinking…' : undefined}
                clock={opponentClockMs === null ? undefined : <ChessClock timeMs={opponentClockMs} isActive={gameState.gameStatus === 'playing' && gameState.turnColor === opponentColor} isGameOver={gameState.gameStatus !== 'playing'} className={PLAYER_CLOCK_CLASS} />}
              />
            )),
            slot('play-you', 'playPlayer', (
              <PlayerCard
                icon={<Trophy />}
                label="You"
                name="Player"
                detail={`Playing ${displayColor}`}
                clock={playerClockMs === null ? undefined : <ChessClock timeMs={playerClockMs} isActive={gameState.gameStatus === 'playing' && gameState.turnColor === displayColor} isGameOver={gameState.gameStatus !== 'playing'} className={PLAYER_CLOCK_CLASS} />}
              />
            )),
            slot('play-go-to', 'playGoTo', (
              <>
                <span className="card-label inline-flex items-center gap-[0.35em]">
                  <Radio />
                  Go to
                </span>
                <div className="card-body" style={{ gap: 0 }}>
                  {/* From a position link, the way back to an ordinary game (E3b). */}
                  {fromPosition && gameState.gameStatus !== 'playing' && (
                    <button type="button" onClick={() => { actions.reset(); navigate('/play'); }} className="card-row w-full py-[0.16em] text-left hover:text-foreground">
                      <span>Start from the beginning</span>
                      <ChevronRight className="ml-auto shrink-0" />
                    </button>
                  )}
                  <button type="button" onClick={() => navigate('/play-online')} className="card-row w-full py-[0.16em] text-left hover:text-foreground">
                    <span>Play online</span>
                    <ChevronRight className="ml-auto shrink-0" />
                  </button>
                </div>
              </>
            )),
          ],
          foot: footSlot('theme-focus', (
            <PuzzleAppearanceCard currentThemeId={currentTheme.id} onThemeChange={changeTheme} analyticsSurface="play_computer" focusMode={focusMode} onToggleFocusMode={canFocus ? () => setFocusMode(value => !value) : undefined} soundEnabled={soundEnabled} onToggleSound={() => setSoundEnabled(soundService.toggleEnabled())} />
          )),
        }}
      />
    </main>
  );
}

export default PlayComputer;
