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
 * The words come from the server (D2: /api/guided-games/:id/warning, worded from the board and SF), with their
 * recording; the approved fixed lines (A3) are the fallback when it cannot be reached. The server's game is started
 * once the player's first move is graded (the free plan's one a day is taken there); a refusal ends the guidance for
 * this game and opens the limit dialog, and the game goes on unguided.
 *
 * After his reply he may say what the player's move missed (a mate, or a piece kept once the exchange is over), when
 * that move lost MISSED_LOSS or more and drew no warning.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { analysisService, type SearchScore } from '@/services/AnalysisService';
import type { ComputerGameActions, ComputerGameState, DrawEnding, Guide } from '../hooks/useComputerGame';
import { usePlayGameStore } from '../stores/gameStore';
import { MAIA_LIVE } from '@/design/designFlags';
import { findLevel, playLevels } from '../services/playLevels';
import { confirmed, gate, playerWin, type GateKind } from './gate';
import { fetchMissed, fetchWarning, startGuidedGame, type GuidedLine } from './guidedApi';
import { newClientGameId } from '../services/computerGameSave';
import { reportDailyLimit } from '@/services/freePlanLimit';
import { logGA4Event } from '@/services/analytics';

export const TAKEBACKS = 3;
const PRE_MS = 1000;
const AFTER_MS = 300;
const CONFIRM_MS = 1000;
/** A missed chance is said after a move that lost this much win% (the Game report's threshold, A1's simulation). */
export const MISSED_LOSS = 18;
/** The server's warning must answer within this, or the fixed line is said (his reply waits for it). */
const WARNING_WAIT_MS = 2500;
/** D6 reads it: when the day's guided game is used, the reset time the server gave. */
export const LIMIT_KEY = 'cp_guided_limit';
/** E2 (Fable): said when LIMIT_KEY changes in this tab (a successful start clears it), so the page reads it again. */
export const LIMIT_CHANGED_EVENT = 'cp:guided-limit';
/** E2 (Codex): a start that never answers must not hold his reply for ever; the game goes on with the fixed lines. */
const START_WAIT_MS = 6000;
const limitStillApplies = (): boolean => {
  try { const at = localStorage.getItem(LIMIT_KEY); return !!at && Date.parse(at) > Date.now(); } catch { return false; }
};

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

/**
 * D4: THE GRADE OF A MOVE OF THE PLAYER'S, from the check that runs anyway (the player's win% before and after, both
 * from Lichess's formula as the gate reads them, and SF's best move before it). `ply` is the move's number in the line
 * (1 = the first move of the game). A move taken back and played again at the same ply replaces its grade.
 */
export interface MoveGrade { ply: number; uci: string; before: number; after: number; best: string | null }
/** D4: a move that lost this much win% is a mistake in the summary (Lichess's inaccuracy line). */
export const MISTAKE_LOSS = 10;
/**
 * D4 (analysis 3.5): the player's biggest mistakes among the moves that STAND in the final line (a move taken back
 * was not played), the biggest first, the earlier first when equal.
 */
export function biggestMistakes(grades: readonly MoveGrade[], moves: readonly string[], n = 2): MoveGrade[] {
  return grades
    .filter((g) => g.ply >= 1 && g.ply <= moves.length && moves[g.ply - 1] === g.uci && g.before - g.after >= MISTAKE_LOSS)
    .sort((a, b) => (b.before - b.after) - (a.before - a.after) || a.ply - b.ply)
    .slice(0, n);
}

export interface GuidedWarning { kind: GateKind; text: string; reply: string | null; audioUrl?: string; cuesUrl?: string }

/** B6: while another tab holds the engine he cannot check moves; he says so and the game goes on unguided. */
export const ENGINE_BUSY_LINE = "Another tab is using the engine. I'll stay quiet.";

/** B6: the guided game kept in this tab (sessionStorage), so a reload continues it (owner decision B). */
export const STORAGE_KEY = 'cp_guided_game';
interface StoredGame {
  levelId: string; playerColor: 'white' | 'black'; moves: string[]; takebacksLeft: number; clientGameId?: string; serverId?: string | null;
  /** D4: the summary's record, kept so a reload keeps it. */
  grades?: MoveGrade[]; warningsGiven?: number; takebacksUsed?: number; hintsUsed?: number;
}
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
  /** D2: the server refused this game (the day's free one is used): no guidance, the game goes on as an ordinary one. */
  refused: boolean;
  /** D2: a missed chance he says after his reply, until the next move. */
  said: GuidedLine | null;
  /** D3: the server's id for this game once it is started (Hint and Why? are bound to it), else null. */
  gameId: string | null;
  /** D3: the engine's search of a position (the one searched while the player thinks, when it is that one). */
  searchHere: (fen: string) => Promise<SearchScore | null>;
  /** D3: the win% his last move gave the player, for the position now on the board; null when unknown. */
  hisMoveGift: (fen: string, plies: number) => Promise<number | null>;
  /** D4: the grades of the player's moves this game (the summary picks the ones that stand). */
  grades: MoveGrade[];
  /** D4: warnings he gave this game, and takebacks used (free ones included). */
  warningsGiven: number;
  takebacksUsed: number;
  /** D4, E2: Hint presses this game, kept with the game so a reload keeps them. */
  hintsUsed: number;
  noteHint: () => void;
  takeBack: () => void;
  playOn: () => void;
}

export function useGuidedGame({ enabled, guideRef, game, actions, timed = false, restore }: {
  enabled: boolean;
  guideRef: { current: Guide | null };
  game: ComputerGameState;
  actions: ComputerGameActions;
  /** E2 (Fable): the game has a clock. A timed game is not continued after a reload (its clock is not kept). */
  timed?: boolean;
  /**
   * E2 (Fable): continues a stored game through the page, so the page knows the player's colour (its result lines and
   * events read it) and the clock (none). Without it the computer game is started directly.
   */
  restore?: (color: 'white' | 'black', level: ReturnType<typeof findLevel>, moves: string[]) => void;
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
  /* D4: the summary's record. */
  const [grades, setGrades] = useState<MoveGrade[]>([]);
  const [warningsGiven, setWarningsGiven] = useState(0);
  const [takebacksUsed, setTakebacksUsed] = useState(0);
  const [hintsUsed, setHintsUsed] = useState(0);
  const noteHint = useCallback(() => setHintsUsed((n) => n + 1), []);
  const restoredRecordRef = useRef<Pick<StoredGame, 'grades' | 'warningsGiven' | 'takebacksUsed' | 'hintsUsed'> | null>(null);
  /*
    E2 (Codex, Fable): TOKENS AGAINST LATE ANSWERS. `gameGen` changes with each game, `plyGen` with each game and each
    takeback. A check, a start or a warning that comes back after either changed belongs to a line that is gone: it
    changes nothing (no warning on a rewound or finished game, no server id in the next game).
  */
  const gameGenRef = useRef(0);
  const checkSeqRef = useRef(0);
  const plyGenRef = useRef(0);
  const playingRef = useRef(false);
  const grade = useCallback((g: MoveGrade) => { setGrades((all) => [...all.filter((x) => x.ply !== g.ply), g]); }, []);

  /* D2: the server's game, started once the first move is graded (the free plan's one a day). */
  const clientGameIdRef = useRef<string>(newClientGameId());
  const serverIdRef = useRef<string | null>(null);
  const startingRef = useRef<Promise<string | null> | null>(null);
  const refusedRef = useRef(false);
  const [refused, setRefused] = useState(false);
  const [gameId, setGameId] = useState<string | null>(null);
  /* D3: the search of the position after the player's last move (his turn), to judge his reply (Why? on a weak move). */
  const lastAfterRef = useRef<{ plies: number; score: SearchScore } | null>(null);
  const restoredIdsRef = useRef<{ clientGameId?: string; serverId?: string | null } | null>(null);
  const levelIdRef = useRef<string | null>(null);
  levelIdRef.current = game.level?.id ?? null;
  const colorRef = useRef(playerColor);
  colorRef.current = playerColor;
  const ensureStarted = useCallback((moves: string[]): Promise<string | null> => {
    if (refusedRef.current) return Promise.resolve(null);
    if (serverIdRef.current) return Promise.resolve(serverIdRef.current);
    const level = levelIdRef.current;
    if (!level || !/^master-[0-9]{4}$/.test(level)) return Promise.resolve(null);
    if (!startingRef.current) {
      const gen = gameGenRef.current;
      const knownRefused = limitStillApplies(); // the day's game was already used when this one asked (Fable)
      const answer = Promise.race([
        startGuidedGame({ clientGameId: clientGameIdRef.current, level, color: colorRef.current, moves }),
        new Promise<null>((resolve) => { setTimeout(() => resolve(null), START_WAIT_MS); }),
      ]);
      startingRef.current = answer.then((a) => {
        if (gen !== gameGenRef.current) return null; // an earlier game's answer
        startingRef.current = null;
        if (!a) return null; // no answer in time: the fixed lines this time, asked again at the next move
        if (a.ok === true) {
          serverIdRef.current = a.id;
          setGameId(a.id);
          // E2 (Fable): a game started, so no limit applies now (Premium bought, a grant, the next day)
          try {
            if (localStorage.getItem(LIMIT_KEY)) { localStorage.removeItem(LIMIT_KEY); window.dispatchEvent(new Event(LIMIT_CHANGED_EVENT)); }
          } catch { /* private window */ }
          // D7: once per game (a reload continues with the stored id and never starts again)
          const rating = Number(level.slice('master-'.length));
          logGA4Event({ name: 'guided_game_started', params: { level: rating } });
          return a.id;
        }
        const limit = a.ok === false ? a.limit : null; // strict is off: narrow by === false
        if (limit) {
          refusedRef.current = true;
          setRefused(true);
          try { localStorage.setItem(LIMIT_KEY, limit.resetsAt); } catch { /* private window */ }
          /* E2 (Fable): the dialog and `limit_reached` once a day, not at every game after it: the line says it. */
          // and never once the game is over (resigned or out of time while it asked: Codex, round 2)
          if (!knownRefused && playingRef.current) reportDailyLimit(limit);
        }
        return null; // unreachable or refused: no server words this time, the fixed lines stay
      });
    }
    return startingRef.current;
  }, []);

  /* D2: a missed chance, waiting for his reply to land (`at` = the line's length then). */
  const pendingMissedRef = useRef<{ at: number; line: Promise<GuidedLine | null> } | null>(null);
  const [said, setSaid] = useState<{ at: number; line: GuidedLine } | null>(null);

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
  playingRef.current = playing;
  useEffect(() => {
    if (!playing) return;
    gameGenRef.current++;
    plyGenRef.current++;
    // a warning of the last game never opens the next (Fable)
    decideRef.current?.('takeBack');
    decideRef.current = null;
    setWarning(null);
    setTakebacksLeft(restoredTakebacksRef.current ?? TAKEBACKS);
    restoredTakebacksRef.current = null;
    const rec = restoredRecordRef.current;
    restoredRecordRef.current = null;
    setGrades(rec?.grades ?? []);
    setWarningsGiven(rec?.warningsGiven ?? 0);
    setTakebacksUsed(rec?.takebacksUsed ?? 0);
    setHintsUsed(rec?.hintsUsed ?? 0);
    // D2: a new browser game (or the one a reload continues), not yet known to the server unless restored
    const ids = restoredIdsRef.current;
    restoredIdsRef.current = null;
    clientGameIdRef.current = ids?.clientGameId ?? newClientGameId();
    serverIdRef.current = ids?.serverId ?? null;
    setGameId(serverIdRef.current);
    lastAfterRef.current = null;
    startingRef.current = null;
    refusedRef.current = false;
    setRefused(false);
    pendingMissedRef.current = null;
  }, [playing]);

  /* D2: the missed chance is said once his reply has landed; a takeback or the next move drops it. */
  const plies = storeMoves.length;
  /* E2 (Codex): a rewind drops the grades of the moves it removed, so a move played again is graded again or not at all. */
  const lastPliesRef = useRef(plies);
  useEffect(() => {
    if (plies < lastPliesRef.current) setGrades((all) => all.filter((g) => g.ply <= plies));
    lastPliesRef.current = plies;
  }, [plies]);
  useEffect(() => {
    setSaid((s) => (s && s.at === plies ? s : null));
    const p = pendingMissedRef.current;
    if (!p) return;
    if (plies < p.at - 1 || plies > p.at) { pendingMissedRef.current = null; return; }
    if (plies !== p.at) return;
    pendingMissedRef.current = null;
    let live = true;
    p.line.then((line) => { if (live && line) setSaid({ at: plies, line }); });
    return () => { live = false; };
  }, [plies]);

  /* B6: kept at the player's turn only, so a reload never brings back a move he warned about without its warning. */
  useEffect(() => {
    if (!enabled) return;
    if (!playing) { if (game.gameStatus === 'ended') writeStored(null); return; }
    if (game.turnColor !== playerColor || game.isThinking || !game.level) return;
    if (timed) { writeStored(null); return; } // a clock is not kept, so a timed game is not continued (Fable)
    writeStored({ levelId: game.level.id, playerColor, moves: storeMoves, takebacksLeft, clientGameId: clientGameIdRef.current, serverId: serverIdRef.current, grades, warningsGiven, takebacksUsed, hintsUsed });
  }, [enabled, playing, timed, game.gameStatus, game.turnColor, game.isThinking, game.level, playerColor, storeMoves, takebacksLeft, grades, warningsGiven, takebacksUsed, hintsUsed]);

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
    restoredIdsRef.current = { clientGameId: g.clientGameId, serverId: g.serverId };
    restoredRecordRef.current = { grades: g.grades, warningsGiven: g.warningsGiven, takebacksUsed: g.takebacksUsed, hintsUsed: g.hintsUsed };
    if (restore) restore(g.playerColor, level, g.moves);
    else actions.startGame(g.playerColor, level, undefined, undefined, g.moves);
  }, [enabled, game.gameStatus, actions, restore]);
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

  const check = useCallback(async ({ fenBefore, fenAfter, drawByRule, moves, drawText }: {
    fenBefore: string; fenAfter: string; drawByRule: boolean; moves?: string[]; drawText?: string;
  }): Promise<GuidedWarning | null> => {
    const seq = ++checkSeqRef.current;
    setChecking(true);
    const ply = plyGenRef.current;
    const gone = () => ply !== plyGenRef.current || !playingRef.current;
    try {
      const before = preRef.current?.fen === fenBefore ? await preRef.current.search : await search(fenBefore, AFTER_MS);
      if (!before) return null;
      const after = drawByRule ? null : await search(fenAfter, AFTER_MS);
      if (!drawByRule && !after) return null;
      if (gone()) return null;
      lastAfterRef.current = after && moves ? { plies: moves.length, score: after } : null;
      // The move is graded: the server's game starts now (the day's one is taken here, analysis 3.7).
      const id = moves ? await ensureStarted(moves) : null;
      if (refusedRef.current || gone()) return null;
      const verdict = gate(before, after, drawByRule);
      /* D4: the move's grade for the summary (a loss is regraded below by the longer search when there is one). */
      const played = moves?.[moves.length - 1];
      const keep = (afterWin: number) => { if (moves && played) grade({ ply: moves.length, uci: played, before: verdict.before, after: afterWin, best: before.best ?? null }); };
      keep(verdict.after);
      /* A chance missed, said after his reply when no warning comes (D2). */
      const missed = () => {
        if (!id || !moves || drawByRule || !before.best || before.best === played || verdict.before - verdict.after < MISSED_LOSS) return;
        pendingMissedRef.current = {
          at: moves.length + 1,
          line: fetchMissed(id, { moves, pv: before.pv, mateForPlayer: before.mate !== null && before.mate > 0 }).catch(() => null),
        };
      };
      if (!verdict.kind) { missed(); return null; }
      let reply = after?.best ?? null;
      let pv = after?.pv ?? [];
      if (verdict.kind === 'loss') {
        const longer = await search(fenAfter, CONFIRM_MS, CONFIRM_MS + 1500);
        if (gone()) return null;
        if (longer) keep(playerWin(longer, false));
        if (!confirmed(verdict, longer)) { missed(); return null; }
        reply = longer?.best ?? reply;
        pv = longer?.pv ?? pv;
      }
      const fixed = verdict.kind === 'draw_thrown' ? drawText ?? '' : WARNING_LINES[verdict.kind];
      const words = id && moves
        ? await fetchWarning(id, { moves, pv: drawByRule ? [] : pv, mateForHim: verdict.mateForHim }, AbortSignal.timeout?.(WARNING_WAIT_MS)).catch(() => null)
        : null;
      if (gone()) return null; // taken back, resigned or out of time while he checked
      return { kind: verdict.kind, text: words?.text ?? fixed, reply, audioUrl: words?.audioUrl, cuesUrl: words?.cuesUrl };
    } finally {
      // only the latest check says it is over (an older one finishing must not clear a newer one's: Codex, round 2)
      if (seq === checkSeqRef.current) setChecking(false);
    }
  }, [search, ensureStarted, grade]);

  /* The guide the computer game asks before his reply lands. */
  useEffect(() => {
    if (!enabled || refused) { guideRef.current = null; return; }
    guideRef.current = {
      beforeReply: async ({ fenBefore, fenAfter, moves }) => {
        const found = await check({ fenBefore, fenAfter, drawByRule: false, moves });
        if (!found) return null;
        setWarning(found);
        setWarningsGiven((n) => n + 1);
        logGA4Event({ name: 'guided_warning_shown', params: { kind: found.kind } });
        const decision = await new Promise<'playOn' | 'takeBack'>((resolve) => { decideRef.current = resolve; });
        decideRef.current = null;
        setWarning(null);
        return decision === 'playOn' && found.reply ? { replyUci: found.reply } : null;
      },
      /* D5: the save names the server's game, so it is stored as guided (and its PGN says so). */
      guidedGameId: () => serverIdRef.current,
    };
    guideRef.current.beforeDraw = async ({ fenBefore, ending, moves }) => {
      const found = await check({ fenBefore, fenAfter: '', drawByRule: true, moves, drawText: DRAW_LINES[ending] });
      if (!found) return 'end';
      setWarning({ ...found, reply: null });
      setWarningsGiven((n) => n + 1);
      logGA4Event({ name: 'guided_warning_shown', params: { kind: found.kind } });
      const decision = await new Promise<'playOn' | 'takeBack'>((resolve) => { decideRef.current = resolve; });
      decideRef.current = null;
      setWarning(null);
      return decision === 'takeBack' ? 'takeBack' : 'end';
    };
    return () => { guideRef.current = null; };
  }, [enabled, refused, guideRef, check]);

  const takeBack = useCallback(() => {
    plyGenRef.current++;
    if (decideRef.current) {
      // After a warning: free. The rewind first, so his held reply belongs to an old revision when it resolves.
      if (actions.takeBack() > 0) { setTakebacksUsed((n) => n + 1); logGA4Event({ name: 'guided_takeback', params: { kind: 'free' } }); }
      decideRef.current('takeBack');
      return;
    }
    if (takebacksLeft <= 0) return;
    if (actions.takeBack() > 0) { setTakebacksLeft((n) => n - 1); setTakebacksUsed((n) => n + 1); logGA4Event({ name: 'guided_takeback', params: { kind: 'counted' } }); }
  }, [actions, takebacksLeft]);

  const playOn = useCallback(() => { decideRef.current?.('playOn'); }, []);

  /* D3: the search of the board now, shared with the one made while the player thinks. */
  const searchHere = useCallback((at: string) => (preRef.current?.fen === at ? preRef.current.search : search(at, PRE_MS, PRE_MS + 1500)), [search]);
  /* D3: his reply's cost to him: the player's win% now against just before his reply (the gate's own formula). */
  const hisMoveGift = useCallback(async (at: string, nowPlies: number) => {
    const last = lastAfterRef.current;
    if (!last || last.plies + 1 !== nowPlies) return null;
    const now = await searchHere(at);
    return now ? playerWin(now, true) - playerWin(last.score, false) : null;
  }, [searchHere]);

  return { warning, takebacksLeft, checking, enginePaused, refused, said: said?.line ?? null, gameId, searchHere, hisMoveGift, grades, warningsGiven, takebacksUsed, hintsUsed, noteHint, takeBack, playOn };
}
