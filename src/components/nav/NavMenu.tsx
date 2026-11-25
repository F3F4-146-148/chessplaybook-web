import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';

/*
  A NAV ITEM WITH A LIST UNDER IT: the behaviour Play got in #308 (owner, 2026-11-17), shared so Puzzles has the same
  list and the two cannot drift. `PlayMenu.tsx` and `PuzzlesMenu.tsx` are the two users; this file holds how a list
  opens, not what is in it.

  How it opens (owner rulings, 2026-11-17):
    - a mouse: hovering the item opens it, and a click on the item still goes to its own page;
    - touch on the desktop row (an iPad held sideways, a touch laptop): there is no hover, so the FIRST tap opens
      the list and does not navigate;
    - a keyboard: Tab onto the item opens it (only a keyboard focus, `:focus-visible`: a tap also focuses, and opening
      on that focus would let the same tap's click navigate), Arrow Down moves into it, Escape closes it.
  It closes on any press outside it (a document listener, which no ancestor can trap), on Escape, when focus leaves
  it, when the pointer leaves it, and when the page changes.

  THE LINKS ARE IN THE PAGE WHILE THE LIST IS CLOSED (`hidden`, not unmounted), so the nav keeps linking them for
  crawlers.

  The class names (`nav-play*`) and the item attribute (`data-play-item`) are Play's from before this file existed;
  `verify-play-menu` and `index.css` read them, so they stay the shared names.
*/

export interface NavMenuItem {
  id: string;
  to: string;
  label: string;
  icon: ReactNode;
}

export type NavMenuSurface = 'desktop' | 'mobile';

/** How long the list stays after the pointer leaves, so crossing the gap to it does not close it. */
const LEAVE_DELAY_MS = 180;

interface NavMenuProps {
  /** Which menu this is, so a page with two lists (and a guard) can tell them apart. */
  menuId: string;
  /** Where a click on the item itself goes. */
  to: string;
  label: string;
  /** The item's own icon, drawn the way the row's other items draw theirs. */
  icon: ReactNode;
  items: NavMenuItem[];
  /** The list's accessible name. */
  groupLabel: string;
  isActive: boolean;
  /** A click on the item while this is true re-opens its page from scratch (the nav's own rule for an active item). */
  resetsOn: (pathname: string) => boolean;
  onItemClick: (item: NavMenuItem, surface: NavMenuSurface) => void;
}

/** The desktop row's item with its list. */
export function NavMenu({ menuId, to, label, icon, items, groupLabel, isActive, resetsOn, onItemClick }: NavMenuProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLAnchorElement>(null);
  const lastPointer = useRef<string | null>(null);
  // Escape hands focus back to the item; that focus is a keyboard one, and must not open the list it just closed.
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

  const focusItem = (index: number) => {
    const links = wrapRef.current?.querySelectorAll<HTMLAnchorElement>('[data-play-item]');
    if (!links || links.length === 0) return;
    links[(index + links.length) % links.length].focus();
  };

  return (
    <div
      ref={wrapRef}
      className="nav-play"
      data-nav-menu={menuId}
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
        to={to}
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
          if (isActive && resetsOn(location.pathname)) {
            e.preventDefault();
            navigate(to, { state: { t: Date.now(), reset: true } });
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
          {icon}
          <span>{label}</span>
        </Button>
      </Link>
      <div id={listId} className="nav-play-list" hidden={!open}>
        <div className="nav-play-panel rounded-lg border border-border bg-card shadow-lg py-1" role="group" aria-label={groupLabel}>
          {items.map((item, index) => (
            <Link
              key={item.id}
              to={item.to}
              data-play-item={item.id}
              className="nav-play-link text-foreground hover:bg-muted/50 focus-visible:bg-muted/50 transition-colors"
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') { e.preventDefault(); focusItem(index + 1); }
                if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  if (index === 0) triggerRef.current?.focus();
                  else focusItem(index - 1);
                }
              }}
              onClick={() => {
                onItemClick(item, 'desktop');
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

interface NavMenuGroupProps {
  label: string;
  /** The group's own icon, drawn the way the menu's other items draw theirs. */
  icon: ReactNode;
  items: NavMenuItem[];
  isActive: boolean;
  onNavigate: () => void;
  onItemClick: (item: NavMenuItem, surface: NavMenuSurface) => void;
}

/** The phone menu's group: a button that opens its links (no hover on a phone). */
export function NavMenuGroup({ label, icon, items, isActive, onNavigate, onItemClick }: NavMenuGroupProps) {
  const [expanded, setExpanded] = useState(isActive);
  const listId = useId();
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
        {icon}
        <span className="font-medium">{label}</span>
        <ChevronDown className={`ml-auto h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {/* `hidden` alone is not enough: `flex` is a class and beats the attribute's display:none, so a closed
          group showed its links (Play's did since #308). The class is what hides it. */}
      <div id={listId} hidden={!expanded} className={`${expanded ? 'flex' : 'hidden'} flex-col gap-1 pl-8`}>
        {items.map((item) => (
          <Link
            key={item.id}
            to={item.to}
            data-play-item={item.id}
            className="flex items-center gap-3 px-4 py-2.5 rounded-lg transition-colors text-foreground hover:bg-muted/50"
            onClick={() => {
              onItemClick(item, 'mobile');
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
