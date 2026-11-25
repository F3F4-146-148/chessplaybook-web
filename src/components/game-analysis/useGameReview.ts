/**
 * The Game report and Explain Position, as state and actions (layout redesign E4b-2,
 * 2026-10-10): taken out of `GameAnalysisWrapper` unchanged. Since E6 every caller is
 * `GameReviewActions` on `GameViewerWorkspace` (the champion viewers and `/analysis`
 * review mode), and it reads the ply from the game model.
 *
 * Report: a server cache check, else browser Stockfish over every position, then
 * `POST /api/game-summary` for the summary and LC0 policy. Explanation: a server cache
 * check, else a browser search and `POST /api/explain-position/v4`.
 */
import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { backendAPIClient, APIHTTPError } from '@/services/BackendAPIClient';
import { logEvent } from '@/services/analytics';
import { dailyLimitMessage, readDailyLimit, reportDailyLimit } from '@/services/freePlanLimit';
import { analysisService } from '@/services/AnalysisService';
import { analyzeFullGame, type FullGameAnalysis } from '@/services/GameAnalysisService';
import { detectBrilliantMovesInBrowser, type Detection } from '@/services/brilliantDetection';
import type { ChessGame } from '@/types/chess';
import type { StructuredExplanation } from '@/types/positionExplanation';

/** Structured position explanation from V2/V3 CommentaryPipeline */
export interface PositionExplanation {
  /** Sectioned output consumed by PositionExplanationCard. Present on
   *  every /explain-position/v4 response from pipeline 2.7.0 onward
   *  (mandatory from 2.8.0 after the flat-prose fields were retired). */
  structured?: StructuredExplanation;
  /** Headline recommendation — kept as a top-level field for callers
   *  that want the ACTION prose without drilling into `structured`. */
  action?: string;
}

/** Game summary returned from POST /api/game-summary */
/** The report's progress: not asked for, running, done. */
export type GameReportButtonState = 'initial' | 'analyzing' | 'ready';

export interface GameSummaryResult {
  summary: string;
  cta: string;
  /** `side`: the colour the champion's counted games were played with (#374); absent in old cached reports. */
  championLink: { championName: string; championKey: string; url: string; side?: 'white' | 'black' } | null;
  /** #374: the champion who met the opening best from the other colour; absent or null when none. */
  counterLink?: { championName: string; championKey: string; url: string; side: 'white' | 'black' } | null;
  criticalMoveIndex: number | null;
}

export interface UseGameReviewOptions {
  /** The position on the board. */
  currentFen: string;
  /** The game's moves, UCI. */
  moves: string[];
  gameResult: 'white' | 'black' | 'draw';
  /** Players, opening and result, for the summary. */
  metadata?: ChessGame;
  /** Plies played to reach the board (0 = the start), from the game model. */
  moveIndex: number;
}

/*
  THE SAVED REPORT CARRIES THE REPORT RULES' REVISION (#379): a report saved in this tab before the brilliant-move
  rule changed has the old brilliant moves and button, so it is not restored; the report is run again (and is
  usually a server cache hit). Raise it with the server's SUMMARY_RULES_REVISION.
*/
const REPORT_REVISION = 5;

export function useGameReview({
  currentFen, moves, gameResult, metadata, moveIndex,
}: UseGameReviewOptions) {
  // Game identity — used to invalidate cached analysis when game changes
  const gameKey = moves.length > 0 ? `r${REPORT_REVISION}:` + moves.slice(0, 5).join(',') + ':' + moves.length : '';

  // Game Analysis state — restore from sessionStorage only if same game
  const [gameAnalysis, setGameAnalysis] = useState<FullGameAnalysis | null>(() => {
    try {
      const storedKey = sessionStorage.getItem('analysis_gameKey');
      if (storedKey === gameKey && gameKey) {
        const stored = sessionStorage.getItem('analysis_gameReport');
        return stored ? JSON.parse(stored) : null;
      }
      return null;
    } catch { return null; }
  });
  const [reportButtonState, setReportButtonState] = useState<GameReportButtonState>(
    () => {
      try {
        const storedKey = sessionStorage.getItem('analysis_gameKey');
        if (storedKey === gameKey && gameKey) {
          return sessionStorage.getItem('analysis_gameReport') ? 'ready' : 'initial';
        }
        return 'initial';
      } catch { return 'initial'; }
    }
  );
  const [currentMoveIndex, setCurrentMoveIndex] = useState(0);
  const [positionExplanation, setPositionExplanation] = useState<PositionExplanation | null>(null);
  const [explanationLoading, setExplanationLoading] = useState(false);
  const [explanationError, setExplanationError] = useState<string | null>(null);

  /** `?forceExplain=1` debug bypass. When set, Explain Position:
   *   - skips the useRef client cache,
   *   - skips the GET /v4/cache-check call,
   *   - always runs the 6s browser SF search,
   *   - console.logs the full raw `searchOutput` + `nullMoveSearchOutput`
   *     so the developer can copy them from DevTools,
   *   - sends `forceFresh: true` on the POST body so the backend
   *     bypasses its own cache on read (still writes through).
   *  Purpose: diagnose "what did the engine actually produce?" when a
   *  shared cache entry is in the way. */
  const useForceExplain = useMemo(() => {
    try {
      return new URLSearchParams(window.location.search).get('forceExplain') === '1';
    } catch { return false; }
  }, []);

  const [reportError, setReportError] = useState<string | null>(null);
  const explanationCache = useRef<Map<string, PositionExplanation>>(new Map());
  const policyDataRef = useRef<Array<{ topMoves: Array<{ move: string; policy: number }>; wdl: { win: number; draw: number; loss: number } }> | null>(null);
  /*
    THE SUMMARY IS KEPT WITH THE ANALYSIS (#374, found by the owner on staging): the
    analysis came back from the session store when the page was opened again (after
    following the summary's own champion link and coming back, or a reload), the summary
    did not, so the report came back with no text and no link.
  */
  const [gameSummary, setGameSummary] = useState<GameSummaryResult | null>(() => {
    try {
      if (!gameKey || sessionStorage.getItem('analysis_gameKey') !== gameKey) return null;
      const stored = sessionStorage.getItem('analysis_gameSummary');
      return stored ? JSON.parse(stored) as GameSummaryResult : null;
    } catch { return null; }
  });
  const [showSummary, setShowSummary] = useState(false);
  /* #510: the report's per-position arrays, for puzzles made from this game (its first pass). Not
     kept across a reload: a restored report has none, and the generator then searches itself. */
  const [reportArrays, setReportArrays] = useState<{ evals: number[]; bestMoves: string[]; mateIn: (number | null)[] } | null>(null);
  // Progress shown inside the "Analyzing..." button during client-side
  // Stockfish batch analysis. `null` when not running.
  const [reportProgress, setReportProgress] = useState<{ current: number; total: number } | null>(null);
  /** The step after the batch (#379): the button reads "Checking brilliant moves" while it runs. */
  const [reportStage, setReportStage] = useState<'engine' | 'brilliant' | null>(null);
  /*
    ONLY A REPORT WITH A COMPLETE DETECTION IS SAVED (#379 B3): a report whose brilliant-move detection failed is
    shown without brilliant moves or a button, and is run again the next time it is opened. A restored report was
    saved complete.
  */
  const [reportComplete, setReportComplete] = useState(() => gameAnalysis !== null);

  // Persist game analysis to sessionStorage (with game key for invalidation)
  useEffect(() => {
    try {
      if (gameAnalysis && reportComplete) {
        sessionStorage.setItem('analysis_gameReport', JSON.stringify(gameAnalysis));
        sessionStorage.setItem('analysis_gameKey', gameKey);
      } else {
        sessionStorage.removeItem('analysis_gameReport');
        sessionStorage.removeItem('analysis_gameKey');
      }
    } catch { /* storage full — ignore */ }
  }, [gameAnalysis, gameKey, reportComplete]);

  // The summary goes with the analysis, under the same game key.
  useEffect(() => {
    try {
      if (gameSummary && gameAnalysis && reportComplete) sessionStorage.setItem('analysis_gameSummary', JSON.stringify(gameSummary));
      else sessionStorage.removeItem('analysis_gameSummary');
    } catch { /* storage full — ignore */ }
  }, [gameSummary, gameAnalysis, reportComplete]);

  // Clear stale analysis when game changes
  useEffect(() => {
    const storedKey = sessionStorage.getItem('analysis_gameKey');
    if (storedKey && storedKey !== gameKey) {
      setGameAnalysis(null);
      setGameSummary(null);
      setReportArrays(null);
      setReportButtonState('initial');
      sessionStorage.removeItem('analysis_gameReport');
      sessionStorage.removeItem('analysis_gameKey');
      sessionStorage.removeItem('analysis_gameSummary');
    }
  }, [gameKey]);

  /*
    THE MOVE INDEX: the plies played to reach the board, so 0 is the starting position,
    from the game model (E4b-2). The FEN arithmetic it replaced (E6) read the move
    number off the FEN, which is wrong for a game imported from a `[FEN]` position.
  */
  useEffect(() => {
    if (!currentFen) return;
    const halfMove = moveIndex;
    setCurrentMoveIndex(halfMove);
    // Dismiss overlays when navigating
    setPositionExplanation(null);
    setExplanationError(null);
    if (halfMove !== 0) setShowSummary(false);
  }, [currentFen, moveIndex]);

  // Game Report handler — client-side Stockfish flow.
  //
  // Flow (cache miss):
  //   1. GET /api/game-summary/cache-check → empty
  //   2. analysisService.analyzeFullGameClientSide(moves, onProgress)
  //      runs `go depth 16` on every position in the browser
  //   3. analyzeFullGame(..., null) classifies the moves
  //   4. detectBrilliantMovesInBrowser (#379): the board facts, Maia 1900
  //      and a two-line search where needed; `complete` or `failed`
  //   5. analyzeFullGame(..., detection), then POST /api/game-summary with
  //      those classes and the detection; the server applies it, writes the
  //      summary, and stores the bundle only when the detection is complete
  //   6. Render the bundle the server returns (another tab may have stored
  //      the same game since step 1: then that one, never a mix)
  //
  // Flow (cache hit):
  //   1. GET /api/game-summary/cache-check → cached bundle, with its detection
  //   2. analyzeFullGame on cached evals/bestMoves/mateIn + the detection
  //   3. Render summary from the cached bundle
  //   No Stockfish run, no Maia — all purely client-side reconstruction.
  const handleGameReport = useCallback(async () => {
    if (moves.length === 0) return;
    setReportButtonState('analyzing');
    setReportError(null);
    setReportProgress(null);
    setReportStage('engine');

    const resultStr =
      gameResult === 'white' ? '1-0' : gameResult === 'black' ? '0-1' : '1/2-1/2';

    try {
      // ── Step 1: cache pre-flight ──────────────────────────────────────
      // A hit returns everything needed to render without running any
      // engine. Failures are non-fatal — we fall through to the client-
      // side Stockfish path.
      let cached: {
        summary: string;
        cta: string;
        championLink: GameSummaryResult['championLink'];
        counterLink: GameSummaryResult['counterLink'];
        criticalMoveIndex: number | null;
        policyData: Array<{
          topMoves: Array<{ move: string; policy: number }>;
          wdl: { win: number; draw: number; loss: number };
        }> | null;
        evals: number[];
        bestMoves: string[];
        mateIn: (number | null)[];
        detection: Detection | null;
      } | null = null;
      try {
        const cacheCheckUrl =
          `/api/game-summary/cache-check` +
          `?moves=${moves.join(',')}` +
          `&result=${encodeURIComponent(resultStr)}`;
        const cacheResp = await backendAPIClient.get<{
          cached: boolean;
          result?: {
            summary: { text: string; cta: string; championLink: GameSummaryResult['championLink']; counterLink?: GameSummaryResult['counterLink']; criticalMoveIndex: number | null };
            policyData: typeof cached extends null ? never : NonNullable<typeof cached>['policyData'];
            evals: number[];
            bestMoves: string[];
            mateIn: (number | null)[];
            detection?: Detection | null;
          };
        }>(cacheCheckUrl, { identified: true });
        if (cacheResp.cached && cacheResp.result) {
          const r = cacheResp.result;
          cached = {
            summary: r.summary.text,
            cta: r.summary.cta,
            championLink: r.summary.championLink,
            counterLink: r.summary.counterLink ?? null,
            criticalMoveIndex: r.summary.criticalMoveIndex,
            policyData: r.policyData,
            evals: r.evals,
            bestMoves: r.bestMoves,
            mateIn: r.mateIn,
            detection: r.detection ?? null,
          };
        }
      } catch (cacheErr) {
        // The free plan's daily limit: stop here, before the browser analyses the whole game.
        if (cacheErr instanceof APIHTTPError) {
          const limit = readDailyLimit(cacheErr.status, cacheErr.body);
          if (limit) {
            reportDailyLimit(limit);
            setReportError(dailyLimitMessage(limit));
            setReportButtonState('initial');
            return;
          }
        }
        console.warn('[GameAnalysisWrapper] game-summary cache-check failed:', cacheErr);
      }

      if (cached) {
        // ── Cache hit: reconstruct the full report client-side ──────────
        policyDataRef.current = cached.policyData;
        const analysis = analyzeFullGame(
          cached.evals,
          cached.bestMoves,
          cached.mateIn,
          moves,
          gameResult,
          cached.detection,
        );
        setReportComplete(cached.detection?.status === 'complete');
        setReportArrays({ evals: cached.evals, bestMoves: cached.bestMoves, mateIn: cached.mateIn });
        setGameAnalysis(analysis);
        setGameSummary({
          summary: cached.summary,
          cta: cached.cta,
          championLink: cached.championLink,
          counterLink: cached.counterLink ?? null,
          criticalMoveIndex: cached.criticalMoveIndex,
        });
        setShowSummary(true);
        setReportButtonState('ready');
        return;
      }

      // ── Step 2: client-side Stockfish batch analysis ────────────────
      // Runs `go depth 16` on every position. Progress callback drives
      // the "Analyzing N/M" label on the report button (GameReviewActions).
      const totalPositions = moves.length + 1;
      setReportProgress({ current: 0, total: totalPositions });

      const batch = await analysisService.analyzeFullGameClientSide(
        moves,
        ({ current, total }) => setReportProgress({ current, total }),
      );

      // ── Step 3: the classes, no brilliant move yet ───────────────────
      const preliminary = analyzeFullGame(
        batch.evals,
        batch.bestMoves,
        batch.mateIn,
        moves,
        gameResult,
        null,
      );

      // ── Step 4: brilliant moves and the critical move (#379) ─────────
      // Never throws: a failure is `failed`, shown without brilliant moves or a button and not saved.
      setReportStage('brilliant');
      const detection = await detectBrilliantMovesInBrowser({
        moves,
        evals: batch.evals,
        bestMoves: batch.bestMoves,
        classified: preliminary.classifiedMoves,
      }).catch((): Detection => ({ status: 'failed', moves: [], critical: null, reason: 'detection threw' }));
      const final = analyzeFullGame(batch.evals, batch.bestMoves, batch.mateIn, moves, gameResult, detection);

      // ── Step 5: POST /api/game-summary ───────────────────────────────
      const summaryBody: Record<string, unknown> = {
        evalGraph: final.evalGraph,
        classifiedMoves: final.classifiedMoves,
        whiteAccuracy: final.whiteAccuracy,
        blackAccuracy: final.blackAccuracy,
        whiteCounts: final.whiteCounts,
        blackCounts: final.blackCounts,
        phases: final.phases,
        gameRating: final.gameRating,
        white: metadata?.white || 'White',
        black: metadata?.black || 'Black',
        result: resultStr,
        moveCount: Math.floor(moves.length / 2),
        eco: metadata?.eco,
        opening: metadata?.opening,
        moveHistory: moves,
        bestMoves: batch.bestMoves,
        mateIn: batch.mateIn,
        detection: { status: detection.status, moves: detection.moves, critical: detection.critical },
      };

      let policyData: Array<{
        topMoves: Array<{ move: string; policy: number }>;
        wdl: { win: number; draw: number; loss: number };
      }> | null = null;
      let summaryPayload: GameSummaryResult | null = null;
      // What the server answers with: its own stored bundle when another tab stored this game since the cache check.
      let served: { evals: number[]; bestMoves: string[]; mateIn: (number | null)[]; detection: Detection | null } | null = null;

      try {
        const summaryResp = (await backendAPIClient.post(
          '/api/game-summary',
          summaryBody,
          { identified: true },
        )) as unknown as Record<string, unknown>;
        if (summaryResp.success && summaryResp.summary) {
          summaryPayload = {
            summary: summaryResp.summary as string,
            cta: (summaryResp.cta as string) || '',
            championLink: summaryResp.championLink as GameSummaryResult['championLink'],
            counterLink: (summaryResp.counterLink as GameSummaryResult['counterLink']) ?? null,
            criticalMoveIndex: summaryResp.criticalMoveIndex as number | null,
          };
          policyData = (summaryResp.policyData as typeof policyData) ?? null;
          if (Array.isArray(summaryResp.evals) && Array.isArray(summaryResp.bestMoves) && Array.isArray(summaryResp.mateIn)) {
            served = {
              evals: summaryResp.evals as number[],
              bestMoves: summaryResp.bestMoves as string[],
              mateIn: summaryResp.mateIn as (number | null)[],
              detection: (summaryResp.detection as Detection | null | undefined) ?? null,
            };
          }
        }
      } catch (summaryErr) {
        // Refused at the end (a second tab took the last report meanwhile): say so, show nothing.
        if (summaryErr instanceof APIHTTPError) {
          const limit = readDailyLimit(summaryErr.status, summaryErr.body);
          if (limit) {
            reportDailyLimit(limit);
            setReportError(dailyLimitMessage(limit));
            setReportButtonState('initial');
            return;
          }
        }
        console.error('[GameAnalysisWrapper] Game summary failed:', summaryErr);
        // Non-fatal — fall through with policyData=null so the report
        // still renders with classifications (just no brilliant tagging).
      }

      // ── Step 6: render the bundle the server returned (or ours, if the request failed) ──
      policyDataRef.current = policyData;
      const bundle = served ?? { evals: batch.evals, bestMoves: batch.bestMoves, mateIn: batch.mateIn, detection };
      const analysis = analyzeFullGame(bundle.evals, bundle.bestMoves, bundle.mateIn, moves, gameResult, bundle.detection);
      const complete = bundle.detection?.status === 'complete';
      setReportComplete(complete);
      if (!complete && summaryPayload) summaryPayload = { ...summaryPayload, criticalMoveIndex: null };
      setReportArrays({ evals: bundle.evals, bestMoves: bundle.bestMoves, mateIn: bundle.mateIn });
      setGameAnalysis(analysis);
      if (summaryPayload) {
        setGameSummary(summaryPayload);
        setShowSummary(true);
      }
      setReportButtonState('ready');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[GameAnalysisWrapper] Game Report failed:', err);
      setReportError(`Error: ${message}`);
      setReportButtonState('initial');
    } finally {
      setReportProgress(null);
      setReportStage(null);
    }
  }, [moves, gameResult, metadata]);

  // Explain Position handler
  const handleExplainPosition = useCallback(async () => {
    if (!currentFen) return;
    // The move index is part of the key: since pipeline 4.9.0 an explanation can carry the last move's reasons,
    // which depend on the moves that reached the position (move explanations plan D4).
    const cacheKey = `${currentMoveIndex}|${currentFen}`;
    // `?forceExplain=1` — skip the client-side useRef cache so a fresh
    // analysis always runs (debug tool for diagnosing "what did the
    // engine actually produce?"). The server-side cache-check is also
    // skipped further down.
    if (useForceExplain) {
      explanationCache.current.delete(cacheKey);
      console.info('[forceExplain] skipping client cache for', currentFen);
    }
    const cached = explanationCache.current.get(cacheKey);
    // If the sectioned UI flag is ON but the cached entry predates the
    // 2.7.0-route-fix roll-out (commit 8ef0528) and therefore lacks
    // `structured`, evict it so the next call hits the network and
    // gets a fresh response that includes the structured field.
    if (cached && !cached.structured) {
      // Legacy cached entry from before the sectioned-UI rollout; evict
      // so the next call hits the network and gets a structured response.
      explanationCache.current.delete(cacheKey);
    } else if (cached) {
      setPositionExplanation(cached);
      setExplanationError(null);
      return;
    }
    setExplanationLoading(true);
    setExplanationError(null);

    // Track whether we auto-enabled analysis in this call so we can revert
    // it in the finally block. If the user had analysis enabled already,
    // didAutoEnable stays false and we leave it alone.
    const analysisWasEnabled = analysisService.isAnalysisEnabled();
    let didAutoEnable = false;

    try {
      // v4-only flow (as of 2026-04-11): the old v1 fallback is gone.
      // Commentary always comes from either the server-side cache or
      // a fresh v4 run (browser Stockfish → POST /explain-position/v4).
      let response: Record<string, unknown>;

      // R4: Look up last-move classification from game report (if available).
      // Needs to happen BEFORE the cache-check because classification is
      // part of the cache key — see POSITION_EXPLAINER_CACHE_VERSIONING.md
      // Q5 ("re-compute if classification different").
      const lastMoveClass = currentMoveIndex > 0 && gameAnalysis
        ? gameAnalysis.classifiedMoves.find(m => m.moveIndex === currentMoveIndex - 1)
        : null;
      const classificationParam = lastMoveClass?.classification ?? '';

      // Pre-flight: check the server-side cache BEFORE running Stockfish.
      // If a current-version cached explanation exists for
      // (fen, classification), skip Stockfish entirely and render instantly.
      // Cache-check round-trips in <100ms.
      //
      // Failure is non-fatal: a cache-check error logs a warning and falls
      // through to the fresh-analysis path. The user never sees an error
      // from a broken cache-check.
      let cachedResult: Record<string, unknown> | null = null;
      if (useForceExplain) {
        console.info('[forceExplain] skipping server cache-check; will run fresh SF + POST with forceFresh=true');
      } else {
        try {
          const cacheCheckUrl =
            `/api/explain-position/v4/cache-check` +
            `?fen=${encodeURIComponent(currentFen)}` +
            `&lastMoveClassification=${encodeURIComponent(classificationParam)}` +
            // D3: the game's moves are part of the server's key, as they are in the POST's moveHistory.
            (moves.length > 0 && currentMoveIndex > 0
              ? `&moves=${encodeURIComponent(moves.slice(0, currentMoveIndex).join(','))}`
              : '');
          const cacheCheckResponse = await backendAPIClient.get<{
            cached: boolean;
            result?: Record<string, unknown>;
          }>(cacheCheckUrl, { identified: true });
          if (cacheCheckResponse.cached && cacheCheckResponse.result) {
            cachedResult = cacheCheckResponse.result;
          }
        } catch (cacheCheckErr) {
          // The free plan's daily limit: not a broken cache-check, so do not search anyway.
          if (cacheCheckErr instanceof APIHTTPError && readDailyLimit(cacheCheckErr.status, cacheCheckErr.body)) {
            throw cacheCheckErr;
          }
          console.warn(
            '[GameAnalysisWrapper] cache-check failed, falling back to fresh analysis:',
            cacheCheckErr,
          );
        }
      }

      if (cachedResult) {
        // Cache hit — skip Stockfish + POST entirely, render instantly.
        response = cachedResult;
      } else {
        // Cache miss — run fresh analysis through v4.
        //
        // Auto-enable: if the user has the analysis panel disabled, turn
        // it on so the browser Stockfish starts producing data for the
        // current position. The finally block reverts this to preserve
        // the user's panel preference.
        if (!analysisWasEnabled) {
          analysisService.setEnabled(true);
          didAutoEnable = true;
        }

        // getCommentarySearchData delegates to CommentarySearchProtocol
        // (MultiPV=1, Hash=32 MB, movetime=6s main + MultiPV=3 depth=8
        // null-move) via a WorkerTransport over the service's shared
        // Worker. Drains any panel search in flight first. See
        // SEARCH_QUALITY_PLAN.md §3 and
        // src/services/commentarySearch/CommentarySearchProtocol.ts.
        const searchData = await analysisService.getCommentarySearchData(currentFen);

        if (!searchData) {
          // Engine never returned bestmove within movetime + safety
          // slack. Extremely unlikely unless the worker died.
          throw new Error('ANALYSIS_NOT_READY');
        }

        if (useForceExplain) {
          // Dump the raw engine output so the developer can inspect
          // what the parser will see. Keys match the POST body shape.
          // Copy from DevTools console as plain text.
          console.groupCollapsed(
            `[forceExplain] raw searchOutput for ${currentFen.substring(0, 30)}… (${searchData.searchOutput.length} chars, depth=${searchData.meta.finalDepth}, wall=${searchData.meta.wallMs}ms)`,
          );
          console.log('── main search (pv1, MultiPV=1, movetime=6000) ──');
          console.log(searchData.searchOutput);
          console.log('── null-move search (MultiPV=3, depth=8) ──');
          console.log(searchData.nullMoveSearchOutput);
          console.log('── parsed summary ──');
          console.log({
            searchedEval: searchData.searchedEval,
            isMate: searchData.isMate,
            mateIn: searchData.mateIn,
            pvScores: searchData.pvScores,
            meta: searchData.meta,
          });
          console.groupEnd();
        }

        // V4 POST: send browser search data, server only runs eval + pipeline.
        const body: Record<string, unknown> = {
          fen: currentFen,
          searchOutput: searchData.searchOutput,
          pvScores: searchData.pvScores,
          searchedEval: searchData.searchedEval,
          isMate: searchData.isMate,
          mateIn: searchData.mateIn,
          nullMoveSearchOutput: searchData.nullMoveSearchOutput,
        };
        if (useForceExplain) {
          // Bypass the backend cache-read so the pipeline actually re-runs
          // with this fresh searchOutput. The backend still writes through.
          body.forceFresh = true;
        }
        if (moves.length > 0 && currentMoveIndex > 0) {
          body.moveHistory = moves.slice(0, currentMoveIndex);
          body.moveNumber = Math.floor((currentMoveIndex - 1) / 2) + 1;
        }
        if (lastMoveClass) {
          body.lastMoveClassification = lastMoveClass.classification;
          body.lastMoveEvalBefore = lastMoveClass.evalBefore / 100; // cp -> pawn units
          body.lastMoveEvalAfter = lastMoveClass.evalAfter / 100;
          // R14: Send LC0 policy for the last move if available
          const posPolicy = policyDataRef.current?.[currentMoveIndex - 1];
          if (posPolicy) {
            const playedMove = moves[currentMoveIndex - 1];
            const policyEntry = posPolicy.topMoves.find((m: { move: string }) => m.move === playedMove);
            if (policyEntry) body.lastMovePolicy = policyEntry.policy;
          }
        }
        response = await backendAPIClient.post('/api/explain-position/v4', body, { identified: true }) as unknown as Record<string, unknown>;
      }

      if (response.success && response.structured) {
        const explanation: PositionExplanation = {
          action: response.action as string | undefined,
          structured: response.structured as StructuredExplanation | undefined,
        };
        explanationCache.current.set(cacheKey, explanation);
        setPositionExplanation(explanation);
      } else {
        // Issue #10 (2026-04-19): the backend returned 2xx but the body
        // is missing both prose fields AND the structured section. This
        // shouldn't happen — the pipeline always produces at least an
        // action or assessment — but if it does we surface a specific
        // message instead of the old "Failed to explain position" and
        // log the response shape so we can diagnose in prod via GA4.
        const shape = `success=${response.success} action=${!!response.action} structured=${!!response.structured}`;
        console.error('[GameAnalysisWrapper] v4 returned 2xx with empty content:', shape, response);
        logEvent('explain_position', 'failed', `empty_response:${shape}`);
        setExplanationError('The engine returned an incomplete response. Please try again.');
      }
    } catch (err) {
      // Issue #10 (2026-04-19): error mapping rewritten to use
      // APIHTTPError's status code rather than substring-matching on
      // the message. The old code silently mishandled the 429 case
      // (backend message is "Too many requests. Please try again in N
      // seconds." — contains none of "429" / "rate" / "limit") and
      // every 400 / 500 fell through to the generic "Failed to explain
      // position" toast. Each branch now fires a GA4 event so we can
      // count occurrences in prod without user reports.
      console.error('[GameAnalysisWrapper] Position explanation failed:', err);
      const message = err instanceof Error ? err.message : 'Unknown error';

      const limit = err instanceof APIHTTPError ? readDailyLimit(err.status, err.body) : null;
      if (limit) {
        reportDailyLimit(limit);
        setExplanationError(dailyLimitMessage(limit));
      } else if (err instanceof APIHTTPError) {
        logEvent('explain_position', 'failed', `http_${err.status}`);
        if (err.status === 429) {
          setExplanationError('Too many requests — please wait a moment and try again.');
        } else if (err.status === 503) {
          setExplanationError('The chess engine is temporarily unavailable. Please try again.');
        } else if (err.status === 400) {
          // Most common cause: browser Stockfish hadn't produced a
          // `bestmove` line yet when we POSTed the search output.
          // Retrying after the panel warms up almost always works.
          setExplanationError('Analysis data was not ready. Please wait a moment and try again.');
        } else if (err.status >= 500) {
          setExplanationError('Server error while explaining the position. Please try again.');
        } else {
          setExplanationError(err.message || 'Failed to explain position. Please try again.');
        }
      } else if (message === 'ANALYSIS_NOT_READY') {
        logEvent('explain_position', 'failed', 'analysis_not_ready');
        setExplanationError('Analysis engine is still warming up. Please wait a moment and try again.');
      } else {
        // Unknown / network error.
        logEvent('explain_position', 'failed', 'unknown');
        setExplanationError('Failed to explain position. Please try again.');
      }
    } finally {
      // Revert auto-enable to preserve the user's analysis-panel preference.
      // This only fires if we turned the panel on ourselves inside this call.
      if (didAutoEnable) {
        analysisService.setEnabled(false);
      }
      setExplanationLoading(false);
    }
  }, [currentFen, moves, currentMoveIndex, gameAnalysis]);

  return {
    gameAnalysis, reportButtonState, reportProgress, reportStage, reportError, gameSummary,
    showSummary, setShowSummary, currentMoveIndex, setCurrentMoveIndex,
    positionExplanation, setPositionExplanation, explanationLoading, explanationError,
    setExplanationError, handleGameReport, handleExplainPosition, reportArrays,
  };
}
