/**
 * Game 3's recap, from the owner's account of the game (notes of 2026-11-26), every chess and clock claim checked:
 *   - Clocks: the [%clk] comments of the Lichess broadcast PGN (games/game-3.pgn), recap_game.py clocks 3. Gukesh's
 *     first 15 moves took 2 min 12 s (his longest 32 s, 10...Nxd4). Sindarov: 6.Qe2 3:43, 9.Qe4 6:25, 10.Nd4 9:10,
 *     12.Nc3 9:09, 13.Na4 4:00 (13...Qb8 in 6 s), 14.a3 7:00, 16.b3 15:05, 21.c3 16:06. After 12...Be6 the clocks
 *     read 1:29:15 against 1:58:09. Gukesh: 16...Qxd4 11:00, 19...h5 14:32, 21...Kd7 13:31, 23...Rhb8 11:18.
 *   - Evaluations: Stockfish, bake-recap-moments.ts --swings (depth 16), White's view: at most +0.69 (after 6...Nd6),
 *     +0.65 after 9.Qe4, +0.31 after 12...Be6, between 0.00 and +0.20 from the queen trade (16...Qxd4) on.
 *     "A significant advantage" in the owner's notes became "a little better" (owner, 2026-11-26).
 *   - The opening's names from the opening book's named lines: 5...Be7 is the Rio de Janeiro Variation of the Berlin,
 *     8...Nf5 its Cordel line. Game 1 went 5...Nd6, the main line.
 *
 *   - The ending: 29.f4 cost nothing (0.00), 29...gxf4 took Gukesh 15:51. Sindarov had 1:20 after 37.b5 and 0:08
 *     after 39.Bb4, about 7 s after 40.Rc1 (30:36 with the 30 min and 30 s added; the broadcast showed 7 s, owner); Black's edge in those moves at most -0.39 (after 39.Bb4). 47...Rxe1 traded the last rooks; after
 *     49...Kxf6 Black a pawn up, 0.00 from there; draw agreed after 60...Kf3 (the position had been seen twice).
 */

import type { BakedMoments, GameRecap } from './types';
import pgn from './games/game-3.pgn?raw';
import baked from './moments/game-3.json';

export const GAME_3_RECAP: GameRecap = {
  slug: 'game-3',
  game: 3,
  kicker: 'World Championship 2026 · Game 3',
  title: 'Game 3: Gukesh’s preparation makes Sindarov think',
  subtitle: 'Sindarov ½-½ Gukesh, Geneva',
  lead:
    'This game was different. In the first two games Sindarov looked the more comfortable player. This time he was ' +
    'the one who had to work. Gukesh left the Berlin’s main line on move 5 with a line he knew by heart, asked the ' +
    'questions in the middlegame and looked in control all game. When Sindarov stirred up the endgame, Gukesh answered ' +
    'every try, ready to strike if one went wrong. The game ended in a draw.',
  dateLabel: '26 November 2026',
  resultLine: 'Draw in 60 moves',
  scoreLine: 'Score: Sindarov 1½ - 1½ Gukesh',
  photo: {
    src: '/assets/news/wch-2026-game-3/players-at-the-board.webp',
    width: 1400,
    height: 933,
    alt: 'Sindarov thinks with his hand on his cheek while Gukesh writes down his move in game 3',
    credit: 'FIDE / Y.E. Nisenbaum',
  },
  /* Two strips of sindarov-thinking.webp: Sindarov's face, Gukesh playing a move (CREDITS.md). */
  cardImage: '/assets/news/wch-2026-game-3/card-split.webp',
  sections: [
    {
      heading: 'An older Berlin, played at speed',
      paragraphs: [
        'Sindarov began with 1.e4 for the second time in the match, and Gukesh went for the Berlin again. In game 1 he ' +
          'had played the main line, 5...Nd6. This time he chose 5...Be7, the Rio de Janeiro Variation, an older way of ' +
          'meeting White’s centre.',
        'The engine liked White’s position a little more, but Gukesh had clearly chosen it on purpose. He played as if ' +
          'he knew every move by heart, his first fifteen moves in just over two minutes.',
        'Sindarov, on the other hand, had to work. Before 9.Qe4 he reached for the queen three or four times and pulled ' +
          'his hand back each time.',
      ],
      photo: {
        src: '/assets/news/wch-2026-game-3/sindarov-thinking.webp',
        width: 1400,
        height: 933,
        alt: 'Sindarov with his hands clasped as Gukesh plays a move at the start of game 3',
        credit: 'FIDE / Y.E. Nisenbaum',
      },
    },
    {
      heading: 'Gukesh asks the questions',
      paragraphs: [
        'Every reply came quickly, and by move 12 Sindarov was already half an hour behind on the clock. Then ' +
          'Gukesh’s queen went on a tour, 13...Qb8, 14...Qb5 and 15...Qc4, until 16.b3 drove it away and he traded ' +
          'queens on d4.',
        'It began to look as if Sindarov was finding his way through a line Gukesh had studied at home with an ' +
          'engine, every reply ready. For a professional, few things at the board are harder.',
        'Without queens, Gukesh kept going. He never castled, pushed his kingside pawns with 19...h5 and 20...g5, ' +
          'and brought his king to d7. The engine still saw the position as close to level.',
        'The players looked different too. Gukesh was calm all through the game and at times seemed to be meditating. ' +
          'Sindarov looked tense and worried.',
      ],
      photo: {
        src: '/assets/news/wch-2026-game-3/gukesh-arrives.webp',
        width: 1400,
        height: 933,
        alt: 'Gukesh, calm, arriving for game 3 as people applaud behind him',
        credit: 'FIDE / Y.E. Nisenbaum',
      },
    },
    {
      heading: 'Sindarov stirs things up',
      paragraphs: [
        'Sindarov opened the queenside with 24.b4, and after 24...axb4 25.cxb4 Ra4 the engine gave exactly 0.00. With ' +
          'rooks and bishops of opposite colours on the board, White’s bishop on the dark squares and Black’s on the ' +
          'light ones, both sides had to watch White’s pawns on a3 and b4.',
        'Sindarov did not settle for that. With 29.f4 he offered a pawn to open lines towards Black’s king on e6. ' +
          'Gukesh took it, gave it back with 33...c5, and let a second pawn go after 34...d4 to get a passed pawn to d3 ' +
          'two moves later. The complications cost Sindarov a lot of time. Before 40.Rc1, the last move before the ' +
          'time control, he was about to write it down on his scoresheet, then changed his mind and played it at once ' +
          'so as not to lose on time. He had seven seconds left.',
        'Gukesh answered every try precisely. From 29.f4 to the end, the engine never gave White more than a tenth of a ' +
          'pawn, and in the time trouble it was Black who had a small edge, with Gukesh ready to punish a slip. With ' +
          '39...Bxb5 he won the pawn back.',
        'After 47...Rxe1 the last rooks came off, and only the bishops of opposite colours were left. After 48.f5+ ' +
          'Kxf5 49.Bxe1 Kxf6 Black had an extra pawn, but White’s king and bishop held the d-pawn and the engine gave ' +
          '0.00. Gukesh’s king walked back and forth until the players agreed a draw after 60...Kf3.',
      ],
    },
    {
      heading: 'What game 3 told us',
      paragraphs: [
        'This game was not like the first two. In game 1 it was Gukesh who had to find the only move with little time ' +
          'left, and in game 2 Sindarov drew with Black at ease. Here Sindarov did the hard work, while Gukesh looked in ' +
          'control from the first move to the last, ready to punch if a chance came. None came, and that is to ' +
          'Sindarov’s credit.',
        'The preparation and the calm defence were a clear sign that Gukesh is ready for this match.',
        'The score is 1½-1½. Friday is the first rest day, and Gukesh has White in game 4 on Saturday.',
      ],
    },
  ],
  moments: [
    {
      ply: 10,
      heading: 'The new move, 5...Be7',
      paragraphs: [
        'In game 1 Gukesh played 5...Nd6, the main line. Here he chose 5...Be7, the Rio de Janeiro Variation.',
      ],
    },
    {
      ply: 17,
      heading: '9.Qe4, the engine’s choice',
      paragraphs: [
        'Sindarov reached for the queen three or four times before he played it, and it was the engine’s first ' +
          'choice too.',
      ],
    },
    {
      ply: 32,
      heading: 'The queens come off, 16...Qxd4',
      paragraphs: [
        'After its tour to b8, b5 and c4, Gukesh’s queen is traded. From here the engine sees the position as close ' +
          'to level.',
      ],
    },
  ],
  baked: baked as BakedMoments,
  pgn,
  gameLabel: 'Sindarov ½-½ Gukesh',
  videoId: 'AejT5f8bDgM',
  sources: [
    'the game and its clock times from the ',
    { text: 'Lichess broadcast', href: 'https://lichess.org/broadcast/fide-world-chess-championship-2026/game-3/fnmEB1kH' },
    '. Photos: ',
    { text: 'FIDE', href: 'https://www.flickr.com/photos/fide/albums' },
    '.',
  ],
};
