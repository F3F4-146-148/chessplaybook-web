/**
 * HOW THE PUZZLE TRAINER WORKS (prerender plan B3, owner 2026-11-19: how it works, runs, themes, training plans,
 * missed puzzles, the explanation and the goal line).
 *
 * Written text, so it may be in the built HTML (the owner's rule 3). It is shown in the "About this trainer" panel and
 * rendered for screen readers and search engines while the panel is closed: one list, so the two cannot drift.
 *
 * EVERY SENTENCE IS A FACT ABOUT THE PAGE, checked against the code on 2026-11-19. Change the page, change the line:
 *   - a wrong move scores the puzzle at once (usePuzzleRecord, B1); Show solution, Rated off and a strength far from
 *     your rating leave the rating as it was (`frozen`);
 *   - the goal line is the server's (`PuzzlePrompt.ts`): a mate, material to win, or a defence;
 *   - the themes and strengths are `PUZZLE_THEMES` and `RATING_PRESETS`; a run is `SESSION_LENGTHS` long and its
 *     choices are `SELECTION_LABEL` and `AREA_LABEL`; "Missed before" is served easiest first (#117);
 *   - a plan is `FREQUENCIES` sessions a week for `DURATIONS` weeks, 5 to 60 positions a session, and ends with a
 *     review of all three areas; it exports to a calendar (PlanCalendarExport).
 * No hints: the owner removed them on 2026-08-12 (their content pointed at the wrong things).
 */
export interface AboutSection {
  heading: string;
  lines: readonly string[];
}

export const ABOUT_TRAINER_TITLE = 'How the puzzle trainer works';

export const ABOUT_TRAINER: readonly AboutSection[] = [
  {
    heading: 'Solving',
    lines: [
      'Every puzzle comes from a real game and is picked for your level.',
      'The card tells you what to aim for, such as a mate, winning material or a defence to find.',
      'Your first wrong move counts against your rating, but you can keep trying until you find the answer.',
      'Show solution plays the answer and leaves your rating as it was.',
    ],
  },
  {
    heading: 'Understanding the solution',
    lines: [
      'When the puzzle is over, Explain solution tells you why the moves work.',
      'Full analysis opens the position so you can try your own ideas against the engine.',
    ],
  },
  {
    heading: 'Choosing your puzzles',
    lines: [
      'Pick puzzles lets you set a strength, from Beginner to Master, and a theme such as a fork, a pin or a mate in 2.',
      'Turn Rated off to practise without your rating changing.',
      'Turn Auto next on to get the next puzzle as soon as you solve one.',
    ],
  },
  {
    heading: 'Runs',
    lines: [
      'A run is a set of 5, 10 or 20 puzzles.',
      'Choose what to train: puzzles at your level, a mix, the areas that need attention, or the puzzles you missed before.',
      'Choose where they come from: tactics, middlegames, endgames or all three.',
      'At the end you get a performance rating for the run, ranked against other players.',
    ],
  },
  {
    heading: 'Puzzles you missed',
    lines: [
      'A puzzle you miss stays on your list until you solve it.',
      'Pick Missed before in a run to go through them again, easiest first.',
    ],
  },
  {
    heading: 'Training plans',
    lines: [
      'A training plan spreads your training over 3 to 8 weeks, with 2 to 5 sessions a week and 5 to 60 puzzles a session.',
      'It covers tactics, middlegames and endgames, and ends with a review of all three.',
      'You can add the sessions to your calendar.',
    ],
  },
  {
    heading: 'Your record',
    lines: [
      'Your training record shows how you do in each area and pattern, and what to train next.',
      'Sign in to keep it on any device.',
    ],
  },
];
