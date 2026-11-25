/**
 * A game recap of the 2026 World Championship match (owner, 2026-11-23): one page per game at
 * /news/world-championship-2026/game-N, written after the game and read by the owner before it is published.
 *
 * A recap is data, not a page: the page (src/pages/WorldChampionship2026Recap.tsx) draws every recap the same way.
 * The owner's rules for it (2026-11-23):
 *   - TEXT FIRST: the story of the game in words, with what happened off the board (and the venue in game 1), for
 *     readers who do not want the moves; the key moments and the replay board come after it.
 *   - FIDE's official photos, credited.
 *   - The key moments explained in the recap's own words (option c), every chess claim from the engine: the facts are
 *     baked by `backend/scripts/bake-recap-moments.ts` into `moments/<slug>.json` (evaluations and lines), so the page
 *     needs no engine and no request. The explainer's text is a writing aid only (`*.explainer-notes.json`).
 */

/** The engine's view of one position, as the bake writes it. */
export interface EngineView {
  /** White's evaluation in pawns (a forced mate is +-100, with `mate` set). */
  eval: number;
  mate?: number;
  /** The engine's line in SAN, best move first. */
  line: string[];
}

/** One baked moment: the move, the position it left, and the engine's view before and after it. */
export interface BakedMoment {
  ply: number;
  moveNumber: number;
  color: 'white' | 'black';
  san: string;
  lastMove: [string, string];
  fen: string;
  before: EngineView;
  after: EngineView;
}

export interface BakedMoments {
  engine: string;
  bakedAt: string;
  moments: BakedMoment[];
}

/** What the recap says about a moment, in its own words, beside the board and the engine's facts. */
export interface RecapMoment {
  ply: number;
  heading: string;
  paragraphs: string[];
}

export interface RecapPhoto {
  src: string;
  width: number;
  height: number;
  alt: string;
  /** Exactly as the source gives it, e.g. "FIDE / Michal Walusza". */
  credit: string;
}

export interface RecapSection {
  heading: string;
  paragraphs: string[];
  /** A photo under the section's text. */
  photo?: RecapPhoto;
}

/** A piece of the sources line: text, or a named source with its link. */
export type RecapSourcePart = string | { text: string; href: string };

export interface GameRecap {
  /** The URL's last segment: `game-1` for a published recap, `draft-...` for a dev-only draft. */
  slug: string;
  /** A draft is drawn on the dev server only: never routed, built, listed or linked in production. */
  draft?: boolean;
  /** The match game, 1-14; null for a draft about another match. */
  game: number | null;
  kicker: string;
  title: string;
  subtitle: string;
  /** 2-3 sentences: what decided the game. */
  lead: string;
  /** The game's date, as shown ("24 November 2026"). */
  dateLabel: string;
  /** The meta row: the result line and the match score after the game. */
  resultLine: string;
  scoreLine: string;
  /** The photo under the header. */
  photo?: RecapPhoto;
  /** A tall picture for the News card's narrow column on wider screens (the card's box is taller than wide, so a wide
   *  two-player photo lost both players there); phones show `photo`. Owner, 2026-11-24. */
  cardImage?: string;
  /** The story, in words: off the board, the venue, the game. */
  sections: RecapSection[];
  moments: RecapMoment[];
  baked: BakedMoments;
  /** The whole game, as the Lichess broadcast or the database gives it. */
  pgn: string;
  /** The board's label in the viewer, e.g. "Sindarov 1-0 Gukesh". */
  gameLabel: string;
  /** FIDE's broadcast of the game (GAME_STREAMS), for the replay. */
  videoId?: string;
  /** One short line at the foot, read in order: plain text, and links where a source is named (owner, 2026-11-24:
   *  the quotes and the reported facts are attributed here, the photo credit is already under each photo). */
  sources: RecapSourcePart[];
}
