import { describe, expect, it } from 'vitest';

import { reactionTo } from './reaction';
import type { MaiaEvaluation } from './maia/maiaEngine';

const ev = (wdl: [number, number, number], moves: Array<[string, number]> = []): MaiaEvaluation => ({
  wdl,
  moves: moves.map(([uci, p]) => ({ uci, p })),
});

describe('his face at your move', () => {
  const before = ev([0.4, 0.3, 0.3], [['e2e4', 0.5], ['g2g4', 0.02]]); // your chances 0.55

  it('a clear drop in your chances: kindly serious', () => {
    // after: his win 0.6, draw 0.2, his loss 0.2 -> your chances 0.3
    expect(reactionTo(before, ev([0.6, 0.2, 0.2]), 'e2e4')).toBe('serious');
  });

  it('an unlikely move that holds: surprised', () => {
    expect(reactionTo(before, ev([0.3, 0.3, 0.4]), 'g2g4')).toBe('surprised'); // your chances 0.55
  });

  it('a likely move that clearly improves your chances: pleased', () => {
    expect(reactionTo(before, ev([0.2, 0.3, 0.5]), 'e2e4')).toBe('pleased'); // 0.65
  });

  it('an ordinary move: no reaction', () => {
    expect(reactionTo(before, ev([0.32, 0.3, 0.38]), 'e2e4')).toBe(null); // 0.53
  });

  it('an unlikely move that loses is serious, not surprised', () => {
    expect(reactionTo(before, ev([0.7, 0.2, 0.1]), 'g2g4')).toBe('serious');
  });
});
