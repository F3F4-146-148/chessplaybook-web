import type { ReactNode } from 'react';
import { Bot, Globe, Swords, UserPlus } from 'lucide-react';
import { NavMenu, NavMenuGroup, type NavMenuItem, type NavMenuSurface } from '@/components/nav/NavMenu';
import { logGA4Event } from '@/services/analytics';
import { MAIA_LIVE, MASTER_LIVE } from '@/design/designFlags';
import { masterIcon } from '@/components/master/masterAssets';

/*
  THE PLAY LIST IN THE NAV (#308, owner 2026-11-17: "a vertical list under Play, like chess.com's").

  Play itself goes to /play, the Master (owner: it was /play-online until this list existed, so the Master was
  reached only from the footer, the home card and buttons on /play-online). The list puts Play online and a
  friend's challenge one click from every page and adds no width to a row that is already full.

  How it opens (owner rulings, 2026-11-17):
    - a mouse: hovering Play opens it, and a click on Play still goes to /play;
    - touch on the desktop row (an iPad held sideways, a touch laptop): there is no hover, so the FIRST tap opens
      the list and does not navigate; Play the Master is the list's first item;
    - a keyboard: Tab onto Play opens it (only a keyboard focus, `:focus-visible`: a tap also focuses, and opening
      on that focus would let the same tap's click navigate), Arrow Down moves into it, Escape closes it.
  It closes on any press outside it (the account menu's document listener, which no ancestor can trap), on
  Escape, when focus leaves it, when the pointer leaves it, and when the page changes.

  THE THREE LINKS ARE IN THE PAGE WHILE THE LIST IS CLOSED (`hidden`, not unmounted), so the nav keeps linking them
  for crawlers, as the issue asked.
*/

export type PlayItemId = 'master' | 'online' | 'friend';

export interface PlayItem {
  id: PlayItemId;
  to: string;
  label: string;
  icon: ReactNode;
}

const MASTER_ON = MASTER_LIVE && MAIA_LIVE;

/** The list's items, in order. "Play the Master" only while his levels are live (owner: only where it is true). */
export function playItems(iconClass: string): PlayItem[] {
  return [
    {
      id: 'master',
      to: '/play',
      label: MASTER_ON ? 'Play the Master' : 'Play vs computer',
      icon: MASTER_ON
        ? <img src={masterIcon().src} srcSet={masterIcon().srcSet} alt="" aria-hidden="true" className={`${iconClass} rounded-full`} />
        : <Bot className={iconClass} aria-hidden="true" />,
    },
    /* Coloured icons (owner, 2026-11-17: in grey "you might almost think the last two items are not available"):
       the homepage's Play green for online play, its sky blue for a friend's challenge. */
    { id: 'online', to: '/play-online', label: 'Play online', icon: <Globe className={`${iconClass} text-feature-play`} aria-hidden="true" /> },
    { id: 'friend', to: '/play-online?setup=friend', label: 'Challenge a friend', icon: <UserPlus className={`${iconClass} text-feature-openings`} aria-hidden="true" /> },
  ];
}

/**
 * Play is current on /play and /play-online and below them, never on /player/... (a profile), which a bare
 * `startsWith('/play')` would also match.
 */
export function isPlayPath(pathname: string): boolean {
  return /^\/play(-online)?(\/|$)/.test(pathname);
}

/** Play is where its list is: a click on Play while on /play starts a fresh game. */
const resetsOnPlay = (pathname: string) => pathname === '/play';

function onItemClick(item: NavMenuItem, surface: NavMenuSurface) {
  logGA4Event({ name: 'nav_play_menu_clicked', params: { item: item.id as PlayItemId, surface } });
}

/** The desktop row's Play item with its list (how a list opens: `NavMenu.tsx`). */
export function PlayMenu({ isActive }: { isActive: boolean }) {
  return (
    <NavMenu
      menuId="play"
      to="/play"
      label="Play"
      icon={<Swords className="h-4 w-4" />}
      items={playItems('nav-play-item-icon')}
      groupLabel="Ways to play"
      isActive={isActive}
      resetsOn={resetsOnPlay}
      onItemClick={onItemClick}
    />
  );
}

/** The phone menu's Play group: a button that opens its three links (no hover on a phone). */
export function PlayMenuGroup({ isActive, onNavigate }: { isActive: boolean; onNavigate: () => void }) {
  return (
    <NavMenuGroup
      label="Play"
      icon={<Swords className="h-5 w-5" />}
      items={playItems('h-5 w-5 shrink-0')}
      isActive={isActive}
      onNavigate={onNavigate}
      onItemClick={onItemClick}
    />
  );
}
