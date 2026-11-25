import type { ReactNode } from 'react';
import { History, Puzzle } from 'lucide-react';
import { MdPsychology } from 'react-icons/md';
import { NavMenu, NavMenuGroup, type NavMenuItem, type NavMenuSurface } from '@/components/nav/NavMenu';
import { logGA4Event } from '@/services/analytics';

/*
  THE PUZZLES LIST IN THE NAV (owner, 2026-11-23: "submenus under Puzzles, like Play").

  Puzzles itself still goes to /puzzles. The list holds the two ways in: the puzzles we pick, and the ones made from
  the player's own games (#245), which have their own page, `/puzzles/from-games`. How a list opens is `NavMenu.tsx`.

  "From My Games" is the owner's working name for the second item ("for now"); it is this one string and the page's
  heading in `route-meta.json`.
*/

export type PuzzlesItemId = 'puzzles' | 'my_games';

export interface PuzzlesItem extends NavMenuItem {
  id: PuzzlesItemId;
}

export function puzzlesItems(iconClass: string): PuzzlesItem[] {
  return [
    { id: 'puzzles', to: '/puzzles', label: 'Puzzles', icon: <Puzzle className={`${iconClass} text-feature-puzzles`} aria-hidden="true" /> },
    { id: 'my_games', to: '/puzzles/from-games', label: 'From My Games', icon: <History className={`${iconClass} text-feature-openings`} aria-hidden="true" /> },
  ];
}

/** Puzzles is current on /puzzles and everything below it (the record, the plan, From My Games). */
export function isPuzzlesPath(pathname: string): boolean {
  return /^\/puzzles(\/|$)/.test(pathname);
}

/** The icon the row has always drawn for Puzzles, 1.4 times its box because the glyph is drawn small. */
const triggerIcon = (size: string): ReactNode => <MdPsychology className={`${size} scale-[1.4]`} />;

function onItemClick(item: NavMenuItem, surface: NavMenuSurface) {
  logGA4Event({ name: 'nav_puzzles_menu_clicked', params: { item: item.id as PuzzlesItemId, surface } });
}

/** The desktop row's Puzzles item with its list. */
export function PuzzlesMenu({ isActive }: { isActive: boolean }) {
  return (
    <NavMenu
      menuId="puzzles"
      to="/puzzles"
      label="Puzzles"
      icon={triggerIcon('h-4 w-4')}
      items={puzzlesItems('nav-play-item-icon')}
      groupLabel="Puzzles"
      isActive={isActive}
      // the nav's own rule for an active item: pressing it again starts it fresh
      resetsOn={() => true}
      onItemClick={onItemClick}
    />
  );
}

/** The phone menu's Puzzles group. */
export function PuzzlesMenuGroup({ isActive, onNavigate }: { isActive: boolean; onNavigate: () => void }) {
  return (
    <NavMenuGroup
      label="Puzzles"
      icon={triggerIcon('h-5 w-5')}
      items={puzzlesItems('h-5 w-5 shrink-0')}
      isActive={isActive}
      onNavigate={onNavigate}
      onItemClick={onItemClick}
    />
  );
}
