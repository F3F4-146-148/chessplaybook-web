/**
 * Game 2's recap, from the owner's account of the game (notes of 2026-11-25), every chess and clock claim checked:
 *   - Clocks: the [%clk] comments of the Lichess broadcast PGN (games/game-2.pgn). Time used per move is the
 *     difference between a player's clocks (no increment before move 41). Sindarov used 38 min 34 s for 20 moves,
 *     10 min 31 s for his first 11; Gukesh 77 min 47 s. 3...c5 51 s, 4...e6 35 s, 15...f5 15 s, 16.f3 29 min 29 s,
 *     12.O-O 13 min 57 s, 8.Rb1 6 min 10 s.
 *   - Evaluations: Stockfish, bake-recap-moments.ts --swings (depth 16): White between +0.10 and +0.39 all game. The
 *     alternatives from the SF 15.1 fork, MultiPV 5, depth 24 (2026-11-25), White's view: before 9.Bxe5, dxe5 +0.41,
 *     Bxe5 +0.32; before 16.f3, Rfc1 +0.27, h3 +0.21, a5 +0.19 (f3 +0.10 in the swing table); before 17.Be5, Rfc1
 *     +0.25, a5 +0.24; before 19.Be5, a5 +0.22, Rfc1 +0.20; before 20.Bg3, Bg3 0.00, Bf4 0.00, the others -0.39 or worse.
 *   - "A surprise": our own games of Gukesh (to 2024, all speeds) have 1.d4 as his most common first move and the
 *     London in at least 88 games, so the surprise is told as the match's expectation, not as his repertoire.
 */

import type { BakedMoments, GameRecap } from './types';
import pgn from './games/game-2.pgn?raw';
import baked from './moments/game-2.json';

export const GAME_2_RECAP: GameRecap = {
  slug: 'game-2',
  game: 2,
  kicker: 'World Championship 2026 · Game 2',
  title: 'Game 2: Sindarov meets Gukesh’s London without breaking a sweat',
  subtitle: 'Gukesh ½-½ Sindarov, Geneva',
  lead:
    'Gukesh opened with the London System, a choice that keeps the fight going with White. Sindarov answered almost ' +
    'at once, used less than 40 minutes for the whole game, and was never in any danger. From move 17 the pieces ' +
    'went back and forth, and after 20 moves the game ended in a draw by repetition.',
  dateLabel: '25 November 2026',
  resultLine: 'Draw in 20 moves',
  scoreLine: 'Score: Gukesh 1 - 1 Sindarov',
  photo: {
    src: '/assets/news/wch-2026-game-2/players-at-the-board.webp',
    width: 1400,
    height: 933,
    alt: 'Gukesh makes a move as Sindarov watches in game 2',
    credit: 'FIDE / Michal Walusza',
  },
  /* The header photo's two players side by side (public/assets/.../CREDITS.md). */
  cardImage: '/assets/news/wch-2026-game-2/card-split.webp',
  sections: [
    {
      heading: 'The London, and quick answers',
      paragraphs: [
        'After the Berlin in game 1, Gukesh began game 2 with 1.d4 and 3.Bf4, the London System. It is a set-up that ' +
          'keeps the pieces on the board and lets White play for a long time without taking risks, and his idea looked ' +
          'clear. He seemed to want a real fight, with no easy way for the challenger to simplify.',
        'Sindarov showed no sign of being surprised. He answered with ...c5 and ...e6, a solid and well-known set-up, ' +
          'and played it quickly. He spent 51 seconds on 3...c5 and 35 on 4...e6, and his first eleven moves took him ' +
          'about ten minutes.',
        'At move 9 Gukesh took back on e5 with the bishop. It was a safe choice that kept the game calm. The engine ' +
          'slightly preferred 9.dxe5, but the difference was less than a tenth of a pawn.',
      ],
      photo: {
        src: '/assets/news/wch-2026-game-2/sindarov-at-the-board.webp',
        width: 1400,
        height: 931,
        alt: 'Sindarov at the board in game 2',
        credit: 'FIDE / Michal Walusza',
      },
    },
    {
      heading: 'Gukesh on the clock again',
      paragraphs: [
        'As in game 1, it was Gukesh who had to think. 8.Rb1 took him six minutes, and castling on move 12 took ' +
          'fourteen. The rook that went to b1 was back on a1 by move 13.',
        'Then Sindarov played 15...f5 in fifteen seconds, and Gukesh spent 29 minutes on his reply, 16.f3. It was a ' +
          'sound move, but it left him with 49 minutes on his clock against Sindarov’s 1 hour 26 minutes.',
        'On the board nothing much happened. The engine kept White a little better from start to finish, but never by ' +
          'even half a pawn.',
      ],
      photo: {
        src: '/assets/news/wch-2026-game-2/gukesh-thinking.webp',
        width: 1400,
        height: 933,
        alt: 'Gukesh deep in thought at the board in game 2',
        credit: 'FIDE / Michal Walusza',
      },
    },
    {
      heading: 'A draw both players chose',
      paragraphs: [
        'From move 17 the white bishop went back and forth between e5 and g3, and the black knight between d7 and f6. ' +
          'After 20...Nf6 the same position appeared for the third time, and the game was drawn.',
        'Gukesh did not have to repeat. At moves 17 and 19 he could have played on with 17.Rfc1 or 19.a5, and the ' +
          'engine gives White the same small edge after either. He chose the draw, and Sindarov went along with it.',
      ],
    },
    {
      heading: 'What game 2 told us',
      paragraphs: [
        'In game 1 it was Gukesh who impressed. Game 2 belonged to Sindarov. He was ready for the London, met it ' +
          'with ease, and used less than half the time his opponent did.',
        'The game had an anticlimactic finish. His choice with White cost Gukesh a long think and gave him no real ' +
          'chances, and the game ended in a quick draw, not a fight.',
        'The score is 1-1. Sindarov has White in game 3 on Thursday, and the first rest day follows.',
      ],
    },
  ],
  moments: [
    {
      ply: 5,
      heading: 'The London, 3.Bf4',
      paragraphs: [
        'Gukesh develops the bishop to f4 before playing e3, the London System. Sindarov answers with ...c5 and ' +
          '...e6, and the two moves take him under a minute and a half.',
      ],
    },
    {
      ply: 31,
      heading: 'Half an hour on 16.f3',
      paragraphs: [
        'Gukesh’s longest think of the game, 29 minutes, in reply to a move played in fifteen seconds. It leaves him ' +
          '49 minutes against 1 hour 26.',
      ],
    },
    {
      ply: 39,
      heading: 'The repetition, 20.Bg3',
      paragraphs: [
        'The bishop goes back to g3 for the third time, Sindarov answers 20...Nf6, and the position repeats. Earlier, ' +
          '17.Rfc1 or 19.a5 would have kept the game going with White’s small edge.',
      ],
    },
  ],
  baked: baked as BakedMoments,
  pgn,
  gameLabel: 'Gukesh ½-½ Sindarov',
  videoId: 'i_0ELvDXYQc',
  sources: [
    'the game and its clock times from the ',
    { text: 'Lichess broadcast', href: 'https://lichess.org/broadcast/fide-world-chess-championship-2026/game-2/L3j03TZq' },
    '. Photos: ',
    { text: 'FIDE', href: 'https://www.flickr.com/photos/fide/albums/72177720336905546' },
    '.',
  ],
};
