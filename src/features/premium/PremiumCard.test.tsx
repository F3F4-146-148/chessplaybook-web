/**
 * The /profile card in one line (#467 plan B4): the title by plan, the first owner-approved sentence of the full
 * card per state, and the way to /membership. Managing (Manage, refund) is not here any more (PremiumStatus).
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { PremiumState } from './paddleCheckout';

let state: PremiumState | null = null;
let known = true;
let provider: string | null = 'stripe';
vi.mock('@/features/auth/AuthContext', () => ({ useAuth: () => ({ user: { sub: 's', username: 'u', email: 'u@example.com' } }) }));
vi.mock('@/services/analytics', () => ({ logGA4Event: vi.fn() }));
vi.mock('./usePremiumOffer', () => ({ usePremiumOffer: () => ({ provider, state, stateKnown: known }) }));

const NONE = { available: null, pending: false };
const free = { premium: false, kind: null, status: null, periodEndsAt: null, scheduledChange: null, purchasePending: false, refund: NONE, entitled: false, grant: null } as unknown as PremiumState;
const sub = { ...free, premium: true, kind: 'subscription', status: 'active', periodEndsAt: '2027-11-23 12:00:00.000', entitled: true } as PremiumState;

async function renderCard() {
  const { PremiumCard } = await import('./PremiumCard');
  return render(<MemoryRouter><PremiumCard /></MemoryRouter>);
}
const card = () => document.querySelector('[data-testid="premium-card"]');
const text = () => card()?.textContent ?? '';
const link = () => card()?.querySelector('a');

describe('the /profile card, one line', () => {
  beforeEach(() => { state = null; known = true; provider = 'stripe'; });

  it('free: "Free plan", the approved line, See the plans on /membership', async () => {
    state = free;
    await renderCard();
    expect(text()).toContain('Free plan');
    expect(text()).toContain('Some features have a daily limit. Premium has none.');
    expect(link()?.getAttribute('href')).toBe('/membership#plans');
  });

  it('paid: "Premium", renews on, managed on /membership; no Manage or refund here', async () => {
    state = sub;
    await renderCard();
    expect(text()).toMatch(/^Premium/);
    expect(text()).toContain('You have Premium. It renews on');
    expect(link()?.getAttribute('href')).toBe('/membership');
    expect(text()).not.toContain('Manage your subscription');
    expect(text()).not.toContain('refund');
  });

  it('given with no end: the grant line', async () => {
    state = { ...free, entitled: true, grant: { endsAt: null } } as PremiumState;
    await renderCard();
    expect(text()).toContain('We gave you Premium with no end date.');
    expect(text()).toMatch(/^Premium/);
  });

  it('a payment not settled: "Free plan", said plainly, the way to Manage', async () => {
    state = { ...free, purchasePending: true, kind: 'subscription' } as PremiumState;
    await renderCard();
    expect(text()).toContain('Free plan');
    expect(text()).toContain("Your payment has not gone through yet, so you don't have Premium.");
    expect(link()?.getAttribute('href')).toBe('/membership');
  });

  it('not known yet: titled Premium, no line', async () => {
    state = null; known = false;
    await renderCard();
    expect(text()).toBe('Premium');
  });

  it('nobody sells and nothing held: nothing', async () => {
    provider = null; state = free;
    await renderCard();
    expect(card()).toBeNull();
  });
});
