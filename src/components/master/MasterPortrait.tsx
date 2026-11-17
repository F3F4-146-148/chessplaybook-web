import { useEffect, useRef, useState } from 'react';

import { MASTER_LIVE } from '@/design/designFlags';
import {
  MASTER_POSES,
  masterLayer,
  masterSrcSet,
  masterWidths,
  type MasterExpression,
  type MasterFacing,
  type MasterLayer,
  type MasterPose,
  type MasterVariant,
} from './masterAssets';
import { MOUTH_LEAD_S, shapeAt, type MasterSpeech, type MouthShape } from './speech';

/**
 * THE MASTER'S PORTRAIT (MASTER_CHARACTER_IMPLEMENTATION_PLAN A2, #186; talking: TALKING_MASTER C1, #298).
 *
 * Decorative: the words he would say are always on the page in text, so the picture has an empty `alt` and is
 * hidden from assistive technology. It renders NOTHING when `MASTER_LIVE` is off or the visitor has turned him
 * off (`show={false}`), so every page is exactly today's without him.
 *
 * A change of expression cross-fades over 200 ms: the previous picture stays underneath while the new one fades
 * in, then is dropped. With reduced motion the change is instant. The box is a fixed square of `size`, so a new
 * expression can never move anything around it (the Workspace contract).
 *
 * Each pose (every expression but 'speaking') carries six drawn mouths and two blink frames, placed on the pose by
 * `masterLayer`. All eight are loaded with the pose and kept transparent, so a change of mouth never waits on the
 * network. While `speech` plays, the mouth follows its cues on the audio's own clock; he blinks every 2-6 s; and
 * the whole figure breathes very slowly (owner T5: no nod or sway), which reduced motion turns off. The blink is a
 * picture change, not motion, so it stays.
 */
export interface MasterPortraitProps {
  expression: MasterExpression;
  variant: MasterVariant;
  /** Which side the board is on, seen from him: `left` uses the pictures as made, `right` mirrors them. */
  facing: MasterFacing;
  /** Drawn width and height in CSS pixels. */
  size: number;
  /** The visitor's "Show the Master" choice; defaults to shown. */
  show?: boolean;
  /** Change expression at once, without the cross-fade. */
  instant?: boolean;
  /**
   * Fill the box the parent gives (B1: the puzzles live card sizes him from its own free height in CSS);
   * `size` then only picks the picture files, so give the largest size the box can reach.
   */
  fluid?: boolean;
  /** His recording while it plays, and its mouth cues: the mouth follows them. */
  speech?: MasterSpeech | null;
  className?: string;
}

const FADE_MS = 200;
const MOUTHS: MouthShape[] = ['A', 'E', 'O', 'U', 'F', 'M'];
/** half 40 ms, shut 80 ms, half 45 ms (plan C1, the sample's blink) */
const BLINK: Array<['half' | 'shut' | null, number]> = [['half', 0], ['shut', 40], ['half', 120], [null, 165]];

const isPose = (e: MasterExpression): e is MasterPose => (MASTER_POSES as readonly string[]).includes(e);

function useBlink(enabled: boolean) {
  const [eyes, setEyes] = useState<'half' | 'shut' | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let next: ReturnType<typeof setTimeout>;
    const schedule = () => {
      next = setTimeout(() => {
        for (const [frame, at] of BLINK) timers.push(setTimeout(() => setEyes(frame), at));
        schedule();
      }, 2000 + Math.random() * 4000);
    };
    schedule();
    return () => {
      clearTimeout(next);
      timers.forEach(clearTimeout);
      setEyes(null);
    };
  }, [enabled]);
  return eyes;
}

function useMouthShape(speech: MasterSpeech | null | undefined): MouthShape {
  const [shape, setShape] = useState<MouthShape>('X');
  useEffect(() => {
    if (!speech) { setShape('X'); return; }
    let raf = 0;
    const frame = () => {
      const { audio, cues } = speech;
      setShape(audio.paused || audio.ended ? 'X' : shapeAt(cues, audio.currentTime + MOUTH_LEAD_S));
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); setShape('X'); };
  }, [speech]);
  return shape;
}

export function MasterPortrait({ expression, variant, facing, size, show = true, instant = false, fluid = false, speech, className }: MasterPortraitProps) {
  const [current, setCurrent] = useState(expression);
  const [previous, setPrevious] = useState<MasterExpression | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visible = MASTER_LIVE && show;
  const eyes = useBlink(visible && isPose(current));
  const mouth = useMouthShape(visible ? speech : null);

  useEffect(() => {
    if (expression === current) return;
    setPrevious(instant ? null : current);
    setCurrent(expression);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setPrevious(null), FADE_MS);
  }, [expression, current, instant]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  if (!visible) return null;

  const base = (name: MasterExpression, fading: boolean) => {
    const { src, srcSet } = masterSrcSet(name, variant, size, facing);
    return (
      <img
        key={name}
        src={src}
        srcSet={srcSet}
        alt=""
        width={size}
        height={size}
        decoding="async"
        draggable={false}
        data-master-base={name}
        className={`absolute inset-0 h-full w-full select-none object-contain object-bottom ${fading ? '' : 'animate-[master-fade-in_200ms_ease-out] motion-reduce:animate-none'}`}
      />
    );
  };

  const layer = (pose: MasterPose, name: MasterLayer, on: boolean, fades: boolean) => {
    const { one, two } = masterWidths(variant, size);
    const a = masterLayer(pose, name, variant, one, facing);
    const b = two !== one ? masterLayer(pose, name, variant, two, facing) : null;
    return (
      <img
        key={`${pose}-${name}`}
        src={a.src}
        srcSet={b ? `${a.src} 1x, ${b.src} 2x` : undefined}
        alt=""
        decoding="async"
        draggable={false}
        data-master-layer={name}
        data-on={on ? 'true' : undefined}
        className={`absolute select-none ${fades ? 'transition-opacity duration-[50ms] motion-reduce:transition-none' : ''}`}
        style={{ left: `${a.left * 100}%`, top: `${a.top * 100}%`, width: `${a.width * 100}%`, opacity: on ? 1 : 0 }}
      />
    );
  };

  return (
    <span
      aria-hidden="true"
      data-master-portrait={current}
      data-master-mouth={mouth}
      className={`relative inline-block shrink-0 ${fluid ? 'h-full w-full ' : ''}${className ?? ''}`}
      style={{ ...(fluid ? {} : { width: size, height: size }), containerType: 'size' }}
    >
      {/* the picture's own square, fitted to the box like object-contain object-bottom, so the layers land on it */}
      <span className="master-figure absolute bottom-0 left-1/2 aspect-square -translate-x-1/2" style={{ width: 'min(100cqw, 100cqh)' }}>
        {previous && previous !== current ? base(previous, true) : null}
        {base(current, instant)}
        {isPose(current) && (
          <>
            {MOUTHS.map((s) => layer(current, `mouth-${s}` as MasterLayer, mouth === s, true))}
            {layer(current, 'eyes-half', eyes === 'half', false)}
            {layer(current, 'eyes-shut', eyes === 'shut', false)}
          </>
        )}
      </span>
    </span>
  );
}
