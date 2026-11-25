import { describe, expect, it } from 'vitest';

import { buildPositionHref, readPositionDeepLink } from './positionDeepLink';

const FEN = 'r1bqkbnr/pppp1ppp/2n5/4p3/8/1P3N2/PBPPPPPP/RN1QKB1R w KQkq - 2 3';

describe('position deep links', () => {
  it('round-trips a puzzle FEN and displayed orientation', () => {
    const href = buildPositionHref('/analysis', FEN, 'black');
    expect(readPositionDeepLink(new URL(href, 'https://chessplaybook.com').search)).toEqual({
      value: { fen: FEN, orientation: 'black', source: 'puzzle' },
      error: null,
    });
  });

  it('accepts underscore-separated FENs', () => {
    const result = readPositionDeepLink(`?fen=${encodeURIComponent(FEN.replace(/ /g, '_'))}`);
    expect(result.value?.fen).toBe(FEN);
  });

  it('completes a FEN of only the pieces, so the board can read it', () => {
    const result = readPositionDeepLink('?fen=' + encodeURIComponent('r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R'));
    expect(result.value?.fen).toBe('r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w - - 0 1');
  });

  it('rejects invalid positions without returning a board value', () => {
    const result = readPositionDeepLink('?fen=not-a-position');
    expect(result.value).toBeNull();
    expect(result.error).toContain('invalid');
  });
});
