/**
 * TODAY'S RATING LINE AND THE DAY'S SUMMARY ON THE PAGE (#418 v3, Phase C).
 *
 * The server decides both (backend `todayLine.ts`, `daySummary.ts`): today's line comes from `GET /api/puzzles/today`
 * and each result's `today`; the day's summary comes with the result that ends a free player's day and with every
 * refused puzzle after it (a 402's `daySummary`). This module holds their shapes and checks them: a summary the page
 * cannot draw is dropped, never half shown. Its recordings share the moment's folder (`MOMENT_AUDIO_BASE`).
 */
import type { MasterLine } from '@/features/master/narrationApi';
import { MOMENT_AUDIO_BASE, type ProgressMomentLine } from './progressMoment';

export interface TodayLine {
  /** #418 v3 C2: the day's recorded summary, when the day has ended (`GET /api/puzzles/today` replays it on load). */
  summary?: DaySummary | null;
  /** The Bucharest day, YYYY-MM-DD. */
  day: string;
  /** The first rated result's rating before, then each rated result's after. Empty when none is rated yet. */
  points: number[];
  attempts: number;
  solved: number;
}

export type DayShape = 'up' | 'recovered' | 'upMixed' | 'fadedLate' | 'down' | 'level' | 'unrated';

export interface DaySummary extends TodayLine {
  shape: DayShape;
  heading: string;
  lines: ProgressMomentLine[];
}

const SHAPES: readonly DayShape[] = ['up', 'recovered', 'upMixed', 'fadedLate', 'down', 'level', 'unrated'];

export function asTodayLine(v: unknown): TodayLine | null {
  const t = v as Partial<TodayLine> | null | undefined;
  if (!t || typeof t.day !== 'string' || !Array.isArray(t.points) || !t.points.every((p) => typeof p === 'number')) return null;
  const summary = (t as { daySummary?: unknown }).daySummary;
  return {
    day: t.day, points: t.points, attempts: Number(t.attempts) || 0, solved: Number(t.solved) || 0,
    ...(summary ? { summary: asDaySummary(summary) } : {}),
  };
}

export function asDaySummary(v: unknown): DaySummary | null {
  const line = asTodayLine(v);
  const s = v as Partial<DaySummary> | null | undefined;
  if (!line || !s || !SHAPES.includes(s.shape as DayShape) || typeof s.heading !== 'string') return null;
  if (!Array.isArray(s.lines) || s.lines.length === 0) return null;
  if (!s.lines.every((l) => l && typeof l.text === 'string' && /^[0-9a-f]{16}$/.test(String(l.key)))) return null;
  return { ...line, shape: s.shape as DayShape, heading: s.heading, lines: s.lines as ProgressMomentLine[] };
}

export function daySummaryVoiceLines(s: DaySummary): MasterLine[] {
  return s.lines.map((l) => ({ text: l.text, audioUrl: `${MOMENT_AUDIO_BASE}${l.key}.mp3`, cuesUrl: `${MOMENT_AUDIO_BASE}${l.key}.json` }));
}

/** The change over the day with its sign ("+38", "-12", "0"): never "+-12" (Codex, Fable). */
export function signedChange(points: number[]): string {
  if (points.length < 2) return '0';
  const d = points[points.length - 1] - points[0];
  return d > 0 ? `+${d}` : d < 0 ? `−${-d}` : '0';
}
