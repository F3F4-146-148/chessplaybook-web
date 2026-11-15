/**
 * The Premium page shows, before checkout is live, the price Paddle will charge in the visitor's
 * country (#261, owner: a reviewer in the UK sees the UK price). It reads the structure the catalog
 * upload sends to Paddle (countryPrices.js), so these pin what buyers in a few countries see.
 */
import { describe, expect, it } from 'vitest';
import local from '@/config/premium-local-prices.json';
import lists from '@/config/premium-full-price-countries.json';
import paddle from '@/config/paddle-supported-countries.json';
import { catalogPrices, fullPriceCountries, priceFor, type LocalPrice, type PremiumPlan } from './countryPrices';

const L = (local as { prices: Record<string, LocalPrice> }).prices;
const S = paddle.supported;
const at = (country: string | null, plan: PremiumPlan) => priceFor(country, plan, L, lists, S);

describe('priceFor: what a buyer in a country is charged', () => {
  it('United States: the full price in dollars, all three plans', () => {
    expect(at('US', 'yearly')).toEqual({ currency: 'USD', minor: '2500', amount: 25 });
    expect(at('US', 'monthly')).toEqual({ currency: 'USD', minor: '500', amount: 5 });
    expect(at('US', 'one_year')).toEqual({ currency: 'USD', minor: '2500', amount: 25 });
  });

  it('United Kingdom and Germany: their own currencies', () => {
    expect(at('GB', 'yearly')).toMatchObject({ currency: 'GBP', amount: 18.49 });
    expect(at('GB', 'monthly')).toMatchObject({ currency: 'GBP', amount: 3.49 });
    expect(at('DE', 'yearly')).toMatchObject({ currency: 'EUR', amount: 22.49 });
  });

  it('Japan: a zero-decimal currency reads in yen, not hundredths', () => {
    expect(at('JP', 'yearly')).toEqual({ currency: 'JPY', minor: '3990', amount: 3990 });
  });

  it('India: rupees, the year and the one-year pass, no monthly', () => {
    expect(at('IN', 'yearly')).toMatchObject({ currency: 'INR', amount: 549 });
    expect(at('IN', 'one_year')).toMatchObject({ currency: 'INR', amount: 549 });
    expect(at('IN', 'monthly')).toBeNull();
  });

  it('a reduced-price country with no local currency pays the reduced price in dollars, no monthly', () => {
    const country = 'NG';
    expect(fullPriceCountries(lists)).not.toContain(country);
    expect(at(country, 'yearly')).toEqual({ currency: 'USD', minor: '650', amount: 6.5 });
    expect(at(country, 'one_year')).toEqual({ currency: 'USD', minor: '650', amount: 6.5 });
    expect(at(country, 'monthly')).toBeNull();
  });

  it('an unknown country pays the full price, like the US, with all three plans (owner, 2026-11-14)', () => {
    for (const unknown of ['', null, 'ZZ', 'RU']) { // missing, nonsense, a country Paddle does not sell in
      expect(at(unknown, 'yearly'), String(unknown)).toEqual({ currency: 'USD', minor: '2500', amount: 25 });
      expect(at(unknown, 'one_year'), String(unknown)).toEqual({ currency: 'USD', minor: '2500', amount: 25 });
      expect(at(unknown, 'monthly'), String(unknown)).toEqual({ currency: 'USD', minor: '500', amount: 5 });
    }
  });
});

describe('the uploaded structure', () => {
  it('names each country at most once per price, so a lookup has one answer', () => {
    for (const [plan, price] of Object.entries(catalogPrices(L, lists, S))) {
      const seen = new Set<string>();
      for (const o of price.unit_price_overrides) {
        for (const c of o.country_codes) {
          expect(seen.has(c), `${c} twice in ${plan}`).toBe(false);
          seen.add(c);
        }
      }
    }
  });

  it('offers monthly in every full-price country and nowhere else', () => {
    const full = new Set(fullPriceCountries(lists));
    for (const c of full) expect(at(c, 'monthly'), c).not.toBeNull();
    for (const c of ['IN', 'BR', 'NG', 'TR']) if (!full.has(c)) expect(at(c, 'monthly'), c).toBeNull();
  });
});

describe('the full price is the base (owner, 2026-11-14)', () => {
  const catalog = catalogPrices(L, lists, S);
  const full = new Set(fullPriceCountries(lists));

  it('the yearly and one-year base is $25, so a buyer Paddle cannot place pays the full price', () => {
    expect(catalog.yearly.unit_price).toEqual({ amount: '2500', currency_code: 'USD' });
    expect(catalog.one_year.unit_price).toEqual({ amount: '2500', currency_code: 'USD' });
  });

  it('every reduced-price country Paddle sells in is named in an override, so none falls to the full base', () => {
    for (const plan of ['yearly', 'one_year'] as const) {
      const named = new Set(catalog[plan].unit_price_overrides.flatMap((o) => o.country_codes));
      for (const c of S) {
        if (!full.has(c)) expect(named.has(c), `${c} missing from the ${plan} overrides`).toBe(true);
      }
    }
  });

  it('no reduced-price country is charged $25, and every full-price country is', () => {
    for (const c of S) {
      const y = at(c, 'yearly')!;
      const usd = y.currency === 'USD';
      if (full.has(c)) { if (usd) expect(y.minor, c).toBe('2500'); }
      else if (usd) expect(y.minor, c).toBe('650');
    }
  });

  it('every override names only countries Paddle sells in', () => {
    const sells = new Set(S);
    for (const price of Object.values(catalog)) {
      for (const o of price.unit_price_overrides) for (const c of o.country_codes) expect(sells.has(c), c).toBe(true);
    }
  });

  it("Paddle's list is complete: 229 countries, as published (re-read it before changing this number)", () => {
    expect(S.length).toBe(229);
    expect(new Set(S).size).toBe(229);
  });

  it('every local-currency country is charged the amount in the price table, at its own tier', () => {
    for (const [group, p] of Object.entries(L)) {
      const tier = (p.yearly ?? p.reduced) as { minor: string };
      for (const c of p.countries) {
        expect(at(c, 'yearly'), `${c} (${group})`).toMatchObject({ currency: p.currency, minor: tier.minor });
        expect(at(c, 'one_year'), `${c} (${group})`).toMatchObject({ currency: p.currency, minor: tier.minor });
        const monthly = p.monthly as { minor: string } | undefined;
        if (monthly) expect(at(c, 'monthly'), `${c} (${group})`).toMatchObject({ currency: p.currency, minor: monthly.minor });
      }
    }
  });

  it('every country Paddle sells in is named in the yearly overrides, so the base serves only buyers it cannot place', () => {
    const named = new Set(catalog.yearly.unit_price_overrides.flatMap((o) => o.country_codes));
    for (const c of S) expect(named.has(c), c).toBe(true);
  });

  it('every full-price country is named in the monthly overrides too', () => {
    const named = new Set(catalog.monthly.unit_price_overrides.flatMap((o) => o.country_codes));
    for (const c of full) expect(named.has(c), c).toBe(true);
  });

  it('refuses to build from a truncated country list', () => {
    expect(() => catalogPrices(L, lists, S.slice(0, 50))).toThrow(/incomplete/);
  });
});
