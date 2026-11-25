import lines from './eventLines.json';
import type { MasterLine } from './narrationApi';
import { browserLineStore, chooseLine, noteLineUsed, type LineStore } from './lineChooser';

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
const AUDIO_BASE = '/audio/master-v3/';

/*
  THE PUZZLES CARD'S LINES HAVE THEIR OWN FOLDER (#454, owner 2026-11-23). Every one is short, Kokoro's known weak spot
  (its model card: under ~10-20 tokens), and they came out with odd sounds. They are voiced again in one pass after a
  lead-in sentence that is cut off (`synthesize-kokoro.ts --puzzles`), at 1.15, his two-sentence lines made one
  sentence. Recordings are cached for a year, so the new ones need a new folder: the old names would keep playing.
*/
export const PUZZLE_AUDIO_BASE = '/audio/master-puzzles-v1/';

/** A fixed line of his with its recording and mouth cues, by the recording's name (`audioKey` of the text). */
export function voicedLine(text: string, key: string, base: string = AUDIO_BASE): MasterLine {
  return { text, audioUrl: `${base}${key}.mp3`, cuesUrl: `${base}${key}.json` };
}

/** One of the event's lines, chosen by `pick` (a number fixed per game), with its recording and mouth cues. */
export function eventLine(event: MasterEvent, pick: number): MasterLine {
  const options = lines[event];
  const { text, key } = options[Math.abs(Math.floor(pick)) % options.length];
  return voicedLine(text, key);
}

/*
  NOT THE SAME AS LAST GAME (#401 B5): /play's start and end lines go through the same chooser as the puzzles card,
  so a player who plays several games in a session never hears the same "Good luck" twice running. Chosen once per
  game (`game` is the number /play draws for each game) and kept, so a re-render never changes it.
*/
const chosenForGame = new Map<MasterEvent, { game: number; line: MasterLine }>();

/** The event's line for this game, never the one used for that event last time. */
export function chosenEventLine(event: MasterEvent, game: number, deps: { store?: LineStore; rng?: () => number } = {}): MasterLine {
  const have = chosenForGame.get(event);
  if (have && have.game === game) return have.line;
  const store = deps.store ?? browserLineStore;
  const options = lines[event];
  const text = chooseLine(`play_${event}`, options.map((o) => o.text), store, deps.rng);
  noteLineUsed(`play_${event}`, text, store);
  const line = voicedLine(text, options.find((o) => o.text === text)!.key);
  chosenForGame.set(event, { game, line });
  return line;
}

/** Every event line, for the test and the recording script. */
export function allEventLines(): { text: string; key: string }[] {
  return Object.values(lines).flat();
}
