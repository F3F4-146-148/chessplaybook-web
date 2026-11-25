/**
 * THE PROGRESS MOMENT ON THE PAGE (#418 C1-C4).
 *
 * The server decides that a moment comes and what he says (backend momentRule.ts and momentCompose.ts), and sends it
 * in the answer to a clean solve. This module holds its shape, where its recordings are, and how the captions follow
 * him: one phrase at a time in the live card's line under the headline, timed by the recording's word timings while
 * his voice plays, at reading pace while it is off.
 *
 * Off unless `PROGRESS_MOMENT_LIVE` (design flags) and the server's `PROGRESS_MOMENT_LIVE=on`.
 */
import type { MasterLine } from '@/features/master/narrationApi';

export interface ProgressMomentLine { text: string; key: string; role: string }

export interface ProgressMoment {
  puzzleId: string;
  tryId: string;
  kind: 'first' | 'second' | 'third' | 'best';
  why: 'atLevel' | 'recovered' | 'ceiling' | 'best';
  startRating: number;
  gain: number;
  /** The sitting's ratings: the start, then one per rated result up to this one. */
  points: number[];
  heading: string;
  lines: ProgressMomentLine[];
  /** 3 or more days with puzzles before this sitting (the server's rule). */
  returning?: boolean;
}

/**
 * The moment's own folder (PUZZLE_BAKE_RUNBOOK section 7), never master-v3. v2 (#454, owner 2026-11-23): voiced again
 * at 1.15 in one pass after a lead-in that is cut off (`--carrier`), as the puzzle lines; v1 was 1.2, sentence by
 * sentence. Recordings are cached for a year, so a re-voice needs a new folder.
 */
export const MOMENT_AUDIO_BASE = '/audio/master-moment-v2/';

export function momentVoiceLines(m: ProgressMoment): MasterLine[] {
  return m.lines.map((l) => ({ text: l.text, audioUrl: `${MOMENT_AUDIO_BASE}${l.key}.mp3`, cuesUrl: `${MOMENT_AUDIO_BASE}${l.key}.json` }));
}

/** A shape check on the server's answer: a moment the page cannot draw is dropped, never half shown. */
export function asProgressMoment(v: unknown, puzzleId: string): ProgressMoment | null {
  const m = v as Partial<ProgressMoment> | null | undefined;
  if (!m || m.puzzleId !== puzzleId || !Array.isArray(m.points) || m.points.length < 2) return null;
  if (!Array.isArray(m.lines) || m.lines.length === 0 || typeof m.heading !== 'string') return null;
  if (!m.lines.every((l) => l && typeof l.text === 'string' && /^[0-9a-f]{16}$/.test(String(l.key)))) return null;
  return m as ProgressMoment;
}

export interface TimedPhrase { text: string; start: number; end: number }

/** The text's phrases, each ending with its , . ! ? ; or : (the same cut as backend wordTimings.ts). */
export function phrasesOf(text: string): string[] {
  const out: string[] = [];
  let cur = '';
  for (const ch of text) {
    cur += ch;
    if (/[,.!?;:]/.test(ch)) { if (cur.trim()) out.push(cur.trim()); cur = ''; }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

const timingCache = new Map<string, Promise<TimedPhrase[]>>();

/** The recording's phrases with their times (`<key>.words.json`); none when it fails to load. */
export function loadPhrases(key: string): Promise<TimedPhrase[]> {
  let p = timingCache.get(key);
  if (!p) {
    p = fetch(`${MOMENT_AUDIO_BASE}${key}.words.json`)
      .then((r) => (r.ok && (r.headers.get('content-type') ?? '').includes('json') ? r.json() : { phrases: [] }))
      .then((w: { phrases?: TimedPhrase[] }) => (Array.isArray(w.phrases) ? w.phrases : []))
      .catch(() => []);
    timingCache.set(key, p);
  }
  return p;
}

/*
  ONE LINE PER CAPTION. The live card's height is fixed by the layout, and at 1280x800 "Correct! Puzzle solved." wraps
  beside his face, so a two-line caption pushed Explain solution 2 px out of the card (measured, C7). A phrase longer
  than the line holds is cut at word boundaries into pieces of at most `maxChars`, the caller's measure of the line.
*/
export function splitCaption(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let cur = '';
  for (const w of words) {
    if (cur && cur.length + 1 + w.length > maxChars) { out.push(cur); cur = w; } else cur = cur ? `${cur} ${w}` : w;
  }
  if (cur) out.push(cur);
  // never a lone short word at the end: it joins the piece before when that still fits a little over
  if (out.length > 1 && out[out.length - 1].length < 8 && out[out.length - 2].length + 1 + out[out.length - 1].length <= maxChars * 1.15) {
    out.splice(-2, 2, `${out[out.length - 2]} ${out[out.length - 1]}`);
  }
  return out.length ? out : [text];
}

/**
 * The caption `t` seconds into a recording: the phrase being said (the last one started), and within a phrase too
 * long for one line, the piece its time has reached (by characters, the pieces of one phrase share its time).
 */
export function phraseAt(phrases: readonly TimedPhrase[], t: number, maxChars = Infinity): string | null {
  if (!phrases.length) return null;
  let p = phrases[0];
  for (const x of phrases) if (x.start <= t + 0.05) p = x;
  const pieces = splitCaption(p.text, maxChars);
  if (pieces.length === 1) return pieces[0];
  const total = pieces.reduce((n, s) => n + s.length, 0);
  const k = Math.min(1, Math.max(0, (t - p.start) / Math.max(0.01, p.end - p.start)));
  let acc = 0;
  for (const s of pieces) { acc += s.length; if (k * total < acc) return s; }
  return pieces[pieces.length - 1];
}

/*
  READING PACE, WITH HIS VOICE OFF (most visitors): each phrase stays about 15 characters a second, never under 1.2 s
  (analysis 3.7). Shorter than his speech, so a silent moment never holds Auto next longer than a spoken one.
*/
export const READ_CHARS_PER_S = 15;
export const READ_MIN_S = 1.2;

export interface ReadingStep { text: string; line: number; ms: number }

/** The captions of the moment in order, from line `fromLine` on, one line each, with how long each stays. */
export function readingSteps(m: ProgressMoment, fromLine = 0, maxChars = Infinity): ReadingStep[] {
  return m.lines.flatMap((l, line) => (line < fromLine ? [] : phrasesOf(l.text)
    .flatMap((p) => splitCaption(p, maxChars)).map((text) => ({
      text, line, ms: Math.max(READ_MIN_S, text.length / READ_CHARS_PER_S) * 1000,
    }))));
}

/** Auto next waits for the moment and this much more, to look at the graph, never longer than the cap. */
export const MOMENT_LOOK_MS = 2000;
export const MOMENT_AUTO_ADVANCE_MAX_MS = 20000;
/** His ordinary solved line waits this long for the result's answer, in case it brings a moment. */
export const MOMENT_HOLD_MS = 1500;
