/**
 * Turn one search's UCI output into the generator's engine lines.
 *
 * Input: the `info` and `bestmove` lines of a single `go depth N` search at
 * MultiPV K. Output: one line per MultiPV index, best first, each the LAST
 * complete report for that index (Stockfish reports every index again at each
 * depth). Scores are side-to-move, exactly as UCI prints them. Bound scores
 * (`lowerbound` / `upperbound`) are provisional and skipped, as is any report
 * without a principal variation. A position with no legal move gives [].
 */
import type { EngineLine } from '../generator/types';

export function parseMultiPv(lines: string[]): EngineLine[] {
  const byIndex = new Map<number, EngineLine>();
  for (const line of lines) {
    if (!line.startsWith('info ')) continue;
    if (line.includes(' lowerbound') || line.includes(' upperbound')) continue;
    const pvAt = line.indexOf(' pv ');
    if (pvAt < 0) continue;
    const head = line.slice(0, pvAt);
    const cp = head.match(/ score cp (-?\d+)/);
    const mate = head.match(/ score mate ([-+]?\d+)/);
    if (!cp && !mate) continue;
    const pv = line.slice(pvAt + 4).trim().split(/\s+/).filter(Boolean);
    if (!pv.length) continue;
    const k = Number(head.match(/ multipv (\d+)/)?.[1] ?? 1);
    byIndex.set(k, {
      uci: pv[0],
      cp: cp ? Number(cp[1]) : null,
      mate: mate ? Number(mate[1]) : null,
      pv,
    });
  }
  return [...byIndex.entries()].sort(([a], [b]) => a - b).map(([, l]) => l);
}
