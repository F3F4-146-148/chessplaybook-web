import { describe, expect, it } from 'vitest';
import { buildPgn as serverPgn } from '../../../backend/src/services/PgnService';
import { buildGamePgn, gamePgnFileName } from './gamePgn';

/*
 * #416: the browser's PGN (a computer game before it is stored) and the server's (every stored game)
 * are two copies of one builder. Same games in, the same text out, or Copy during a game and Copy
 * after it would give different files.
 */
const base = {
  white: { username: 'Quiet Rook', rating: null },
  black: { username: 'Chess Playbook Master (1500)', rating: 1500 },
  timeControlInitial: 0,
  timeControlIncrement: 0,
  playedAt: new Date('2026-11-25T10:00:00Z'),
};

const GAMES = [
  { ...base, result: '0-1', endReason: 'checkmate', sanMoves: ['f3', 'e5', 'g4', 'Qh4#'], mode: 'master' as const },
  { ...base, result: '1-0', endReason: 'resignation', sanMoves: ['e5', 'Nf3'], mode: 'stockfish' as const,
    startFen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1' },
  { ...base, result: '0-1', endReason: 'timeout', sanMoves: ['d4'], mode: 'online' as const, timeControlInitial: 180, timeControlIncrement: 2 },
  { ...base, white: { username: 'Ro"ok \\ Knight', rating: 1210 }, result: '1/2-1/2', endReason: 'repetition', sanMoves: [], mode: 'master' as const, timeControlInitial: 600 },
  { ...base, result: '1/2-1/2', endReason: 'stalemate', sanMoves: ['Qc7'], mode: 'online' as const, startFen: 'k7/8/1Q6/8/8/8/8/7K w - - 0 1' },
  // #428 D5: a guided game's Event, the same in both builders; `guided` on a Stockfish game changes nothing
  { ...base, result: '0-1', endReason: 'resignation', sanMoves: ['e4', 'e5'], mode: 'master' as const, guided: true },
  { ...base, result: '1-0', endReason: 'resignation', sanMoves: ['e4'], mode: 'stockfish' as const, guided: true },
];

describe('the browser PGN is the server PGN', () => {
  for (const g of GAMES) {
    it(`${g.endReason} (${g.mode ?? 'online'})`, () => {
      expect(buildGamePgn(g)).toBe(serverPgn(g));
    });
  }

  it('a game still being played: Result "*", no Termination', () => {
    const pgn = buildGamePgn({ ...base, result: '*', endReason: '', sanMoves: ['e4', 'e5'], mode: 'master' });
    expect(pgn).toContain('[Result "*"]');
    expect(pgn).not.toContain('Termination');
    expect(pgn.endsWith('1. e4 e5 *')).toBe(true);
  });
});

describe('the file name', () => {
  it('is the date and both players, letters and digits only', () => {
    expect(gamePgnFileName('Quiet Rook', 'Chess Playbook Master (1500)', new Date('2026-11-25T10:00:00Z')))
      .toBe('chessplaybook-2026-11-25-quiet-rook-vs-chess-playbook-master-1500.pgn');
    expect(gamePgnFileName('***', '', new Date('2026-11-25T10:00:00Z'))).toBe('chessplaybook-2026-11-25-player-vs-player.pgn');
  });
});

describe('a guided game (#428 D5)', () => {
  it("says so in the Event, against the Master only", () => {
    expect(buildGamePgn({ ...base, result: '*', endReason: '', sanMoves: ['e4'], mode: 'master', guided: true })).toContain('[Event "Chess Playbook guided game vs the Master"]');
    expect(buildGamePgn({ ...base, result: '*', endReason: '', sanMoves: ['e4'], mode: 'stockfish', guided: true })).toContain('[Event "Chess Playbook vs Stockfish"]');
  });
});
