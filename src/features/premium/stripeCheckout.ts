/**
 * Stripe checkout from the Premium page (STRIPE_MANAGED_PAYMENTS_IMPLEMENTATION_PLAN C1).
 *
 * Stripe's checkout is a page on Stripe (Managed Payments has no overlay): our server opens a Checkout
 * Session for the signed-in account and the browser goes to its URL. No Stripe script runs on our
 * pages, so the CSP is unchanged. The buyer comes back to /premium?checkout=success, and the page
 * waits for the webhook as it does after Paddle's checkout.
 */
import env from '@/config/env';
import unavailableList from '@/config/stripe-unavailable-countries.json';
import { getAuthHeader } from '@/features/auth/utils/getAuthToken';
import type { PlanKey } from './premiumPlans';

/** What the server refused with (backend/src/routes/stripe.ts), or `failed` for anything else. */
export type StripeCheckoutResult =
  | { ok: true; url: string }
  | { ok: false; reason: 'already_premium' | 'checkout_in_progress' | 'plan_unavailable' | 'country_unavailable' | 'price_changed' | 'failed' };

const UNAVAILABLE = new Set(unavailableList.countries);

/** True where Stripe Managed Payments refuses buyers: the page offers no Buy there (the server refuses too). */
export function stripeUnavailableIn(country: string | null | undefined): boolean {
  return Boolean(country) && UNAVAILABLE.has(country!.toUpperCase());
}

/** The server's plan names: the page's `one_year` is `oneYear` there. */
export function stripePlan(key: PlanKey): 'monthly' | 'yearly' | 'oneYear' {
  return key === 'one_year' ? 'oneYear' : key;
}

export async function createStripeCheckout(
  key: PlanKey,
  country: string | null | undefined,
  fetchImpl: typeof fetch = fetch,
  /** The price the page showed: the server refuses when it would charge another (Fable review). */
  shown?: { minor: string; currency: string },
): Promise<StripeCheckoutResult> {
  try {
    const response = await fetchImpl(`${env.apiBaseUrl}/api/premium/stripe/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
      /* The country decides the price, as it decided the price the page shows (useVisitorCountry). */
      body: JSON.stringify({
        plan: stripePlan(key),
        ...(country ? { country } : {}),
        ...(shown ? { shownMinor: shown.minor, shownCurrency: shown.currency.toLowerCase() } : {}),
      }),
    });
    const body = await response.json().catch(() => null) as { url?: unknown; error?: unknown } | null;
    if (response.ok && typeof body?.url === 'string' && body.url.startsWith('https://')) return { ok: true, url: body.url };
    const error = body?.error;
    if (error === 'already_premium' || error === 'checkout_in_progress' || error === 'plan_unavailable'
      || error === 'country_unavailable' || error === 'price_changed') return { ok: false, reason: error };
    return { ok: false, reason: 'failed' };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}

/**
 * Shown in place of Buy while the account has a Stripe subscription that gives no Premium yet is not over
 * (GET /api/premium `purchasePending`): a first payment still pending, a renewal past due, or a refunded
 * one about to be cancelled. True in each case (Fable, round two); /membership has Manage for it (#467: the
 * owner-approved wording, its last words a link where it renders, PendingLine.tsx).
 */
export const STRIPE_PENDING_LINE = 'Your account already has a subscription. Manage it on your Membership page.';

/**
 * A subscription whose renewal failed (status past_due): Premium continues while the provider retries, and
 * the next renewal date would be untrue (staging, 2026-11-23: the card said "renews on" during the retries).
 */
export const PAST_DUE_LINE = 'Your last payment failed. Update your card to keep Premium.';

/** Shown in place of Buy where Stripe cannot sell. */
export const STRIPE_UNAVAILABLE_LINE = 'Premium cannot be bought from your country.';

/** One plain line per refusal (ui-copy). */
export const STRIPE_REFUSAL: Record<Exclude<StripeCheckoutResult, { ok: true }>['reason'], string> = {
  already_premium: 'Your account already has Premium.',
  checkout_in_progress: 'A checkout is already opening. Try again in a moment.',
  plan_unavailable: 'This plan is not offered in your country.',
  country_unavailable: STRIPE_UNAVAILABLE_LINE,
  price_changed: 'The price has changed. Reload the page to see it.',
  failed: 'Checkout could not be opened. Please try again later.',
};
