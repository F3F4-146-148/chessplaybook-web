import { CHAMPION_ROSTER } from '@/features/champions/championRoster';
import { ChampionsStrip } from './ChampionsStrip';
import { FeaturedChampion, type PlayerInfo } from './FeaturedChampion';
import { HOME_WRAP } from './HomeStage';
import { JourneyCard } from './JourneyCard';
import { LatestNews } from './LatestNews';

/**
 * Everything below the chooser (owner D1: the 08-02 "six cards and nothing else" rule is superseded; every link
 * here is measured with `home_section_click`). On the chooser's own 3-column grid, so these edges fall on the
 * cards above: the Journey card and the strip span two columns, the featured champion and the news one.
 */
export default function HomeSections() {
  // The site's own roster, bundled (prerender plan F1, as the champion pages since D3): the featured champion's name and
  // reign are in the built page, with no request. It was fetched after load, so the card first said "Fischer".
  const players = CHAMPION_ROSTER as unknown as Record<string, PlayerInfo>;

  return (
    <div className={`${HOME_WRAP} pt-3 md:pt-4 pb-16 space-y-10 md:space-y-14`}>
      <div className="grid gap-3 md:gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 min-w-0 flex [&>*]:flex-1"><JourneyCard /></div>
        <FeaturedChampion players={players} />
      </div>
      <div className="grid gap-8 md:gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 min-w-0"><ChampionsStrip /></div>
        {/* The card is absolutely placed from lg up, so the row's height is the champions column's alone: the card
            spans from the champions title's capitals (LatestNews) to the bottom of the portrait row (owner). */}
        <div className="relative min-w-0"><LatestNews /></div>
      </div>
    </div>
  );
}
