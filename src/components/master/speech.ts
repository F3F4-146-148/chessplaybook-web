/**
 * The Master's mouth while he speaks (TALKING_MASTER_IMPLEMENTATION_PLAN C1, #298).
 *
 * Each recording in `audio/master-v4/` has a `.json` next to it: the mouth shape for every stretch of the
 * recording, made from the voice model's own sound timings (`backend/src/services/master/mouthCues.ts`). 'X' is
 * the pose's own closed mouth; the other six are the drawn mouth layers (`MASTER_LAYERS`).
 */
export type MouthShape = 'X' | 'A' | 'E' | 'O' | 'U' | 'F' | 'M';

export interface MouthCue {
  shape: MouthShape;
  start: number;
  end: number;
}

export interface MasterSpeech {
  audio: HTMLAudioElement;
  cues: MouthCue[];
}

/**
 * The picture is changed a little before the sound it shows (30 ms), as in the approved sample: a mouth seen
 * after its sound reads as late, one seen slightly before does not.
 */
export const MOUTH_LEAD_S = 0.03;

export function shapeAt(cues: MouthCue[], t: number): MouthShape {
  for (const c of cues) if (t >= c.start && t < c.end) return c.shape;
  return 'X';
}
