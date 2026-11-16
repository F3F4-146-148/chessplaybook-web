/**
 * /play's LEVELS (MASTER_CHARACTER_IMPLEMENTATION_PLAN D3, #186).
 *
 * With `MAIA_LIVE` off the list is today's eight Stockfish levels, unchanged. With it on (owner, 2026-11-15):
 * Stockfish 800 and 1000; the Master at 1100-1900 (Maia-1, nine levels, one row per rating in the picker); level
 * 7 (2000, Stockfish) renamed "Expert" because the character is now "the Master"; Grandmaster 2500. Today's
 * Stockfish 1200-1800 definitions stay in `DIFFICULTY_LEVELS`: they are the fallback when Maia cannot load, and
 * the whole list again when `MAIA_LIVE` is turned off.
 */
import { DIFFICULTY_LEVELS, type StockfishLevel } from './StockfishOpponent';
import { MAIA_RATINGS, type MaiaRating } from '@/features/master/maia/maiaEngine';

export type PlayLevel =
  | { id: string; kind: 'stockfish'; name: string; approxRating: number; stockfish: StockfishLevel }
  | { id: string; kind: 'master'; name: string; approxRating: number; maia: MaiaRating };

const stockfish = (level: number, name?: string): PlayLevel => {
  const sf = DIFFICULTY_LEVELS.find((l) => l.level === level)!;
  return { id: `sf-${level}`, kind: 'stockfish', name: name ?? sf.name, approxRating: sf.approxRating, stockfish: sf };
};

export function playLevels(maiaLive: boolean): PlayLevel[] {
  if (!maiaLive) return DIFFICULTY_LEVELS.map((l) => stockfish(l.level));
  return [
    stockfish(1),
    stockfish(2),
    ...MAIA_RATINGS.map((r): PlayLevel => ({ id: `master-${r}`, kind: 'master', name: 'The Master', approxRating: r, maia: r })),
    stockfish(7, 'Expert'),
    stockfish(8),
  ];
}

/** The level a new visitor starts on: today Intermediate (~1400); with the Master, the Master at 1400. */
export function defaultLevelId(maiaLive: boolean): string {
  return maiaLive ? 'master-1400' : 'sf-4';
}

/** When Maia cannot load: the Stockfish level nearest in rating, from today's eight (kept for this). */
export function stockfishFallback(rating: number): StockfishLevel {
  return DIFFICULTY_LEVELS.reduce((best, l) =>
    Math.abs(l.approxRating - rating) < Math.abs(best.approxRating - rating) ? l : best);
}

export function findLevel(levels: PlayLevel[], id: string): PlayLevel {
  return levels.find((l) => l.id === id) ?? levels[0];
}
