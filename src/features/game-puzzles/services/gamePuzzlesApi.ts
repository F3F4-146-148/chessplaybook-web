/**
 * The client half of own-game puzzles (`backend/src/routes/gamePuzzles.ts`).
 *
 * The auth headers are imported at call time, as in `PlanApi`: a static import of `getAuthToken`
 * pulls the Cognito graph into the page's chunk.
 */
import env from '@/config/env';

const BASE = `${env.apiBaseUrl}/api/game-puzzles`;

export class GamePuzzlesApiError extends Error {
  constructor(message: string, public status: number, public body: unknown) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = await (await import('@/features/auth/utils/getAuthToken')).getRequestHeaders();
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...headers, ...init?.headers },
  });
  let body: { success?: boolean; data?: T; error?: string } | null = null;
  try {
    body = await response.json();
  } catch {
    // A gateway or proxy error page: fall through to the status.
  }
  if (!response.ok || body?.success === false) {
    throw new GamePuzzlesApiError(body?.error || `Request failed (${response.status})`, response.status, body);
  }
  return body?.data as T;
}

/** What is left of today's games; null when the player is not limited. */
export interface Allowance {
  limit: number;
  left: number;
  resetsAt: string;
}

export interface CheckResult {
  /** The hashes of games this player has already had analysed. */
  analysed: string[];
  allowance: Allowance | null;
}

/** Before analysing: which of these games are done already, and how many new ones are left today. */
export function checkGames(gameHashes: string[]): Promise<CheckResult> {
  return request<CheckResult>('/check', { method: 'POST', body: JSON.stringify({ gameHashes }) });
}

/** One game's puzzles, as the generator made them, without the generator's own `game` field. */
export type PuzzleToSave = Omit<import('../generator/types').GeneratedPuzzle, 'game'>;

/** A pasted game sends its PGN; a game played here sends its id, and the server reads its own copy. */
export type SaveRequest = ({ source: 'pgn'; pgn: string } | { source: 'site'; sourceGameRef: string }) & {
  gameHash: string;
  /** null: the side is not known, so every colour's puzzles (#510). A game played here may omit it. */
  perspective: 'white' | 'black' | null;
  rulesVersion: string;
  puzzles: PuzzleToSave[];
  /** Made from a Game report: the report's moves and result, so its own daily use covers them (#510, R1). */
  report?: { moves: string[]; result: '1-0' | '0-1' | '1/2-1/2' };
};

export interface SaveResult {
  ids: string[];
  /** The game was saved before: nothing was saved again and nothing was charged. */
  alreadyAnalysed: boolean;
}

/** Save one game's puzzles. A refusal is a GamePuzzlesApiError; a 402 carries the daily limit. */
export function saveGame(req: SaveRequest): Promise<SaveResult> {
  return request<SaveResult>('', { method: 'POST', body: JSON.stringify(req) });
}
