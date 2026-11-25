import { positionFromFen } from '@/components/chess/chessLogic';
import { makeFen } from 'chessops/fen';

export type BoardOrientation = 'white' | 'black';

export interface PositionDeepLink {
  fen: string;
  orientation: BoardOrientation;
  source: 'puzzle' | null;
}

export type PositionDeepLinkResult =
  | { value: PositionDeepLink; error: null }
  | { value: null; error: string };

export function readPositionDeepLink(search: string): PositionDeepLinkResult {
  const params = new URLSearchParams(search);
  const rawFen = params.get('fen');
  if (!rawFen) return { value: null, error: '' };

  const position = positionFromFen(rawFen.replace(/_/g, ' ').trim());
  if (!position) {
    return { value: null, error: 'That position link is invalid. The standard starting position is shown instead.' };
  }
  // Completed by chessops (a FEN of only the pieces gets White to move): the boards read it with chess.js, which
  // refuses a partial FEN, and /analysis went blank on one (2026-11-22).
  const fen = makeFen(position.chess.toSetup());

  const orientation: BoardOrientation = params.get('orientation') === 'black' ? 'black' : 'white';
  return {
    value: { fen, orientation, source: params.get('source') === 'puzzle' ? 'puzzle' : null },
    error: null,
  };
}

export function buildPositionHref(
  pathname: '/analysis' | '/explain' | '/play',
  fen: string,
  orientation: BoardOrientation,
  source: 'puzzle' | 'opening' = 'puzzle',
): string {
  const params = new URLSearchParams({ fen, orientation, source });
  return `${pathname}?${params.toString()}`;
}
