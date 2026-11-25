/**
 * Our own price in the buyer's currency for Stripe (owner, 2026-11-23; scripts/stripe/local-prices.mjs).
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import paddleLocal from '@/config/premium-local-prices.json';
import stripeLocal from '@/config/stripe-local-prices.json';
import lists from '@/config/premium-full-price-countries.json';
import { supported } from '@/config/paddle-supported-countries.json';
import mp from '../../../scripts/stripe/inputs/managed-payments-currencies.json';
import { goodLookingDown, stripeLocalTable, wholeMonthlyDown } from '../../../scripts/stripe/local-prices.mjs';
import { catalogPrices, type LocalPrice } from './countryPrices';
import { mergedLocalPrices, STRIPE_ZERO_DECIMAL } from './stripeLocalPrices';
import { plansForCountry } from './premiumPlans';

type Table = Record<string, LocalPrice>;
/* Paddle's catalog digest on 2026-11-23, before and after the Stripe layer (it never changed). */
const PADDLE_CATALOG_DIGEST = 'ae881c2873c7289e6838456da4397ae9faa434fcdd763bf0af398f83c7eff82c';
const P = (paddleLocal as unknown as { prices: Table }).prices;
const S = (stripeLocal as unknown as { prices: Table }).prices;

describe('the Stripe local prices', () => {
  it('the committed table is what the generator computes (rerun local-prices.mjs --write after a change)', () => {
    expect(stripeLocal).toEqual(stripeLocalTable());
  });

  it('every currency in it is one Managed Payments accepted (measured in test mode)', () => {
    const accepted = new Set(mp.accepted);
    for (const g of Object.values(S)) expect(accepted.has(g.currency), g.currency).toBe(true);
  });

  it('after the merge, every country is priced exactly once, at one level', () => {
    const merged = mergedLocalPrices(P, S);
    const seen = new Map<string, string>();
    for (const [name, g] of Object.entries(merged)) {
      for (const c of g.countries) {
        expect(seen.has(c), `${c} in ${seen.get(c)} and ${name}`).toBe(false);
        seen.set(c, name);
      }
    }
    /* The merged table passes the same consistency checks the Paddle upload applies to its own. */
    expect(() => catalogPrices(merged, lists, supported)).not.toThrow();
  });

  it('Paddle\'s own catalog is exactly as uploaded: the layer never reaches it (Fable review)', () => {
    /* Paddle's catalog as built from its own table alone, pinned by its digest: any change to it, from this
       layer or otherwise, fails here and must be made on purpose (scripts/paddle/premium-catalog.mjs). */
    const digest = createHash('sha256').update(JSON.stringify(catalogPrices(P, lists, supported))).digest('hex');
    expect(digest).toBe(PADDLE_CATALOG_DIGEST);
  });

  it('the page shows the local price, whole units where the currency has no decimals', () => {
    const ro = plansForCountry('RO');
    expect(ro.find((c) => c.key === 'yearly')?.currency).toBe('RON');
    expect(ro.find((c) => c.key === 'yearly')?.minor).toBe(11900);
    const cm = plansForCountry('CM').find((c) => c.key === 'yearly')!;
    expect(cm.currency).toBe('XAF');
    expect(STRIPE_ZERO_DECIMAL.has('XAF')).toBe(true);
    expect(cm.price.replace(/\D/g, '')).toBe('3790');
  });

  it('rounds down to the approved style', () => {
    expect(goodLookingDown(22.78, false)).toBe(22.49);
    expect(goodLookingDown(24.35, false)).toBe(23.99);
    expect(goodLookingDown(551.2, false)).toBe(549);
    expect(goodLookingDown(4012, true)).toBe(3990);
    expect(goodLookingDown(167000, false)).toBe(159000);
    expect(wholeMonthlyDown(52.6)).toBe(49);
    expect(wholeMonthlyDown(24.35)).toBe(24);
  });
});
