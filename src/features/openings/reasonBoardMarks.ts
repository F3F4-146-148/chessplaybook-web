import type { Key } from '@lichess-org/chessground/types';
import { reasonKind } from './reasonKinds';

/**
 * #324: the board marks of one reason, as the server sent them ("f3d4 e5 !d6": 4 characters an arrow, 2 a tinted
 * square, "!" a square of the other side; backend reasonMarks.ts). Nothing is worked out here: the page only draws
 * what it was given (ruling R1).
 *
 * THE COLOURS ARE CHESS.COM'S COACH'S (owner, 2026-11-18: use the language players already know). Its Game Review
 * says: orange "the main idea your Coach is explaining for that move, including opening theory", red "a threat,
 * tactical danger, or problem in the position", blue "your opponent's plans or possible responses", and highlighted
 * squares "follow the same color system as arrows". So:
 * - the move's idea: orange; a threat or an attack (the reason's kind is threats and tactics): red;
 * - the other side's pieces the reason names: blue;
 * - explaining the opponent's move, its idea is the opponent's plan, blue, and our pieces it names are orange.
 */
type Tone = 'idea' | 'threat' | 'them';

export interface BoardMarks {
  shapes: Array<{ orig: Key; dest?: Key; brush: string }>;
  squares: Map<Key, string>;
}

export const NO_MARKS: BoardMarks = { shapes: [], squares: new Map() };

export function boardMarks(marks: string | undefined | null, key: string | undefined, theirMove = false): BoardMarks {
  if (!marks) return NO_MARKS;
  const threat = reasonKind(key) === 'threat';
  // the mover's marks, and the other side's, as tones (the opponent's idea is blue, our pieces then orange)
  const mover: Tone = threat ? 'threat' : theirMove ? 'them' : 'idea';
  const other: Tone = theirMove ? 'idea' : 'them';
  const shapes: BoardMarks['shapes'] = [];
  const squares = new Map<Key, string>();
  for (const m of marks.split(' ')) {
    if (/^[a-h][1-8][a-h][1-8]$/.test(m)) shapes.push({ orig: m.slice(0, 2) as Key, dest: m.slice(2, 4) as Key, brush: `mark-${mover}` });
    else if (/^[a-h][1-8]$/.test(m)) squares.set(m as Key, `reason-mark-${mover}`);
    else if (/^![a-h][1-8]$/.test(m)) squares.set(m.slice(1) as Key, `reason-mark-${other}`);
  }
  return { shapes, squares };
}

/** The arrows' brushes, one per tone, their colours the `board-mark-*` roles (an SVG arrow needs a colour value). */
export function reasonBrushes(): Record<string, { color: string; opacity: number; lineWidth: number }> {
  const css = typeof document === 'undefined' ? null : getComputedStyle(document.documentElement);
  const role = (name: string) => {
    const v = css?.getPropertyValue(`--${name}`).trim();
    return v ? `hsl(${v.split(/\s+/).join(', ')})` : 'gray';
  };
  return {
    'mark-idea': { color: role('board-mark-idea'), opacity: 0.85, lineWidth: 11 },
    'mark-threat': { color: role('board-mark'), opacity: 0.85, lineWidth: 11 },
    'mark-them': { color: role('board-mark-them'), opacity: 0.85, lineWidth: 11 },
  };
}
