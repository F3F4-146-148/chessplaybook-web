/**
 * Premium's prices, one source for two readers (#261):
 *   scripts/paddle/premium-catalog.mjs uploads catalogPrices() to Paddle;
 *   the Premium page shows priceFor() before checkout is live, for the visitor's country.
 * Both read the same override list, so the page cannot show a price Paddle would not charge.
 *
 * Plain JavaScript (with countryPrices.d.ts) so the Node script imports it without a build step.
 * Inputs: src/config/premium-local-prices.json (`prices`), src/config/premium-full-price-countries.json
 * and src/config/paddle-supported-countries.json (`supported`).
 *
 * THE BASE PRICE IS THE FULL PRICE (owner, 2026-11-14). Paddle charges the base price to a buyer whose
 * country has no override, and to one it cannot place; that buyer must pay the full price, never the
 * reduced one. So the reduced price is an override naming every reduced-price country Paddle sells
 * in, and a visitor whose country is unknown is shown the full price and all three plans, like the US.
 */

/** The full-price country codes, from the lists file (keys starting with "_" are notes). */
export function fullPriceCountries(lists) {
  return [...new Set(Object.entries(lists).filter(([k]) => !k.startsWith('_')).flatMap(([, v]) => v))].sort();
}

/**
 * The unit price and per-country overrides of each Paddle price, exactly as uploaded.
 * Throws when the local table disagrees with the full-price list.
 */
export function catalogPrices(local, lists, supported) {
  const full = fullPriceCountries(lists);
  const sells = new Set(supported);
  if (sells.size < 200) throw new Error('paddle-supported-countries.json looks incomplete: refusing to build overrides from it');
  for (const country of full) {
    if (!sells.has(country)) throw new Error(`${country} is full-price but Paddle does not sell there: check paddle-supported-countries.json`);
  }
  for (const [group, p] of Object.entries(local)) {
    for (const country of p.countries) {
      if (Boolean(p.yearly) !== full.includes(country)) {
        throw new Error(`${country} (${group}) disagrees with the full-price list: recompute premium-local-prices.json first`);
      }
      if (!sells.has(country)) throw new Error(`${country} (${group}) is priced but Paddle does not sell there`);
    }
  }
  const localised = new Set(Object.values(local).flatMap((p) => p.countries));
  const fullSet = new Set(full);
  /* Every other country Paddle sells in pays the reduced price in dollars. */
  const reducedInUsd = [...sells].filter((c) => !fullSet.has(c) && !localised.has(c)).sort();
  const overrides = (tier) => Object.values(local).filter((p) => p[tier])
    .map((p) => ({ country_codes: p.countries, unit_price: { amount: p[tier].minor, currency_code: p.currency } }));
  /* The full-price countries without a local currency are named too, so the base serves only buyers
     Paddle cannot place, and an account's automatic currency conversion never applies to them. */
  const fullInUsd = full.filter((c) => !localised.has(c));
  const yearlyOverrides = [
    ...overrides('yearly'),
    { country_codes: fullInUsd, unit_price: { amount: '2500', currency_code: 'USD' } },
    ...overrides('reduced'),
    { country_codes: reducedInUsd, unit_price: { amount: '650', currency_code: 'USD' } },
  ];
  return {
    /* The full-price countries named here too (re-review, 2026-11-14), as for the year. */
    monthly: {
      unit_price: { amount: '500', currency_code: 'USD' },
      unit_price_overrides: [...overrides('monthly'), { country_codes: fullInUsd, unit_price: { amount: '500', currency_code: 'USD' } }],
    },
    /* The base is the full price: a country with no override, or one Paddle cannot place, pays it. */
    yearly: { unit_price: { amount: '2500', currency_code: 'USD' }, unit_price_overrides: yearlyOverrides },
    one_year: { unit_price: { amount: '2500', currency_code: 'USD' }, unit_price_overrides: yearlyOverrides },
  };
}

const ZERO_DECIMAL = new Set(['JPY', 'KRW', 'CLP', 'VND']);

/**
 * What a buyer in `country` (ISO 3166 alpha-2) pays for `plan`, from the uploaded structure:
 * { currency, minor, amount } or null when the site does not offer the plan there
 * (monthly is offered only in the full-price countries; an unknown country is offered everything, at the base).
 */
export function priceFor(country, plan, local, lists, supported) {
  const cc = String(country || '').toUpperCase();
  /* Unknown: no country, or one Paddle does not sell in. Priced like the US: the base, all plans (owner). */
  const known = supported.includes(cc);
  if (plan === 'monthly' && known && !fullPriceCountries(lists).includes(cc)) return null;
  const price = catalogPrices(local, lists, supported)[plan];
  if (!price) return null;
  const hit = price.unit_price_overrides.find((o) => o.country_codes.includes(cc));
  const { amount: minor, currency_code: currency } = hit ? hit.unit_price : price.unit_price;
  return { currency, minor, amount: Number(minor) / (ZERO_DECIMAL.has(currency) ? 1 : 100) };
}
