import { describe, expect, it } from 'vitest';
import { knightArrowSvg } from './knightArrow';

const corner = (svg: string | null) => svg?.match(/M0,0 L(-?[\d.]+),(-?[\d.]+)/)?.slice(1).map(Number);

describe('knightArrowSvg', () => {
  it('draws only a knight jump', () => {
    expect(knightArrowSvg('d2', 'd4', 'white', 'red', 1, 11)).toBeNull();
    expect(knightArrowSvg('c1', 'f4', 'white', 'red', 1, 11)).toBeNull();
    expect(knightArrowSvg('g1', 'f3', 'white', 'red', 1, 11)).not.toBeNull();
  });
  it('goes along the long leg first, as Chess.com does', () => {
    expect(corner(knightArrowSvg('c6', 'd4', 'white', 'red', 1, 11))).toEqual([0, 200]); // down two, then right
    expect(corner(knightArrowSvg('f3', 'd4', 'white', 'red', 1, 11))).toEqual([-200, 0]); // left two, then up
  });
  it('turns with the board', () => {
    expect(corner(knightArrowSvg('c6', 'd4', 'black', 'red', 1, 11))).toEqual([0, -200]);
    expect(corner(knightArrowSvg('f3', 'd4', 'black', 'red', 1, 11))).toEqual([200, 0]);
  });
});
