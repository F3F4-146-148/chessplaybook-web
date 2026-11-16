import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { MASTER_EXPRESSIONS, MASTER_WIDTHS, masterSrc, masterSrcSet, type MasterVariant } from './masterAssets';

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

  it('mirrors the picture when the board is on his right', () => {
    expect(masterSrc('thinking', 'head', 112, 'left')).toBe('/assets/master-v1/master-thinking-head-112.webp');
    expect(masterSrc('thinking', 'head', 112, 'right')).toBe('/assets/master-v1/master-thinking-head-112-mirror.webp');
  });

  it('picks a 1x at least as wide as the drawn size and a 2x at least twice as wide', () => {
    expect(masterSrcSet('pleased', 'head', 62, 'left')).toEqual({
      src: '/assets/master-v1/master-pleased-head-112.webp',
      srcSet: '/assets/master-v1/master-pleased-head-112.webp 1x, /assets/master-v1/master-pleased-head-224.webp 2x',
    });
    // past the largest export, both are the largest
    expect(masterSrcSet('presenting', 'half', 400, 'left').srcSet).toBe('/assets/master-v1/master-presenting-half-600.webp');
  });
});
