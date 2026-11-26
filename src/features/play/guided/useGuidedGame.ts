/**
 * #428 B4: THE GUIDED LOOP, beside the computer game (an ordinary game never imports it).
 *
 *   - While the player thinks, the position in front of them is searched (1 s), so after their move only the new
 *     position needs a search.
 *   - After the move, as his reply is being chosen: a 300 ms search, the gate (rule B), and for a plain loss a 1 s
 *     confirmation. His reply waits for this (the barrier in `useComputerGame`).
 *   - On a warning his reply is held. Take back rewinds the move, free; Play on plays the reply the engine warned
 *     about, so what he said comes true.
 *   - A search that fails or runs out of time means no warning, never a wrong one.
 *
 * The words are the approved fixed lines (A3). The piece line ("I can win your bishop on d5") needs the server's
 * route (C3), so until then a lost piece reads as the generic line.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { analysisService, type SearchScore } from '@/services/AnalysisService';
import type { ComputerGameActions, ComputerGameState, DrawEnding, Guide } from '../hooks/useComputerGame';
import { usePlayGameStore } from '../stores/gameStore';
import { MAIA_LIVE } from '@/design/designFlags';
import { findLevel, playLevels } from '../services/playLevels';
import { confirmed, gate, type GateKind } from './gate';

export const TAKEBACKS = 3;
const PRE_MS = 1000;
const AFTER_MS = 300;
const CONFIRM_MS = 1000;

export const WARNING_LINES = {
  mate_allowed: 'Wait. After that, I can give checkmate.',
  loss: 'Wait. That gives away too much. Look again.',
} as const;
/** A3, approved: the draw lines, one per rule (the server's `LINES` say the same). */
export const DRAW_LINES: Record<DrawEnding, string> = {
  stalemate: 'Wait. That is stalemate.',
  threefold: 'Wait. That repeats the position a third time.',
  'fifty-moves': 'Wait. That is a draw by the fifty-move rule.',
  insufficient_material: 'Wait. That leaves too little to checkmate.',
};

export interface GuidedWarning { kind: GateKind; text: string; reply: string | null }

/** B6: while another tab holds the engine he cannot check moves; he says so and the game goes on unguided. */
export const ENGINE_BUSY_LINE = "Another tab is using the engine. I'll stay quiet.";

/** B6: the guided game kept in this tab (sessionStorage), so a reload continues it (owner decision B). */
export const STORAGE_KEY = 'cp_guided_game';
interface StoredGame { levelId: string; playerColor: 'white' | 'black'; moves: string[]; takebacksLeft: number }
const readStored = (): StoredGame | null => {
  try { const v = sessionStorage.getItem(STORAGE_KEY); return v ? JSON.parse(v) as StoredGame : null; } catch { return null; }
};
const writeStored = (g: StoredGame | null) => {
  try { if (g) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(g)); else sessionStorage.removeItem(STORAGE_KEY); } catch { /* private window */ }
};

export interface GuidedGame {
  warning: GuidedWarning | null;
  /** Takebacks left in this game; a takeback after a warning is free. */
  takebacksLeft: number;
  /** True while his reply waits for the check of the player's move. */
  checking: boolean;
  /** True while another tab holds the engine: no checks, the game goes on unguided (B6). */
  enginePaused: boolean;
  takeBack: () => void;
  playOn: () => void;
}

export function useGuidedGame({ enabled, guideRef, game, actions }: {
  enabled: boolean;
  guideRef: { current: Guide | null };
  game: ComputerGameState;
  actions: ComputerGameActions;
}): GuidedGame {
  const [warning, setWarning] = useState<GuidedWarning | null>(null);
  const [takebacksLeft, setTakebacksLeft] = useState(TAKEBACKS);
  const [checking, setChecking] = useState(false);
  const decideRef = useRef<((d: 'playOn' | 'takeBack') => void) | null>(null);
  const preRef = useRef<{ fen: string; search: Promise<SearchScore | null> } | null>(null);
  const playerColor = usePlayGameStore((s) => s.playerColor);
  const storeMoves = usePlayGameStore((s) => s.moves);
  const [enginePaused, setEnginePaused] = useState(() => analysisService.isEngineTaken());
  const restoredTakebacksRef = useRef<number | null>(null);

  /*
    B6: ANOTHER TAB TAKES THE ENGINE. A search asked for then would take it back (the newest asker wins), and two
    tabs would trade it for ever, so the guided game asks nothing until the engine is free again. Checked before each
    search and after a failed one; resumed when the service says the engine is available.
  */
  useEffect(() => analysisService.subscribeEngineAvailable(() => setEnginePaused(false)), []);
  const search = useCallback(async (fen: string, ms: number, timeout?: number) => {
    if (analysisService.isEngineTaken()) { setEnginePaused(true); return null; }
    const r = await analysisService.searchScore(fen, ms, timeout);
    if (!r && analysisService.isEngineTaken()) setEnginePaused(true);
    return r;
  }, []);

  /* A new game: the counter is full again. A game that ends or is left drops any held warning. */
  const playing = game.gameStatus === 'playing';
  /* Only when a game starts: a takeback to the start position must not refill it (found by the B4 test). New game is
     offered only before a game or after one, so a start is always a change of `playing` to true. */
  useEffect(() => {
    if (!playing) return;
    setTakebacksLeft(restoredTakebacksRef.current ?? TAKEBACKS);
    restoredTakebacksRef.current = null;
  }, [playing]);

  /* B6: kept at the player's turn only, so a reload never brings back a move he warned about without its warning. */
  useEffect(() => {
    if (!enabled) return;
    if (!playing) { if (game.gameStatus === 'ended') writeStored(null); return; }
    if (game.turnColor !== playerColor || game.isThinking || !game.level) return;
    writeStored({ levelId: game.level.id, playerColor, moves: storeMoves, takebacksLeft });
  }, [enabled, playing, game.gameStatus, game.turnColor, game.isThinking, game.level, playerColor, storeMoves, takebacksLeft]);

  /* B6: on opening the page, a guided game this tab was playing continues. */
  const restoredRef = useRef(false);
  useEffect(() => {
    if (!enabled || restoredRef.current || game.gameStatus !== 'idle') return;
    restoredRef.current = true;
    const g = readStored();
    if (!g || g.moves.length === 0) return;
    const level = findLevel(playLevels(MAIA_LIVE), g.levelId);
    if (level.id !== g.levelId) { writeStored(null); return; }
    restoredTakebacksRef.current = g.takebacksLeft;
    actions.startGame(g.playerColor, level, undefined, undefined, g.moves);
  }, [enabled, game.gameStatus, actions]);
  useEffect(() => {
    if (playing && enabled) return;
    decideRef.current?.('takeBack');
    decideRef.current = null;
    setWarning(null);
  }, [playing, enabled]);

  /* The search of the position in front of the player, while they think. */
  const fen = game.fen;
  const playersTurn = playing && game.turnColor === playerColor && !game.isThinking;
  useEffect(() => {
    if (!enabled || enginePaused || !playersTurn || !fen || fen === 'start') return;
    if (preRef.current?.fen === fen) return;
    preRef.current = { fen, search: search(fen, PRE_MS, PRE_MS + 1500) };
  }, [enabled, enginePaused, playersTurn, fen, search]);

  const check = useCallback(async ({ fenBefore, fenAfter, drawByRule }: { fenBefore: string; fenAfter: string; drawByRule: boolean }) => {
    setChecking(true);
    try {
      const before = preRef.current?.fen === fenBefore ? await preRef.current.search : await search(fenBefore, AFTER_MS);
      if (!before) return null;
      const after = drawByRule ? null : await search(fenAfter, AFTER_MS);
      if (!drawByRule && !after) return null;
      const verdict = gate(before, after, drawByRule);
      if (!verdict.kind) return null;
      let reply = after?.best ?? null;
      if (verdict.kind === 'loss') {
        const longer = await search(fenAfter, CONFIRM_MS, CONFIRM_MS + 1500);
        if (!confirmed(verdict, longer)) return null;
        reply = longer?.best ?? reply;
      }
      return { kind: verdict.kind, text: verdict.kind === 'draw_thrown' ? '' : WARNING_LINES[verdict.kind], reply };
    } finally {
      setChecking(false);
    }
  }, [search]);

  /* The guide the computer game asks before his reply lands. */
  useEffect(() => {
    if (!enabled) { guideRef.current = null; return; }
    guideRef.current = {
      beforeReply: async ({ fenBefore, fenAfter }) => {
        const found = await check({ fenBefore, fenAfter, drawByRule: false });
        if (!found) return null;
        setWarning(found);
        const decision = await new Promise<'playOn' | 'takeBack'>((resolve) => { decideRef.current = resolve; });
        decideRef.current = null;
        setWarning(null);
        return decision === 'playOn' && found.reply ? { replyUci: found.reply } : null;
      },
    };
    guideRef.current.beforeDraw = async ({ fenBefore, ending }) => {
      const found = await check({ fenBefore, fenAfter: '', drawByRule: true });
      if (!found) return 'end';
      setWarning({ ...found, text: DRAW_LINES[ending], reply: null });
      const decision = await new Promise<'playOn' | 'takeBack'>((resolve) => { decideRef.current = resolve; });
      decideRef.current = null;
      setWarning(null);
      return decision === 'takeBack' ? 'takeBack' : 'end';
    };
    return () => { guideRef.current = null; };
  }, [enabled, guideRef, check]);

  const takeBack = useCallback(() => {
    if (decideRef.current) {
      // After a warning: free. The rewind first, so his held reply belongs to an old revision when it resolves.
      actions.takeBack();
      decideRef.current('takeBack');
      return;
    }
    if (takebacksLeft <= 0) return;
    if (actions.takeBack() > 0) setTakebacksLeft((n) => n - 1);
  }, [actions, takebacksLeft]);

  const playOn = useCallback(() => { decideRef.current?.('playOn'); }, []);

  return { warning, takebacksLeft, checking, enginePaused, takeBack, playOn };
}
