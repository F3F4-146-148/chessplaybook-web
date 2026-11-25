import { describe, expect, it } from 'vitest';
import { GAME_STREAMS, type ScoredGame } from './match';
import { TRAILER, gameVideo, hubVideo, videoLabel } from './MatchVideo';

const g = (game: number, result: ScoredGame['result']): ScoredGame =>
  ({ game, white: 'sindarov', black: 'gukesh', result, roundId: null });

describe('the match videos', () => {
  it('game 1 has its broadcast id, and every id is a YouTube video id', () => {
    expect(GAME_STREAMS[1]).toMatch(/^[\w-]{11}$/);
    for (const id of Object.values(GAME_STREAMS)) expect(id).toMatch(/^[\w-]{11}$/);
    expect(new Set(Object.values(GAME_STREAMS)).size).toBe(Object.values(GAME_STREAMS).length);
  });

  it('a game page shows its broadcast: upcoming, then live, then the replay', () => {
    expect(gameVideo(1, undefined)?.kind).toBe('upcoming');
    expect(gameVideo(1, 'pending')?.kind).toBe('upcoming');
    expect(gameVideo(1, 'playing')?.kind).toBe('live');
    expect(gameVideo(1, 'draw')?.kind).toBe('replay');
    expect(gameVideo(1, 'white')?.id).toBe(GAME_STREAMS[1]);
  });

  it('a game whose broadcast is not published has none (the page shows the trailer)', () => {
    expect(gameVideo(14, 'playing')).toBeNull();
  });

  it('the hub: the trailer before any game, the live game while one is on, then the latest replay', () => {
    expect(hubVideo([], undefined)).toEqual(TRAILER);
    expect(hubVideo([g(1, 'pending'), g(2, 'pending')], undefined)).toEqual(TRAILER);
    expect(hubVideo([g(1, 'playing')], 1)).toMatchObject({ kind: 'live', game: 1 });
    expect(hubVideo([g(1, 'black')], undefined)).toMatchObject({ kind: 'replay', game: 1 });
    // A later game without a published broadcast does not hide the last replay there is.
    expect(hubVideo([g(1, 'draw'), g(14, 'draw')], undefined)).toMatchObject({ kind: 'replay', game: 1 });
    // A live game without a broadcast id falls back to the latest replay, not to nothing.
    expect(hubVideo([g(1, 'draw'), g(14, 'playing')], 14)).toMatchObject({ kind: 'replay', game: 1 });
  });

  it('says which video it is, with no em dash', () => {
    expect(videoLabel({ id: 'x', kind: 'live', game: 3 })).toBe('Live: FIDE’s broadcast of game 3');
    expect(videoLabel({ id: 'x', kind: 'replay', game: 3 })).toBe('Replay: FIDE’s broadcast of game 3');
    expect(videoLabel(TRAILER)).not.toMatch(/—/);
  });
});
