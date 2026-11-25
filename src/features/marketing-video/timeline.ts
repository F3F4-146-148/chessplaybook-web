import { Chess } from 'chessops/chess';
import { makeFen, parseFen } from 'chessops/fen';
import { parseUci } from 'chessops/util';
import { MOUTH_LEAD_S, shapeAt, type MouthCue, type MouthShape } from '@/components/master/speech';

/**
 * A VIDEO AS A FUNCTION OF TIME (marketing videos plan A1, #331, #347).
 *
 * The video page draws `frameAt(t)` and a script takes one screenshot per frame; the sound is laid from `clips`. Both
 * come from this one timeline, so the Master's mouth and his voice cannot drift apart, and nothing plays in real
 * time. Nothing here touches the DOM: it is the same arithmetic in the page, the renderer and the tests.
 *
 * His lines are spaced exactly as the site plays them (`useMasterVoice`): each recording starts 0.04 s before its
 * first word and ends 0.06 s after its last, from its mouth cues, with 0.2 s between lines.
 */

export const FPS = 30;
const LEAD_S = 0.04;
const TAIL_S = 0.06;
export const BETWEEN_LINES_S = 0.2;
const BLINK_EVERY_S = 4.1;
const BLINK_S = 0.15;

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** One thing he says. `key` is the recording's name (sha1 of the shown text, 16 hex), `cues` its mouth cues. */
export interface VideoLine {
  text: string;
  key: string;
  cues: MouthCue[];
  /** The reasons' marks format ("f3d4 e5 !d6"), drawn while he says it. */
  marks?: string;
  /** UCI moves played while he says it, spread evenly over his words. */
  plies?: string[];
  /** Seconds of silence after the line (default: the site's gap between lines). */
  pauseAfter?: number;
  /** Shown instead of `text` as the caption (for example a reply's SAN under a silent move). */
  caption?: string;
}

/** A silent beat: moves played with no voice (an opponent's reply), or a pause. */
export interface VideoBeat {
  silent: true;
  duration: number;
  plies?: string[];
  marks?: string;
  caption?: string;
}

export interface VideoScene {
  kind: 'card' | 'board' | 'page';
  /** Large text: the card's title, or the goal or move named on a board scene. */
  title?: string;
  /** Small text under the title, or the step count on a board scene ("1 of 6"). */
  step?: string;
  /** Start the board from this position (otherwise it continues from the previous scene). */
  fen?: string;
  /** A list shown on the scene; `ticked` items are drawn checked, one more as each line starts. */
  list?: { items: string[]; tickPerLine: boolean };
  items: Array<VideoLine | VideoBeat>;
  /** Minimum length of the scene, for cards with no voice. */
  minDuration?: number;
}

export interface Clip { key: string; at: number; from: number; to: number }

export interface Frame {
  t: number;
  scene: number;
  kind: VideoScene['kind'];
  title?: string;
  step?: string;
  caption: string | null;
  fen: string;
  lastMove: [string, string] | null;
  marks: string | null;
  mover: 'white' | 'black';
  mouth: MouthShape;
  blink: boolean;
  list: { items: string[]; ticked: number } | null;
}

export interface Timeline {
  fps: number;
  duration: number;
  clips: Clip[];
  frameAt(t: number): Frame;
  frames: number;
}

/** The part of a recording he is heard saying, from its cues (as the site plays it). */
export function spokenSpan(cues: MouthCue[]): { from: number; to: number } {
  const spoken = cues.filter((c) => c.shape !== 'X');
  if (spoken.length === 0) {
    const end = cues.length ? cues[cues.length - 1].end : 0;
    return { from: 0, to: end };
  }
  return { from: Math.max(0, spoken[0].start - LEAD_S), to: spoken[spoken.length - 1].end + TAIL_S };
}

interface Segment {
  scene: number;
  start: number;
  end: number;
  speech: { key: string; from: number; cues: MouthCue[] } | null;
  text: string | null;
  marks: string | null;
  plyTimes: number[];
  fens: string[];
  moves: Array<[string, string]>;
  fenBefore: string;
  lineIndex: number;
}

function isBeat(item: VideoLine | VideoBeat): item is VideoBeat {
  return (item as VideoBeat).silent === true;
}

function playPlies(fen: string, plies: string[]): { fens: string[]; moves: Array<[string, string]> } {
  const pos = Chess.fromSetup(parseFen(fen).unwrap()).unwrap();
  const fens: string[] = [];
  const moves: Array<[string, string]> = [];
  for (const uci of plies) {
    const move = parseUci(uci);
    if (!move || !pos.isLegal(move)) throw new Error(`illegal move ${uci} in ${makeFen(pos.toSetup())}`);
    pos.play(move);
    fens.push(makeFen(pos.toSetup()));
    moves.push([uci.slice(0, 2), uci.slice(2, 4)]);
  }
  return { fens, moves };
}

export function buildTimeline(scenes: VideoScene[]): Timeline {
  const segments: Segment[] = [];
  const sceneSpans: Array<{ start: number; end: number }> = [];
  const clips: Clip[] = [];
  let t = 0;
  let fen = START_FEN;

  scenes.forEach((scene, s) => {
    const sceneStart = t;
    if (scene.fen) fen = scene.fen;
    let lineIndex = 0;
    for (const item of scene.items) {
      const plies = item.plies ?? [];
      const { fens, moves } = playPlies(fen, plies);
      const start = t;
      let end: number;
      let speech: Segment['speech'] = null;
      let plyFrom: number;
      let plyTo: number;
      if (isBeat(item)) {
        end = t + item.duration;
        plyFrom = start;
        plyTo = start + item.duration * 0.5;
      } else {
        const span = spokenSpan(item.cues);
        const length = span.to - span.from;
        end = start + length;
        speech = { key: item.key, from: span.from, cues: item.cues };
        clips.push({ key: item.key, at: start, from: span.from, to: span.to });
        plyFrom = start;
        plyTo = end;
      }
      // plies spread evenly over the item: the first at its start, the last before its end
      const n = plies.length;
      const plyTimes = plies.map((_, i) => plyFrom + ((plyTo - plyFrom) * i) / Math.max(1, n));
      segments.push({
        scene: s, start, end, speech,
        text: isBeat(item) ? item.caption ?? null : item.caption ?? item.text,
        marks: item.marks ?? null,
        plyTimes, fens, moves, fenBefore: fen, lineIndex,
      });
      if (fens.length) fen = fens[fens.length - 1];
      t = end + (isBeat(item) ? 0 : item.pauseAfter ?? BETWEEN_LINES_S);
      if (!isBeat(item)) lineIndex += 1;
    }
    if (scene.minDuration && t - sceneStart < scene.minDuration) t = sceneStart + scene.minDuration;
    sceneSpans.push({ start: sceneStart, end: t });
  });

  const duration = t;

  function frameAt(time: number): Frame {
    const tt = Math.max(0, Math.min(time, duration));
    let s = sceneSpans.findIndex((sp) => tt >= sp.start && tt < sp.end);
    if (s < 0) s = scenes.length - 1;
    const scene = scenes[s];
    const inScene = segments.filter((g) => g.scene === s);
    // the segment now, or the last one already started in this scene (its board and caption stay up in the pause)
    let current: Segment | null = null;
    for (const g of inScene) if (g.start <= tt) current = g;

    let fenNow = scene.fen ?? (inScene[0]?.fenBefore ?? START_FEN);
    let lastMove: [string, string] | null = null;
    // the board: every ply of this scene's segments up to now
    for (const g of inScene) {
      if (g.start > tt) break;
      fenNow = g.fenBefore;
      g.plyTimes.forEach((pt, i) => {
        if (pt <= tt) { fenNow = g.fens[i]; lastMove = g.moves[i]; }
      });
    }
    if (inScene.length === 0) {
      // a scene with nothing in it shows the previous scene's last position
      const before = segments.filter((g) => g.scene < s);
      const last = before[before.length - 1];
      if (last && !scene.fen) fenNow = last.fens.length ? last.fens[last.fens.length - 1] : last.fenBefore;
    }

    let mouth: MouthShape = 'X';
    if (current?.speech && tt < current.end) {
      mouth = shapeAt(current.speech.cues, current.speech.from + (tt - current.start) + MOUTH_LEAD_S);
    }
    const blink = tt % BLINK_EVERY_S > BLINK_EVERY_S - BLINK_S;
    // whose move the marks belong to: the side that just moved; White before any move (the welcome's goals)
    const mover: Frame['mover'] = lastMove === null ? 'white' : fenNow.split(' ')[1] === 'w' ? 'black' : 'white';

    let list: Frame['list'] = null;
    if (scene.list) {
      const spokenSoFar = inScene.filter((g) => g.speech && g.start <= tt).length;
      list = { items: scene.list.items, ticked: scene.list.tickPerLine ? spokenSoFar : scene.list.items.length };
    }

    return {
      t: tt,
      scene: s,
      kind: scene.kind,
      title: scene.title,
      step: scene.step,
      caption: current?.text ?? null,
      fen: fenNow,
      lastMove,
      marks: current?.marks ?? null,
      mover,
      mouth,
      blink,
      list,
    };
  }

  return { fps: FPS, duration, clips, frameAt, frames: Math.ceil(duration * FPS) };
}
