/**
 * The free plan's daily limits, as the site meets them (2026-11-13).
 *
 * The server refuses with HTTP 402 and `{ error: 'daily_limit', feature, limit, resetsAt }`
 * (backend/src/services/funnel/freePlanLimits.ts). This turns that answer into one sentence
 * the player can act on, and records it for the funnel (stage 7, `limit_reached`).
 *
 * Reporting a limit also opens the one daily-limit dialog (DailyLimitDialog, mounted in the site
 * shell), which says when it is back and offers the Premium page.
 */
import { logGA4Event } from '@/services/analytics';

export type LimitedFeature = 'game_report' | 'explain_position' | 'challenge_session' | 'opening_session' | 'opening_variation' | 'game_puzzles' | 'puzzle_explanation' | 'puzzle' | 'guided_game';

export interface DailyLimit {
  feature: LimitedFeature;
  limit: number;
  /** ISO UTC: the next Europe/Bucharest midnight. */
  resetsAt: string;
}

const FEATURES: readonly LimitedFeature[] = ['game_report', 'explain_position', 'challenge_session', 'opening_session', 'opening_variation', 'game_puzzles', 'puzzle_explanation', 'puzzle', 'guided_game'];

/** The free plan's daily allowances: backend FREE_PLAN_LIMITS (a test reads it, so the two cannot drift). */
export const FREE_PLAN_ALLOWANCE: Readonly<Record<LimitedFeature, number>> = {
  game_report: 1,
  explain_position: 3,
  challenge_session: 1,
  opening_session: 1,
  opening_variation: 1,
  game_puzzles: 3,
  puzzle_explanation: 3,
  /* Attempted puzzles (#521), behind the server's PUZZLE_LIMIT. */
  puzzle: 5,
  guided_game: 1,
};

/** The window event the daily-limit dialog listens for; its `detail` is the DailyLimit. */
export const DAILY_LIMIT_EVENT = 'cp:daily-limit';

/** The limit an error answer carries, or null when it is some other error. */
export function readDailyLimit(status: number | undefined, body: unknown): DailyLimit | null {
  if (status !== 402 || !body || typeof body !== 'object') return null;
  const value = body as Record<string, unknown>;
  if (value.error !== 'daily_limit') return null;
  if (!FEATURES.includes(value.feature as LimitedFeature)) return null;
  if (typeof value.limit !== 'number' || typeof value.resetsAt !== 'string') return null;
  return { feature: value.feature as LimitedFeature, limit: value.limit, resetsAt: value.resetsAt };
}

/** "tomorrow", "at 02:00" or "tomorrow at 02:00", in the visitor's own time. */
export function whenBack(resetsAt: string, now: Date = new Date()): string {
  const at = new Date(resetsAt);
  if (Number.isNaN(at.getTime())) return 'tomorrow';
  // At the visitor's own midnight (every visitor in Romania), "tomorrow" says it all.
  if (at.getHours() === 0 && at.getMinutes() === 0) return 'tomorrow';
  const time = at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return at.toDateString() === now.toDateString() ? `at ${time}` : `tomorrow at ${time}`;
}

/** What was used up, as a dialog title. */
export function dailyLimitTitle(limit: DailyLimit): string {
  switch (limit.feature) {
    case 'game_report': return "That's today's free game report";
    case 'explain_position': return `That's today's ${limit.limit} free explanations`;
    case 'challenge_session': return "That's today's free Champion Challenge";
    case 'opening_session': return "That's today's free training session";
    case 'opening_variation': return "That's today's free variation";
    case 'game_puzzles': return `That's today's ${limit.limit} free games`;
    case 'puzzle_explanation': return `That's today's ${limit.limit} free puzzle explanations`;
    case 'guided_game': return "That's today's free guided game";
    case 'puzzle': return `That's today's ${limit.limit} free puzzles`;
  }
}

/** When the visitor can do it again, in their own time. */
export function dailyLimitBack(limit: DailyLimit, now: Date = new Date()): string {
  const back = whenBack(limit.resetsAt, now);
  switch (limit.feature) {
    case 'game_report': return `You can review another game ${back}.`;
    case 'explain_position': return `You can explain more positions ${back}.`;
    case 'challenge_session': return `You can play another one ${back}.`;
    case 'opening_session': return `You can train again ${back}.`;
    case 'opening_variation': return `You can learn another one ${back}.`;
    case 'game_puzzles': return `You can make puzzles from more games ${back}.`;
    case 'puzzle_explanation': return `You can read more ${back}.`;
    case 'guided_game': return `You can play another one ${back}. You can still play the Master without his help, as many games as you like.`;
    case 'puzzle': return `You can solve more ${back}.`;
  }
}

export function dailyLimitMessage(limit: DailyLimit, now: Date = new Date()): string {
  const used = {
    game_report: "You've used today's free game report.",
    explain_position: `You've used today's ${limit.limit} free explanations.`,
    challenge_session: "You've played today's free Champion Challenge.",
    opening_session: "You've used today's free training session.",
    opening_variation: "You've learned today's free variation.",
    game_puzzles: `You've used today's ${limit.limit} free games.`,
    puzzle_explanation: `You've read today's ${limit.limit} free puzzle explanations.`,
    guided_game: "You've used today's free guided game.",
    puzzle: `You've used today's ${limit.limit} free puzzles.`,
  }[limit.feature];
  return `${used} ${dailyLimitBack(limit, now)}`;
}

/**
 * A refused button's own label, short enough for a half-width button (#472): "Back tomorrow" when the reset falls on
 * the visitor's next day (Romania, India), else the hour later today ("Back at 5 PM", the Americas), minutes only
 * when they are not zero. The reset is always within a day, so the day and the hour are enough.
 */
export function backLabel(limit: DailyLimit, now: Date = new Date()): string {
  const at = new Date(limit.resetsAt);
  if (Number.isNaN(at.getTime()) || at.toDateString() !== now.toDateString()) return 'Back tomorrow';
  const time = at.toLocaleTimeString([], at.getMinutes() === 0 ? { hour: 'numeric' } : { hour: 'numeric', minute: '2-digit' });
  return `Back at ${time}`;
}

/** Whether a limit still applies (its reset has not come yet). */
export function limitApplies(limit: DailyLimit | null, now: number = Date.now()): limit is DailyLimit {
  return !!limit && !(Date.parse(limit.resetsAt) <= now);
}

/** #521 B: record that the visitor met a limit (GA4), without the dialog: a page that shows its own ask. */
export function recordDailyLimit(limit: DailyLimit): void {
  logGA4Event({ name: 'limit_reached', params: { feature: limit.feature } });
}

/** #521 B2: the window event a page showing the puzzle ask listens for; its `detail` is the DailyLimit. */
export const PUZZLE_ASK_EVENT = 'cp:puzzle-ask';
let puzzleAskHosts = 0;

/**
 * #521 B2: while a page that shows the puzzle ask in its own card is mounted (/puzzles), every refusal of the
 * `puzzle` allowance goes to that card, not the dialog: a draw, a first move from a second tab, a result, a run or a
 * plan day. Elsewhere (the plan page has no live card) the dialog still opens, so no refusal goes unexplained.
 * Returns the release.
 */
export function hostPuzzleAsk(): () => void {
  puzzleAskHosts += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    puzzleAskHosts -= 1;
  };
}

/** Record that the visitor met a limit (GA4 mirror of funnel stage 7), and open the dialog (or the puzzle ask). */
export function reportDailyLimit(limit: DailyLimit): void {
  logGA4Event({ name: 'limit_reached', params: { feature: limit.feature } });
  if (typeof window === 'undefined') return;
  const event = limit.feature === 'puzzle' && puzzleAskHosts > 0 ? PUZZLE_ASK_EVENT : DAILY_LIMIT_EVENT;
  window.dispatchEvent(new CustomEvent<DailyLimit>(event, { detail: limit }));
}

/** Open the dialog for a limit already met (#428 D6: a tap on the line that says so); not a new `limit_reached`. */
export function openDailyLimitDialog(limit: DailyLimit): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent<DailyLimit>(DAILY_LIMIT_EVENT, { detail: limit }));
}

/**
 * #521: the puzzle allowance's refusal in an answer, when it is THIS player's: a 402 with feature `puzzle` for a
 * request that carried an identity. A request with none (a signed-in player's token briefly unavailable sends none,
 * by design) is refused like a used-up allowance, and that is a failed request, not their limit.
 */
export function puzzleLimitOf(status: number, body: unknown, headers: Record<string, string>): DailyLimit | null {
  const limit = readDailyLimit(status, body);
  if (!limit || limit.feature !== 'puzzle') return null;
  return headers.Authorization || headers['X-Anonymous-Id'] ? limit : null;
}
