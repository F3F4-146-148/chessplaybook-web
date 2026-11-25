/**
 * The account menu (#467 plan A3; owner 2026-11-12 for closing, 2026-11-24 for its layout).
 *
 * It closes on any press outside it, and on Escape. It used to rely on a `fixed inset-0` backdrop, which the
 * nav's `backdrop-blur` trapped inside the nav bar (1902x58 at 1917x920), so a click on the page left the menu
 * open. jsdom has no layout, so it could never have caught that; what this pins is the mechanism that replaced
 * it, a document listener no ancestor can trap. The sizes are measured in a browser
 * (scripts/measure-account-menu.mjs); here, the structure, focus and the plan line.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { AuthContext, type AuthContextType } from '../authContextValue';
import { AccountPremiumProvider } from '@/features/premium/AccountPremium';
import type { PremiumState } from '@/features/premium/paddleCheckout';

const USER = { userId: 'sub-1', username: 'Player One', email: 'one@example.com' };
vi.mock('../AuthContext', () => ({
  useAuth: () => ({ user: USER, isLoading: false, signOutUser: vi.fn() }),
}));
vi.mock('@/services/analytics', () => ({ logGA4Event: vi.fn() }));

import { UserDropdown, planLine } from './UserDropdown';

const noop = () => Promise.resolve() as never;
const authValue = {
  user: USER, isLoading: false,
  signInWithEmail: noop, signUpWithEmail: noop, confirmEmail: noop, resendCode: noop,
  signInWithGoogle: noop, signOutUser: noop, requestPasswordReset: noop, confirmNewPassword: noop,
} as AuthContextType;

const FREE = { premium: false, kind: null, status: null, periodEndsAt: null, scheduledChange: null, purchasePending: false, refund: { available: null, pending: false } } as unknown as PremiumState;

function renderMenu(fetchPremium: () => Promise<PremiumState | null> = async () => FREE) {
  const fetcher = vi.fn(fetchPremium);
  const Wrap = ({ children }: { children: ReactNode }) => (
    <AuthContext.Provider value={authValue}>
      <AccountPremiumProvider fetcher={async () => fetcher}>{children}</AccountPremiumProvider>
    </AuthContext.Provider>
  );
  render(
    <MemoryRouter>
      <div>
        <p data-testid="outside">The page</p>
        <UserDropdown />
      </div>
    </MemoryRouter>,
    { wrapper: Wrap },
  );
  const trigger = screen.getByRole('button', { name: /Account menu for Player One/ });
  return { trigger, fetcher, open: () => fireEvent.click(trigger) };
}

const menuOpen = () => screen.queryByText('Your training') !== null;

afterEach(cleanup);

describe('the account menu', () => {
  it('closes when the page is pressed anywhere outside it', () => {
    const { open } = renderMenu();
    open();
    expect(menuOpen()).toBe(true);
    fireEvent.pointerDown(screen.getByTestId('outside'));
    expect(menuOpen()).toBe(false);
  });

  it('stays open when the press is inside it', () => {
    const { open } = renderMenu();
    open();
    fireEvent.pointerDown(screen.getByText('Your training'));
    expect(menuOpen()).toBe(true);
  });

  it('closes on Escape and gives the focus back to the trigger', () => {
    const { open, trigger } = renderMenu();
    open();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(menuOpen()).toBe(false);
    expect(document.activeElement).toBe(trigger);
  });

  it('still toggles from the avatar, without the outside listener reopening it', () => {
    const { open, trigger } = renderMenu();
    open();
    fireEvent.pointerDown(trigger);
    fireEvent.click(trigger);
    expect(menuOpen()).toBe(false);
  });

  it('has no backdrop element left to trap', () => {
    const { open } = renderMenu();
    open();
    expect(document.querySelector('.fixed.inset-0')).toBeNull();
  });

  it('is a disclosure: the trigger names the panel it opens, and opening moves the focus in', () => {
    const { open, trigger } = renderMenu();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(trigger.hasAttribute('aria-haspopup')).toBe(false);
    open();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const panel = document.getElementById(trigger.getAttribute('aria-controls') ?? '');
    expect(panel).not.toBeNull();
    expect(panel!.contains(document.activeElement)).toBe(true);
  });

  it('groups the rows under "Your training" and "Account", then Contact us and Sign out (owner, 2026-11-24)', () => {
    const { open } = renderMenu();
    open();
    const training = screen.getByRole('group', { name: 'Your training' });
    expect([...training.querySelectorAll('a')].map((a) => a.textContent)).toEqual(['Training record', 'Training plan']);
    const account = screen.getByRole('group', { name: 'Account' });
    expect([...account.querySelectorAll('a')].map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['Membership', '/membership'], ['Profile', '/profile'], ['Reminder emails', '/reminders'],
    ]);
    expect(screen.getByRole('link', { name: 'Contact us' })).toBeTruthy();
    expect(screen.queryByText('Signed in as')).toBeNull();
    expect(screen.queryByText('My Profile')).toBeNull();
  });

  it('gives every row, Sign out included, the same row and icon classes (A2: Sign out had a smaller icon)', () => {
    const { open } = renderMenu();
    open();
    const rows = [...document.querySelectorAll('[data-account-menu] a, [data-account-menu] button')]
      .filter((el) => !el.classList.contains('account-menu-plan'));
    expect(rows.length).toBe(7);
    for (const row of rows) {
      expect(row.classList.contains('account-menu-row')).toBe(true);
      expect(row.querySelector('svg')?.classList.contains('account-menu-icon')).toBe(true);
    }
    expect(screen.getByRole('button', { name: 'Sign out' }).classList.contains('account-menu-row')).toBe(true);
  });

  it('reads the plan only when opened, and shows it once the account is read', async () => {
    const { open, fetcher } = renderMenu();
    expect(fetcher).not.toHaveBeenCalled();
    open();
    expect(await screen.findByText('Free plan')).toBeTruthy();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Free plan').closest('a')?.getAttribute('href')).toBe('/membership');
  });

  it('shows no plan line while the account cannot be read', async () => {
    const { open, fetcher } = renderMenu(async () => null);
    open();
    await waitFor(() => expect(fetcher).toHaveBeenCalled());
    expect(screen.queryByText('Free plan')).toBeNull();
    expect(document.querySelector('[data-account-plan]')).toBeNull();
  });
});

describe('the plan line', () => {
  const at = (s: Partial<PremiumState> & Record<string, unknown>) => ({ ...FREE, ...s }) as PremiumState;
  it('says nothing before a valid answer', () => {
    expect(planLine(null, false)).toBeNull();
    expect(planLine(at({ premium: true }), false)).toBeNull();
  });
  it('free', () => { expect(planLine(FREE, true)).toBe('Free plan'); });
  it('a subscription renews, or ends when cancelled, or failed its payment', () => {
    expect(planLine(at({ premium: true, kind: 'subscription', status: 'active', periodEndsAt: '2027-12-24 12:00:00.000' }), true)).toMatch(/^Premium · renews .*2027/);
    expect(planLine(at({ premium: true, kind: 'subscription', status: 'active', periodEndsAt: '2027-12-24 12:00:00.000', scheduledChange: 'cancel@2027-12-24' }), true)).toMatch(/^Premium · ends /);
    expect(planLine(at({ premium: true, kind: 'subscription', status: 'past_due', periodEndsAt: '2027-12-24 12:00:00.000' }), true)).toBe('Premium · payment failed');
  });
  it('a pass runs until its end', () => {
    expect(planLine(at({ premium: true, kind: 'pass', periodEndsAt: '2027-12-24 12:00:00.000' }), true)).toMatch(/^Premium · until /);
  });
  it('a grant: until its last day, or just Premium with no end', () => {
    expect(planLine(at({ entitled: true, grant: { endsAt: '2027-02-24 22:00:00.000' } }), true)).toMatch(/^Premium · until /);
    expect(planLine(at({ entitled: true, grant: { endsAt: null } }), true)).toBe('Premium');
  });
});
