import { describe, it, expect } from 'vitest';
import { gameCardLines, surname, type PuzzleGameSource } from './gamePuzzleSource';

/* Black's ...Nd4 into the puzzle position, White (the solver) to play at move 5. */
const FEN = 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR b KQkq - 3 4';
const game = {
  white: 'Kasparov, Garry', black: 'Karpov, Anatoly', year: 1990, event: 'World Championship',
  champion: { slug: 'kasparov', name: 'Garry Kasparov', index: 12 },
};
const source = (over: Partial<PuzzleGameSource> = {}): PuzzleGameSource => ({
  kind: 'missed', playedMove: 'f3d1', foundInGame: null, moveNumber: 5, gameId: 11, game, ...over,
});
const puzzle = (s?: PuzzleGameSource) => ({ fen: FEN, moves: ['c6d4', 'f3f7'], source: s });

describe('the game line on a puzzle made from a game (#245 B4)', () => {
  it('names the game, the move played and the game page', () => {
    expect(gameCardLines(puzzle(source()))).toEqual({
      game: 'Kasparov vs Karpov, World Championship 1990',
      played: 'In the game Kasparov played 5.Qd1.',
      href: '/champions/kasparov/games/12',
    });
  });

  it('says when the move was found in the game', () => {
    expect(gameCardLines(puzzle(source({ kind: 'punish', foundInGame: true })))?.played)
      .toBe('Kasparov found it in the game.');
  });

  it('numbers a Black move with three dots', () => {
    const blackToPlay = { fen: '4k3/8/8/8/8/8/8/R3K3 w - - 0 30', moves: ['a1a2', 'e8d8'], source: source({ playedMove: 'e8f8', moveNumber: 30 }) };
    expect(gameCardLines(blackToPlay)?.played).toBe('In the game Karpov played 30...Kf8.');
  });

  it('leaves out what it does not know, and links nothing without a champion', () => {
    const lines = gameCardLines(puzzle(source({ game: { ...game, event: null, year: null, champion: null } })));
    expect(lines?.game).toBe('Kasparov vs Karpov');
    expect(lines?.href).toBeNull();
  });

  it('nothing for a corpus puzzle or a game that is gone', () => {
    expect(gameCardLines(puzzle(undefined))).toBeNull();
    expect(gameCardLines(puzzle(source({ game: null })))).toBeNull();
  });

  it('a name without a comma is kept whole', () => {
    expect(surname('Gukesh D')).toBe('Gukesh D');
    expect(surname('Carlsen, Magnus')).toBe('Carlsen');
  });
});
