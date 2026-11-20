/**
 * The numbers the phone measurement records (OWN_GAME_PUZZLES plan, A2): per game the generator's
 * own report, summed here. Pure, so the dev page and its test read the same arithmetic.
 */
import type { GameReport } from '../generator/types';

export interface BenchSummary {
  games: number;
  used: number;
  skipped: number;
  puzzles: number;
  /** Puzzles per game the generator used (skipped games excluded). */
  puzzlesPerUsedGame: number;
  /** Seconds per used game. Null until one game is done. */
  medianSeconds: number | null;
  maxSeconds: number | null;
  totalSeconds: number;
  positionsPerUsedGame: number;
}

const round1 = (x: number) => Math.round(x * 10) / 10;

export function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function summarizeBench(reports: GameReport[]): BenchSummary {
  const used = reports.filter((r) => r.status === 'used');
  const secs = used.map((r) => r.ms / 1000);
  const puzzles = used.reduce((a, r) => a + r.puzzles, 0);
  const positions = used.reduce((a, r) => a + r.positionsSearched, 0);
  const med = median(secs);
  return {
    games: reports.length,
    used: used.length,
    skipped: reports.length - used.length,
    puzzles,
    puzzlesPerUsedGame: used.length ? round1(puzzles / used.length) : 0,
    medianSeconds: med === null ? null : round1(med),
    maxSeconds: secs.length ? round1(Math.max(...secs)) : null,
    totalSeconds: round1(reports.reduce((a, r) => a + r.ms, 0) / 1000),
    positionsPerUsedGame: used.length ? round1(positions / used.length) : 0,
  };
}
