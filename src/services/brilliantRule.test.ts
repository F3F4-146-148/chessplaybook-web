import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { analyzeFullGame, cpToWinPercent } from './GameAnalysisService';
import {
  CRIT, RULE, boardFacts, conclude, decide, isCritical, needsSearch, pickCritical, prepare, secondLine, seeGain, winFor,
  type BoardFacts, type CriticalNumbers, type MoveNumbers,
} from './brilliantRule';
import title from './__fixtures__/brilliant379-title.json';
import amateur from './__fixtures__/brilliant379-amateur.json';

/*
  The fixtures are written by scripts/brilliant-379/rule.ts (the reference the owner's marks were measured on), from
  SF 18 lite-single run as the report runs it. Per game: the batch (evals, best moves, mates), Maia 1900's probability
  of each move played, the two-line search as [best cp, second cp, first line is the move played], and the reference's
  answer. This test checks the port; the engine's own variation is the plan's A5 and B5.
*/
interface FixtureGame {
  id: number; result: string; moves: string[]; evals: number[]; bestMoves: string[]; mates: (number | null)[];
  maia: (number | null)[]; second: ([number, number, number] | null)[];
  expected: Array<{ i: number; type: 1 | 2 }>; criticalMoves: number[]; critical: number | null;
}

function runGame(g: FixtureGame) {
  const result = g.result === '1-0' ? 'white' : g.result === '0-1' ? 'black' : 'draw';
  const cm = analyzeFullGame(g.evals, g.bestMoves, g.mates, g.moves, result, null).classifiedMoves;
  const p = prepare({ moves: g.moves, evals: g.evals, classified: cm });
  return conclude(
    p,
    (i) => g.maia[i] ?? null,
    (i) => {
      const s = g.second[i];
      if (!s) return null;
      const lines = [{ move: s[2] ? g.moves[i] : '(another move)', cp: s[0] }, { move: '(second)', cp: s[1] }];
      return secondLine(lines, g.moves[i], (cp) => winFor(i, cp));
    },
  );
}

describe('parity with the reference rule', () => {
  for (const [name, games] of [['title', title], ['amateur', amateur]] as const) {
    it(`${name} games: the same brilliant moves, critical moves and button`, () => {
      let brilliant = 0, buttons = 0;
      for (const g of games as unknown as FixtureGame[]) {
        const r = runGame(g);
        expect({ id: g.id, brilliant: r.brilliant.map((x) => [x.moveIndex, x.type]) })
          .toEqual({ id: g.id, brilliant: g.expected.map((x) => [x.i, x.type]) });
        expect({ id: g.id, critical: r.criticalMoves, button: r.critical })
          .toEqual({ id: g.id, critical: g.criticalMoves, button: g.critical });
        brilliant += r.brilliant.length;
        if (r.critical != null) buttons++;
      }
      // The measured totals (analysis §6, §7), so a fixture that silently lost its data cannot pass.
      if (name === 'title') { expect(brilliant).toBe(22); expect(buttons).toBe(15); }
      else { expect(brilliant).toBe(3); expect(buttons).toBe(4); }
    }, 180_000); // board facts on 66 games take ~30 s in jsdom on a desktop
  }
});

// ── The board facts ─────────────────────────────────────────────────────────
/** The board facts of `uci` played after `before` (UCI moves from the start). */
function factsAfter(before: string[], uci: string): BoardFacts {
  return boardFacts([...before, uci], (i) => i === before.length)[before.length];
}

describe('board facts', () => {
  it('an even trade and a capture that loses the queen', () => {
    // 1.e4 d5 2.exd5 Qxd5: the queen takes back, an even exchange. 3.Nc3 Qxg2: the bishop on f1 takes the queen.
    const even = factsAfter(['e2e4', 'd7d5'], 'e4d5');
    expect(even).toMatchObject({ capture: true, net: 0 });
    const free = factsAfter(['e2e4', 'd7d5', 'e4d5', 'd8d5', 'b1c3'], 'd5g2');
    expect(free.capture).toBe(true);
    expect(free.net).toBe(1 - 9);
  });

  it('en passant is a capture', () => {
    const f = factsAfter(['e2e4', 'a7a6', 'e4e5', 'd7d5'], 'e5d6');
    expect(f.capture).toBe(true);
    expect(f.net).toBe(1 - 1); // takes a pawn, the c7 or e7 pawn takes back
  });

  it('check, promotion and mate', () => {
    // Fool's mate: 1.f3 e5 2.g4 Qh4#.
    const mate = factsAfter(['f2f3', 'e7e5', 'g2g4'], 'd8h4');
    expect(mate.mates).toBe(true);
    const inCheck = factsAfter(['e2e4', 'f7f6', 'd1h5'], 'g7g6');
    expect(inCheck.inCheck).toBe(true);
  });

  it('seeGain: a free pawn', () => {
    const b = new Chess();
    for (const u of ['e2e4', 'e7e5', 'd2d4', 'e5d4']) b.move({ from: u.slice(0, 2), to: u.slice(2, 4) });
    expect(seeGain(b, 'd4')).toBe(1); // Qxd4: the pawn, nothing takes back
  });
});

// ── The decisions, each row on its own ──────────────────────────────────────
const quiet: BoardFacts = { inCheck: false, promotion: false, mates: false, capture: false, net: -5, gives: 5 };
const D = cpToWinPercent(RULE.decisiveCp);
const base: MoveNumbers = {
  i: 40, winBefore: 60, winAfter: 59, winPrevBefore: 55, prevError: false, maiaP: 0.05, second: { best: 59, second: 50 },
};

describe('the brilliant rule (analysis §6)', () => {
  it('passes a clear type 2', () => expect(decide(quiet, base)).toBe(2));
  it('ply 9 is too early', () => expect(decide(quiet, { ...base, i: RULE.minPly - 1 })).toBeNull());
  it('out of check, promotion, mate', () => {
    expect(decide({ ...quiet, inCheck: true }, base)).toBeNull();
    expect(decide({ ...quiet, promotion: true }, base)).toBeNull();
    expect(decide({ ...quiet, mates: true }, base)).toBeNull();
  });
  it('a capture that wins material', () => expect(decide({ ...quiet, capture: true, net: 1 }, base)).toBeNull());
  it('the loss limit', () => {
    expect(decide(quiet, { ...base, winBefore: 62, winAfter: 59 })).toBe(2);
    expect(decide(quiet, { ...base, winBefore: 62.1, winAfter: 59 })).toBeNull();
  });
  it('gives at least the exchange', () => {
    expect(decide({ ...quiet, gives: 2 }, base)).toBe(2);
    expect(decide({ ...quiet, gives: 1 }, base)).toBeNull();
  });
  it('Maia under 12%, and missing Maia', () => {
    expect(decide(quiet, { ...base, maiaP: 0.1199 })).toBe(2);
    expect(decide(quiet, { ...base, maiaP: 0.12 })).toBeNull();
    expect(decide(quiet, { ...base, maiaP: null })).toBeNull();
  });
  it('few moves do it, and missing second line', () => {
    expect(decide(quiet, { ...base, second: { best: 59, second: 56 } })).toBe(2);
    expect(decide(quiet, { ...base, second: { best: 59, second: 56.1 } })).toBeNull();
    expect(decide(quiet, { ...base, second: null })).toBeNull();
  });
  it('not already won without it', () => {
    expect(decide(quiet, { ...base, winBefore: 99, winAfter: 99, second: { best: 99, second: D } })).toBeNull();
  });
  it('type 1 needs the opponent\'s mistake to make it decisive', () => {
    const t1 = { ...base, winPrevBefore: 50, prevError: true, winBefore: 95, winAfter: 94, second: { best: 94, second: 60 } };
    expect(decide(quiet, t1)).toBe(1);
    expect(decide(quiet, { ...t1, prevError: false })).toBe(2);
    expect(decide(quiet, { ...t1, winPrevBefore: D })).toBe(2);
  });
  it('type 2 floor', () => {
    expect(decide(quiet, { ...base, winBefore: 31, winAfter: 30, second: { best: 30, second: 20 } })).toBe(2);
    expect(decide(quiet, { ...base, winBefore: 30, winAfter: 29.9, second: { best: 29.9, second: 20 } })).toBeNull();
  });
});

const crit: CriticalNumbers = { i: 40, winBefore: 70, winAfter: 69, prevDrop: 15, maiaP: 0.05, second: { best: 69, second: 55 } };
const plain: BoardFacts = { inCheck: false, promotion: false, mates: false, capture: false, net: 0, gives: 0 };

describe('the critical move (analysis §7)', () => {
  it('passes a quiet move with no material given', () => expect(isCritical(plain, crit)).toBe(true));
  it('the opponent gave at least 10', () => {
    expect(isCritical(plain, { ...crit, prevDrop: CRIT.prevDrop })).toBe(true);
    expect(isCritical(plain, { ...crit, prevDrop: 9.9 })).toBe(false);
    expect(isCritical(plain, { ...crit, prevDrop: null })).toBe(false);
  });
  it('takes the chance: at most 3 below the best', () => {
    expect(isCritical(plain, { ...crit, winBefore: 72, winAfter: 69 })).toBe(true);
    expect(isCritical(plain, { ...crit, winBefore: 72.1, winAfter: 69 })).toBe(false);
  });
  it('hard to find', () => {
    expect(isCritical(plain, { ...crit, maiaP: 0.12 })).toBe(false);
    expect(isCritical(plain, { ...crit, maiaP: null })).toBe(false);
  });
  it('other moves do not work', () => {
    expect(isCritical(plain, { ...crit, second: { best: 69, second: 61 } })).toBe(true);
    expect(isCritical(plain, { ...crit, second: { best: 69, second: 61.1 } })).toBe(false);
    expect(isCritical(plain, { ...crit, second: null })).toBe(false);
  });
  it('the position holds: 30% after (27.d6 in Nepomniachtchi-Carlsen was 26%)', () => {
    expect(isCritical(plain, { ...crit, winBefore: 31, winAfter: 30, second: { best: 30, second: 20 } })).toBe(true);
    expect(isCritical(plain, { ...crit, winBefore: 27, winAfter: 26, second: { best: 26, second: 10 } })).toBe(false);
  });
  it('a capture counts only when it gives material (35...Rxd8 even, 13...Nxb5 winning)', () => {
    expect(isCritical({ ...plain, capture: true, net: 0 }, crit)).toBe(false);
    expect(isCritical({ ...plain, capture: true, net: 3 }, crit)).toBe(false);
    expect(isCritical({ ...plain, capture: true, net: -2 }, crit)).toBe(true);
  });
  it('not the mating move, not before ply 10; a move out of check can be critical', () => {
    expect(isCritical({ ...plain, mates: true }, crit)).toBe(false);
    expect(isCritical(plain, { ...crit, i: 9 })).toBe(false);
    expect(isCritical({ ...plain, inCheck: true }, crit)).toBe(true);
  });
  it('the button goes to the reply to the largest drop, the first on a tie', () => {
    expect(pickCritical([])).toBeNull();
    expect(pickCritical([{ i: 30, prevDrop: 12 }, { i: 50, prevDrop: 40 }, { i: 70, prevDrop: 40 }])).toBe(50);
  });
});

describe('the two-line search as the rules read it', () => {
  it('only when its first line is the move played', () => {
    const lines = [{ move: 'e2e4', cp: 50 }, { move: 'd2d4', cp: 10 }];
    expect(secondLine(lines, 'e2e4', cpToWinPercent)).not.toBeNull();
    expect(secondLine(lines, 'd2d4', cpToWinPercent)).toBeNull();
    expect(secondLine(lines.slice(0, 1), 'e2e4', cpToWinPercent)).toBeNull();
  });
  it('Maia gates the search', () => {
    expect(needsSearch(0.05)).toBe(true);
    expect(needsSearch(0.12)).toBe(false);
    expect(needsSearch(null)).toBe(false);
  });
});
