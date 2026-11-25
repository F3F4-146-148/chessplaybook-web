/**
 * A DRAFT, dev server only (owner, 2026-11-23: "really need to see how it looks before we publish"): the 2024 title
 * match's last game, recapped in the format the 2026 recaps will use, so the owner judges the format and the
 * explainer's moments on a real game before game 1 is played. Never routed in production (`draft: true`).
 *
 * Facts from the game record (local database, id 47084; its Date header is broken there, "[object Object]", so the
 * saved PGN carries the real date) and from the engine: the evaluations are bake-recap-moments.ts --swings at depth 16.
 */

import type { GameRecap } from '../types';
import pgn from './wch2024-game-14.pgn?raw';
import baked from '../moments/draft-2024-game-14.json';
import type { BakedMoments } from '../types';

export const DRAFT_WCH2024_GAME_14: GameRecap = {
  slug: 'draft-2024-game-14',
  draft: true,
  game: null,
  kicker: 'Draft format · World Championship 2024 · Game 14',
  title: 'One rook move decides the title',
  subtitle: 'Ding Liren 0-1 Gukesh, Singapore',
  lead:
    'For 54 moves the last game of the match was level, and a draw would have sent it to tiebreaks. Then 55.Rf2 ' +
    'offered the trade of rooks, the engine’s evaluation fell from −0.32 to −7.45, and three moves later ' +
    'Black had a won pawn ending.',
  dateLabel: '12 December 2024',
  resultLine: 'Gukesh won with Black',
  scoreLine: 'Final score: Gukesh 7½ - 6½ Ding',
  pgn,
  gameLabel: 'Ding Liren 0-1 Gukesh',
  moments: [
    {
      ply: 108,
      heading: 'After 54...Ke5: still level',
      paragraphs: [
        'Black has the extra pawn, f5 and g4 against g3, but the engine gives only −0.32. With a rook and a light-squared ' +
          'bishop each, White can hold: the engine’s move here is 55.Ra4, keeping the rooks on the board.',
      ],
    },
    {
      ply: 109,
      heading: '55.Rf2: the losing move',
      paragraphs: [
        'The rook comes back to f2, on the rank of Black’s rook, and offers the trade. After 55...Rxf2 the engine gives ' +
          '−7.45: once the rooks are gone, the trade of bishops that follows leaves a pawn ending White cannot hold.',
        'One move earlier the evaluation was −0.32, and before this move no move of the game had changed it by even half a pawn.',
      ],
    },
    {
      ply: 116,
      heading: 'After 58...Ke5: a won pawn ending',
      paragraphs: [
        'Only the kings and three pawns are left. Black’s king stands in front of its pawns, and the engine’s line ' +
          'pushes the f-pawn through. Ding resigned here.',
      ],
    },
  ],
  baked: baked as BakedMoments,
  sections: [
    {
      heading: 'A quiet opening',
      paragraphs: [
        'Ding opened 1.Nf3 d5 2.g3 and castled early. Gukesh exchanged on d4 twice, and by move 30 the queens were off ' +
          'the board after 30.Qxb4 Rxb4.',
      ],
    },
    {
      heading: 'A long, level ending',
      paragraphs: [
        'One pair of rooks came off with 31.Ra8 Rxa8 32.Bxa8. Black kept an extra pawn on the kingside, f5 and g4 against ' +
          'g3, but with a rook and a bishop each the engine never had either side more than 0.8 of a pawn ahead before move 55.',
      ],
    },
    {
      heading: '55.Rf2 and the pawn ending',
      paragraphs: [
        'After 55.Rf2 Rxf2 56.Kxf2 Bd5 57.Bxd5 Kxd5 58.Ke3 Ke5 only the kings and three pawns were left, and White resigned.',
      ],
    },
  ],
  sources: ['the game from the ', { text: 'Chess Playbook games database', href: '/champions/gukesh/games' }, '.'],
};
