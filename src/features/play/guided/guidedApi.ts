/**
 * #428 D2: THE PAGE'S CLIENT FOR THE GUIDED-GAME ROUTES (backend/src/routes/guidedGames.ts). The browser grades the
 * moves (rule R1: the one thing it computes); the server says what the Master says about them and binds every call
 * to the game. Every call answers null when the server cannot be reached or refuses: the page then falls back to its
 * fixed line (a warning) or says nothing (a missed chance). Only start reports a refusal, the free plan's one a day.
 *
 * The identity headers come in by dynamic import, as computerGameSave.ts does: the sign-in code stays out of /play's
 * first chunk.
 */
import { readDailyLimit, type DailyLimit } from '@/services/freePlanLimit';

/** A line he says, with its recording (the narration's shape, for `useMasterVoice`). */
export interface GuidedLine { kind: string; text: string; audioUrl: string; cuesUrl?: string }

async function post(path: string, body: unknown, signal?: AbortSignal): Promise<{ status: number; json: unknown } | null> {
  try {
    const [{ default: env }, { getRequestHeaders }] = await Promise.all([
      import('@/config/env'),
      import('@/features/auth/utils/getAuthToken'),
    ]);
    const headers = await getRequestHeaders();
    const res = await fetch(`${env.apiBaseUrl}${path}`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
    let json: unknown = null;
    try { json = await res.json(); } catch { /* no body */ }
    return { status: res.status, json };
  } catch {
    return null;
  }
}

async function get(path: string): Promise<{ status: number; json: unknown } | null> {
  try {
    const [{ default: env }, { getRequestHeaders }] = await Promise.all([
      import('@/config/env'),
      import('@/features/auth/utils/getAuthToken'),
    ]);
    const res = await fetch(`${env.apiBaseUrl}${path}`, { headers: await getRequestHeaders() });
    let json: unknown = null;
    try { json = await res.json(); } catch { /* no body */ }
    return { status: res.status, json };
  } catch {
    return null;
  }
}

const dataOf = <T>(r: { status: number; json: unknown } | null): T | null =>
  r && r.status === 200 && r.json && typeof r.json === 'object' ? ((r.json as { data?: T }).data ?? null) : null;

export type StartAnswer = { ok: true; id: string } | { ok: false; limit: DailyLimit | null };

/** Start (or find again) the guided game for this browser game, once the player's first move is graded. */
export async function startGuidedGame(body: { clientGameId: string; level: string; color: 'white' | 'black'; moves: string[] }): Promise<StartAnswer> {
  const r = await post('/api/guided-games/start', body);
  const data = dataOf<{ id: string }>(r);
  if (data?.id) return { ok: true, id: data.id };
  return { ok: false, limit: r ? readDailyLimit(r.status, r.json) : null };
}

/** His warning, worded from the board and SF; null on any failure (the page says its fixed line). */
export function fetchWarning(id: string, body: { moves: string[]; pv: string[]; mateForHim?: boolean }, signal?: AbortSignal) {
  return post(`/api/guided-games/${id}/warning`, body, signal).then((r) => dataOf<GuidedLine>(r));
}

/** The chance the player's last move missed, if any worth saying; null for none or on failure. */
export function fetchMissed(id: string, body: { moves: string[]; pv: string[]; mateForPlayer?: boolean }, signal?: AbortSignal) {
  return post(`/api/guided-games/${id}/missed`, body, signal).then((r) => dataOf<GuidedLine>(r));
}

/** A reason for his last move (C5, the opening), with its board marks in the trainer's format. */
export interface GuidedReason { key?: string; text: string; marks: string }

/** Why? in the opening: his last move's reviewed reasons; [] once the opening is over; null on failure. */
export async function fetchWhy(id: string, moves: string[]): Promise<GuidedReason[] | null> {
  const r = await post(`/api/guided-games/${id}/why`, { moves });
  const data = dataOf<{ reasons: Array<{ key?: string; text: string; marks?: string[] }> }>(r);
  return data ? data.reasons.map((x) => ({ key: x.key, text: x.text, marks: (x.marks ?? []).join(' ') })) : null;
}

/**
 * D3: the Position Explainer's action line for the position at the end of `moves`, bound to the guided game (C4: it
 * spends the game's calls, not the free plan's explanations), with the marks of every square it names (the owner's
 * rule, from the server). The server's cache first; on a miss the browser's commentary search (about 6 s) and the
 * POST, as /explain does. Null when it cannot be had.
 */
export async function fetchGuidedAction(id: string, fen: string, moves: string[], onDepth?: (d: number) => void): Promise<{ action: string; marks: string; best?: string } | null> {
  const q = new URLSearchParams({ fen, lastMoveClassification: '', moves: moves.join(','), guidedGameId: id });
  const hit = await get(`/api/explain-position/v4/cache-check?${q}`);
  const cached = hit && hit.status === 200 ? (hit.json as { cached?: boolean; result?: { action?: string; actionMarks?: string } }) : null;
  if (!hit || (hit.status !== 200)) return null;
  if (cached?.cached && cached.result?.action) return { action: cached.result.action, marks: cached.result.actionMarks ?? '' };
  const { analysisService } = await import('@/services/AnalysisService');
  const search = await analysisService.getCommentarySearchData(fen, onDepth);
  if (!search) return null;
  const r = await post('/api/explain-position/v4', {
    fen,
    searchOutput: search.searchOutput,
    pvScores: search.pvScores,
    searchedEval: search.searchedEval,
    isMate: search.isMate,
    mateIn: search.mateIn,
    nullMoveSearchOutput: search.nullMoveSearchOutput,
    moveHistory: moves,
    guidedGameId: id,
  });
  const body = r && r.status === 200 ? (r.json as { action?: string; actionMarks?: string }) : null;
  // The explainer's own best move (its ~6 s search), so the Hint's second rung points where its first one did.
  const best = /bestmove[ ]+([a-h][1-8][a-h][1-8][qrbn]?)/.exec(search.searchOutput)?.[1];
  return body?.action ? { action: body.action, marks: body.actionMarks ?? '', best } : null;
}

export type HintStage = 'opening' | 'middlegame' | 'endgame';
/** A hint with its reason's key, for the trainer's kind marker (#177). */
export interface GuidedHint { key: string; text: string }

/** D3b: the opening trainer's hints for `best` (least pointing first); none in an endgame; null on failure. */
export async function fetchHints(id: string, moves: string[], best: string): Promise<{ stage: HintStage; hints: GuidedHint[] } | null> {
  const r = await post(`/api/guided-games/${id}/hint`, { moves, best });
  return dataOf<{ stage: HintStage; hints: GuidedHint[] }>(r);
}

/** D3c: the stage after `moves` (SF's phase and opening flag), for the opening-principles tab. Not a call for help. */
export async function fetchStage(id: string, moves: string[], at?: number): Promise<HintStage | null> {
  const r = await post(`/api/guided-games/${id}/stage`, at === undefined ? { moves } : { moves, at });
  return dataOf<{ stage: HintStage }>(r)?.stage ?? null;
}
