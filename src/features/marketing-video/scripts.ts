import { reasonAudioKey } from '@/features/openings/reasonVoice';
import type { MouthCue } from '@/components/master/speech';
import { START_FEN, type VideoBeat, type VideoLine, type VideoScene } from './timeline';
import { WELCOME_GOALS } from '@/features/openings/welcome';

/**
 * THE VIDEOS' SCRIPTS (marketing videos plan, #331, #347). A script is scenes of lines written as text; the page
 * finds each line's recording by the name every recording of his has (sha1 of the shown text) and loads its mouth
 * cues, then builds the timeline. Moves and marks come from the trainer's own data, never typed as a position.
 */

export type LineSpec = Omit<VideoLine, 'key' | 'cues'>;
export interface SceneSpec extends Omit<VideoScene, 'items'> { items: Array<LineSpec | VideoBeat> }
export interface VideoScript { id: string; format: '9x16' | '16x9'; scenes: SceneSpec[] }

const goal = (key: string) => {
  const g = WELCOME_GOALS.find((x) => x.key === key);
  if (!g) throw new Error(`no welcome goal ${key}`);
  return g;
};

/** A1-A4: ten seconds of existing material, to measure the method before anything new is written or voiced. */
const sample: VideoScript = {
  id: 'sample',
  format: '9x16',
  scenes: [
    { kind: 'card', title: 'Six things every good opening does', fen: START_FEN, minDuration: 2.5,
      items: [{ silent: true, duration: 2.5, plies: ['d2d4', 'd7d5', 'c1f4'] }] },
    { kind: 'board', title: goal('centre').text, step: '1 of 6', fen: START_FEN,
      items: [{ text: goal('centre').text, marks: goal('centre').marks, pauseAfter: 0.6 }] },
    { kind: 'board', title: goal('development').text, step: '2 of 6',
      items: [{ text: goal('development').text, marks: goal('development').marks, pauseAfter: 0.6 }] },
    { kind: 'board', title: goal('castle').text, step: '3 of 6',
      items: [{ text: goal('castle').text, marks: goal('castle').marks, pauseAfter: 0.8 }] },
  ],
};

export const VIDEO_SCRIPTS: Record<string, VideoScript> = { sample };

export const AUDIO_BASE = '/audio/master-v3/';

/** Every text a script says, for voicing new lines (`scripts/video/list-texts.mjs`). */
export function scriptTexts(script: VideoScript): string[] {
  const out: string[] = [];
  for (const s of script.scenes) for (const i of s.items) if (!('silent' in i)) out.push(i.text);
  return out;
}

/** The script with each line's recording found and its cues loaded; a missing recording is named, never skipped. */
export async function resolveScript(script: VideoScript, fetchJson: (url: string) => Promise<unknown>): Promise<VideoScene[]> {
  const missing: string[] = [];
  const scenes = await Promise.all(script.scenes.map(async (scene) => ({
    ...scene,
    items: await Promise.all(scene.items.map(async (item) => {
      if ('silent' in item) return item;
      const key = await reasonAudioKey(item.text);
      try {
        const cues = (await fetchJson(`${AUDIO_BASE}${key}.json`)) as MouthCue[];
        return { ...item, key, cues } as VideoLine;
      } catch {
        missing.push(`${key} "${item.text}"`);
        return { ...item, key, cues: [] } as VideoLine;
      }
    })),
  })));
  if (missing.length) throw new Error(`not recorded yet:\n${missing.join('\n')}`);
  return scenes;
}
