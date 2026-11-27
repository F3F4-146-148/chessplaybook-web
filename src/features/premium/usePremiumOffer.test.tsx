/**
 * The Premium hook's guards with Stripe selling (Fable and Codex reviews of STRIPE plan C1): each test
 * drives the real hook against a stubbed server and fails when the guard it names is removed.
 */
import { act, render, renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/config/env', () => ({ default: { apiBaseUrl: '' } }));
vi.mock('@/features/auth/utils/getAuthToken', () => ({ getAuthHeader: async () => ({ Authorization: 'Bearer t' }) }));
const auth = { user: { userId: 'sub-1', email: 'a@example.com' } as { userId: string; email: string } | null, isLoading: false };
vi.mock('@/features/auth/AuthContext', () => ({ useAuth: () => auth }));

import type { ReactNode } from 'react';
import { AuthContext, type AuthContextType } from '@/features/auth/authContextValue';
import { AccountPremiumProvider, useAccountPremium } from './AccountPremium';
import { PremiumStatus } from './PremiumStatus';
import { LEAVE_TIMEOUT_MS, usePremiumOffer } from './usePremiumOffer';

/* The shared account state (#467 A1b) reads the user from AuthContext; it is given the same mutable user as the
   mocked useAuth above, so a test that signs another account in reaches both. */
const noopAuth = () => Promise.resolve() as never;
function Wrap({ children }: { children: ReactNode }) {
  const value = {
    user: auth.user ? { ...auth.user, username: 'u' } : null, isLoading: false,
    signInWithEmail: noopAuth, signUpWithEmail: noopAuth, confirmEmail: noopAuth, resendCode: noopAuth,
    signInWithGoogle: noopAuth, signOutUser: noopAuth, requestPasswordReset: noopAuth, confirmNewPassword: noopAuth,
  } as AuthContextType;
  return <AuthContext.Provider value={value}><AccountPremiumProvider>{children}</AccountPremiumProvider></AuthContext.Provider>;
}

const NONE = { premium: false, kind: null, status: null, periodEndsAt: null, scheduledChange: null, purchasePending: false, refund: { available: null, pending: false } };
const HOLDER = { ...NONE, premium: true, kind: 'subscription', status: 'active', periodEndsAt: '2027-11-23 00:00:00.000' };

type Handler = (url: string, init?: RequestInit) => Promise<Response> | Response;
let handler: Handler;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const checkoutCalls = () => (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(([u]) => String(u).includes('/stripe/checkout'));
const assign = vi.fn();

beforeEach(() => {
  auth.user = { userId: 'sub-1', email: 'a@example.com' };
  vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => Promise.resolve(handler(String(url), init))));
  Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, assign, search: '', pathname: '/premium', hash: '' } });
  assign.mockReset();
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

const route = (premium: () => unknown, checkout: Handler = () => json({ url: 'https://checkout.stripe.com/x' })): Handler => (url, init) => {
  if (url.endsWith('/api/premium/checkout')) return json({ provider: 'stripe', checkout: null });
  if (url.endsWith('/api/premium/stripe/checkout')) return checkout(url, init);
  if (url.endsWith('/api/premium')) return json(premium());
  return json({});
};

describe('usePremiumOffer with Stripe selling', () => {
  it('two Buy presses in the same moment send one checkout request', async () => {
    let release!: () => void;
    const held = new Promise<void>((r) => { release = r; });
    handler = route(() => NONE, async () => { await held; return json({ url: 'https://checkout.stripe.com/x' }); });
    const { result } = renderHook(() => usePremiumOffer(), { wrapper: Wrap });
    await waitFor(() => expect(result.current.stateKnown).toBe(true));
    await act(async () => {
      void result.current.buy({ key: 'yearly', priceId: null, minor: 1849, currency: 'GBP' }, 'GB');
      void result.current.buy({ key: 'yearly', priceId: null, minor: 1849, currency: 'GBP' }, 'GB');
    });
    release();
    await waitFor(() => expect(assign).toHaveBeenCalledTimes(1));
    expect(checkoutCalls()).toHaveLength(1);
    expect(JSON.parse(String(checkoutCalls()[0][1]?.body))).toEqual({ plan: 'yearly', country: 'GB', shownMinor: '1849', shownCurrency: 'gbp' });
  });

  it('a slow first account read never overwrites a later "you have Premium"', async () => {
    window.location.search = '?checkout=success';
    vi.spyOn(window.history, 'replaceState').mockImplementation(() => {});
    let firstRelease!: () => void;
    const first = new Promise<void>((r) => { firstRelease = r; });
    let reads = 0;
    handler = (url, init) => {
      if (url.endsWith('/api/premium')) {
        reads += 1;
        /* The first read answers last, with the old "no Premium"; every later read sees Premium. */
        if (reads === 1) return first.then(() => json(NONE));
        return json(HOLDER);
      }
      return route(() => HOLDER)(url, init);
    };
    const { result } = renderHook(() => usePremiumOffer(), { wrapper: Wrap });
    await waitFor(() => expect(result.current.state?.premium).toBe(true));
    await act(async () => { firstRelease(); await first; });
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current.state?.premium).toBe(true);
  });

  it('a purchase not yet settled offers no checkout, and the reason is the server\'s', async () => {
    handler = route(() => ({ ...NONE, purchasePending: true }));
    const { result } = renderHook(() => usePremiumOffer(), { wrapper: Wrap });
    await waitFor(() => expect(result.current.state?.purchasePending).toBe(true));
    await act(async () => { await result.current.buy({ key: 'yearly', priceId: null }, 'IN'); });
    expect(checkoutCalls()).toHaveLength(0);
  });

  it('a refusal for a pending purchase says it is pending, not that the account has Premium', async () => {
    let pending = false;
    handler = route(() => ({ ...NONE, purchasePending: pending }), () => { pending = true; return json({ error: 'already_premium' }, 409); });
    const { result } = renderHook(() => usePremiumOffer(), { wrapper: Wrap });
    await waitFor(() => expect(result.current.stateKnown).toBe(true));
    await act(async () => { await result.current.buy({ key: 'yearly', priceId: null }, 'IN'); });
    expect(result.current.message).toMatch(/already has a subscription/);
    expect(result.current.busy).toBe(false);
  });

  it('a page whose price changed says so and opens nothing', async () => {
    handler = route(() => NONE, () => json({ error: 'price_changed' }, 409));
    const { result } = renderHook(() => usePremiumOffer(), { wrapper: Wrap });
    await waitFor(() => expect(result.current.stateKnown).toBe(true));
    await act(async () => { await result.current.buy({ key: 'yearly', priceId: null, minor: 1799, currency: 'GBP' }, 'GB'); });
    expect(result.current.message).toMatch(/price has changed/);
    expect(assign).not.toHaveBeenCalled();
  });

  it('a page left while the checkout opens never sends the visitor to Stripe', async () => {
    let release!: () => void;
    const held = new Promise<void>((r) => { release = r; });
    handler = route(() => NONE, async () => { await held; return json({ url: 'https://checkout.stripe.com/x' }); });
    const { result, unmount } = renderHook(() => usePremiumOffer(), { wrapper: Wrap });
    await waitFor(() => expect(result.current.stateKnown).toBe(true));
    let pending!: Promise<void>;
    act(() => { pending = result.current.buy({ key: 'yearly', priceId: null }, 'GB'); });
    unmount();
    release();
    await pending;
    expect(assign).not.toHaveBeenCalled();
  });
});

describe('an attempt is bound to its moment and its account (Codex, round two)', () => {
  it('an older attempt\'s timer never unlocks a newer checkout', async () => {
    let release2!: () => void;
    let calls = 0;
    handler = route(() => NONE, async () => {
      calls += 1;
      if (calls === 2) await new Promise<void>((r) => { release2 = r; });
      return json({ url: 'https://checkout.stripe.com/x' });
    });
    const { result } = renderHook(() => usePremiumOffer(), { wrapper: Wrap });
    await waitFor(() => expect(result.current.stateKnown).toBe(true));
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await act(async () => { await result.current.buy({ key: 'yearly', priceId: null }, 'GB'); });
    expect(assign).toHaveBeenCalledTimes(1);
    /* Back with the Back button: the page as it was left, unlocked. */
    await act(async () => { window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true })); });
    expect(result.current.busy).toBe(false);
    /* A second attempt, still opening when the first attempt's timer comes due. */
    let second!: Promise<void>;
    act(() => { second = result.current.buy({ key: 'yearly', priceId: null }, 'GB'); });
    await act(async () => { vi.advanceTimersByTime(LEAVE_TIMEOUT_MS + 100); });
    expect(result.current.busy).toBe(true);
    await act(async () => { result.current.buy({ key: 'yearly', priceId: null }, 'GB'); });
    expect(checkoutCalls()).toHaveLength(2);
    release2();
    await act(async () => { await second; });
  });

  it('another account signing in while a checkout opens is never sent to it', async () => {
    let release!: () => void;
    const held = new Promise<void>((r) => { release = r; });
    handler = route(() => NONE, async () => { await held; return json({ url: 'https://checkout.stripe.com/x' }); });
    const { result, rerender } = renderHook(() => usePremiumOffer(), { wrapper: Wrap });
    await waitFor(() => expect(result.current.stateKnown).toBe(true));
    let pending!: Promise<void>;
    act(() => { pending = result.current.buy({ key: 'yearly', priceId: null }, 'GB'); });
    auth.user = { userId: 'sub-2', email: 'b@example.com' };
    rerender();
    release();
    await act(async () => { await pending; });
    expect(assign).not.toHaveBeenCalled();
    expect(result.current.busy).toBe(false);
  });
});

describe('another year for a one-year-pass holder (owner, 2026-11-24, option A)', () => {
  const PASS = { ...NONE, premium: true, kind: 'pass', status: 'pass', periodEndsAt: '2027-11-24 12:00:00.000', openSubscription: false };
  beforeEach(() => { sessionStorage.clear(); });

  it('Fable: no checkout for a pass holder with an open subscription or a refund waiting (the page\'s own rule)', async () => {
    for (const s of [{ ...PASS, openSubscription: true }, { ...PASS, refund: { available: null, pending: true } }]) {
      handler = route(() => s);
      const { result, unmount } = renderHook(() => usePremiumOffer(), { wrapper: Wrap });
      await waitFor(() => expect(result.current.stateKnown).toBe(true));
      await act(async () => { await result.current.buy({ key: 'one_year', priceId: null, minor: 1849, currency: 'GBP' }, 'GB'); });
      unmount();
    }
    expect(checkoutCalls()).toHaveLength(0);
  });

  it('a pass holder may buy the one-year plan: one checkout, the old end kept for the wait', async () => {
    handler = route(() => PASS);
    const { result } = renderHook(() => usePremiumOffer(), { wrapper: Wrap });
    await waitFor(() => expect(result.current.stateKnown).toBe(true));
    await act(async () => { await result.current.buy({ key: 'one_year', priceId: null, minor: 1849, currency: 'GBP' }, 'GB'); });
    expect(checkoutCalls()).toHaveLength(1);
    expect(sessionStorage.getItem('cp_premium_extend_from')).toBe(PASS.periodEndsAt);
  });

  it('a pass holder still cannot start a subscription', async () => {
    handler = route(() => PASS);
    const { result } = renderHook(() => usePremiumOffer(), { wrapper: Wrap });
    await waitFor(() => expect(result.current.stateKnown).toBe(true));
    await act(async () => { await result.current.buy({ key: 'yearly', priceId: null }, 'GB'); });
    expect(checkoutCalls()).toHaveLength(0);
  });

  it('a subscriber cannot buy a pass on top', async () => {
    handler = route(() => HOLDER);
    const { result } = renderHook(() => usePremiumOffer(), { wrapper: Wrap });
    await waitFor(() => expect(result.current.stateKnown).toBe(true));
    await act(async () => { await result.current.buy({ key: 'one_year', priceId: null }, 'GB'); });
    expect(checkoutCalls()).toHaveLength(0);
  });

  it('back from a FIRST pass purchase: not a wait for another year (Fable: the holder box said waiting for ever)', async () => {
    window.location.search = '?checkout=success';
    vi.spyOn(window.history, 'replaceState').mockImplementation(() => {});
    handler = route(() => PASS);
    const { result } = renderHook(() => usePremiumOffer(), { wrapper: Wrap });
    await waitFor(() => expect(result.current.purchased).toBe(true));
    expect(result.current.extendWait).toBe(false);
  });

  it('back from paying, the wait lasts until the pass end moves, not merely while the account has Premium', async () => {
    window.location.search = '?checkout=success';
    vi.spyOn(window.history, 'replaceState').mockImplementation(() => {});
    sessionStorage.setItem('cp_premium_extend_from', PASS.periodEndsAt);
    let current: typeof PASS = PASS;
    handler = route(() => current);
    const { result } = renderHook(() => usePremiumOffer(), { wrapper: Wrap });
    await waitFor(() => expect(result.current.purchased).toBe(true));
    expect(result.current.extendWait).toBe(true);
    await new Promise((r) => setTimeout(r, 50));
    expect(result.current.purchased).toBe(true);
    current = { ...PASS, periodEndsAt: '2028-11-24 12:00:00.000' };
    await waitFor(() => expect(result.current.purchased).toBe(false), { timeout: 5000 });
    expect(result.current.message).toBeNull();
    expect(result.current.extendWait).toBe(false);
    expect(sessionStorage.getItem('cp_premium_extend_from')).toBeNull();
  });
});

describe('one account state for every consumer (#467 A1b)', () => {
  it('a purchase read by one consumer is seen by another', async () => {
    let premiumNow: unknown = NONE;
    handler = route(() => premiumNow);
    const { result } = renderHook(() => ({ page: usePremiumOffer(), menu: useAccountPremium() }), { wrapper: Wrap });
    await waitFor(() => expect(result.current.page.stateKnown).toBe(true));
    expect(result.current.menu.state?.premium).toBe(false);
    premiumNow = HOLDER;
    await act(async () => { await result.current.menu.refresh(); });
    expect(result.current.page.state?.premium).toBe(true);
  });

  it('a page where nobody sells does not clear what the menu read', async () => {
    handler = (url) => {
      if (url.endsWith('/api/premium/checkout')) return json({ provider: null, checkout: null });
      if (url.endsWith('/api/premium')) return json(HOLDER);
      return json({});
    };
    const { result } = renderHook(() => ({ menu: useAccountPremium({ load: true }), page: usePremiumOffer() }), { wrapper: Wrap });
    await waitFor(() => expect(result.current.menu.known).toBe(true));
    await waitFor(() => expect(result.current.page.checked).toBe(true));
    expect(result.current.menu.state?.premium).toBe(true);
    expect(result.current.page.state?.premium).toBe(true);
  });
});

describe("the account's Premium status (moved from /profile to /membership, #467 B4)", () => {
  it('a renewal being retried says the payment failed, never "renews on", with Manage (staging, 2026-11-23)', async () => {
    handler = (url) => {
      if (url.endsWith('/api/premium/checkout')) return json({ provider: 'stripe', checkout: null });
      if (url.endsWith('/api/premium')) return json({ ...HOLDER, status: 'past_due', periodEndsAt: '2027-02-23 20:31:57.000' });
      return json({});
    };
    const { findByText, queryByText } = render(<MemoryRouter><PremiumStatus /></MemoryRouter>, { wrapper: Wrap });
    expect(await findByText('Your last payment failed. Update your card to keep Premium.')).toBeTruthy();
    expect(queryByText(/renews on/)).toBeNull();
    expect(await findByText('Manage your subscription')).toBeTruthy();
  });

  it('shows a subscription with no Premium, with Manage (Fable, Codex: /premium sends them here)', async () => {
    handler = (url) => {
      if (url.endsWith('/api/premium/checkout')) return json({ provider: null, checkout: null });
      if (url.endsWith('/api/premium')) return json({ ...NONE, purchasePending: true });
      return json({});
    };
    const { findByText } = render(<MemoryRouter><PremiumStatus /></MemoryRouter>, { wrapper: Wrap });
    expect(await findByText('Manage your subscription')).toBeTruthy();
  });

  it('shows for a Premium holder even when nobody sells today (Fable)', async () => {
    handler = (url) => {
      if (url.endsWith('/api/premium/checkout')) return json({ provider: null, checkout: null });
      if (url.endsWith('/api/premium')) return json(HOLDER);
      return json({});
    };
    const { findByTestId } = render(<PremiumStatus />, { wrapper: Wrap });
    expect(await findByTestId('premium-status')).toBeTruthy();
  });
});

describe('back from Stripe without an account (#521 Phase F)', () => {
  it('a settled purchase on an existing account is DONE: no spinner, nothing more to buy (owner, staging)', async () => {
    auth.user = null;
    window.location.search = '?checkout=success&purchase=p1';
    vi.spyOn(window.history, 'replaceState').mockImplementation(() => {});
    sessionStorage.setItem('cp_guest_purchase', JSON.stringify({ purchaseId: 'p1', secret: 's1' }));
    handler = (url) => {
      if (url.endsWith('/api/premium/checkout')) return json({ provider: 'stripe', checkout: null, guestCheckout: true });
      if (url.endsWith('/api/premium/guest-purchase/status')) return json({ state: 'ready', account: 'existing', email: 'b@example.com', canSignIn: false });
      return json({});
    };
    const { result } = renderHook(() => usePremiumOffer(), { wrapper: Wrap });
    await waitFor(() => expect(result.current.guestDone).toBe(true));
    expect(result.current.purchased).toBe(true);
    expect(result.current.message).toBe('Premium is now on your account b@example.com. Sign in with that email to use it.');
    expect(sessionStorage.getItem('cp_guest_purchase')).toBeNull();
  });
});
