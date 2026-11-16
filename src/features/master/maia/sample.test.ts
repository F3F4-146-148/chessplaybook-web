import { describe, expect, it } from 'vitest';

import { sampleMove } from './sample';

const seq = (...xs: number[]) => { let i = 0; return () => xs[i++ % xs.length]; };

describe('sampleMove', () => {
  const probs = [0.6, 0.3, 0.08, 0.019, 0.001]; // the last two: a blunder and a hung queen

  it('never draws a move under the floor, however the dice fall', () => {
    const seen = new Set<number>();
    for (let k = 0; k < 1000; k++) seen.add(sampleMove(probs, { temperature: 1, floor: 0.05, random: () => k / 1000 }));
    expect([...seen].sort()).toEqual([0, 1, 2]);
  });

  it('keeps the most likely move even when it is under the floor', () => {
    expect(sampleMove([0.04, 0.03, 0.03], { temperature: 1, floor: 0.05, random: () => 0.99 })).toBe(0);
  });

  it('draws in proportion to Maia at temperature 1', () => {
    // weights 0.6, 0.3, 0.08 of 0.98: the boundaries are at 0.612 and 0.918
    expect(sampleMove(probs, { temperature: 1, floor: 0.05, random: seq(0.6) })).toBe(0);
    expect(sampleMove(probs, { temperature: 1, floor: 0.05, random: seq(0.7) })).toBe(1);
    expect(sampleMove(probs, { temperature: 1, floor: 0.05, random: seq(0.95) })).toBe(2);
  });

  it('a low temperature favours the top move, temperature 0 always plays it', () => {
    const counts = [0, 0, 0];
    for (let k = 0; k < 1000; k++) counts[sampleMove(probs, { temperature: 0.3, floor: 0.05, random: () => k / 1000 })]++;
    expect(counts[0]).toBeGreaterThan(900);
    expect(sampleMove(probs, { temperature: 0, floor: 0.05, random: () => 0.99 })).toBe(0);
  });
});
