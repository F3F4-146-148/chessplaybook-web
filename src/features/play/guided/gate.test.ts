import { describe, expect, it } from 'vitest';

import { parseSearchScore } from '@/services/AnalysisService';
import { confirmed, gate, playerWin, winPct } from './gate';

const cp = (n: number) => ({ cp: n, mate: null });
const mate = (n: number) => ({ cp: null, mate: n });

describe('parseSearchScore (#428 B3)', () => {
  it('takes the last exact score and its line, skipping bounds', () => {
    const s = parseSearchScore([
      'info depth 10 score cp 31 nodes 1 pv e2e4 e7e5',
      'info depth 11 score cp 40 lowerbound nodes 2 pv d2d4',
      'info depth 11 score cp 35 nodes 3 pv e2e4 c7c5 g1f3',
      'bestmove e2e4 ponder c7c5',
    ]);
    expect(s).toEqual({ cp: 35, mate: null, best: 'e2e4', pv: ['e2e4', 'c7c5', 'g1f3'] });
  });
  it('reads a mate score, from the side to move', () => {
    expect(parseSearchScore(['info depth 5 score mate -2 pv h7h6 d1h5', 'bestmove h7h6'])).toMatchObject({ cp: null, mate: -2 });
  });
  it('null without a move or a score', () => {
    expect(parseSearchScore(['bestmove (none)'])).toBeNull();
    expect(parseSearchScore(['info depth 1 nodes 3', 'bestmove e2e4'])).toBeNull();
  });
});

describe('the gate (#428 B3, rule B)', () => {
  it('Lichess win%: 0 cp is 50, symmetric', () => {
    expect(winPct(0)).toBe(50);
    expect(winPct(200) + winPct(-200)).toBeCloseTo(100);
  });
  it('the search after the move is the Master\'s point of view, so it is turned round', () => {
    expect(playerWin(cp(-300), false)).toBeCloseTo(winPct(300));
    expect(playerWin(mate(3), false)).toBe(0);
    expect(playerWin(mate(3), true)).toBe(100);
  });
  it('a loss of 20 or more passes the gate (77% to 46%)', () => {
    expect(gate(cp(330), cp(40), false).kind).toBe('loss');
    expect(gate(cp(100), cp(-60), false).kind).toBeNull(); // about 59% to 55%: under 20
  });
  it('rule B: never in a position already lost', () => {
    expect(gate(cp(-400), mate(2), false).kind).toBeNull();
    expect(gate(cp(-300), cp(600), false).kind).toBeNull();
  });
  it('a mate allowed warns (a player already being mated is already lost: rule B)', () => {
    const v = gate(cp(150), mate(1), false);
    expect(v.kind).toBe('mate_allowed');
    expect(v.mateForHim).toBe(true);
    expect(gate(mate(-3), mate(1), false).kind).toBeNull();
  });
  it('a draw by rule warns only from a winning score (75+)', () => {
    expect(gate(mate(1), null, true).kind).toBe('draw_thrown'); // A1, game 8: Qg8 stalemate from a mate in 1
    expect(gate(cp(50), null, true).kind).toBeNull();
  });
  it('a loss stands only when the longer search agrees; no answer means no warning', () => {
    const v = gate(cp(330), cp(40), false);
    expect(confirmed(v, cp(20))).toBe(true);
    expect(confirmed(v, cp(-250))).toBe(false); // the longer search finds the move costs the player only ~5%
    expect(confirmed(v, null)).toBe(false);
    expect(confirmed(gate(cp(150), mate(1), false), null)).toBe(true); // a mate is not confirmed away
  });
});
