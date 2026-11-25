/**
 * The account card, one test per state of the owner-approved wording (2026-11-24, Fable and Codex consulted):
 * the title names the plan ("Free plan" / "Premium"); paid lines open "You have Premium", given ones "We gave
 * you Premium"; the free plan's line names no limit and no number.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { PremiumState } from './paddleCheckout';

let state: PremiumState | null = null;
let known = true;
vi.mock('@/features/auth/AuthContext', () => ({ useAuth: () => ({ user: { sub: 's', username: 'u', email: 'u@example.com' } }) }));
vi.mock('./usePremiumOffer', () => ({
  usePremiumOffer: () => ({ provider: 'stripe', state, stateKnown: known, setState: vi.fn(), message: null, setMessage: vi.fn() }),
  fetchPremium: vi.fn(),
}));

const NONE = { available: null, pending: false };
const free: PremiumState = { premium: false, kind: null, status: null, periodEndsAt: null, scheduledChange: null, purchasePending: false, refund: NONE, entitled: false, grant: null };
const subscription: PremiumState = { ...free, premium: true, kind: 'subscription', status: 'active', periodEndsAt: '2027-11-23 12:00:00.000', entitled: true };
const pass: PremiumState = { ...free, premium: true, kind: 'pass', status: 'pass', periodEndsAt: '2027-11-24 12:00:00.000', entitled: true, openSubscription: false };
const givenOpen = { endsAt: null };
const givenEnding = { endsAt: '2027-02-24 22:00:00.000' };

async function renderCard() {
  const { PremiumStatus } = await import('./PremiumStatus');
  return render(<MemoryRouter><PremiumStatus /></MemoryRouter>);
}
const text = () => document.querySelector('[data-testid="premium-status"]')!.textContent ?? '';

describe('PremiumStatus (the card that moved to /membership), the seven states', () => {
  beforeEach(() => { state = null; known = true; });

  it('1. free: "Free plan", no limit and no number named, the plans offered', async () => {
    state = free;
    await renderCard();
    expect(text()).toContain('Free plan');
    expect(text()).toContain('Some features have a daily limit. Premium has none.');
    expect(text()).not.toMatch(/\d/);
    expect(screen.getByText('See the plans')).toBeTruthy();
  });

  it('2. a paid subscription: Premium, renews on, Manage', async () => {
    state = subscription;
    await renderCard();
    expect(text()).toMatch(/^Premium/);
    expect(text()).toMatch(/You have Premium\. It renews on .*2027\./);
    expect(screen.getByRole('button', { name: 'Manage your subscription' })).toBeTruthy();
  });

  it('3. a paid pass: until, does not renew, Add another year', async () => {
    state = pass;
    await renderCard();
    expect(text()).toMatch(/You have Premium until .*2027\. It does not renew\./);
    expect(screen.getByText('Add another year')).toBeTruthy();
    expect(text()).not.toContain(';');
  });

  it('4. given with no end: the line only; no Manage, no refund, no plans', async () => {
    state = { ...free, entitled: true, grant: givenOpen };
    await renderCard();
    expect(text()).toMatch(/^Premium/);
    expect(text()).toContain('We gave you Premium with no end date.');
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByText('See the plans')).toBeNull();
  });

  it('5. given with an end: the line, then the plans', async () => {
    state = { ...free, entitled: true, grant: givenEnding };
    await renderCard();
    expect(text()).toMatch(/We gave you Premium until .*2027\. After that, you can choose a plan\./);
    expect(screen.getByText('See the plans')).toBeTruthy();
  });

  it('6. given and paid: one line each, no plans offered; the refund keeps the given Premium', async () => {
    state = { ...subscription, grant: givenEnding, refund: { available: { kind: 'subscription', totalMinor: '449', currency: 'EUR', until: '2026-12-24 12:00:00.000' }, pending: false } };
    await renderCard();
    expect(text()).toMatch(/We gave you Premium until .*2027\.Your subscription renews on .*2027\./);
    expect(text()).not.toContain('You have Premium');
    expect(screen.queryByText('See the plans')).toBeNull();
    screen.getByRole('button', { name: /cancel and get a full refund/i }).click();
    expect(await screen.findByText(/you keep the Premium we gave you/)).toBeTruthy();
  });

  it('3a. no "Add another year" where /premium would not sell it (Fable): an open subscription, a refund waiting, an older backend', async () => {
    for (const s of [{ ...pass, openSubscription: true }, { ...pass, refund: { available: null, pending: true } }, { ...pass, openSubscription: undefined }]) {
      state = s;
      const { unmount } = await renderCard();
      expect(screen.queryByText('Add another year')).toBeNull();
      unmount();
    }
  });

  it('3b. a single pass refunded: "Get a full refund" (nothing to cancel), and Premium ends', async () => {
    state = { ...pass, refund: { available: { kind: 'pass', totalMinor: '2249', currency: 'EUR', until: '2026-12-24 12:00:00.000', premiumUntilAfter: null }, pending: false } };
    await renderCard();
    expect(screen.queryByRole('button', { name: /cancel/i })).toBeNull();
    screen.getByRole('button', { name: 'Get a full refund' }).click();
    expect(await screen.findByText(/in full\? Premium ends once the refund is confirmed\./)).toBeTruthy();
  });

  it('3c. two passes, the second year refunded (#467 E4, owner-approved): you keep Premium until the first ends', async () => {
    state = { ...pass, periodEndsAt: '2028-11-24 12:00:00.000', refund: { available: { kind: 'pass', totalMinor: '2249', currency: 'EUR', until: '2026-12-24 12:00:00.000', premiumUntilAfter: '2027-11-24 12:00:00.000' }, pending: false } };
    await renderCard();
    screen.getByRole('button', { name: 'Get a full refund' }).click();
    expect(await screen.findByText(/in full\? You keep Premium until .*2027\./)).toBeTruthy();
    expect(text()).not.toContain('Premium ends');
  });

  it('3d. two passes, a refund waiting: you keep Premium until the first ends', async () => {
    state = { ...pass, refund: { available: null, pending: true, pendingPremiumUntilAfter: '2027-11-24 12:00:00.000' } };
    await renderCard();
    expect(text()).toMatch(/Your refund has been requested\. You keep Premium until .*2027\./);
  });

  it('6b. given and a paid pass: the pass line, no Add another year', async () => {
    state = { ...pass, grant: givenOpen };
    await renderCard();
    expect(text()).toMatch(/We gave you Premium with no end date\.Your one-year pass ends on .*2027\./);
    expect(screen.queryByText('Add another year')).toBeNull();
  });

  it('7. a payment not settled: "Free plan", said plainly, Manage', async () => {
    state = { ...free, purchasePending: true };
    await renderCard();
    expect(text()).toMatch(/^Free plan/);
    expect(text()).toContain("Your payment has not gone through yet, so you don't have Premium.");
    expect(screen.getByRole('button', { name: 'Manage your subscription' })).toBeTruthy();
    expect(screen.queryByText('See the plans')).toBeNull();
  });

  it('7b. a payment not settled while given Premium: no "you don\'t have Premium"', async () => {
    state = { ...free, purchasePending: true, entitled: true, grant: givenOpen };
    await renderCard();
    expect(text()).toMatch(/^Premium/);
    expect(text()).toContain("Your subscription's payment has not gone through yet.");
    expect(text()).not.toContain("you don't have Premium");
  });

  it('the account not known yet: titled Premium, nothing claimed', async () => {
    known = false;
    state = null;
    await renderCard();
    expect(text()).toMatch(/^Premium/);
    expect(text()).not.toContain('Free plan');
  });
});

