import env from '@/config/env';

/**
 * The sentence the Master says for his move (MASTER_CHARACTER_IMPLEMENTATION_PLAN D6, #186), from the server
 * (rule R1: the browser calculates nothing for what he says). `audioUrl` is his recorded voice for the sentence,
 * served by the site's own origin (D7). Null when the server cannot be reached: he then just shows no line.
 */
export interface MasterLine {
  text: string;
  audioUrl: string;
  /** The mouth shapes timed to the recording (#298); absent from a server older than v2: his mouth stays closed. */
  cuesUrl?: string;
}

/**
 * The voice this page plays, named in every narration request. The server lets a browser keep an answer for a
 * day, so without it a browser that heard the Master before a voice change answered the positions it had seen with
 * the OLD recordings, and a game mixed two voices (owner on staging, 2026-11-17: Polly for the first three moves,
 * George from move 4). A new voice means a new value here, so old answers are never reused. The server ignores it.
 */
export const MASTER_VOICE = '2';

export async function fetchNarration(fenBefore: string, uci: string, signal?: AbortSignal): Promise<MasterLine | null> {
  try {
    const q = new URLSearchParams({ fen: fenBefore, uci, voice: MASTER_VOICE });
    const res = await fetch(`${env.apiBaseUrl}/api/master/narrate?${q}`, { signal });
    if (!res.ok) return null;
    const body = (await res.json()) as { text: string; audioUrl: string; cuesUrl?: string };
    return { text: body.text, audioUrl: body.audioUrl, cuesUrl: body.cuesUrl };
  } catch {
    return null;
  }
}
