import { useEffect, useState } from 'react';

/**
 * THE MASTER READS A MOVE'S REASONS (#309, owner 2026-11-17: "almost like a coach staying on the side and teaching
 * you"). Each reason is recorded once, offline (`backend/scripts/master/synthesize-kokoro.ts --openings`), under the
 * name every recording of his uses: the first 16 hex characters of the SHA-1 of the text as shown
 * (`audioKey` in the backend's narration). The browser only finds the file for a text it was given; a text not yet
 * recorded (a rebake added it) fails to load and he goes on to the next one, while the text stays on the card.
 */
const AUDIO_BASE = '/audio/master-v4/';

export type VoicedLine = { text: string; audioUrl: string; cuesUrl: string };

const keys = new Map<string, Promise<string>>();

/** The recording's name for a shown text (the backend's `audioKey`). */
export function reasonAudioKey(text: string): Promise<string> {
  let k = keys.get(text);
  if (!k) {
    k = crypto.subtle.digest('SHA-1', new TextEncoder().encode(text)).then((buf) =>
      Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16));
    keys.set(text, k);
  }
  return k;
}

/**
 * The reasons as lines he says, in order, or null while there is nothing to say. `id` names the moment (the move on
 * the board): a new id starts him again even when the texts are the same, and the value is stable otherwise, so a
 * re-render never restarts him.
 */
export function useReasonVoice(id: string | null, texts: readonly string[] | null): VoicedLine[] | null {
  const [lines, setLines] = useState<{ id: string; lines: VoicedLine[] } | null>(null);
  const joined = texts?.join('\n') ?? '';
  useEffect(() => {
    if (id === null || !joined || typeof crypto === 'undefined' || !crypto.subtle) { setLines(null); return; }
    let live = true;
    const all = joined.split('\n');
    void Promise.all(all.map(reasonAudioKey)).then((ks) => {
      if (!live) return;
      setLines({ id, lines: ks.map((k, i) => ({ text: all[i], audioUrl: `${AUDIO_BASE}${k}.mp3`, cuesUrl: `${AUDIO_BASE}${k}.json` })) });
    });
    return () => { live = false; };
  }, [id, joined]);
  return lines && lines.id === id ? lines.lines : null;
}
