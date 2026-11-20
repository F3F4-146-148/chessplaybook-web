/** A cell of the champion game tables (its padding and type set a row's height: 49.5px, 33.5px on a phone). */
export const GAME_CELL = 'py-2 px-1 sm:py-3 sm:px-3 text-xs sm:text-base';

const HEAD_CELL = `text-left ${GAME_CELL} text-muted-foreground font-semibold`;

/**
 * The head of both champion game tables (`/games`, `/best-games`) and of their placeholder, one copy, so the
 * placeholder's height cannot drift from the table it stands in for (prerender plan D1).
 */
export function GamesTableHead() {
  return (
    <thead>
      <tr className="border-b-2 border-primary/50">
        <th className={`${HEAD_CELL} w-10`}>#</th>
        <th className={`${HEAD_CELL} w-28 sm:w-48`}>White</th>
        <th className={`${HEAD_CELL} w-28 sm:w-48`}>Black</th>
        <th className={`${HEAD_CELL} w-12 sm:w-20`}>
          <span className="sm:hidden">Res.</span>
          <span className="hidden sm:inline">Result</span>
        </th>
        <th className={`${HEAD_CELL} w-14`}>Year</th>
        <th className={`${HEAD_CELL}`}>Event</th>
      </tr>
    </thead>
  );
}
