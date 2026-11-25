/**
 * The run on `/puzzles/from-games` (own-game puzzles C2): the chosen games, one at a time, on this
 * browser's engine (D2), each saved as soon as it is done (B2), so nothing is lost when the tab is
 * closed halfway.
 *
 * - A game with any search that did not finish is NOT saved: it would be saved as analysed with
 *   puzzles missing, and never offered again. It is marked interrupted and can be run again.
 * - Another tab taking the engine ends this tab's searches at once (AnalysisService); the run stops
 *   and offers to continue here, and continues by itself when the other tab lets the engine go.
 * - A hidden tab is not analysed: the run waits between games until the tab is visible again
 *   (a phone suspends a hidden page, and its searches would time out).
 * - The screen is kept on where the browser offers a Wake Lock.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { analysisService } from '@/services/AnalysisService';
import { logGA4Event } from '@/services/analytics';
import { reportDailyLimit } from '@/services/freePlanLimit';
import { generateForGame, RULES_VERSION, type ParsedGame } from '../generator/generatePuzzles';
import type { Side } from '../generator/types';
import { withBrowserPuzzleEngine } from '../engine/browserEngine';
import { GamePuzzlesApiError, saveGame } from '../services/gamePuzzlesApi';
import { gamePgn } from './gamePgn';

/** The server's cap (backend MAX_PUZZLES_PER_GAME): the best ones are kept. */
export const MAX_PUZZLES_PER_GAME = 20;

export interface Job {
  hash: string;
  /** null: not known, so both sides' puzzles (#510). */
  side: Side | null;
  game: ParsedGame;
  /** A game played here (C3): its online_games id. Saved by reference, not by its PGN. */
  ref?: string;
}

export type RowRun =
  | { state: 'waiting' }
  | { state: 'analysing' }
  | { state: 'saved'; ids: string[] }
  | { state: 'interrupted' }
  | { state: 'failed' }
  | { state: 'limit' };

export type RunPhase = 'idle' | 'running' | 'paused-hidden' | 'paused-taken' | 'done' | 'stopped' | 'limit';

export interface DailyLimitHit {
  limit: number;
  resetsAt: string;
}

interface WakeLockLike { release: () => Promise<void> }

async function keepScreenOn(): Promise<WakeLockLike | null> {
  try {
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<WakeLockLike> } };
    return (await nav.wakeLock?.request('screen')) ?? null;
  } catch {
    return null;
  }
}

function untilVisible(): Promise<void> {
  if (!document.hidden) return Promise.resolve();
  return new Promise((resolve) => {
    const on = () => {
      if (document.hidden) return;
      document.removeEventListener('visibilitychange', on);
      resolve();
    };
    document.addEventListener('visibilitychange', on);
  });
}

export function useGameRun(onSaved: (hash: string, alreadyAnalysed: boolean) => void) {
  const [phase, setPhase] = useState<RunPhase>('idle');
  const [rowRuns, setRowRuns] = useState<Map<string, RowRun>>(new Map());
  const [msPerGame, setMsPerGame] = useState<number | null>(null);
  const [limitHit, setLimitHit] = useState<DailyLimitHit | null>(null);
  const stopRef = useRef(false);
  const leftRef = useRef<Job[]>([]);
  const durations = useRef<number[]>([]);
  /* What this run has saved, across a pause and its continuation, for the end event. */
  const tally = useRef({ games: 0, puzzles: 0 });
  const runningRef = useRef(false);
  const phaseRef = useRef<RunPhase>('idle');
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;

  const setRow = (hash: string, run: RowRun) =>
    setRowRuns((prev) => new Map(prev).set(hash, run));

  const runQueue = useCallback(async (queue: Job[]) => {
    if (runningRef.current) return;
    runningRef.current = true;
    stopRef.current = false;
    leftRef.current = [...queue];
    phaseRef.current = 'running';
    setPhase('running');
    let outcome: RunPhase = 'done';
    let wake = await keepScreenOn();
    try {
      await withBrowserPuzzleEngine(async (engine) => {
        while (leftRef.current.length > 0) {
          if (stopRef.current) { outcome = 'stopped'; return; }
          if (document.hidden) {
            setPhase('paused-hidden');
            await wake?.release().catch(() => undefined);
            await untilVisible();
            wake = await keepScreenOn();
            setPhase('running');
            if (stopRef.current) { outcome = 'stopped'; return; }
          }
          if (analysisService.isEngineTaken()) { outcome = 'paused-taken'; return; }
          const job = leftRef.current[0];
          setRow(job.hash, { state: 'analysing' });
          const started = Date.now();
          const r = await generateForGame(job.game, {
            perspective: job.side ?? undefined,
            thresholds: { maxPuzzlesPerGame: MAX_PUZZLES_PER_GAME },
          }, engine);
          if ((r.report.dropped.timeout ?? 0) > 0) {
            setRow(job.hash, { state: 'interrupted' });
            // Taken by another tab: this game is run again when the run continues.
            if (analysisService.isEngineTaken()) { outcome = 'paused-taken'; return; }
            leftRef.current.shift();
            continue;
          }
          durations.current.push(Date.now() - started);
          setMsPerGame(durations.current.reduce((a, b) => a + b, 0) / durations.current.length);
          try {
            const game = job.ref
              ? { source: 'site' as const, sourceGameRef: job.ref }
              : { source: 'pgn' as const, pgn: gamePgn(job.game) };
            const saved = await saveGame({
              ...game, gameHash: job.hash, perspective: job.side,
              rulesVersion: RULES_VERSION, puzzles: r.puzzles.map(({ game: _game, ...p }) => p),
            });
            setRow(job.hash, { state: 'saved', ids: saved.ids });
            tally.current.games += 1;
            tally.current.puzzles += saved.ids.length;
            onSavedRef.current(job.hash, saved.alreadyAnalysed);
          } catch (e) {
            if (e instanceof GamePuzzlesApiError && e.status === 402) {
              const body = e.body as { limit?: number; resetsAt?: string } | null;
              const hit = { limit: body?.limit ?? 3, resetsAt: body?.resetsAt ?? '' };
              setLimitHit(hit);
              // The site's one daily-limit dialog, and the funnel's `limit_reached` (C5).
              reportDailyLimit({ feature: 'game_puzzles', ...hit });
              setRow(job.hash, { state: 'limit' });
              leftRef.current.shift();
              outcome = 'limit';
              return;
            }
            setRow(job.hash, { state: 'failed' });
          }
          leftRef.current.shift();
        }
      });
    } catch {
      outcome = analysisService.isEngineTaken() ? 'paused-taken' : 'stopped';
    } finally {
      await wake?.release().catch(() => undefined);
      runningRef.current = false;
    }
    // What is left waits: not started, or (another tab took the engine) started and cut short.
    setRowRuns((prev) => {
      const next = new Map(prev);
      for (const job of leftRef.current) next.set(job.hash, { state: 'waiting' });
      return next;
    });
    phaseRef.current = outcome;
    setPhase(outcome);
    // Set inside the engine callback, which TypeScript's narrowing does not follow.
    const ended = outcome as RunPhase;
    if (ended === 'done' || ended === 'stopped' || ended === 'limit') {
      logGA4Event({ name: 'game_puzzles_run_ended', params: { outcome: ended, games_saved: tally.current.games, puzzles: tally.current.puzzles } });
    }
  }, []);

  const start = useCallback((jobs: Job[]) => {
    setLimitHit(null);
    tally.current = { games: 0, puzzles: 0 };
    logGA4Event({ name: 'game_puzzles_run_started', params: { games: jobs.length } });
    setRowRuns(new Map(jobs.map((j) => [j.hash, { state: 'waiting' } as RowRun])));
    void runQueue(jobs);
  }, [runQueue]);

  /** Take the engine back from the other tab and go on with the games left. */
  const continueHere = useCallback(() => { void runQueue(leftRef.current); }, [runQueue]);

  const stop = useCallback(() => { stopRef.current = true; }, []);

  // The other tab let the engine go: go on by ourselves, if this tab is the one being looked at.
  useEffect(() => analysisService.subscribeEngineAvailable(() => {
    if (phaseRef.current === 'paused-taken' && !document.hidden && !runningRef.current) void runQueue(leftRef.current);
  }), [runQueue]);

  const remaining = [...rowRuns.values()].filter((r) => r.state === 'waiting' || r.state === 'analysing').length;
  return { phase, rowRuns, msPerGame, remaining, limitHit, start, stop, continueHere };
}
