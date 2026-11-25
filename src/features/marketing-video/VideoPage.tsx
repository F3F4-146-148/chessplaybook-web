import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Key } from '@lichess-org/chessground/types';
import { ChessBoard } from '@/components/chess/ChessBoard';
import { masterLayer, masterSrc, type MasterFacing } from '@/components/master/masterAssets';
import { boardMarks, reasonBrushes } from '@/features/openings/reasonBoardMarks';
import { buildTimeline, type Frame, type Timeline } from './timeline';
import { VIDEO_SCRIPTS, resolveScript } from './scripts';

/**
 * THE VIDEO PAGE (marketing videos plan A2, dev only). It draws one frame of a video for a given time and plays
 * nothing: `scripts/video/render.mjs` sets the time, screenshots the frame element and lays the sound from the same
 * timeline. Everything on it is the site's own: the board, the trainer's marks, the Master's pose and mouth layers.
 *
 * `/dev/video?script=sample` · `window.__videoSetT(t)` resolves once the frame is drawn ·
 * `window.__videoTimeline` holds the clips and the length.
 */

declare global {
  interface Window {
    __videoSetT?: (t: number) => Promise<void>;
    __videoTimeline?: { duration: number; fps: number; frames: number; clips: Timeline['clips']; captions: Array<{ from: number; to: number; text: string }> };
    __videoError?: string;
  }
}

const SIZES = { '9x16': { w: 540, h: 960 }, '16x9': { w: 960, h: 540 } } as const;
const POSE = 'talking' as const;
const HEAD_W = 224;
const FACING: MasterFacing = 'right'; // mirrored: he looks right, towards the caption and the board's centre

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

async function preload(urls: string[]) {
  await Promise.all(urls.map(async (u) => {
    const img = new Image();
    img.src = u;
    try { await img.decode(); } catch { /* drawn when it arrives */ }
  }));
}

function captionsOf(tl: Timeline): Array<{ from: number; to: number; text: string }> {
  const out: Array<{ from: number; to: number; text: string }> = [];
  let last: { from: number; to: number; text: string } | null = null;
  for (let n = 0; n < tl.frames; n++) {
    const f = tl.frameAt(n / tl.fps);
    if (f.caption && last && last.text === f.caption) { last.to = (n + 1) / tl.fps; continue; }
    if (f.caption) { last = { from: n / tl.fps, to: (n + 1) / tl.fps, text: f.caption }; out.push(last); } else last = null;
  }
  return out;
}

function Master({ frame, size }: { frame: Frame; size: number }) {
  const mouth = frame.mouth === 'X' ? null : masterLayer(POSE, `mouth-${frame.mouth}`, 'head', HEAD_W, FACING);
  const eyes = frame.blink ? masterLayer(POSE, 'eyes-shut', 'head', HEAD_W, FACING) : null;
  const layer = (l: ReturnType<typeof masterLayer>) => (
    <img src={l.src} alt="" className="absolute" style={{ left: `${l.left * 100}%`, top: `${l.top * 100}%`, width: `${l.width * 100}%`, height: `${l.height * 100}%` }} />
  );
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <img src={masterSrc(POSE, 'head', HEAD_W, FACING)} alt="" className="absolute inset-0 h-full w-full" />
      {mouth && layer(mouth)}
      {eyes && layer(eyes)}
    </div>
  );
}

export default function VideoPage() {
  const [params] = useSearchParams();
  const script = VIDEO_SCRIPTS[params.get('script') ?? 'sample'];
  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const [error, setError] = useState<string | null>(script ? null : `no script "${params.get('script')}"`);
  const [t, setT] = useState(0);

  useEffect(() => {
    if (!script) return;
    let live = true;
    (async () => {
      const scenes = await resolveScript(script, async (url) => {
        const r = await fetch(url);
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      });
      const tl = buildTimeline(scenes);
      const layers = ['mouth-A', 'mouth-E', 'mouth-O', 'mouth-U', 'mouth-F', 'mouth-M', 'eyes-shut'] as const;
      await preload([masterSrc(POSE, 'head', HEAD_W, FACING), ...layers.map((l) => masterLayer(POSE, l, 'head', HEAD_W, FACING).src)]);
      await document.fonts.ready;
      if (!live) return;
      setTimeline(tl);
      window.__videoTimeline = { duration: tl.duration, fps: tl.fps, frames: tl.frames, clips: tl.clips, captions: captionsOf(tl) };
    })().catch((e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e);
      window.__videoError = msg;
      if (live) setError(msg);
    });
    return () => { live = false; };
  }, [script]);

  useEffect(() => {
    window.__videoSetT = async (time: number) => { setT(time); await nextFrame(); };
    return () => { delete window.__videoSetT; };
  }, []);

  const frame = timeline?.frameAt(t) ?? null;
  const brushes = useMemo(() => reasonBrushes(), []);
  const marks = useMemo(() => boardMarks(frame?.marks ?? null, frame?.mover ?? 'white'), [frame?.marks, frame?.mover]);
  const size = SIZES[script?.format ?? '9x16'];

  if (error) return <pre className="m-8 whitespace-pre-wrap text-destructive">{error}</pre>;
  if (!frame) return <p className="m-8 text-muted-foreground">Loading the video...</p>;

  const card = frame.kind === 'card';
  return (
    <div className="flex justify-center p-4">
      <div
        data-video-frame
        className="relative overflow-hidden bg-background font-sans text-foreground"
        style={{ width: size.w, height: size.h }}
      >
        {/* the goal or move, at the top */}
        <div className="absolute inset-x-0 top-0 flex h-[118px] flex-col items-center justify-center px-6 text-center">
          {!card && frame.step && <p className="text-[18px] font-medium text-muted-foreground">{frame.step}</p>}
          {!card && frame.title && <p className="text-[30px] font-semibold leading-tight">{frame.title}</p>}
        </div>

        <div className="absolute left-1/2 top-[122px] -translate-x-1/2" style={{ opacity: card ? 0.35 : 1 }}>
          <ChessBoard
            fen={frame.fen}
            lastMove={frame.lastMove ? (frame.lastMove as Key[]) : undefined}
            viewOnly
            coordinates={false}
            animationDuration={0}
            size={470}
            shapes={card ? [] : marks.shapes}
            brushes={brushes}
            squareClasses={card ? new Map() : marks.squares}
          />
        </div>

        {card && frame.title && (
          <div className="absolute inset-x-0 top-[122px] flex h-[470px] items-center justify-center px-10 text-center">
            <p className="text-[46px] font-bold leading-tight">{frame.title}</p>
          </div>
        )}

        {/* the Master and what he is saying; the bottom fifth stays empty (the platforms' buttons) */}
        <div className="absolute inset-x-0 top-[608px] flex h-[160px] items-start gap-4 px-6">
          <Master frame={frame} size={140} />
          <p className="pt-2 text-[27px] font-medium leading-snug">{frame.caption ?? ''}</p>
        </div>
      </div>
    </div>
  );
}
