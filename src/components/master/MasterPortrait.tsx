import { useEffect, useRef, useState } from 'react';

import { MASTER_LIVE } from '@/design/designFlags';
import { masterSrcSet, type MasterExpression, type MasterFacing, type MasterVariant } from './masterAssets';

/**
 * THE MASTER'S PORTRAIT (MASTER_CHARACTER_IMPLEMENTATION_PLAN A2, #186).
 *
 * Decorative: the words he would say are always on the page in text, so the picture has an empty `alt` and is
 * hidden from assistive technology. It renders NOTHING when `MASTER_LIVE` is off or the visitor has turned him
 * off (`show={false}`), so every page is exactly today's without him.
 *
 * A change of expression cross-fades over 200 ms: the previous picture stays underneath while the new one fades
 * in, then is dropped. With reduced motion the change is instant. The box is a fixed square of `size`, so a new
 * expression can never move anything around it (the Workspace contract).
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
  /** Change expression at once, without the cross-fade: the mouth frames while he speaks (D8). */
  instant?: boolean;
  className?: string;
}

const FADE_MS = 200;

export function MasterPortrait({ expression, variant, facing, size, show = true, instant = false, className }: MasterPortraitProps) {
  const [current, setCurrent] = useState(expression);
  const [previous, setPrevious] = useState<MasterExpression | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (expression === current) return;
    setPrevious(instant ? null : current);
    setCurrent(expression);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setPrevious(null), FADE_MS);
  }, [expression, current, instant]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  if (!MASTER_LIVE || !show) return null;

  const layer = (name: MasterExpression, fading: boolean) => {
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
        className={`absolute inset-0 h-full w-full select-none ${fading ? '' : 'animate-[master-fade-in_200ms_ease-out] motion-reduce:animate-none'}`}
      />
    );
  };

  return (
    <span
      aria-hidden="true"
      data-master-portrait={current}
      className={`relative inline-block shrink-0 ${className ?? ''}`}
      style={{ width: size, height: size }}
    >
      {previous && previous !== current ? layer(previous, true) : null}
      {layer(current, instant)}
    </span>
  );
}
