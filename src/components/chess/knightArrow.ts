import type { Key, Color } from '@lichess-org/chessground/types';

/**
 * A knight's move drawn as an L (owner, 2026-11-18, review note: "the traditional way... a line for two squares
 * horizontal or vertical then another square... this is the chess.com way to show arrows"). The long leg first, then
 * the short one, as Chess.com draws it.
 *
 * Chessground draws only straight arrows, so the L is a custom SVG on the origin square (one square is 100
 * units there), drawn with chessground's own arrow proportions: the line `lineWidth / 64` of a square wide, the head
 * 3 line widths long and 4 wide, ending where a straight arrow's head ends. Returns null when the move is not a
 * knight's jump.
 */
export function knightArrowSvg(orig: Key, dest: Key, orientation: Color, color: string, opacity: number, lineWidth: number): string | null {
  const df = dest.charCodeAt(0) - orig.charCodeAt(0);
  const dr = Number(dest[1]) - Number(orig[1]);
  if (!((Math.abs(df) === 1 && Math.abs(dr) === 2) || (Math.abs(df) === 2 && Math.abs(dr) === 1))) return null;
  // screen direction: x to the right, y down; the board flipped for Black
  const s = orientation === 'white' ? 1 : -1;
  const dx = df * s * 100, dy = -dr * s * 100;
  const corner = Math.abs(df) === 2 ? [dx, 0] : [0, dy];
  const ux = Math.sign(dx - corner[0]), uy = Math.sign(dy - corner[1]); // the last leg's direction
  const sw = (lineWidth / 64) * 100;
  const margin = (10 / 64) * 100; // chessground's arrowMargin
  const tipBack = margin - 0.95 * sw; // the tip of a straight arrow sits this far short of the square's centre
  const tip = [dx - ux * tipBack, dy - uy * tipBack];
  const base = [tip[0] - ux * 3 * sw, tip[1] - uy * 3 * sw];
  const half = 2 * sw;
  const wing1 = [base[0] - uy * half, base[1] + ux * half];
  const wing2 = [base[0] + uy * half, base[1] - ux * half];
  const lineEnd = [base[0] + ux * 0.5, base[1] + uy * 0.5]; // into the head, so no gap shows
  const r = (n: number) => Math.round(n * 10) / 10;
  const p = (pt: number[]) => `${r(pt[0])},${r(pt[1])}`;
  // the custom layer puts 0,0 at the origin square's top-left corner: start from its centre
  return `<g transform="translate(50,50)" opacity="${opacity}" fill="${color}" stroke="${color}">`
    + `<path d="M0,0 L${p(corner)} L${p(lineEnd)}" fill="none" stroke-width="${r(sw)}" stroke-linecap="round" stroke-linejoin="miter"/>`
    + `<path d="M${p(tip)} L${p(wing1)} L${p(wing2)} Z" stroke="none"/>`
    + `</g>`;
}
