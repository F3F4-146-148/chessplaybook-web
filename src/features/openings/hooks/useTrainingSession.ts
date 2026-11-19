import { useCallback, useEffect, useRef, useState } from 'react';
import {
  trainingApi, OpeningsApiError, type TrainingFocus, type TrainingMistake, type TrainingScope, type TrainingSession, type TrainingState,
} from '../services/openingsApi';
import type { TrainingReport } from './useTrainingWalk';
import { logGA4Event } from '@/services/analytics';
import { dailyLimitMessage, readDailyLimit, reportDailyLimit } from '@/services/freePlanLimit';

const NO_LINE: string[] = [];
const UNSAVED = 'Your progress is not being saved right now. You can keep training.';

/**
 * Training sessions and progress (opening trainer E5; Q16; owner rulings 2026-11-11).
 *
 * - Start begins a session in the chosen scope; Resume continues the open one (paused, or left when a tab closed)
 *   from its saved line, in a new session.
 * - Every move is saved as it is played; a line played to its end is saved, and the server says whether it was
 *   clean (trained). Pause keeps the line in progress; Stop drops it.
 * - Reset clears the repertoire's progress.
 * Guests save under their anonymous id, as puzzle progress does (the soft account rule).
 */
export function useTrainingSession(repertoireId: string, active: boolean, from: string[] = NO_LINE) {
  const [state, setState] = useState<TrainingState | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [session, setSession] = useState<TrainingSession | null>(null);
  const [scope, setScopeState] = useState<TrainingScope>('main');
  /*
    #338 (owner, 2026-11-19): "train my mistakes", a session of only the positions not yet right first time. The
    server keeps it as an 'all lines' session with a focus, so the scope is 'both' while the focus is on.
  */
  const [focus, setFocus] = useState<TrainingFocus | null>(null);
  const setScope = useCallback((s: TrainingScope) => { setScopeState(s); setFocus(null); }, []);
  const chooseMistakes = useCallback(() => { setScopeState('both'); setFocus('mistakes'); }, []);
  /** #338: the session just ended's mistakes still to fix, the recap ("these positions need work"). */
  const [recap, setRecap] = useState<TrainingMistake[] | null>(null);
  const sessionMisses = useRef(new Map<string, TrainingMistake>());
  const [busy, setBusy] = useState(false);
  /** A save that failed: said once on the card, never blocking the board. */
  const [saveError, setSaveError] = useState<string | null>(null);
  /** The session just ended by Pause or Stop: the moment to offer sign-in to a guest (soft accounts). */
  const [justEnded, setJustEnded] = useState<'paused' | 'stopped' | null>(null);
  const sessionRef = useRef<TrainingSession | null>(null);
  sessionRef.current = session;
  const stateRef = useRef<TrainingState | null>(null);
  stateRef.current = state;

  const load = useCallback((signal?: AbortSignal) => {
    setLoadError(false);
    return trainingApi.state(repertoireId, signal)
      .then((s) => {
        setState(s);
        setScopeState(s.open?.scope ?? s.lastScope ?? 'main');
        setFocus(s.open?.focus ?? null);
      })
      .catch(() => {
        if (signal?.aborted) return;
        setLoadError(true);
        // Owner, 2026-11-17: a failed read never stops training; it starts from no progress, said on the card.
        setState((st) => st ?? { bookVersion: '', open: null, lastScope: null, cleanPaths: [], linesPlayed: 0, mistakes: [] });
      });
  }, [repertoireId]);

  useEffect(() => {
    // Another repertoire, or leaving training: what was running here is left open on the server (Resume finds it).
    setSession(null);
    setState(null);
    setJustEnded(null);
    setSaveError(null);
    setRecap(null);
    sessionMisses.current = new Map();
    if (!active) return;
    const ctrl = new AbortController();
    load(ctrl.signal);
    return () => ctrl.abort();
  }, [repertoireId, active, load]);

  const failed = (e: unknown) => {
    setSaveError(
      e instanceof OpeningsApiError && e.status === 409 && /book was updated/.test(e.message)
        ? 'The opening book was updated. Start a new session.'
        : 'Your progress could not be saved. You can keep training.',
    );
  };

  /** `mistakes`: start a session of only the mistakes now, whatever is chosen (#338: "Train them now"). */
  const begin = useCallback(async (resume: boolean, mistakes = false) => {
    const f: TrainingFocus | null = resume ? null : mistakes ? 'mistakes' : focus;
    const sc: TrainingScope = mistakes ? 'both' : scope;
    setBusy(true);
    setSaveError(null);
    setJustEnded(null);
    setRecap(null);
    sessionMisses.current = new Map();
    try {
      const s = await trainingApi.start(repertoireId, sc, resume, from, f);
      logGA4Event({ name: 'opening_session_started', params: { repertoire: repertoireId, scope: s.scope, resumed: resume, from_position: from.length > 0, ...(s.focus ? { focus: s.focus } : {}) } });
      setSession(s);
      setState((st) => (st ? { ...st, open: s, lastScope: s.scope } : st));
      if (resume || mistakes) { setScopeState(s.scope); setFocus(s.focus ?? f); }
    } catch (e) {
      // The free plan's one session a day (a Resume of today's session is free).
      const limit = e instanceof OpeningsApiError ? readDailyLimit(e.status, e.body) : null;
      if (limit) {
        reportDailyLimit(limit);
        setSaveError(dailyLimitMessage(limit));
      } else {
        /*
          Owner, 2026-11-17: "saving progress should not stop training". Any other failure (no connection, a server
          error, the dev server's write guard) starts the session here in the browser: the board and the book's answers
          come from the export already loaded; moves, lines, Pause and Stop are not saved. The free plan's daily limit
          above stays a block, or blocking one request would bypass it.
        */
        const open = resume ? sessionRef.current ?? null : null;
        const was = resume ? (open ?? stateRef.current?.open ?? null) : null;
        const local: TrainingSession = {
          id: `local-${Date.now()}`,
          repertoireId,
          bookVersion: stateRef.current?.bookVersion ?? '',
          scope: was?.scope ?? sc,
          focus: was?.focus ?? f,
          startLine: was?.startLine ?? from,
          status: 'active',
          currentLine: was?.currentLine ?? [],
          currentLineId: was?.currentLineId ?? null,
          resumedFrom: was ? was.id : null,
          local: true,
        };
        logGA4Event({ name: 'opening_session_started', params: { repertoire: repertoireId, scope: local.scope, resumed: resume, from_position: local.startLine.length > 0, saved: false, ...(local.focus ? { focus: local.focus } : {}) } });
        setSession(local);
        setSaveError(UNSAVED);
      }
    } finally {
      setBusy(false);
    }
  }, [repertoireId, scope, focus, from]);

  const end = useCallback(async (how: 'paused' | 'stopped', line: string[]) => {
    const s = sessionRef.current;
    if (!s) return;
    // #338: the recap, the positions this session got wrong and has not yet put right
    setRecap([...sessionMisses.current.values()]);
    if (s.local) { // nothing on the server to end
      setSession(null);
      setJustEnded(null);
      return;
    }
    setBusy(true);
    try {
      const ended = await trainingApi.end(s.id, how, how === 'paused' ? line : undefined);
      setSession(null);
      setState((st) => (st ? { ...st, open: how === 'paused' ? ended : null } : st));
      setJustEnded(how);
    } catch (e) {
      failed(e);
    } finally {
      setBusy(false);
    }
  }, []);

  /** Reset the whole repertoire, or only the lines through the position trained from (E7). */
  const reset = useCallback(async () => {
    setBusy(true);
    try {
      await trainingApi.reset(repertoireId, from);
      if (from.length) {
        // The part's lines stop counting; the count of lines played is re-read from the server.
        await load();
      } else {
        setState((st) => (st ? { ...st, cleanPaths: [], linesPlayed: 0, mistakes: [] } : st));
      }
    } catch (e) {
      failed(e);
    } finally {
      setBusy(false);
    }
  }, [repertoireId, from, load]);

  /** E6: one of our moves, saved as it is played. */
  const recordMove = useCallback((r: TrainingReport) => {
    const s = sessionRef.current;
    if (!s) return;
    // #338: the mistakes, kept as the server keeps them (the latest result per position), and this session's
    const m: TrainingMistake = { key: r.positionKey, move: r.line[r.line.length - 1], outcome: r.outcome, line: r.line };
    if (r.outcome === 'first_time') sessionMisses.current.delete(m.key); else sessionMisses.current.set(m.key, m);
    setState((st) => {
      if (!st) return st;
      const rest = (st.mistakes ?? []).filter((x) => x.key !== m.key);
      return { ...st, mistakes: r.outcome === 'first_time' ? rest : [...rest, m] };
    });
    if (s.local) return;
    trainingApi.move(s.id, r).then(() => setSaveError(null)).catch(failed);
  }, []);

  /** A line played to its end; the server's answer is whether it is trained. */
  const recordLine = useCallback(async (line: string[], lineId: string, cleanHere: boolean): Promise<boolean | null> => {
    const s = sessionRef.current;
    if (!s) return null;
    if (s.local) {
      // judged here, from the moves' outcomes; counted on the card for this visit only
      const path = line.join(' ');
      setState((st) => (st ? {
        ...st,
        linesPlayed: st.linesPlayed + 1,
        cleanPaths: cleanHere && !st.cleanPaths.includes(path) ? [...st.cleanPaths, path] : st.cleanPaths,
      } : st));
      return cleanHere;
    }
    try {
      const { clean } = await trainingApi.line(s.id, lineId, line);
      logGA4Event({ name: 'opening_line_finished', params: { repertoire: repertoireId, trained: clean } });
      const path = line.join(' ');
      setState((st) => (st ? {
        ...st,
        linesPlayed: st.linesPlayed + 1,
        cleanPaths: clean && !st.cleanPaths.includes(path) ? [...st.cleanPaths, path] : st.cleanPaths,
      } : st));
      return clean;
    } catch (e) {
      failed(e);
      return null;
    }
  }, [repertoireId]);

  return {
    state,
    loadError,
    retry: () => load(),
    session,
    /** The open session to resume (paused, or left open), when none is running. */
    resumable: !session && state?.open ? state.open : null,
    scope,
    setScope,
    /** #338: 'mistakes' while "My mistakes" is chosen (scope 'both'); null otherwise. */
    focus,
    chooseMistakes,
    /** #338: the mistakes to train, and the recap of the session just ended (null before one ends). */
    mistakes: state?.mistakes ?? [],
    recap,
    busy,
    saveError,
    justEnded,
    start: () => begin(false),
    /** #338: "Train them now", a session of only the mistakes. */
    startMistakes: () => begin(false, true),
    resume: () => begin(true),
    pause: (line: string[]) => end('paused', line),
    stop: () => end('stopped', []),
    reset,
    recordMove,
    recordLine,
  };
}
