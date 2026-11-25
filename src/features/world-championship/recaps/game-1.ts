/**
 * Game 1's recap, read and approved by the owner on 2026-11-24 (every recap is read before it is published).
 *
 * The game's story follows the owner's own account of game 1 (2026-11-24), every chess and clock claim checked:
 *   - Clocks: the [%clk] comments of the Lichess broadcast PGN (games/game-1.pgn).
 *   - Evaluations: Stockfish, bake-recap-moments.ts --swings (depth 16) and the baked moments (depth 20); the
 *     alternatives to 32...Kg8 and 33.Rg5+ from the SF 15.1 fork, MultiPV 5, depth 24 (2026-11-24):
 *     after 32.Bxh6+, Kg8 0.00, Kf6 +3.52, Kg6 +3.87, Kh7 +4.77, Kh8 +4.78 (White's view); after 32...Kg8, Rg5+ 0.00,
 *     Kf1 0.00, Rd5 -0.15, Kh1 -0.17, Kg2 -0.44.
 *   - Average loss per move from the --swings table: Sindarov 0.072, Gukesh 0.057 of a pawn.
 *   - Svidler and Leko on the older line, and Sindarov's press-conference words on 13...Bd7: the owner, who watched
 *     FIDE's broadcast (reported speech, no direct quote until a transcript is found); the owner confirmed both again on
 *     2026-11-24 after the review.
 *   - The incorrect draw claim: [C] Chess.com and [E] ESPN (below); the clock jump after 36...Kg8 (4:44 to 6:40)
 *     agrees.
 * Every quote in the off-board sections was found word for word on its source page on 2026-11-23:
 *   [A] Chess.com, https://www.chess.com/news/view/2026-fide-chess-world-championship-opening-ceremony
 *   [B] FIDE, https://www.fide.com/the-two-world-championship-contenders-open-up-to-the-media/
 * Photos: public/assets/news/wch-2026-game-1/CREDITS.md.
 */

import type { BakedMoments, GameRecap } from './types';
import pgn from './games/game-1.pgn?raw';
import baked from './moments/game-1.json';

export const GAME_1_RECAP: GameRecap = {
  slug: 'game-1',
  game: 1,
  kicker: 'World Championship 2026 · Game 1',
  title: 'Game 1: Gukesh stands firm and looks like himself again',
  subtitle: 'Sindarov ½-½ Gukesh, Geneva',
  lead:
    'Gukesh went for the Berlin, Sindarov replied with a line from an earlier era, and the game turned into a battle ' +
    'on the clock. With under six minutes left, Gukesh found the one move that held, 32...Kg8, and the draw after 38 ' +
    'moves showed a champion back in form.',
  dateLabel: '24 November 2026',
  resultLine: 'Draw in 38 moves',
  scoreLine: 'Score: Gukesh ½ - ½ Sindarov',
  photo: {
    src: '/assets/news/wch-2026-game-1/players-at-the-board.webp',
    width: 1400,
    height: 933,
    alt: 'Sindarov and Gukesh at the board in game 1',
    credit: 'FIDE / Michal Walusza',
  },
  /* The header photo's two players side by side, cut above the nameplates (public/assets/.../CREDITS.md). */
  cardImage: '/assets/news/wch-2026-game-1/card-split.webp',
  sections: [
    {
      heading: 'The Berlin, and an older line',
      paragraphs: [
        'Gukesh chose the Berlin Defence, an opening in which the queens come off early and a long, complex endgame ' +
          'follows. In this game they were gone by move 8.',
        'Sindarov did what he usually does. He picked an interesting line and tried to put Black under pressure from ' +
          'the start. On FIDE’s broadcast, Peter Svidler and Peter Leko explained that it had been one of the main lines ' +
          'of the Berlin some 25 years ago, and that it is rarely seen at the top today.',
        'His first thirteen moves took him about five minutes. Then came 13...Bd7, and he stopped for 23 minutes. At ' +
          'the press conference he explained that this was the first point at which he had needed to think, because he ' +
          'knew the move but had expected something else.',
      ],
      photo: {
        src: '/assets/news/wch-2026-game-1/sindarov-arrives-game-1.webp',
        width: 1400,
        height: 934,
        alt: 'Sindarov arrives at the Fondation Martin Bodmer for game 1',
        credit: 'FIDE / Michal Walusza',
      },
    },
    {
      heading: 'A battle on the clock',
      paragraphs: [
        'The choice worked. Gukesh had used 40 minutes by move 13, and he then spent 36 more on 17...Bb4, which was ' +
          'also the engine’s first choice. After 19...c5 he had 16 minutes left for the 21 moves to the time control, ' +
          'against Sindarov’s 57. The engine never had White even half a pawn ahead, so the real pressure was on the ' +
          'clock.',
        'Yet Gukesh played like a World Champion. Short of time, he did not look for safety. He took the pawn on e5 ' +
          'with 23...Nxe5, although he had only 11 minutes left for 17 moves, and allowed Sindarov to open the kingside ' +
          'with f4 and f5. Both sides had chances. By the engine’s measure, his moves were as precise as Sindarov’s.',
        'His replies made Sindarov think as well. Between moves 18 and 22, Sindarov’s clock fell from 75 minutes to ' +
          '27, and 20 of those minutes went on 22.Ne1.',
      ],
      photo: {
        src: '/assets/news/wch-2026-game-1/gukesh-arrives-game-1.webp',
        width: 1400,
        height: 934,
        alt: 'Gukesh arrives at the Fondation Martin Bodmer for game 1',
        credit: 'FIDE / Michal Walusza',
      },
    },
    {
      heading: 'The only move, and a draw claimed twice',
      paragraphs: [
        'After 32.Bxh6+, Gukesh had to find 32...Kg8, because every other king move loses a piece. He found it. From ' +
          'there White’s rook went back and forth between g5 and h5, and the engine shows no way for White to play on ' +
          'with an advantage. Sindarov knew when to stop, and taking the draw was the professional decision.',
        'Even the draw took two attempts. Sindarov’s first claim did not follow the required procedure, so the arbiter ' +
          'added two minutes to Gukesh’s clock. Sindarov then claimed the draw correctly after 38...Kg8.',
      ],
    },
    {
      heading: 'What game 1 told us',
      paragraphs: [
        'Of the two players, it was Gukesh who impressed. Sindarov played the kind of game we have come to expect from ' +
          'him over the last two years, while Gukesh showed more than many had expected after his difficult year.',
        'Above all, game 1 showed Gukesh meeting the demands of a world championship match. He played precisely and ' +
          'boldly, and with Black he even tried to turn the tables. If anything, the psychological edge passed to him.',
        'The game promises an exciting match, and it tells Sindarov and his team that Gukesh is in form, in a good ' +
          'frame of mind, and ready to fight even with Black. Gukesh has White in game 2 on Wednesday.',
      ],
    },
    {
      heading: 'A chocolate knight decides the colours',
      paragraphs: [
        // [A] "Sunday in the impressive Palace of Nations"; "a pair of clocks—containing light or dark chocolate knights";
        // "Sindarov was left with the white knight, meaning he gets White in game one."
        'Sunday’s opening ceremony in Geneva ended with the drawing of colours, done with chocolate. Gukesh had to ' +
          'choose between two clocks, each hiding a chocolate knight, one light and one dark. The clock he chose held ' +
          'the dark knight, so the challenger had White in the first game, and the colours alternate from there.',
      ],
      photo: {
        src: '/assets/news/wch-2026-game-1/opening-ceremony.webp',
        width: 1400,
        height: 934,
        alt: 'The opening ceremony at the Palais des Nations, Geneva, 22 November',
        credit: 'FIDE / Michal Walusza',
      },
    },
    {
      heading: 'What they said before the match',
      paragraphs: [
        // [B] "Room XIV, also known as the Kazakh Room, at the Palais des Nations in Geneva"; "Moderated by Grandmaster Maurice Ashley"
        'Earlier that day the two players gave their press conference at the Palais des Nations, with Grandmaster ' +
          'Maurice Ashley asking the questions.',
        // [A]
        'Gukesh did not see himself as the one defending. “I don’t think I’m here to defend anything. I’m here to win it all over again!” he said.',
        // [B]
        'Of his challenger he said, “He is super talented and energetic, or, in a single word, a genius!”',
        'Sindarov expected a ' +
          'different Gukesh from the one of the past year. “It is true that he has lost quite a lot of games in the past year, ' +
          'but this is because he always tries to win at all costs. I believe that he will be more cautious in the match.”',
        // [A]
        'Sindarov also spoke about what the match means to him. “Many chess players play their whole life in chess and they don’t have a chance to play for this.”',
      ],
      photo: {
        src: '/assets/news/wch-2026-game-1/handshake.webp',
        width: 1024,
        height: 683,
        alt: 'Sindarov and Gukesh shake hands on media day in Geneva',
        credit: 'FIDE / Y.E. Nisenbaum',
      },
    },
    {
      heading: 'A library above the lake',
      paragraphs: [
        // [A] "the Fondation Martin Bodmer, a library and museum in Cologny, overlooking Lake Geneva"
        'The match is not being played in the city itself. The boards are set up in Cologny, on the hill just outside Geneva, ' +
          'at the Fondation Martin Bodmer, home to a library and a museum, with the lake below its windows.',
        // [B] and [A] "I checked the chairs, the lighting, the floors" / "But I was happy with pretty much everything"
        'Sindarov liked what he saw. “It is a beautiful room with a fantastic view over the lake!” he said. Gukesh looked ' +
          'at everything closely. “I checked the chairs, the lighting, the floors,” he said, and he was “happy with pretty much everything”.',
      ],
      photo: {
        src: '/assets/news/wch-2026-game-1/fondation-bodmer.webp',
        width: 1400,
        height: 932,
        alt: 'The Fondation Martin Bodmer in Cologny on the day of game 1',
        credit: 'FIDE / Michal Walusza',
      },
    },
  ],
  moments: [
    {
      ply: 27,
      heading: 'Sindarov’s first long think, 14.c4',
      paragraphs: [
        'Thirteen moves in about five minutes, and then a stop. 13...Bd7 is not what Sindarov expected, and he ' +
          'spends 23 minutes before choosing 14.c4, which gains space on the queenside. White keeps a small edge and the ' +
          'initiative, nothing more, but the clocks have started to matter.',
      ],
    },
    {
      ply: 46,
      heading: 'Gukesh takes the pawn, 23...Nxe5',
      paragraphs: [
        'With 11 minutes left for 17 moves, Gukesh takes the pawn on e5 instead of playing safe. It is also the engine’s ' +
          'first choice, and Sindarov answers with f4, the start of his kingside play.',
      ],
    },
    {
      ply: 64,
      heading: 'The only move, 32...Kg8',
      paragraphs: [
        'Sindarov takes the h6 pawn with check, and Black has five squares for the king. Four of them lose a piece. ' +
          'After ...Kf6 or ...Kg6 the rook on d8 falls, and after ...Kh7 or ...Kh8 the bishop on c3. With under six ' +
          'minutes left, Gukesh finds the one square that holds. From here the rook checks on g5 and goes back to h5 until the repetition.',
      ],
    },
  ],
  baked: baked as BakedMoments,
  pgn,
  gameLabel: 'Sindarov ½-½ Gukesh',
  videoId: '7dyXiy2kWsw',
  sources: [
    'quotes from the opening ceremony (',
    { text: 'Chess.com', href: 'https://www.chess.com/news/view/2026-fide-chess-world-championship-opening-ceremony' },
    ') and the press conference (',
    { text: 'FIDE', href: 'https://www.fide.com/the-two-world-championship-contenders-open-up-to-the-media/' },
    '), and the draw claim as reported by ',
    { text: 'Chess.com', href: 'https://www.chess.com/news/view/2026-fide-world-chess-championship-game-1' },
    ' and ',
    { text: 'ESPN', href: 'https://www.espn.com/chess/story/_/id/50581668/gukesh-sindarov-live-world-chess-championship-2026-game-1-updates' },
    '. Photos: ',
    { text: 'FIDE', href: 'https://www.flickr.com/photos/fide/albums/72177720337059197' },
    '.',
  ],
};
