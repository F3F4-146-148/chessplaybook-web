/**
 * Stripe's local prices merged over Paddle's table (owner, 2026-11-23; scripts/stripe/local-prices.mjs).
 *
 * The page, the server's table (scripts/stripe/country-prices.mjs) and the Stripe catalog
 * (scripts/stripe/catalog.mjs) read the merged table, so all three agree. Paddle's upload keeps reading
 * premium-local-prices.json alone: it cannot hold most of these currencies, and it is the rollback.
 *
 * Plain JavaScript (with stripeLocalPrices.d.ts) so the Node scripts import it without a build step.
 */

/**
 * Currencies Stripe writes with no minor unit (docs.stripe.com/currencies). UGX, ISK, HUF and TWD are
 * written with two decimals there (measured: UGX), so they are not in this list.
 */
export const STRIPE_ZERO_DECIMAL = new Set([
  'BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA', 'PYG', 'RWF', 'VND', 'VUV', 'XAF', 'XOF', 'XPF',
]);

/**
 * Paddle's groups, minus every country the Stripe layer prices, plus the Stripe layer's groups (prefixed
 * so their names cannot collide). A group left with no country is dropped.
 */
export function mergedLocalPrices(paddleLocal, stripeLocal) {
  const moved = new Set(Object.values(stripeLocal).flatMap((g) => g.countries));
  const out = {};
  for (const [name, group] of Object.entries(paddleLocal)) {
    const countries = group.countries.filter((c) => !moved.has(c));
    if (countries.length) out[name] = { ...group, countries };
  }
  for (const [name, group] of Object.entries(stripeLocal)) out[`stripe:${name}`] = group;
  return out;
}
