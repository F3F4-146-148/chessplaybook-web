import type { Key } from '@lichess-org/chessground/types';

/**
 * #324: the board marks of one reason, as the server sent them ("f3d4 e5 !d6": 4 characters an arrow, 2 a tinted
 * square, "!" a square of the other side; backend reasonMarks.ts). Nothing is worked out here: the page only draws
 * what it was given (ruling R1).
 *
 * THE COLOURS ARE THE SIDES' (owner, 2026-11-18, after reviewing 78 positions): White's marks blue, Black's red,
 * whoever moved. The plain marks are the mover's; a "!" square is the other side's (the pawn a move stops, a pawn or
 * piece it attacks, the part of a file or diagonal from the other side's first pawn on). This replaces Chess.com's
 * coach colours (orange the idea, red a threat, blue the other side), which read as "red is Black" on the cards.
 */
export type Side = 'white' | 'black';
type Tone = 'white' | 'black';

export interface BoardMarks {
  shapes: Array<{ orig: Key; dest?: Key; brush: string }>;
  squares: Map<Key, string>;
}

export const NO_MARKS: BoardMarks = { shapes: [], squares: new Map() };

export function boardMarks(marks: string | undefined | null, mover: Side): BoardMarks {
  if (!marks) return NO_MARKS;
  const own: Tone = mover;
  const other: Tone = mover === 'white' ? 'black' : 'white';
  const shapes: BoardMarks['shapes'] = [];
  const squares = new Map<Key, string>();
  for (const m of marks.split(' ')) {
    if (/^[a-h][1-8][a-h][1-8]$/.test(m)) shapes.push({ orig: m.slice(0, 2) as Key, dest: m.slice(2, 4) as Key, brush: `mark-${own}` });
    else if (/^[a-h][1-8]$/.test(m)) squares.set(m as Key, `reason-mark-${own}`);
    else if (/^![a-h][1-8]$/.test(m)) squares.set(m.slice(1) as Key, `reason-mark-${other}`);
    // "~d3": a light tint (the squares a centralised knight now sees, owner 2026-11-18)
    else if (/^~[a-h][1-8]$/.test(m)) squares.set(m.slice(1) as Key, `reason-mark-soft-${own}`);
  }
  return { shapes, squares };
}

/** The arrows' brushes, one per side, their colours the `board-mark-*` roles (an SVG arrow needs a colour value). */
export function reasonBrushes(): Record<string, { color: string; opacity: number; lineWidth: number }> {
  const css = typeof document === 'undefined' ? null : getComputedStyle(document.documentElement);
  const role = (name: string) => {
    const v = css?.getPropertyValue(`--${name}`).trim();
    return v ? `hsl(${v.split(/\s+/).join(', ')})` : 'gray';
  };
  return {
    'mark-white': { color: role('board-mark-them'), opacity: 0.85, lineWidth: 11 },
    'mark-black': { color: role('board-mark'), opacity: 0.85, lineWidth: 11 },
  };
}
