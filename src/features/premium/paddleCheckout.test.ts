import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

vi.mock('@/config/env', () => ({ default: { apiBaseUrl: '' } }));
import { canAddPassYear, isFullPriceCountry, previewPlans, REDUCED_CURRENCIES, type PremiumState } from './paddleCheckout';

describe('another year for a one-year-pass holder (#467 Phase E)', () => {
  const PASS: PremiumState = {
    premium: true, kind: 'pass', status: 'pass', periodEndsAt: '2027-11-24 12:00:00.000', scheduledChange: null,
    purchasePending: false, openSubscription: false, refund: { available: null, pending: false },
  };
  it('is offered to a pass holder the server would sell to', () => {
    expect(canAddPassYear(PASS)).toBe(true);
  });
  it('is never offered where the server refuses: an open subscription (E6), or a backend that does not say', () => {
    expect(canAddPassYear({ ...PASS, openSubscription: true })).toBe(false);
    expect(canAddPassYear({ ...PASS, openSubscription: undefined })).toBe(false);
  });
  it('nor to a subscriber, to anyone without Premium, while a refund waits, or with given Premium that has no end', () => {
    expect(canAddPassYear({ ...PASS, kind: 'subscription' })).toBe(false);
    expect(canAddPassYear({ ...PASS, premium: false, kind: null })).toBe(false);
    expect(canAddPassYear({ ...PASS, refund: { available: null, pending: true } })).toBe(false);
    expect(canAddPassYear({ ...PASS, entitled: true, grant: { endsAt: null } })).toBe(false);
    expect(canAddPassYear(null)).toBe(false);
  });
});

const root = path.resolve(__dirname, '../../..');
const table = JSON.parse(readFileSync(path.join(root, 'src/config/premium-local-prices.json'), 'utf8')).prices as
  Record<string, { currency: string; countries: string[]; yearly?: unknown; reduced?: unknown }>;

describe('the page agrees with the price table (owner, 2026-11-13)', () => {
  it('knows every reduced-only currency, so its fallback never offers monthly there', () => {
    const reducedOnly = new Set<string>();
    const fullToo = new Set<string>();
    for (const group of Object.values(table)) (group.yearly ? fullToo : reducedOnly).add(group.currency);
    for (const currency of fullToo) reducedOnly.delete(currency);
    expect([...REDUCED_CURRENCIES].sort()).toEqual([...reducedOnly].sort());
  });

  it('offers monthly exactly in the countries the table gives a full price', () => {
    for (const group of Object.values(table)) {
      for (const country of group.countries) expect(isFullPriceCountry(country), country).toBe(Boolean(group.yearly));
    }
    expect(isFullPriceCountry('us')).toBe(true);
    expect(isFullPriceCountry('RU')).toBe(false);
    expect(isFullPriceCountry(undefined)).toBe(false);
  });
});

describe('the live preview decides monthly from where Paddle places the buyer (#261 review)', () => {
  const settings = { environment: 'sandbox' as const, clientToken: 't', prices: { monthly: 'pm', yearly: 'py', oneYear: 'po' } };
  const paddle = (countryCode: string | null, currency: string, yearMinor: string) => ({
    Environment: { set: () => {} }, Initialize: () => {}, Checkout: { open: () => {} },
    PricePreview: async ({ items }: { items: Array<{ priceId: string }> }) => ({
      data: {
        currencyCode: currency,
        address: countryCode ? { countryCode } : null,
        details: { lineItems: items.map(({ priceId }) => ({
          price: { id: priceId },
          formattedTotals: { total: priceId === 'pm' ? '$5' : 'x' },
          totals: { total: priceId === 'pm' ? '500' : yearMinor },
        })) },
      },
    }),
  });

  it('a country Paddle does not sell in, charged the $25 base, gets monthly like the US', async () => {
    const plans = await previewPlans(paddle('RU', 'USD', '2500'), settings);
    expect(plans.monthly).not.toBeNull();
  });

  it('a buyer Paddle cannot place, charged the $25 base, gets monthly', async () => {
    expect((await previewPlans(paddle(null, 'USD', '2500'), settings)).monthly).not.toBeNull();
  });

  it('a reduced-price country gets no monthly', async () => {
    expect((await previewPlans(paddle('NG', 'USD', '650'), settings)).monthly).toBeNull();
    expect((await previewPlans(paddle('IN', 'INR', '54900'), settings)).monthly).toBeNull();
  });

  it('a full-price country gets monthly', async () => {
    expect((await previewPlans(paddle('US', 'USD', '2500'), settings)).monthly).not.toBeNull();
  });
});
