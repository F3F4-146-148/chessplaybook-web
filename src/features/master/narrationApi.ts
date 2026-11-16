import env from '@/config/env';

/**
 * The sentence the Master says for his move (MASTER_CHARACTER_IMPLEMENTATION_PLAN D6, #186), from the server
 * (rule R1: the browser calculates nothing for what he says). `audioUrl` is his recorded voice for the sentence,
 * served by the site's own origin (D7). Null when the server cannot be reached: he then just shows no line.
 */
export interface MasterLine {
  text: string;
  audioUrl: string;
}

export async function fetchNarration(fenBefore: string, uci: string, signal?: AbortSignal): Promise<MasterLine | null> {
  try {
    const q = new URLSearchParams({ fen: fenBefore, uci });
    const res = await fetch(`${env.apiBaseUrl}/api/master/narrate?${q}`, { signal });
    if (!res.ok) return null;
    const body = (await res.json()) as { text: string; audioUrl: string };
    return { text: body.text, audioUrl: body.audioUrl };
  } catch {
    return null;
  }
}
