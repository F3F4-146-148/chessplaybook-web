import { useEffect, useRef, useCallback, useState } from 'react';
import { usePlayGameStore } from '../stores/gameStore';
import { StockfishOpponent } from '../services/StockfishOpponent';
import { stockfishFallback, type PlayLevel } from '../services/playLevels';
import { drawByRule, repetitionKey, type DrawRule } from '../services/drawRules';
import { MaiaOpponent } from '@/features/master/maia/MaiaOpponent';
import type { MaiaEvaluation } from '@/features/master/maia/maiaEngine';
import { MAIA_LIVE } from '@/design/designFlags';
import { fetchNarration, type MasterLine } from '@/features/master/narrationApi';
import { reactionTo } from '@/features/master/reaction';
import type { MasterExpression } from '@/components/master/masterAssets';
import {
  positionFromFen,
  applyMove,
  toUci,
  uciToSan,
  initialPosition,
  isPromotion,
} from '@/components/chess/chessLogic';
import type { ChessPosition } from '@/components/chess/chessLogic';
import type { Key, Color, Dests } from '@lichess-org/chessground/types';
import { soundService } from '@/services/SoundService';
import { newClientGameId, saveFinishedGame, savePendingGame } from '../services/computerGameSave';

export interface ComputerGameState {
  position: ChessPosition | null;
  fen: string;
  dests: Dests | undefined;
  turnColor: Color;
  movableColor: Color | undefined;
  lastMove: Key[] | undefined;
  isCheck: boolean;
  isThinking: boolean;
  isEngineReady: boolean;
  sanMoves: string[];
  gameStatus: 'idle' | 'playing' | 'ended';
  gameResult: string | null;
  playerColor: Color;
  /** The level of the game in progress (or the last one); null before the first game. */
  level: PlayLevel | null;
  /** Maia's evaluation behind the Master's last move (his probabilities and WDL), for his reactions (D9). */
  lastMasterEvaluation: MaiaEvaluation | null;
  /** True when Maia could not load and the game went on with the nearest Stockfish level. */
  masterFellBack: boolean;
  /** What the Master said about his last move (D6), null before his first move or when the server is out of reach. */
  masterLine: MasterLine | null;
  /** His face at the player's last move (D9), a face only; `at` is when it was decided, so the page shows it briefly. */
  masterReaction: { expression: MasterExpression; at: number } | null;
  /**
   * #416: the finished game's id on the server once it is stored (its PGN, the history, a share link), null
   * before. `saving` while it is sent; `failed` when it could not be (kept in the browser, sent on the next visit).
   */
  savedGame: { status: 'saving' | 'saved' | 'failed'; id: string | null } | null;
}

/** #416: the game's clock, in seconds; 0 and 0 is a game with no clock. */
export interface GameClock { initial: number; increment: number }

export interface ComputerGameActions {
  /**
   * `startFen`: a position to start from (opening trainer E3b); the initial position when absent.
   * `clock`: the game's time control, stored with the finished game (#416); no clock when absent.
   */
  startGame: (playerColor: Color, level: PlayLevel, startFen?: string, clock?: GameClock) => void;
  onMove: (orig: Key, dest: Key) => void;
  resign: () => void;
  timeout: (loser: Color) => void;
  reset: () => void;
  flipBoard: () => void;
}

const DRAW_TEXT: Record<Exclude<DrawRule, null>, string> = {
  threefold: 'Draw by threefold repetition',
  'fifty-moves': 'Draw by the 50-move rule',
};

/**
 * Hook that manages a complete game against the computer.
 * Wires together: ChessBoard, chessops, the opponent (Stockfish, or the Master through Maia-1), the game store.
 *
 * THE OPPONENT IS ASKED FOR A MOVE ONLY WHEN IT IS READY (MASTER_CHARACTER_IMPLEMENTATION_PLAN D1). The old wiring
 * returned silently when the engine was not ready yet, which dropped the computer's first move whenever it moved
 * first (playing Black, or `?fen=` with the computer to move) before its worker had started. Every engine move now
 * awaits readiness, and a reply that belongs to an earlier game is dropped (`gameIdRef`).
 */
export function useComputerGame(): [ComputerGameState, ComputerGameActions] {
  const stockfishRef = useRef<StockfishOpponent | null>(null);
  const stockfishReadyRef = useRef<Promise<void> | null>(null);
  const maiaRef = useRef<MaiaOpponent | null>(null);
  const positionRef = useRef<ChessPosition | null>(null);
  const startFenRef = useRef<string | undefined>(undefined);
  const movesRef = useRef<string[]>([]);
  const keysRef = useRef<string[]>([]);
  const levelRef = useRef<PlayLevel | null>(null);
  const gameIdRef = useRef(0);
  const fellBackRef = useRef(false);
  /* #416: what is sent when the game ends: its id for the server, its clock, the player's colour */
  const clientGameIdRef = useRef<string | null>(null);
  const clockRef = useRef<GameClock>({ initial: 0, increment: 0 });
  const playerColorRef = useRef<Color>('white');
  const [savedGame, setSavedGame] = useState<ComputerGameState['savedGame']>(null);
  const [position, setPosition] = useState<ChessPosition | null>(null);
  const [isThinking, setIsThinking] = useState(false);
  const [isEngineReady, setIsEngineReady] = useState(false);
  const [lastMove, setLastMove] = useState<Key[] | undefined>(undefined);
  const [sanMoves, setSanMoves] = useState<string[]>([]);
  const [gameResult, setGameResult] = useState<string | null>(null);
  const [orientation, setOrientation] = useState<Color>('white');
  const [level, setLevel] = useState<PlayLevel | null>(null);
  const [lastMasterEvaluation, setLastMasterEvaluation] = useState<MaiaEvaluation | null>(null);
  const [masterFellBack, setMasterFellBack] = useState(false);
  const [masterLine, setMasterLine] = useState<MasterLine | null>(null);
  const [masterReaction, setMasterReaction] = useState<{ expression: MasterExpression; at: number } | null>(null);

  const store = usePlayGameStore();

  const stockfish = useCallback((): { engine: StockfishOpponent; ready: Promise<void> } => {
    if (!stockfishRef.current) {
      const engine = new StockfishOpponent();
      stockfishRef.current = engine;
      stockfishReadyRef.current = engine.init();
      stockfishReadyRef.current.then(() => setIsEngineReady(true)).catch(() => console.error('Failed to initialize Stockfish'));
    }
    return { engine: stockfishRef.current, ready: stockfishReadyRef.current! };
  }, []);

  // Stockfish starts on mount, as before, unless the Master plays: then nothing downloads until a game needs it.
  useEffect(() => {
    if (!MAIA_LIVE) stockfish();
    else setIsEngineReady(true);
    return () => {
      stockfishRef.current?.destroy();
      stockfishRef.current = null;
      stockfishReadyRef.current = null;
      maiaRef.current?.dispose();
      maiaRef.current = null;
    };
  }, [stockfish]);

  // Play sound based on SAN notation
  const playMoveSound = useCallback((san: string | null) => {
    if (!san) { soundService.move(); return; }
    if (san.includes('+') || san.includes('#')) soundService.check();
    else if (san.startsWith('O-O')) soundService.castle();
    else if (san.includes('x')) soundService.capture();
    else soundService.move();
  }, []);

  /*
    #416: THE FINISHED GAME GOES TO THE SERVER, whatever ended it. Once per game (the id is cleared), and a
    reply that belongs to an earlier game never lands on this one. The server replays the moves and decides
    the result; `claim` is only for a resignation or a loss on time.
  */
  const saveGame = useCallback((claim: { reason: 'resignation' | 'timeout'; loser: Color } | null) => {
    const clientGameId = clientGameIdRef.current;
    const lvl = levelRef.current;
    if (!clientGameId || !lvl) return;
    clientGameIdRef.current = null;
    const gameId = gameIdRef.current;
    setSavedGame({ status: 'saving', id: null });
    saveFinishedGame({
      clientGameId,
      level: lvl.id,
      playerColor: playerColorRef.current,
      startFen: startFenRef.current ?? null,
      moves: [...movesRef.current],
      timeControl: clockRef.current,
      claim,
    }).then((outcome) => {
      if (gameId !== gameIdRef.current) return;
      setSavedGame(outcome.ok ? { status: 'saved', id: outcome.id } : { status: 'failed', id: null });
    });
  }, []);

  // A game an earlier visit could not save is sent once, when /play opens.
  useEffect(() => { savePendingGame().catch(() => { /* kept for the next visit */ }); }, []);

  // Handle game over
  const handleGameOver = useCallback((pos: ChessPosition, myColor: Color, rule: DrawRule = null) => {
    let result: string;
    if (pos.isCheckmate) {
      const winner = pos.turnColor === 'white' ? 'Black' : 'White';
      result = `${winner} wins by checkmate`;
      const iWon = (pos.turnColor === 'white' && myColor === 'black') ||
                   (pos.turnColor === 'black' && myColor === 'white');
      soundService.gameEnd(iWon ? 'win' : 'loss');
    } else if (pos.isStalemate) {
      result = 'Draw by stalemate';
      soundService.gameEnd('draw');
    } else if (pos.isInsufficientMaterial) {
      result = 'Draw by insufficient material';
      soundService.gameEnd('draw');
    } else if (rule) {
      result = DRAW_TEXT[rule];
      soundService.gameEnd('draw');
    } else {
      result = 'Game over';
      soundService.gameEnd('draw');
    }
    setGameResult(result);
    store.endGame(pos.isCheckmate
      ? (pos.turnColor === 'white' ? 'black' : 'white')
      : 'draw');
    saveGame(null);
  }, [store, saveGame]);

  /** Record a move; returns the draw rule that ends the game, if any. */
  const record = useCallback((uciMove: string, newPos: ChessPosition): DrawRule => {
    movesRef.current = [...movesRef.current, uciMove];
    keysRef.current = [...keysRef.current, repetitionKey(newPos.chess)];
    return drawByRule(newPos.chess, keysRef.current);
  }, []);

  /** The opponent's move for the current position: the Master through Maia, or Stockfish. */
  const opponentMove = useCallback(async (pos: ChessPosition): Promise<string> => {
    const lvl = levelRef.current!;
    if (lvl.kind === 'master' && !fellBackRef.current) {
      try {
        maiaRef.current ??= new MaiaOpponent(lvl.maia);
        maiaRef.current.setRating(lvl.maia);
        const { uci, evaluation } = await maiaRef.current.getMove({
          start: startFenRef.current ?? 'startpos',
          moves: movesRef.current,
        });
        /*
          HE TAKES A MOMENT (plan D5). Maia answers in ~3 ms, so without this the thinking face would flash for a
          frame and every reply would land instantly. The wait is short and varied, and longer when Maia itself
          hesitates between moves (its top move under 35%) than when one move is obvious (over 60%).
          Owner, 2026-11-16, after playing 1100: "at times it felt too fast", so 0.8-3.5 s (was 0.45-2.1 s).
        */
        const top = evaluation.moves[0]?.p ?? 1;
        const base = top > 0.6 ? 800 : top > 0.35 ? 1400 : 2200;
        await new Promise((r) => setTimeout(r, base + Math.random() * base * 0.6));
        setLastMasterEvaluation(evaluation);
        return uci;
      } catch (err) {
        // Maia could not load or failed: the game goes on with the nearest Stockfish level (plan §6).
        console.error('Maia failed, falling back to Stockfish:', err);
        fellBackRef.current = true;
        setMasterFellBack(true);
      }
    }
    const { engine, ready } = stockfish();
    await ready;
    engine.setLevel(lvl.kind === 'stockfish' ? lvl.stockfish.level : stockfishFallback(lvl.approxRating).level);
    return engine.getMove(pos.fen);
  }, [stockfish]);

  // The computer makes a move
  const engineMove = useCallback(async (pos: ChessPosition) => {
    if (pos.isGameOver) return;
    const gameId = gameIdRef.current;
    setIsThinking(true);
    try {
      const uciMove = await opponentMove(pos);
      if (gameId !== gameIdRef.current) return; // a new game started meanwhile
      const san = uciToSan(pos, uciMove);
      const newPos = applyMove(pos, uciMove);

      if (newPos) {
        positionRef.current = newPos;
        setPosition(newPos);
        setLastMove([uciMove.substring(0, 2) as Key, uciMove.substring(2, 4) as Key]);
        if (san) setSanMoves(prev => [...prev, san]);
        playMoveSound(san);

        store.makeMove(uciMove, newPos.fen);
        const rule = record(uciMove, newPos);

        // He says his move (D6). The game never waits for it: the line arrives a moment after the move.
        if (levelRef.current?.kind === 'master') {
          setMasterLine(null);
          fetchNarration(pos.fen, uciMove).then((line) => {
            if (gameId === gameIdRef.current) setMasterLine(line);
          });
        }

        if (newPos.isGameOver || rule) {
          handleGameOver(newPos, store.playerColor as Color, rule);
        }
      }
    } catch (err) {
      console.error('Engine move error:', err);
    } finally {
      if (gameId === gameIdRef.current) setIsThinking(false);
    }
  }, [store, playMoveSound, handleGameOver, opponentMove, record]);

  // Player makes a move
  const onMove = useCallback((orig: Key, dest: Key) => {
    const pos = positionRef.current;
    if (!pos || store.status !== 'playing') return;

    // Handle promotion (default to queen for now)
    const promo = isPromotion(pos, orig, dest) ? 'q' : '';
    const uciMove = toUci(orig, dest, promo);
    const san = uciToSan(pos, uciMove);
    const newPos = applyMove(pos, uciMove);

    if (newPos) {
      positionRef.current = newPos;
      setPosition(newPos);
      setLastMove([orig, dest]);
      if (san) setSanMoves(prev => [...prev, san]);
      playMoveSound(san);

      const movesBefore = movesRef.current;
      store.makeMove(uciMove, newPos.fen);
      const rule = record(uciMove, newPos);

      // His face at your move (D9): Maia rates the position before and after it, ~3 ms each, a face only.
      const lvl = levelRef.current;
      if (lvl?.kind === 'master' && maiaRef.current && !fellBackRef.current && !newPos.isGameOver && !rule) {
        const gameId = gameIdRef.current;
        const start = startFenRef.current ?? 'startpos';
        const maia = maiaRef.current;
        Promise.all([
          maia.evaluate({ start, moves: movesBefore }),
          maia.evaluate({ start, moves: [...movesBefore, uciMove] }),
        ]).then(([before, after]) => {
          if (gameId !== gameIdRef.current) return;
          const expression = reactionTo(before, after, uciMove);
          setMasterReaction(expression ? { expression, at: Date.now() } : null);
        }).catch(() => { /* no reaction */ });
      }

      if (newPos.isGameOver || rule) {
        handleGameOver(newPos, store.playerColor as Color, rule);
      } else {
        // The computer's turn
        engineMove(newPos);
      }
    }
  }, [store, engineMove, handleGameOver, playMoveSound, record]);

  // Start a new game
  const startGame = useCallback((playerColor: Color, lvl: PlayLevel, startFen?: string, clock?: GameClock) => {
    gameIdRef.current++;
    // #416: a new game; the one before, if unfinished, is dropped (owner, 2026-11-23).
    clientGameIdRef.current = newClientGameId();
    clockRef.current = clock ?? { initial: 0, increment: 0 };
    playerColorRef.current = playerColor;
    setSavedGame(null);
    levelRef.current = lvl;
    setLevel(lvl);
    fellBackRef.current = false;
    setMasterFellBack(false);
    setLastMasterEvaluation(null);
    setMasterLine(null);
    setMasterReaction(null);

    const pos = (startFen ? positionFromFen(startFen) : null) ?? initialPosition();
    startFenRef.current = startFen && positionFromFen(startFen) ? startFen : undefined;
    movesRef.current = [];
    keysRef.current = [repetitionKey(pos.chess)];
    positionRef.current = pos;
    setPosition(pos);
    setLastMove(undefined);
    setSanMoves([]);
    setGameResult(null);
    setIsThinking(false);
    setOrientation(playerColor);

    store.startGame(playerColor);

    // Start loading the opponent now, so the first move is not kept waiting.
    if (lvl.kind === 'master') {
      maiaRef.current ??= new MaiaOpponent(lvl.maia);
      maiaRef.current.setRating(lvl.maia);
      maiaRef.current.ready().catch(() => { /* engineMove falls back */ });
    } else {
      stockfish();
    }

    // The computer moves first when it is its turn (Black from the start; either side from a position).
    if (pos.turnColor !== playerColor) {
      engineMove(pos);
    }
  }, [store, engineMove, stockfish]);

  // Resign
  const resign = useCallback(() => {
    if (store.status !== 'playing') return;
    const winner = store.playerColor === 'white' ? 'Black' : 'White';
    setGameResult(`${winner} wins by resignation`);
    store.endGame(store.playerColor === 'white' ? 'black' : 'white');
    soundService.gameEnd('loss');
    saveGame({ reason: 'resignation', loser: store.playerColor as Color });
  }, [store, saveGame]);

  const timeout = useCallback((loser: Color) => {
    if (store.status !== 'playing') return;
    const winner = loser === 'white' ? 'Black' : 'White';
    setGameResult(`${winner} wins on time`);
    store.endGame(loser === 'white' ? 'black' : 'white');
    soundService.gameEnd(loser === store.playerColor ? 'loss' : 'win');
    saveGame({ reason: 'timeout', loser });
  }, [store, saveGame]);

  // Reset
  const reset = useCallback(() => {
    gameIdRef.current++;
    clientGameIdRef.current = null; // an unfinished game is dropped
    setSavedGame(null);
    positionRef.current = null;
    movesRef.current = [];
    keysRef.current = [];
    setPosition(null);
    setLastMove(undefined);
    setSanMoves([]);
    setGameResult(null);
    setIsThinking(false);
    setLastMasterEvaluation(null);
    store.reset();
  }, [store]);

  // Flip board
  const flipBoard = useCallback(() => {
    setOrientation(prev => prev === 'white' ? 'black' : 'white');
  }, []);

  const state: ComputerGameState = {
    position,
    fen: position?.fen || 'start',
    dests: position?.dests,
    turnColor: position?.turnColor || 'white',
    movableColor: store.status === 'playing' && !isThinking
      ? store.playerColor as Color
      : undefined,
    lastMove,
    isCheck: position?.isCheck || false,
    isThinking,
    isEngineReady,
    sanMoves,
    gameStatus: store.status,
    gameResult,
    playerColor: orientation,
    level,
    lastMasterEvaluation,
    masterFellBack,
    masterLine,
    masterReaction,
    savedGame,
  };

  const actions: ComputerGameActions = {
    startGame,
    onMove,
    resign,
    timeout,
    reset,
    flipBoard,
  };

  return [state, actions];
}
