import type { LocalPrice } from './countryPrices';

export const STRIPE_ZERO_DECIMAL: Set<string>;
export function mergedLocalPrices(paddleLocal: Record<string, LocalPrice>, stripeLocal: Record<string, LocalPrice>): Record<string, LocalPrice>;
