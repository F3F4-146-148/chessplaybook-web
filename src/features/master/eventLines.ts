import lines from './eventLines.json';
import type { MasterLine } from './narrationApi';

/**
 * WHAT THE MASTER SAYS AT THE START AND END OF A GAME (#186, owner 2026-11-16).
 *
 * A closed list, like his move sentences: `eventLines.json` holds each line and the name of its recording (the
 * same key the server gives a move sentence, `audioKey` in backend/src/services/master/narration.ts).
 * `backend/scripts/master/synthesize-kokoro.ts` reads this file and records any line not yet recorded, so a line
 * added here needs one more run of that script and an upload before it can be heard (until then he shows it and
 * stays silent). Never anything about the player's mistakes: those are a face, never words (owner, D9).
 */
export type MasterEvent = keyof typeof lines;

/** George's voice and its mouth cues (#298), the same folder the server's `MASTER_AUDIO_BASE` names. */
const AUDIO_BASE = '/audio/master-v2/';

/** A fixed line of his with its recording and mouth cues, by the recording's name (`audioKey` of the text). */
export function voicedLine(text: string, key: string): MasterLine {
  return { text, audioUrl: `${AUDIO_BASE}${key}.mp3`, cuesUrl: `${AUDIO_BASE}${key}.json` };
}

/** One of the event's lines, chosen by `pick` (a number fixed per game), with its recording and mouth cues. */
export function eventLine(event: MasterEvent, pick: number): MasterLine {
  const options = lines[event];
  const { text, key } = options[Math.abs(Math.floor(pick)) % options.length];
  return voicedLine(text, key);
}

/** Every event line, for the test and the recording script. */
export function allEventLines(): { text: string; key: string }[] {
  return Object.values(lines).flat();
}
