import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REASON_KIND, reasonKind } from './reasonKinds';

/** Every reason key the backend explainer can emit: the first element of each `['key', 'a sentence']` reason tuple
 *  (the second element holds a space, which keeps out word lists such as `['first', 'second', ...]`). */
function backendKeys(): string[] {
  const src = readFileSync(resolve(__dirname, '../../../backend/src/services/openings/OpeningMoveExplainer.ts'), 'utf8');
  const keys = new Set<string>();
  for (const m of src.matchAll(/\[\s*'([a-z_]{3,})'\s*,\s*[`'"]([^`'"\n]*)/g)) if (/\s/.test(m[2]) || m[2].startsWith('${')) keys.add(m[1]);
  return [...keys];
}

describe('reason kinds (#177)', () => {
  it('files every reason key the backend explainer emits', () => {
    const keys = backendKeys();
    expect(keys.length).toBeGreaterThan(60);
    expect(keys.filter((k) => !(k in REASON_KIND))).toEqual([]);
  });

  it('a key never seen falls back to development and activity', () => {
    expect(reasonKind('no_such_key')).toBe('development');
    expect(reasonKind(undefined)).toBe('development');
  });

  it('files the kinds of the owner-approved option B page as shown', () => {
    expect(reasonKind('attacks')).toBe('threat');
    expect(reasonKind('centre')).toBe('centre');
    expect(reasonKind('clears')).toBe('development');
    expect(reasonKind('defends')).toBe('king');
    expect(reasonKind('gambit')).toBe('structure');
  });
});
