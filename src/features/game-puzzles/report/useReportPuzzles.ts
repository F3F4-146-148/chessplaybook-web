/**
 * Puzzles from the Game report (#510, owner decisions R1-R5, analysis GAME_REPORT_PUZZLES_ANALYSIS).
 *
 * After a report is ready, and only if the player left the box ticked, the generator runs on the
 * report's own evaluations (its first pass), so only the confirming searches are added, in the
 * visitor's browser (D2). The game is saved with `POST /api/game-puzzles`, carrying the report's
 * moves and result so the report's own daily use covers it (R1). A game already saved costs nothing
 * and answers its puzzles again.
 *
 * The side is passed when the page knows it (a game played here); otherwise none, and the puzzles
 * are both colours' (R3).
 *
 * Never delays or blocks the report: it starts after it, and any failure is a line, never an error
 * over the report.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChessGame } from '@/types/chess';
import { evalsFromGameReport, withBrowserPuzzleEngine } from '../engine/browserEngine';
import { generateForGame, parseGames, RULES_VERSION, skipReasonOf } from '../generator/generatePuzzles';
import type { Side } from '../generator/types';
import { gamePgn } from '../page/gamePgn';
import { MAX_PUZZLES_PER_GAME } from '../page/useGameRun';
import { checkGames, GamePuzzlesApiError, saveGame } from '../services/gamePuzzlesApi';
import { logGA4Event } from '@/services/analytics';

const PREF_KEY = 'cp_report_puzzles';

/** The box's state, remembered per browser: ticked unless the player unticked it (R1-R5: ticked by default). */
export function readReportPuzzlesPref(): boolean {
  try { return localStorage.getItem(PREF_KEY) !== 'off'; } catch { return true; }
}

function writeReportPuzzlesPref(on: boolean): void {
  try { localStorage.setItem(PREF_KEY, on ? 'on' : 'off'); } catch { /* a convenience only */ }
}

export type ReportPuzzlesState =
  | { kind: 'idle' }
  | { kind: 'making' }
  | { kind: 'saved'; ids: string[]; hash: string }
  | { kind: 'none'; text: string }
  | { kind: 'limit'; resetsAt: string }
  | { kind: 'failed' };

/** The report's per-position arrays (White's point of view), as `evalsFromGameReport` takes them. */
export interface ReportArrays {
  evals: number[];
  bestMoves: string[];
  mateIn: Array<number | null>;
}

export function useReportPuzzles({
  offered, ready, arrays, moves, sans, metadata, gameResult, perspective,
}: {
  /** The page offers puzzles for this game (not a champion's or a broadcast game, R2). */
  offered: boolean;
  /** The report is complete. */
  ready: boolean;
  /** The report's evaluations, or null when the report was restored without them. */
  arrays: ReportArrays | null;
  /** UCI, the report's own moves (the report's daily item is computed from them). */
  moves: string[];
  sans: string[];
  metadata: ChessGame;
  gameResult: 'white' | 'black' | 'draw';
  /** The player's side when the page knows it; null otherwise (both colours). */
  perspective: Side | null;
}) {
  const [wanted, setWanted] = useState(readReportPuzzlesPref);
  const [state, setState] = useState<ReportPuzzlesState>({ kind: 'idle' });
  const doneFor = useRef<string | null>(null);
  const gameKey = moves.join(',');

  const setWantedAndRemember = useCallback((on: boolean) => {
    setWanted(on);
    writeReportPuzzlesPref(on);
  }, []);

  /* A different game: start again. */
  useEffect(() => {
    if (doneFor.current !== null && doneFor.current !== gameKey) {
      doneFor.current = null;
      setState({ kind: 'idle' });
    }
  }, [gameKey]);

  const run = useCallback(async () => {
    const result = gameResult === 'white' ? '1-0' : gameResult === 'black' ? '0-1' : '1/2-1/2';
    setState({ kind: 'making' });
    try {
      const headers = new Map<string, string>();
      const put = (k: string, v: string | undefined) => { if (v && v.trim()) headers.set(k, v.trim()); };
      put('Event', metadata.event);
      put('Site', metadata.site);
      put('Date', metadata.date);
      put('White', metadata.white || 'White');
      put('Black', metadata.black || 'Black');
      headers.set('Result', result);
      const pgn = gamePgn({ headers, sans });
      const evals = arrays && arrays.evals.length === moves.length + 1 ? evalsFromGameReport(arrays) : undefined;
      const [game] = await parseGames([{ pgn, evals }]);
      if (!game) { setState({ kind: 'failed' }); return; }
      const skip = await skipReasonOf(game);
      if (skip === 'too-short') { setState({ kind: 'none', text: 'This game is too short for puzzles.' }); return; }
      if (skip) { setState({ kind: 'none', text: 'Puzzles cannot be made from this game.' }); return; }

      const report = { moves, result } as const;
      const base = { source: 'pgn' as const, pgn, gameHash: game.hash, perspective, rulesVersion: RULES_VERSION, report };

      // Saved before (this report opened again): its puzzles, with no engine work and no charge.
      const { analysed } = await checkGames([game.hash]).catch(() => ({ analysed: [] as string[] }));
      if (analysed.includes(game.hash)) {
        const again = await saveGame({ ...base, puzzles: [] });
        setState(again.ids.length > 0
          ? { kind: 'saved', ids: again.ids, hash: game.hash }
          : { kind: 'none', text: 'No puzzles in this game.' });
        return;
      }

      const r = await withBrowserPuzzleEngine((engine) => generateForGame(game, {
        perspective: perspective ?? undefined,
        thresholds: { maxPuzzlesPerGame: MAX_PUZZLES_PER_GAME },
      }, engine));
      if ((r.report.dropped.timeout ?? 0) > 0) { setState({ kind: 'failed' }); return; }

      const saved = await saveGame({ ...base, puzzles: r.puzzles.map(({ game: _g, ...p }) => p) });
      logGA4Event({ name: 'report_puzzles_made', params: { puzzles: saved.ids.length, side_known: perspective !== null } });
      setState(saved.ids.length > 0
        ? { kind: 'saved', ids: saved.ids, hash: game.hash }
        : {
          kind: 'none',
          text: r.report.candidates === 0
            ? 'No puzzles: no mistake in this game changed the result.'
            : 'No puzzles: no position in this game had one clear answer.',
        });
    } catch (e) {
      if (e instanceof GamePuzzlesApiError && e.status === 402) {
        const body = e.body as { resetsAt?: string } | null;
        setState({ kind: 'limit', resetsAt: body?.resetsAt ?? '' });
        return;
      }
      setState({ kind: 'failed' });
    }
  }, [arrays, gameResult, metadata, moves, perspective, sans]);

  /* After the report, once per game, if wanted. */
  useEffect(() => {
    if (!offered || !ready || !wanted || doneFor.current === gameKey) return;
    doneFor.current = gameKey;
    void run();
  }, [offered, ready, wanted, gameKey, run]);

  return { wanted, setWanted: setWantedAndRemember, state, retry: run };
}
