/**
 * THE OPENING TRAINER'S WELCOME (#337, owner 2026-11-18): a first visit to /openings opens on the goals of the
 * opening, not on the London System, and the player is then invited to choose an opening; the Master introduces an
 * opening only after it is chosen. The texts are the owner's approved wording, said by the Master when his voice is
 * on (recorded offline: `backend/scripts/master/synthesize-kokoro.ts --voice` with `welcomeTexts()`), and each goal
 * draws its idea on the starting position in the reasons' own marks format (reasonBoardMarks.ts).
 *
 * A goal carries a reason key only for its kind's marker and colour (reasonKinds.ts); nothing here is computed.
 */
export const WELCOME_INTRO = 'Welcome to the Opening Trainer. Every good opening does the same few things:';
export const WELCOME_END = 'Choose an opening on the left, and I will show you how it does these things.';

export interface WelcomeGoal { key: string; text: string; marks: string }

export const WELCOME_GOALS: readonly WelcomeGoal[] = [
  { key: 'centre', text: 'Take the centre with your pawns.', marks: 'd4 e4 d5 e5' },
  { key: 'development', text: 'Bring out your knights and bishops.', marks: 'b1c3 g1f3 c1f4 f1c4' },
  { key: 'castle', text: 'Castle to keep your king safe.', marks: 'e1g1' },
  { key: 'rooks', text: 'Connect your rooks.', marks: 'a1h1' },
  { key: 'activity', text: 'Move each piece once in the opening, and keep your queen at home early on.', marks: 'd1' },
  // owner, 2026-11-18: every move has a purpose; no mark, it is about every move
  { key: 'threatens', text: 'Give every move a purpose: it should gain something for you, stop your opponent from gaining something, or take away their options.', marks: '' },
];

/** Everything he says on the welcome, in order: the intro, each goal, the closing line. */
export function welcomeTexts(): string[] {
  return [WELCOME_INTRO, ...WELCOME_GOALS.map((g) => g.text), WELCOME_END];
}

/**
 * Who each opening suits, under its name in the Repertoire card (owner-approved wording, #337). An opening without a
 * line shows its side only.
 */
export const REPERTOIRE_SUITS: Readonly<Record<string, string>> = {
  london: 'One set-up against almost anything, easy to learn.',
  // owner-approved 2026-11-20
  colle: 'Extremely solid and easy to learn.',
  french: 'Solid, with a clear plan against 1.e4.',
  // drafts, published unreviewed (owner, 2026-11-23); the owner's review is #443
  'caro-kann': 'Solid and safe against 1.e4.',
  najdorf: 'Sharp and ambitious against 1.e4.',
  slav: 'Solid and sound against 1.d4.',
};

/**
 * The openings as the Repertoire card lists them before the server's list arrives (prerender plan B1a, 2026-11-19): their
 * names and sides are written text, so a built page shows them instead of "Loading.". The server's list replaces it,
 * so a new opening appears once it is served; keep these in the server's order and words (`/api/openings/repertoires`).
 */
export const WRITTEN_STARTERS: ReadonlyArray<{ id: string; name: string; side: 'white' | 'black' }> = [
  { id: 'colle', name: 'Colle System', side: 'white' },
  { id: 'london', name: 'London System', side: 'white' },
  { id: 'caro-kann', name: 'Caro-Kann Defense', side: 'black' },
  { id: 'french', name: 'French Defense', side: 'black' },
  { id: 'najdorf', name: 'Sicilian Najdorf', side: 'black' },
  { id: 'slav', name: 'Slav Defense', side: 'black' },
];

/** The opening last used in this browser: a returning player goes straight to it (#337). */
export const LAST_REPERTOIRE_KEY = 'cp_openings_repertoire';

export function readLastRepertoire(): string | null {
  try { return window.localStorage.getItem(LAST_REPERTOIRE_KEY); } catch { return null; }
}

export function writeLastRepertoire(id: string): void {
  try { window.localStorage.setItem(LAST_REPERTOIRE_KEY, id); } catch { /* remembered for this visit only */ }
}
