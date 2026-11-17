import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { MASTER_EXPRESSIONS, MASTER_LAYERS, MASTER_POSES, MASTER_WIDTHS, masterIcon, masterLayer, masterSrc, masterSrcSet, type MasterVariant } from './masterAssets';

const PUBLIC = resolve(__dirname, '../../../public');

describe('the Master\'s pictures', () => {
  it('every picture the code can ask for exists in public/', () => {
    const missing: string[] = [];
    for (const expression of MASTER_EXPRESSIONS) {
      for (const variant of Object.keys(MASTER_WIDTHS) as MasterVariant[]) {
        for (const width of MASTER_WIDTHS[variant]) {
          for (const facing of ['left', 'right'] as const) {
            const src = masterSrc(expression, variant, width, facing);
            if (!existsSync(resolve(PUBLIC, src.slice(1)))) missing.push(src);
          }
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('his button face exists at 1x, 2x and 3x', () => {
    const { src, srcSet } = masterIcon();
    const files = [src, ...srcSet.split(', ').map((s) => s.split(' ')[0])];
    expect(files.filter((f) => !existsSync(resolve(PUBLIC, f.slice(1))))).toEqual([]);
    expect(srcSet).toMatch(/icon-b-108\.webp 3x$/);
  });

  it('every mouth and blink layer exists, and its box lies inside its pose', () => {
    const missing: string[] = [];
    const outside: string[] = [];
    for (const pose of MASTER_POSES) {
      for (const layer of MASTER_LAYERS) {
        for (const variant of Object.keys(MASTER_WIDTHS) as MasterVariant[]) {
          for (const width of MASTER_WIDTHS[variant]) {
            for (const facing of ['left', 'right'] as const) {
              const l = masterLayer(pose, layer, variant, width, facing);
              if (!existsSync(resolve(PUBLIC, l.src.slice(1)))) missing.push(l.src);
              if (l.left < 0 || l.top < 0 || l.left + l.width > 1.0001 || l.top + l.height > 1.0001) outside.push(l.src);
            }
          }
        }
      }
    }
    expect(missing).toEqual([]);
    expect(outside).toEqual([]);
  });

  it('flips the box of a layer with the picture', () => {
    const left = masterLayer('talking', 'mouth-A', 'head', 224, 'left');
    const right = masterLayer('talking', 'mouth-A', 'head', 224, 'right');
    expect(right.src).toBe('/assets/master-v4/master-talking-mouth-A-head-224-mirror.webp');
    expect(right.left).toBeCloseTo(1 - left.left - left.width);
    expect(right.top).toBe(left.top);
  });

  it('mirrors the picture when the board is on his right', () => {
    expect(masterSrc('thinking', 'head', 112, 'left')).toBe('/assets/master-v4/master-thinking-head-112.webp');
    expect(masterSrc('thinking', 'head', 112, 'right')).toBe('/assets/master-v4/master-thinking-head-112-mirror.webp');
  });

  it('picks a 1x at least as wide as the drawn size and a 2x at least twice as wide', () => {
    expect(masterSrcSet('pleased', 'head', 62, 'left')).toEqual({
      src: '/assets/master-v4/master-pleased-head-112.webp',
      srcSet: '/assets/master-v4/master-pleased-head-112.webp 1x, /assets/master-v4/master-pleased-head-224.webp 2x',
    });
    // past the largest export, both are the largest
    expect(masterSrcSet('presenting', 'half', 400, 'left').srcSet).toBe('/assets/master-v4/master-presenting-half-600.webp');
  });
});
