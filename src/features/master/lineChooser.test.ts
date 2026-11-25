import { describe, expect, it } from 'vitest';

import { avoidCount, chooseLine, memoryLineStore, noteLineUsed } from './lineChooser';

/** A seeded generator, so a failure repeats. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sequence(options: string[], n: number, seed: number): string[] {
  const store = memoryLineStore();
  const r = rng(seed);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const l = chooseLine('p', options, store, r);
    noteLineUsed('p', l, store);
    out.push(l);
  }
  return out;
}

describe('chooseLine (#401 B1)', () => {
  it('avoids the last line for pools up to 3, the last two above', () => {
    expect(avoidCount(1)).toBe(0);
    expect(avoidCount(2)).toBe(1);
    expect(avoidCount(3)).toBe(1);
    expect(avoidCount(4)).toBe(2);
    expect(avoidCount(12)).toBe(2);
  });

  it('never the same line twice in a row (pools of 2, 3, 10)', () => {
    for (const size of [2, 3, 10]) {
      const options = Array.from({ length: size }, (_, i) => `line ${i}`);
      for (let seed = 1; seed <= 10; seed++) {
        const s = sequence(options, 200, seed);
        for (let i = 1; i < s.length; i++) expect(s[i], `size ${size} seed ${seed} at ${i}`).not.toBe(s[i - 1]);
      }
    }
  });

  it('with larger pools, not a fixed cycle (random among the rest)', () => {
    const options = Array.from({ length: 6 }, (_, i) => `line ${i}`);
    const s = sequence(options, 60, 7);
    const cycle = s.every((l, i) => i < 6 || l === s[i - 6]);
    expect(cycle).toBe(false);
    for (let i = 2; i < s.length; i++) expect(s[i]).not.toBe(s[i - 2]);
  });

  it('uses every line of a pool over a run', () => {
    const options = ['a', 'b', 'c'];
    expect(new Set(sequence(options, 30, 3))).toEqual(new Set(options));
  });

  it('a pool of one always gives that line', () => {
    expect(sequence(['only'], 5, 1)).toEqual(['only', 'only', 'only', 'only', 'only']);
  });

  it('a store that throws falls back without failing', () => {
    const broken = { read: () => { throw new Error('no storage'); }, write: () => { throw new Error('no storage'); } };
    expect(() => chooseLine('p', ['a', 'b'], { read: () => ({}), write: broken.write }, Math.random)).not.toThrow();
  });
});
