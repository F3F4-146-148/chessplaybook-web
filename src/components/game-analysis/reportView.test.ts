import { describe, it, expect } from 'vitest';
import { analyzeFullGame } from '@/services/GameAnalysisService';
import { bandFor, buildReportView, displayName, moveLabel, phasePositions } from './reportView';
import { FIXTURE_GAME, FIXTURE_METADATA, SUMMARY_LONG, SUMMARY_SHORT } from './fixtures/gameReportFixtures';

const analysis = analyzeFullGame(FIXTURE_GAME.evals, FIXTURE_GAME.bestMoves, FIXTURE_GAME.mateIn, FIXTURE_GAME.uci, 'white', null);
const view = (over: Partial<Parameters<typeof buildReportView>[0]> = {}) => buildReportView({
  analysis, summary: SUMMARY_LONG, metadata: FIXTURE_METADATA, sans: FIXTURE_GAME.san, gameResult: 'white', ...over,
});

describe('displayName', () => {
  it('keeps the surname of a "Surname, First" name', () => expect(displayName('Tal, Mihail', 'White')).toBe('Tal'));
  it('keeps a two-word surname', () => expect(displayName('Jimenez Morales, Francisco', 'Black')).toBe('Jimenez Morales'));
  it('keeps a name without a comma as it is', () => {
    expect(displayName('You', 'White')).toBe('You');
    expect(displayName('Guest-31d8', 'Black')).toBe('Guest-31d8');
    expect(displayName('The Master', 'Black')).toBe('The Master');
  });
  it('falls back to the side for an empty or unknown name', () => {
    expect(displayName('', 'White')).toBe('White');
    expect(displayName('?', 'Black')).toBe('Black');
    expect(displayName(undefined, 'Black')).toBe('Black');
  });
});

describe('bandFor: one scale for every score', () => {
  it.each([
    [59.9, 'blunder'], [60, 'mistake'], [69.9, 'mistake'], [70, 'inaccuracy'], [79.9, 'inaccuracy'],
    [80, 'excellent'], [89.9, 'excellent'], [90, 'best'], [100, 'best'],
  ])('%s is %s', (score, band) => expect(bandFor(score as number)).toBe(band));
});

describe('moveLabel', () => {
  it('numbers White and Black moves', () => {
    expect(moveLabel(0, 'Nf3')).toBe('1. Nf3');
    expect(moveLabel(1, 'Nf6')).toBe('1... Nf6');
    expect(moveLabel(59, 'Rd8')).toBe('30... Rd8');
    expect(moveLabel(44, 'Qxe8+')).toBe('23. Qxe8+');
  });
});

describe('phasePositions: inclusive move ranges become graph positions', () => {
  it('covers [s, e + 1]', () => expect(phasePositions([0, 20], 61)).toEqual({ from: 0, to: 21 }));
  it('clamps an end past the last position', () => expect(phasePositions([0, 20], 6)).toEqual({ from: 0, to: 6 }));
  it('a game of one ply', () => expect(phasePositions([0, 20], 1)).toEqual({ from: 0, to: 1 }));
  it('drops a phase that starts after the game', () => expect(phasePositions([21, 60], 6)).toBeNull());
});

describe('buildReportView on the fixture game', () => {
  const v = view();
  it('names the players and their result', () => {
    expect(v.white).toMatchObject({ name: 'Tal', outcome: 'Won' });
    expect(v.black).toMatchObject({ name: 'Jimenez Morales', outcome: 'Lost' });
    expect(view({ gameResult: 'draw' }).white.outcome).toBe('Drew');
    expect(view({ gameResult: 'black' }).black.outcome).toBe('Won');
  });
  it('rounds the rating and gives its band', () => {
    expect(v.rating.rounded).toBe(Math.round(analysis.gameRating.overall));
    expect(v.rating.band).toBe(bandFor(analysis.gameRating.overall));
  });
  it('keeps the phases with a score, as positions, and drops the endgame this game never reached', () => {
    expect(v.phases.map(p => p.name)).toEqual(['Opening', 'Middlegame']);
    expect(v.phases[0]).toMatchObject({ from: 0, to: 21 });
    expect(v.phases[1].from).toBe(21);
    expect(v.phases[1].to).toBe(v.lastPosition);
  });
  it('lists the eight classes with both counts, matching the analysis', () => {
    expect(v.classes.map(c => c.key)).toEqual(['brilliant', 'best', 'excellent', 'good', 'inaccuracy', 'mistake', 'blunder', 'severe_blunder']);
    for (const c of v.classes) {
      expect(c.moves.filter(m => m.side === 'white').length).toBe(c.white);
      expect(c.moves.filter(m => m.side === 'black').length).toBe(c.black);
    }
  });
  it('opens only error and brilliant rows that have moves', () => {
    const open = Object.fromEntries(v.classes.map(c => [c.key, c.openable]));
    expect(open.best).toBe(false);
    expect(open.good).toBe(false);
    expect(open.brilliant).toBe(false); // none in this game
    expect(open.inaccuracy).toBe(true);
    expect(open.blunder).toBe(true);
  });
  it('labels the moves and gives each jump as a graph position, in game order', () => {
    const blunder = v.classes.find(c => c.key === 'blunder')!;
    expect(blunder.moves).toEqual([{ position: 60, side: 'black', label: '30... Rd8' }]);
    const inacc = v.classes.find(c => c.key === 'inaccuracy')!;
    expect(inacc.moves.map(m => m.position)).toEqual([...inacc.moves.map(m => m.position)].sort((a, b) => a - b));
    expect(inacc.moves.some(m => m.side === 'white') && inacc.moves.some(m => m.side === 'black')).toBe(true);
  });
  it('a jump lands the board on the move: board ply = position - 1 = moveIndex', () => {
    const blunder = v.classes.find(c => c.key === 'blunder')!.moves[0];
    expect(blunder.position - 1).toBe(59);
    expect(FIXTURE_GAME.san[blunder.position - 1]).toBe('Rd8');
  });
  it('gives the critical move as a jump, or none', () => {
    expect(v.critical).toMatchObject({ position: 60, moveNumber: 30 });
    expect(view({ summary: SUMMARY_SHORT }).critical).toBeNull();
    expect(view({ summary: null }).critical).toBeNull();
    expect(view({ summary: { ...SUMMARY_LONG, criticalMoveIndex: 0 } }).critical).toMatchObject({ position: 1, moveNumber: 1 });
  });
  it('names the critical move by the mover and the move, "brilliant" only when it is (#379), never "turning point"', () => {
    // Not brilliant: no class word, whatever the move's class (the critical move is a good reply since #379).
    expect(v.critical!.label).toBe("Go to move 30: Jimenez Morales's Rd8");
    expect(view({ summary: { ...SUMMARY_LONG, criticalMoveIndex: 0 } }).critical!.label).toMatch(/^Go to move 1: \S.*'s \S+$/);
    // Brilliant: said.
    const brilliant = {
      ...analysis,
      classifiedMoves: analysis.classifiedMoves.map(m => m.moveIndex === 59 ? { ...m, classification: 'brilliant' as const } : m),
    };
    expect(view({ analysis: brilliant }).critical!.label)
      .toBe("Go to move 30: Jimenez Morales's brilliant Rd8");
    for (const c of [v.critical!.label]) expect(c).not.toMatch(/turning point|critical moment/);
  });
});
