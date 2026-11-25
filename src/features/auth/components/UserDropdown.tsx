import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { User, LogOut, ChevronDown, LayoutDashboard, Target, CalendarDays, MessageSquare, Mail, Gem, type LucideIcon } from 'lucide-react';
import { contactHref } from '@/components/support/ReportProblemLink';
import { logGA4Event } from '@/services/analytics';
import { useAccountPremium } from '@/features/premium/AccountPremium';
import { grantDay } from '@/features/premium/GrantLine';
import { hasPremium, premiumGrant, type PremiumState } from '@/features/premium/paddleCheckout';
import { useAuth } from '../AuthContext';

/** A paid period's end, as a short date: "24 Dec 2027" (SQLite UTC text). */
function shortDay(sqliteUtc: string | null): string | null {
  if (!sqliteUtc) return null;
  const at = new Date(`${sqliteUtc.replace(' ', 'T')}Z`);
  return Number.isNaN(at.getTime()) ? null : at.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * The plan line under the name (#467 plan A3): what the account has, read from the shared account state.
 * Nothing until a valid answer for this account: a failed or slow lookup is never "Free plan" (#261 rule).
 */
export function planLine(state: PremiumState | null, known: boolean): string | null {
  if (!known || !state) return null;
  if (state.premium) {
    const ends = shortDay(state.periodEndsAt);
    if (state.kind === 'pass') return ends ? `Premium · until ${ends}` : 'Premium';
    if (state.status === 'past_due') return 'Premium · payment failed';
    if (!ends) return 'Premium';
    return state.scheduledChange?.startsWith('cancel@') ? `Premium · ends ${ends}` : `Premium · renews ${ends}`;
  }
  const grant = premiumGrant(state);
  if (grant && hasPremium(state)) {
    const until = grant.endsAt ? grantDay(grant.endsAt) : null;
    return until ? `Premium · until ${until}` : 'Premium';
  }
  return 'Free plan';
}

/** One row of the menu: a link or the Sign out button, one class so the two cannot differ (A2). */
function MenuRow({ to, onClick, icon: RowIcon, children }: { to?: string; onClick: () => void; icon: LucideIcon; children: ReactNode }) {
  const body = <><RowIcon className="account-menu-icon" aria-hidden />{children}</>;
  return to
    ? <Link to={to} onClick={onClick} className="account-menu-row">{body}</Link>
    : <button type="button" onClick={onClick} className="account-menu-row">{body}</button>;
}

/**
 * THE ACCOUNT MENU (#467 plan A3; analysis §3.1, owner-approved 2026-11-24).
 *
 * Its own fixed type and sizes (index.css, `.account-menu`), not the nav's fluid ones: the nav's account-slot
 * rules used to reach every row, so rows had no vertical padding and grew and shrank with the bar (15.5px tall
 * at 840x600), and the Sign out icon was smaller than the others (measured, A2).
 *
 * A disclosure of links, not an ARIA menu: the trigger says whether it is open and which panel it controls;
 * opening it moves focus to the first row, Escape closes it and returns focus to the trigger, Tab walks the
 * links. In the phone's hamburger panel (`placement="panel"`) it opens in flow at full width, so a taller menu
 * at the bottom of a scrolled panel is never cut off.
 */
export function UserDropdown({ placement = 'nav' }: { placement?: 'nav' | 'panel' }) {
  const { user, signOutUser } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const trainingId = useId();
  const accountId = useId();
  const account = useAccountPremium();
  const { load } = account;

  /*
    CLOSED BY ANY PRESS OUTSIDE IT, AND BY ESCAPE (owner, 2026-11-12: it closed only from the
    avatar, "especially on mobile this is an issue").

    A listener on the document, not a `fixed inset-0` backdrop: a fixed element fills its nearest
    ancestor with a `transform`, `filter` or `backdrop-filter`, and the nav has `backdrop-blur`, so the
    backdrop covered only the nav bar. It also does not swallow the press: tapping a link outside closes
    the menu AND follows the link. `pointerdown`, so it closes as the finger lands.
  */
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  /* Opening reads the plan (lazily: a page load with the menu closed costs no request) and moves focus in. */
  useEffect(() => {
    if (!open) return;
    load();
    panelRef.current?.querySelector<HTMLElement>('a, button')?.focus();
  }, [open, load]);

  const close = () => setOpen(false);
  const handleSignOut = async () => {
    setOpen(false);
    // Navigate first, then sign out: prevents a blank page from auth state clearing
    // while still on a page that may depend on auth context
    navigate('/', { replace: true });
    await signOutUser();
  };
  const toMembership = () => {
    logGA4Event({ name: 'premium_link_clicked', params: { from: 'account_menu' } });
    close();
  };

  if (!user) {
    return (
      <Link
        to="/login"
        className="text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors px-3 py-1.5 rounded-md"
      >
        Sign in
      </Link>
    );
  }

  const plan = planLine(account.state, account.known);
  /* The first letter of the name, for the avatar (any script: \p{L}). */
  const initial = user.username.match(/\p{L}/u)?.[0]?.toLocaleUpperCase() ?? null;

  return (
    <div className="relative" ref={containerRef}>
      {/*
        THE NAME IS THE ACCESSIBLE NAME NOW THAT IT IS NOT ON SCREEN (#55). The trigger is an avatar and a
        chevron, so without `aria-label` a screen reader announces an unlabelled button.
        NO USERNAME IN THE BAR (#55, 2026-08-23): the account control shares a fixed slot with `Sign in` so
        that signing in moves no other item, and a name does not fit that slot.
      */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`Account menu for ${user.username}`}
        title="Account"
      >
        {/*
          THE ACCOUNT, AT A GLANCE (owner, 2026-11-24: the faint circle with a thin outline icon was "so small and
          un-noticeable and confusing"). A solid gold circle with the account's initial, as Google and GitHub do:
          the same height as Sign in (the slot is fixed, #55), so nothing in the bar moves; it reads as "you".
          No initial (a name with no letter): the person icon, still on the solid circle.
        */}
        <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center" data-account-avatar>
          {initial ? <span className="account-initial">{initial}</span> : <User className="h-3.5 w-3.5" />}
        </div>
        {/* Gold, thicker, and turned while open (owner, 2026-11-24: the arrow was barely visible). */}
        <ChevronDown
          className={`account-chevron h-3.5 w-3.5 text-link transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`}
          strokeWidth={2.75}
          aria-hidden
        />
      </button>

      {open && (
        <div
          id={panelId}
          ref={panelRef}
          data-account-menu={placement}
          className={`account-menu rounded-lg border border-border bg-card shadow-lg py-1 ${placement === 'nav' ? 'absolute right-0 mt-1 w-64 z-50' : 'mt-2 w-full'}`}
        >
          <div className="account-menu-header">
            <p className="font-semibold text-foreground truncate">{user.username}</p>
            <p className="text-muted-foreground truncate">{user.email}</p>
            {plan && (
              <Link to="/membership" onClick={toMembership} className="account-menu-plan" data-account-plan>
                {plan}
              </Link>
            )}
          </div>

          {/*
            "YOUR TRAINING" (owner, 2026-11-24): a bare "Training" read as an entry point into training. The record
            and the plan are the two halves of one question about yourself (owner, 2026-08-05 and 08-06); both stay
            ungated, and these are second doors for people with an account.
          */}
          <div role="group" aria-labelledby={trainingId} className="account-menu-group">
            <p id={trainingId} className="account-menu-heading">Your training</p>
            <MenuRow to="/puzzles/progress" onClick={close} icon={Target}>Training record</MenuRow>
            <MenuRow to="/puzzles/plan" onClick={close} icon={CalendarDays}>Training plan</MenuRow>
          </div>

          {/* NO "Puzzles from your games" here (owner, 2026-11-24): it lives in the nav's Puzzles list only. */}
          <div role="group" aria-labelledby={accountId} className="account-menu-group">
            <p id={accountId} className="account-menu-heading">Account</p>
            <MenuRow to="/membership" onClick={toMembership} icon={Gem}>Membership</MenuRow>
            <MenuRow to="/profile" onClick={close} icon={LayoutDashboard}>Profile</MenuRow>
            {/* Email reminders, where people look for a setting about their account (owner, 2026-11-12). */}
            <MenuRow to="/reminders" onClick={close} icon={Mail}>Reminder emails</MenuRow>
          </div>

          {/* #44: a way to us from the account, where access questions land. Alone, so no heading. */}
          <div className="account-menu-group">
            <MenuRow
              to={contactHref('account_menu', undefined, null)}
              onClick={() => { logGA4Event({ name: 'support_entry_clicked', params: { surface: 'account_menu' } }); close(); }}
              icon={MessageSquare}
            >
              Contact us
            </MenuRow>
          </div>

          <div className="account-menu-group">
            <MenuRow onClick={handleSignOut} icon={LogOut}>Sign out</MenuRow>
          </div>
        </div>
      )}
    </div>
  );
}
