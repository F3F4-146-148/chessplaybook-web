/**
 * The Game report's view model (#374, plan A2): one pure function from what
 * `GameReviewActions` holds to everything the report shows, so the report's
 * components hold no chess logic and every rule is tested here.
 *
 * NUMBERING, written once:
 *   - `ClassifiedMove.moveIndex` counts moves from 0 (the first move);
 *   - the graph counts POSITIONS, 0 being the start, so a move's position is moveIndex + 1;
 *   - the board counts from -1.
 * Every jump this model gives is a GRAPH POSITION, which is what the dialog's
 * `onMoveClick` takes (`GameReviewActions` converts it with `onGoTo(index - 1)`).
 *
 * A report is offered only for a game from the initial position (D36), so an even
 * `moveIndex` is White's move.
 */
import type { FullGameAnalysis, MoveClassificationCounts } from '@/services/GameAnalysisService';
import type { ChessGame } from '@/types/chess';
import type { GameSummaryResult } from './useGameReview';

export type Band = 'best' | 'excellent' | 'inaccuracy' | 'mistake' | 'blunder';
export type ClassKey = 'brilliant' | 'best' | 'excellent' | 'good' | 'inaccuracy' | 'mistake' | 'blunder' | 'severe_blunder';
export type PhaseName = 'Opening' | 'Middlegame' | 'Endgame';

export interface ReportPlayer {
  name: string;
  accuracy: number;
  outcome: 'Won' | 'Lost' | 'Drew';
}

export interface ReportMove {
  /** The graph position to jump to (moveIndex + 1). */
  position: number;
  side: 'white' | 'black';
  /** "17. Nd4" or "17... Nd4". */
  label: string;
}

export interface ReportClass {
  key: ClassKey;
  name: string;
  white: number;
  black: number;
  /** Both sides' moves of this class, in game order. */
  moves: ReportMove[];
  /** A row that opens to its moves. */
  openable: boolean;
}

export interface ReportPhase {
  name: PhaseName;
  score: number;
  band: Band;
  /** Graph positions covered, inclusive, clamped to the game. */
  from: number;
  to: number;
}

export interface ReportView {
  white: ReportPlayer;
  black: ReportPlayer;
  rating: { value: number; rounded: number; label: string; band: Band };
  phases: ReportPhase[];
  bonus: string | null;
  classes: ReportClass[];
  /** The server's critical move, as a jump. */
  critical: {
    position: number;
    moveNumber: number;
    /** What the button calls it (owner, 2026-11-19: 22.Be3 is no turning point). */
    label: string;
  } | null;
  /** The last graph position (= number of moves). */
  lastPosition: number;
}

/** The one colour band for any score, used everywhere in the report (plan A2). */
export function bandFor(score: number): Band {
  if (score >= 90) return 'best';
  if (score >= 80) return 'excellent';
  if (score >= 70) return 'inaccuracy';
  if (score >= 60) return 'mistake';
  return 'blunder';
}

/** "Tal, Mihail" -> "Tal"; "You" stays; empty or "?" -> the side's name. */
export function displayName(raw: string | undefined, side: 'White' | 'Black'): string {
  const name = (raw ?? '').trim();
  if (!name || name === '?') return side;
  const comma = name.indexOf(',');
  const short = comma > 0 ? name.slice(0, comma).trim() : name;
  return short || side;
}

/** "17. Nd4" for White's 17th move, "17... Nd4" for Black's. */
export function moveLabel(moveIndex: number, san: string): string {
  const number = Math.floor(moveIndex / 2) + 1;
  return `${number}${moveIndex % 2 === 0 ? '.' : '...'} ${san}`;
}

const CLASSES: Array<{ key: ClassKey; name: string; openable: boolean }> = [
  { key: 'brilliant', name: 'Brilliant', openable: true },
  { key: 'best', name: 'Best', openable: false },
  { key: 'excellent', name: 'Excellent', openable: false },
  { key: 'good', name: 'Good', openable: false },
  { key: 'inaccuracy', name: 'Inaccuracy', openable: true },
  { key: 'mistake', name: 'Mistake', openable: true },
  { key: 'blunder', name: 'Blunder', openable: true },
  { key: 'severe_blunder', name: 'Severe Blunder', openable: true },
];

/** A phase's inclusive move range [s, e] covers graph positions [s, e + 1], clamped. */
export function phasePositions(range: [number, number], lastPosition: number): { from: number; to: number } | null {
  const from = Math.max(0, Math.min(range[0], lastPosition));
  const to = Math.max(from, Math.min(range[1] + 1, lastPosition));
  if (range[0] > lastPosition) return null;
  return { from, to };
}

/*
  THE CRITICAL MOVE'S BUTTON SAYS WHAT THE MOVE IS (#374, owner on staging, 2026-11-19), never
  "the turning point". Since #379 the critical move is the hard-to-find reply that took the chance
  the opponent gave (BRILLIANT_MOVES_ANALYSIS §7): a good move, so the button names the mover and
  the move ("Go to move 30: Kasparov's Nd4"), with "brilliant" when it is one. Without the move's
  SAN it says "the critical moment".
*/
const CRITICAL_WORD: Partial<Record<string, string>> = { brilliant: 'brilliant' };

export function buildReportView({
  analysis, summary, metadata, sans, gameResult,
}: {
  analysis: FullGameAnalysis;
  summary: GameSummaryResult | null;
  metadata?: ChessGame;
  /** The game's moves in SAN, in order (from the game model's plies). */
  sans: string[];
  gameResult: 'white' | 'black' | 'draw';
}): ReportView {
  const outcome = (side: 'white' | 'black'): ReportPlayer['outcome'] =>
    gameResult === 'draw' ? 'Drew' : gameResult === side ? 'Won' : 'Lost';
  const lastPosition = Math.max(0, analysis.evalGraph.length - 1);

  const rating = analysis.gameRating;
  const phaseDefs: Array<[PhaseName, number, [number, number] | null]> = [
    ['Opening', rating.opening, analysis.phases?.opening ?? null],
    ['Middlegame', rating.middlegame, analysis.phases?.middlegame ?? null],
    ['Endgame', rating.endgame, analysis.phases?.endgame ?? null],
  ];
  const phases: ReportPhase[] = [];
  for (const [name, score, range] of phaseDefs) {
    if (!(score > 0)) continue; // a phase whose score is 0 or less is left out, as before
    const pos = range ? phasePositions(range, lastPosition) : null;
    if (!pos) continue;
    phases.push({ name, score, band: bandFor(score), ...pos });
  }
  const bonusParts: string[] = [];
  if (rating.phaseBonus > 0) bonusParts.push(`Phase +${rating.phaseBonus}`);
  if (rating.resultBonus > 0) bonusParts.push(`Result +${rating.resultBonus}`);

  const classes: ReportClass[] = CLASSES.map(({ key, name, openable }) => {
    const moves = analysis.classifiedMoves
      .filter(m => m.classification === key)
      .sort((a, b) => a.moveIndex - b.moveIndex)
      .map(m => ({
        position: m.moveIndex + 1,
        side: (m.moveIndex % 2 === 0 ? 'white' : 'black') as 'white' | 'black',
        label: moveLabel(m.moveIndex, sans[m.moveIndex] ?? ''),
      }));
    const k = key as keyof MoveClassificationCounts;
    return {
      key, name,
      white: analysis.whiteCounts[k] ?? 0,
      black: analysis.blackCounts[k] ?? 0,
      moves,
      openable: openable && moves.length > 0,
    };
  });

  const cmi = summary?.criticalMoveIndex;
  const criticalLabel = (mi: number): string => {
    const number = Math.floor(mi / 2) + 1;
    const cls = analysis.classifiedMoves.find(m => m.moveIndex === mi)?.classification;
    const word = cls ? CRITICAL_WORD[cls] : undefined;
    const san = sans[mi];
    if (!san) return `Go to move ${number}, the critical moment`;
    const mover = mi % 2 === 0 ? displayName(metadata?.white, 'White') : displayName(metadata?.black, 'Black');
    return word ? `Go to move ${number}: ${mover}'s ${word} ${san}` : `Go to move ${number}: ${mover}'s ${san}`;
  };
  const critical = cmi !== null && cmi !== undefined && cmi >= 0 && cmi < lastPosition
    ? { position: cmi + 1, moveNumber: Math.floor(cmi / 2) + 1, label: criticalLabel(cmi) }
    : null;

  return {
    white: { name: displayName(metadata?.white, 'White'), accuracy: analysis.whiteAccuracy, outcome: outcome('white') },
    black: { name: displayName(metadata?.black, 'Black'), accuracy: analysis.blackAccuracy, outcome: outcome('black') },
    rating: { value: rating.overall, rounded: Math.round(rating.overall), label: rating.label, band: bandFor(rating.overall) },
    phases,
    bonus: bonusParts.length ? bonusParts.join(' · ') : null,
    classes,
    critical,
    lastPosition,
  };
}
