/**
 * WHICH OF HIS LINES HE SAYS NEXT (#401 B1): never the same line twice in a row for a moment (the start of a
 * puzzle, a solve, the start of a game), whatever was said in between.
 *
 * Before this a line was picked by hashing the puzzle's id (or a number fixed per game), so two puzzles running
 * repeated a line one time in three with pools of three (measured: the start line was the same as last time on 9
 * puzzles in 25).
 *
 * - Per moment ("pool"), the lines used recently are kept in this browser (`cp_master_lines`); a new choice avoids
 *   the last one (pools of up to 3) or the last two (larger pools), at random among the rest. Not "avoid all but
 *   one", which would make a fixed cycle (ABCABC).
 * - A line counts as used when its moment is REACHED (shown or said), voice on or off: his line is also text on the
 *   card, and most visitors have the voice off, so a history moved only by audio would never move for them.
 * - Storage that cannot be read or written falls back to memory for this visit; two tabs may interleave, harmless.
 */

const KEY = 'cp_master_lines';
const KEEP = 6;

export type LineHistory = Record<string, string[]>;

export interface LineStore {
  read(): LineHistory;
  write(h: LineHistory): void;
}

let memory: LineHistory = {};

/** This browser's history, or memory when storage is refused (a private window, a blocked site). */
export const browserLineStore: LineStore = {
  read() {
    try {
      const raw = window.localStorage.getItem(KEY);
      const h = raw ? (JSON.parse(raw) as unknown) : null;
      return h && typeof h === 'object' ? (h as LineHistory) : memory;
    } catch {
      return memory;
    }
  },
  write(h) {
    memory = h;
    try { window.localStorage.setItem(KEY, JSON.stringify(h)); } catch { /* memory only for this visit */ }
  },
};

/** A store held in memory (the speech simulator, tests). */
export function memoryLineStore(): LineStore {
  let h: LineHistory = {};
  return { read: () => h, write: (n) => { h = n; } };
}

/** How many of the most recent lines a choice avoids. */
export function avoidCount(poolSize: number): number {
  return Math.max(0, Math.min(poolSize <= 3 ? 1 : 2, poolSize - 1));
}

/** One line of `options` for `pool`, avoiding the ones said most recently. */
export function chooseLine(pool: string, options: readonly string[], store: LineStore = browserLineStore, rng: () => number = Math.random): string {
  if (options.length === 0) throw new Error(`no lines for ${pool}`);
  const k = avoidCount(options.length);
  const avoid = k === 0 ? [] : (store.read()[pool] ?? []).slice(-k);
  const fresh = options.filter((o) => !avoid.includes(o));
  const from = fresh.length > 0 ? fresh : options;
  return from[Math.min(from.length - 1, Math.floor(rng() * from.length))];
}

/** Records that `text` was used for `pool` (its moment was reached). */
export function noteLineUsed(pool: string, text: string, store: LineStore = browserLineStore): void {
  const h = { ...store.read() };
  h[pool] = [...(h[pool] ?? []), text].slice(-KEEP);
  store.write(h);
}
