import { describe, expect, it } from 'vitest';
import local from '@/config/premium-local-prices.json';
import { defaultPlan, plansForCountry, plansFromPaddle, savingPercent, type ShownPlan } from './premiumPlans';

const keys = (cards: ShownPlan[]) => cards.map((c) => c.key);

describe('the Premium page cards, before checkout is live', () => {
  it('a full-price country gets the year first, then the month and the pass', () => {
    const cards = plansForCountry('GB');
    expect(keys(cards)).toEqual(['yearly', 'monthly', 'one_year']);
    expect(defaultPlan(cards)).toBe('yearly');
    expect(cards.every((c) => c.currency === 'GBP' && c.priceId === null)).toBe(true);
  });

  it('a reduced-price country gets two cards at one price, the pass chosen first (owner)', () => {
    const cards = plansForCountry('IN');
    expect(keys(cards)).toEqual(['one_year', 'yearly']);
    expect(cards.map((c) => c.title)).toEqual(['Pay once', 'Renews every year']);
    expect(defaultPlan(cards)).toBe('one_year');
    expect(new Set(cards.map((c) => c.minor)).size).toBe(1);
    expect(savingPercent(cards)).toBeNull();
  });

  it('an unknown country gets the full price and all three plans, like the US, as Paddle charges the base (owner, 2026-11-14)', () => {
    const cards = plansForCountry(null);
    expect(keys(cards)).toEqual(['yearly', 'monthly', 'one_year']);
    expect(cards.find((c) => c.key === 'yearly')).toMatchObject({ currency: 'USD', minor: 2500 });
    expect(cards.find((c) => c.key === 'monthly')).toMatchObject({ currency: 'USD', minor: 500 });
  });
});

describe('the saving against paying monthly', () => {
  it('is computed per currency and rounded down, never a fixed number', () => {
    const table = (local as { prices: Record<string, { currency: string; countries: string[]; yearly?: { minor: string }; monthly?: { minor: string } }> }).prices;
    for (const p of Object.values(table)) {
      if (!p.yearly || !p.monthly) continue;
      const y = Number(p.yearly.minor), m = Number(p.monthly.minor);
      const exact = ((12 * m - y) / (12 * m)) * 100;
      const shown = savingPercent(plansForCountry(p.countries[0]));
      expect(shown, p.currency).toBe(Math.floor(exact));
      expect(shown!, p.currency).toBeLessThanOrEqual(exact);
    }
    expect(savingPercent(plansForCountry('US'))).toBe(58);
    expect(savingPercent(plansForCountry('DK'))).toBe(59);
  });

  it('is not shown when the two prices are in different currencies', () => {
    const cards = plansFromPaddle({
      yearly: { priceId: 'y', total: '€22.49', cents: 2249, currency: 'EUR' },
      monthly: { priceId: 'm', total: '$5.00', cents: 500, currency: 'USD' },
      oneYear: { priceId: 'o', total: '€22.49', cents: 2249, currency: 'EUR' },
    });
    expect(savingPercent(cards)).toBeNull();
  });
});

describe('the Premium page cards, from Paddle', () => {
  it('keeps Paddle\'s own formatted totals and price ids', () => {
    const cards = plansFromPaddle({
      yearly: { priceId: 'pri_y', total: '₹549.00', cents: 54900, currency: 'INR' },
      monthly: null,
      oneYear: { priceId: 'pri_o', total: '₹549.00', cents: 54900, currency: 'INR' },
    });
    expect(cards.map((c) => [c.key, c.price, c.priceId])).toEqual([['one_year', '₹549.00', 'pri_o'], ['yearly', '₹549.00', 'pri_y']]);
  });
});
