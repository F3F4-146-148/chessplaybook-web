/**
 * The Premium page selling through Stripe (STRIPE_MANAGED_PAYMENTS_IMPLEMENTATION_PLAN B6 and C1).
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/config/env', () => ({ default: { apiBaseUrl: '' } }));
vi.mock('@/features/auth/utils/getAuthToken', () => ({ getAuthHeader: async () => ({ Authorization: 'Bearer t' }) }));

import stored from '../../../backend/src/config/premiumCountryPrices.json';
import { fetchCheckoutSettings } from './paddleCheckout';
import { plansForCountry } from './premiumPlans';
import { createStripeCheckout, STRIPE_REFUSAL, stripePlan, stripeUnavailableIn } from './stripeCheckout';

const answer = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe('who sells (B6)', () => {
  const paddle = { environment: 'sandbox', clientToken: 'c', prices: { monthly: 'm', yearly: 'y', oneYear: null } };

  it('reads Stripe, Paddle and nobody', async () => {
    expect(await fetchCheckoutSettings(answer(200, { provider: 'stripe', checkout: null }))).toEqual({ provider: 'stripe', settings: null });
    expect(await fetchCheckoutSettings(answer(200, { provider: 'paddle', checkout: paddle }))).toEqual({ provider: 'paddle', settings: paddle });
    expect(await fetchCheckoutSettings(answer(200, { provider: null, checkout: null }))).toEqual({ provider: null, settings: null });
    expect(await fetchCheckoutSettings(answer(500, {}))).toEqual({ provider: null, settings: null });
  });

  it('an API from before B6 (no provider field) with Paddle settings still means Paddle', async () => {
    expect(await fetchCheckoutSettings(answer(200, { checkout: paddle }))).toEqual({ provider: 'paddle', settings: paddle });
  });

  it('Stripe wins when the server names it, even beside Paddle settings (Fable)', async () => {
    expect(await fetchCheckoutSettings(answer(200, { provider: 'stripe', checkout: paddle }))).toEqual({ provider: 'stripe', settings: null });
  });

  it('Paddle is never chosen without its settings, whatever provider says', async () => {
    expect((await fetchCheckoutSettings(answer(200, { provider: 'paddle', checkout: null }))).provider).toBeNull();
  });
});

describe('the Stripe checkout call (C1)', () => {
  it('sends the plan by the server\'s name and the country, and returns the URL', async () => {
    let sent: { url: string; init: RequestInit } | null = null;
    const fetchImpl = (async (url: string, init: RequestInit) => {
      sent = { url, init };
      return new Response(JSON.stringify({ url: 'https://checkout.stripe.com/c/pay/cs_test_1', currency: 'inr', amountMinor: '54900' }), { status: 200 });
    }) as unknown as typeof fetch;
    expect(await createStripeCheckout('one_year', 'IN', fetchImpl)).toEqual({ ok: true, url: 'https://checkout.stripe.com/c/pay/cs_test_1' });
    expect(sent!.url).toBe('/api/premium/stripe/checkout');
    expect(JSON.parse(String(sent!.init.body))).toEqual({ plan: 'oneYear', country: 'IN' });
    expect((sent!.init.headers as Record<string, string>).Authorization).toBe('Bearer t');
  });

  it('sends no country when it is not known (the server prices it as unknown, as the page did)', async () => {
    let body = '';
    const fetchImpl = (async (_: string, init: RequestInit) => {
      body = String(init.body);
      return new Response(JSON.stringify({ url: 'https://checkout.stripe.com/x' }), { status: 200 });
    }) as unknown as typeof fetch;
    await createStripeCheckout('yearly', null, fetchImpl);
    expect(JSON.parse(body)).toEqual({ plan: 'yearly' });
  });

  it('names each refusal, and anything else is a plain failure', async () => {
    expect(await createStripeCheckout('yearly', 'GB', answer(409, { error: 'already_premium' }))).toEqual({ ok: false, reason: 'already_premium' });
    expect(await createStripeCheckout('yearly', 'GB', answer(409, { error: 'checkout_in_progress' }))).toEqual({ ok: false, reason: 'checkout_in_progress' });
    expect(await createStripeCheckout('monthly', 'IN', answer(400, { error: 'plan_unavailable' }))).toEqual({ ok: false, reason: 'plan_unavailable' });
    expect(await createStripeCheckout('yearly', 'GB', answer(409, { error: 'price_changed' }))).toEqual({ ok: false, reason: 'price_changed' });
    expect(await createStripeCheckout('yearly', 'GB', answer(503, { error: 'price_mismatch' }))).toEqual({ ok: false, reason: 'failed' });
    expect(await createStripeCheckout('yearly', 'GB', answer(502, { error: 'stripe_unavailable' }))).toEqual({ ok: false, reason: 'failed' });
    const down = (async () => { throw new Error('offline'); }) as unknown as typeof fetch;
    expect(await createStripeCheckout('yearly', 'GB', down)).toEqual({ ok: false, reason: 'failed' });
    for (const line of Object.values(STRIPE_REFUSAL)) expect(line).not.toContain('—');
  });

  it('never follows a URL that is not https', async () => {
    expect(await createStripeCheckout('yearly', 'GB', answer(200, { url: 'javascript:alert(1)' }))).toEqual({ ok: false, reason: 'failed' });
  });

  it('knows where Stripe refuses buyers, as the server does (C2)', async () => {
    expect(['RU', 'cn', 'XK'].every(stripeUnavailableIn)).toBe(true);
    expect([null, undefined, '', 'GB', 'IN', 'RO'].some(stripeUnavailableIn)).toBe(false);
    expect((stored as { unavailable: string[] }).unavailable.every((cc) => stripeUnavailableIn(cc))).toBe(true);
    expect(await createStripeCheckout('yearly', 'RU', answer(400, { error: 'country_unavailable' }))).toEqual({ ok: false, reason: 'country_unavailable' });
  });

  it('maps every page plan to the server\'s plan names', () => {
    expect([stripePlan('yearly'), stripePlan('monthly'), stripePlan('one_year')]).toEqual(['yearly', 'monthly', 'oneYear']);
  });
});

describe('the price on the page is the price Stripe charges, in every country (C1)', () => {
  type Entry = { tier: string; currency: string; yearlyMinor: string; monthlyMinor: string | null };
  const table = stored as { unknown: Entry; countries: Record<string, Entry> };
  const check = (cc: string | null, e: Entry) => {
    const cards = plansForCountry(cc);
    const at = (key: string) => cards.find((c) => c.key === key);
    for (const key of ['yearly', 'one_year'] as const) {
      expect(at(key)?.currency, `${cc} ${key} currency`).toBe(e.currency.toUpperCase());
      expect(String(at(key)?.minor), `${cc} ${key}`).toBe(e.yearlyMinor);
    }
    if (e.monthlyMinor) expect(String(at('monthly')?.minor), `${cc} monthly`).toBe(e.monthlyMinor);
    else expect(at('monthly'), `${cc}: no monthly card where the server sells none`).toBeUndefined();
  };

  it('for every country in the server\'s table', () => {
    for (const [cc, e] of Object.entries(table.countries)) check(cc, e);
  });

  it('for a visitor whose country is unknown or outside the table', () => {
    check(null, table.unknown);
    check('XX', table.unknown);
  });
});
