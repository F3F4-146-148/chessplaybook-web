import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Bot, ChevronDown, Globe, Swords, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
    { id: 'online', to: '/play-online', label: 'Play online', icon: <Globe className={iconClass} aria-hidden="true" /> },
    { id: 'friend', to: '/play-online?setup=friend', label: 'Challenge a friend', icon: <UserPlus className={iconClass} aria-hidden="true" /> },
  ];
}

/**
 * Play is current on /play and /play-online and below them, never on /player/... (a profile), which a bare
 * `startsWith('/play')` would also match.
 */
export function isPlayPath(pathname: string): boolean {
  return /^\/play(-online)?(\/|$)/.test(pathname);
}

/** How long the list stays after the pointer leaves, so crossing the gap to it does not close it. */
const LEAVE_DELAY_MS = 180;

/** The desktop row's Play item with its list. */
export function PlayMenu({ isActive }: { isActive: boolean }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLAnchorElement>(null);
  const lastPointer = useRef<string | null>(null);
  // Escape hands focus back to Play; that focus is a keyboard one, and must not open the list it just closed.
  const refocusing = useRef(false);
  const leaveTimer = useRef<number | null>(null);
  const listId = useId();

  const cancelLeave = () => {
    if (leaveTimer.current !== null) window.clearTimeout(leaveTimer.current);
    leaveTimer.current = null;
  };

  useEffect(() => {
    setOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => cancelLeave, []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      if (wrapRef.current?.contains(document.activeElement)) {
        refocusing.current = true;
        triggerRef.current?.focus();
        refocusing.current = false;
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const items = playItems('nav-play-item-icon');

  const focusItem = (index: number) => {
    const links = wrapRef.current?.querySelectorAll<HTMLAnchorElement>('[data-play-item]');
    if (!links || links.length === 0) return;
    links[(index + links.length) % links.length].focus();
  };

  return (
    <div
      ref={wrapRef}
      className="nav-play"
      data-open={open || undefined}
      onPointerEnter={(e) => {
        if (e.pointerType !== 'mouse') return;
        cancelLeave();
        setOpen(true);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType !== 'mouse') return;
        cancelLeave();
        leaveTimer.current = window.setTimeout(() => setOpen(false), LEAVE_DELAY_MS);
      }}
      onBlur={(e) => {
        if (!wrapRef.current?.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <Link
        ref={triggerRef}
        to="/play"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={listId}
        onPointerDown={(e) => { lastPointer.current = e.pointerType; }}
        onFocus={(e) => {
          if (!refocusing.current && e.currentTarget.matches(':focus-visible')) setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
            // the list is `hidden` until the state lands; focus it on the next frame
            window.requestAnimationFrame(() => focusItem(0));
          }
        }}
        onClick={(e) => {
          const pointer = lastPointer.current;
          lastPointer.current = null;
          if ((pointer === 'touch' || pointer === 'pen') && !open) {
            e.preventDefault();
            setOpen(true);
            return;
          }
          if (isActive && location.pathname === '/play') {
            e.preventDefault();
            navigate('/play', { state: { t: Date.now(), reset: true } });
          }
          setOpen(false);
        }}
      >
        <Button
          variant={isActive ? 'default' : 'ghost'}
          size="sm"
          data-active={isActive ? 'true' : undefined}
          className="gap-2 relative"
          tabIndex={-1}
        >
          <Swords className="h-4 w-4" />
          <span>Play</span>
        </Button>
      </Link>
      <div id={listId} className="nav-play-list" hidden={!open}>
        <div className="nav-play-panel rounded-lg border border-border bg-card shadow-lg py-1" role="group" aria-label="Ways to play">
          {items.map((item, index) => (
            <Link
              key={item.id}
              to={item.to}
              data-play-item={item.id}
              className="nav-play-link text-muted-foreground hover:text-foreground hover:bg-muted/50 focus-visible:text-foreground focus-visible:bg-muted/50 transition-colors"
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') { e.preventDefault(); focusItem(index + 1); }
                if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  if (index === 0) triggerRef.current?.focus();
                  else focusItem(index - 1);
                }
              }}
              onClick={() => {
                logGA4Event({ name: 'nav_play_menu_clicked', params: { item: item.id, surface: 'desktop' } });
                setOpen(false);
              }}
            >
              {item.icon}
              <span>{item.label}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

/** The phone menu's Play group: a button that opens its three links (no hover on a phone). */
export function PlayMenuGroup({ isActive, onNavigate }: { isActive: boolean; onNavigate: () => void }) {
  const [expanded, setExpanded] = useState(isActive);
  const listId = useId();
  const items = playItems('h-5 w-5 shrink-0');
  return (
    <div>
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={listId}
        onClick={() => setExpanded((v) => !v)}
        className={`flex w-full items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
          isActive ? 'bg-primary/10 text-link' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
        }`}
      >
        <Swords className="h-5 w-5" />
        <span className="font-medium">Play</span>
        <ChevronDown className={`ml-auto h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      <div id={listId} hidden={!expanded} className="flex flex-col gap-1 pl-8">
        {items.map((item) => (
          <Link
            key={item.id}
            to={item.to}
            data-play-item={item.id}
            className="flex items-center gap-3 px-4 py-2.5 rounded-lg transition-colors text-muted-foreground hover:text-foreground hover:bg-muted/50"
            onClick={() => {
              logGA4Event({ name: 'nav_play_menu_clicked', params: { item: item.id, surface: 'mobile' } });
              onNavigate();
            }}
          >
            {item.icon}
            <span className="font-medium">{item.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
