/**
 * A finished game against the computer goes to the server (#416, `POST /api/computer-games`), where it
 * joins the player's history with every other game.
 *
 * - Only a FINISHED game is sent: an unfinished one is dropped (owner, 2026-11-23).
 * - The finished game is kept in this browser (`cp_computer_game_pending`) until the server has it, so a
 *   failed save or a tab closed straight after the game is sent again on the next visit to /play.
 * - Each game has its own id (`clientGameId`); a retry of the same game is one row on the server.
 * - The server replays the moves and decides how the game ended; the browser's word is taken only for a
 *   resignation or a loss on time.
 */
export interface ComputerGameDraft {
  clientGameId: string;
  /** /play's level id: `master-1500`, `sf-3`. */
  level: string;
  playerColor: 'white' | 'black';
  startFen: string | null;
  /** UCI, from the start position. */
  moves: string[];
  /** Seconds; 0 and 0 is a game with no clock. */
  timeControl: { initial: number; increment: number };
  claim: { reason: 'resignation' | 'timeout'; loser: 'white' | 'black' } | null;
  /** #428 D5: the server's id of the guided game this was; the server stores the game as guided only if it is theirs. */
  guidedGameId?: string | null;
}

const KEY = 'cp_computer_game_pending';

export function newClientGameId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch { /* fall through */ }
  // RFC 4122 version 4 from Math.random (old browsers only; uniqueness, not secrecy, is what matters here).
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function keep(draft: ComputerGameDraft): void {
  try { localStorage.setItem(KEY, JSON.stringify(draft)); } catch { /* storage blocked: only the retry is lost */ }
}

function forget(clientGameId: string): void {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw && (JSON.parse(raw) as ComputerGameDraft).clientGameId === clientGameId) localStorage.removeItem(KEY);
  } catch { /* nothing to forget */ }
}

/** The finished game a previous visit could not save, if any. */
export function pendingGame(): ComputerGameDraft | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw) as ComputerGameDraft;
    return draft && typeof draft.clientGameId === 'string' && Array.isArray(draft.moves) ? draft : null;
  } catch {
    return null;
  }
}

export type SaveOutcome =
  | { ok: true; id: string }
  /** `final`: the server refused the game itself (a 4xx); sending it again would be refused again. */
  | { ok: false; final: boolean };

async function postOnce(draft: ComputerGameDraft): Promise<SaveOutcome> {
  const [{ default: env }, { getRequestHeaders }] = await Promise.all([
    import('@/config/env'),
    import('@/features/auth/utils/getAuthToken'),
  ]);
  try {
    const headers = await getRequestHeaders();
    const res = await fetch(`${env.apiBaseUrl}/api/computer-games`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(draft),
    });
    const json = await res.json().catch(() => null);
    if (res.ok && json?.success) return { ok: true, id: json.data.id as string };
    // 429 and 5xx are worth another try; any other refusal is about the game itself.
    return { ok: false, final: res.status >= 400 && res.status < 500 && res.status !== 429 };
  } catch {
    return { ok: false, final: false };
  }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Save a finished game: kept in the browser first, sent with two retries (1 s, then 4 s), forgotten once
 * the server has it or has refused it for good. A game a visit could not save stays for the next one.
 */
export async function saveFinishedGame(draft: ComputerGameDraft): Promise<SaveOutcome> {
  keep(draft);
  let outcome: SaveOutcome = { ok: false, final: false };
  for (const delay of [0, 1000, 4000]) {
    if (delay) await wait(delay);
    outcome = await postOnce(draft);
    if (outcome.ok || ('final' in outcome && outcome.final)) break;
  }
  if (outcome.ok || ('final' in outcome && outcome.final)) forget(draft.clientGameId);
  return outcome;
}

/** Send the game a previous visit could not save (once, on /play's load). */
export async function savePendingGame(): Promise<void> {
  const draft = pendingGame();
  if (draft) await saveFinishedGame(draft);
}
