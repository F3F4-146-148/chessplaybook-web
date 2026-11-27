/**
 * The GA4 `purchase` event (#559): sent once the server confirms Premium after a checkout, so Google Ads can
 * import it and report sales by country, keyword and search term. Our own server (premium_payments, read per
 * campaign in the admin Funnel view) stays the record: this event misses a buyer who closes the tab before the
 * confirmation and a browser that blocks analytics.
 *
 * The amount is the latest payment's, from the refund offer the server sends with the state (`refund.available`:
 * kind, total and currency of the payment that can still be refunded, which right after a purchase is that
 * purchase). The transaction id is built from that payment, so GA4 drops a repeat, and the browser also
 * remembers what it sent for this tab.
 */
import { logGA4Event } from '@/services/analytics';
import type { PremiumState } from './paddleCheckout';
import { STRIPE_ZERO_DECIMAL } from './stripeLocalPrices';

const SENT_KEY = 'cp_purchase_reported';

/** "2249" minor units of EUR is 22.49; a zero-decimal currency's minor unit is the unit. */
export function minorToAmount(totalMinor: string | null | undefined, currency: string | null | undefined): number | undefined {
  if (!totalMinor || !currency || !/^\d+$/.test(totalMinor)) return undefined;
  const upper = currency.toUpperCase();
  return Number(totalMinor) / (STRIPE_ZERO_DECIMAL.has(upper) ? 1 : 100);
}

/** The event for a confirmed purchase, or null when the state does not show one. */
export function purchaseEventFor(state: PremiumState | null | undefined, provider: 'stripe' | 'paddle') {
  if (!state?.premium || !state.kind) return null;
  const paid = state.refund?.available ?? null;
  const kind = paid?.kind ?? state.kind;
  /* Without the payment, the period's end still names this purchase (a renewal moves it, a repeat does not). */
  const anchor = paid?.until ?? state.periodEndsAt;
  if (!anchor) return null;
  const value = minorToAmount(paid?.totalMinor, paid?.currency);
  const currency = value !== undefined && paid?.currency ? paid.currency.toUpperCase() : undefined;
  return {
    name: 'purchase' as const,
    params: {
      transaction_id: `${provider}-${kind}-${anchor}`,
      ...(value !== undefined && currency ? { value, currency } : {}),
      kind,
      provider,
    },
  };
}

/** Sends the event once per purchase in this tab. Returns whether it was sent. */
export function reportPurchase(state: PremiumState | null | undefined, provider: 'stripe' | 'paddle'): boolean {
  const event = purchaseEventFor(state, provider);
  if (!event) return false;
  try {
    if (sessionStorage.getItem(SENT_KEY) === event.params.transaction_id) return false;
    sessionStorage.setItem(SENT_KEY, event.params.transaction_id);
  } catch { /* storage unavailable: GA4 drops a repeat by transaction_id anyway */ }
  logGA4Event(event);
  return true;
}
