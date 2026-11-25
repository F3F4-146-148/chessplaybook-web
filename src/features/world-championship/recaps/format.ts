/** How a recap prints the engine's facts (src/pages/WorldChampionship2026Recap.tsx). */

import type { EngineView } from './types';

/** "+0.35", "−6.06", "White mates in 3": White's view, as the bake stores it (a mate's sign says who mates). */
export function formatEval(v: EngineView): string {
  if (v.mate !== undefined) return `${v.eval > 0 ? 'White' : 'Black'} mates in ${Math.abs(v.mate)}`;
  const e = Math.round(v.eval * 100) / 100;
  return `${e > 0 ? '+' : e < 0 ? '−' : ''}${Math.abs(e).toFixed(2)}`;
}

/** A line of SAN moves with move numbers, starting at `moveNumber` with `color` to move: "55...Rxf2 56.Kxf2 Bd5". */
export function formatLine(line: string[], moveNumber: number, color: 'white' | 'black', max = 6): string {
  let n = moveNumber;
  let white = color === 'white';
  return line.slice(0, max).map((san, i) => {
    const text = white ? `${n}.${san}` : i === 0 ? `${n}...${san}` : san;
    if (!white) n += 1;
    white = !white;
    return text;
  }).join(' ');
}
