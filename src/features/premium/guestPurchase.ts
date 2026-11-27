/**
 * Buying Premium without an account, the browser's half (#521 Phase F, F7; BUY_WITHOUT_ACCOUNT_DESIGN v4).
 *
 * The checkout returns a purchase id and a secret once. Both are kept for this tab only (sessionStorage), so
 * the page Stripe sends the buyer back to can ask how the purchase stands, and sign in once to the account the
 * purchase made (backend: routes/stripe.ts, services/premium/guestPurchaseAccess.ts). The secret never goes in
 * a URL: every call is a POST with a JSON body.
 */
import env from '@/config/env';
import { getAnonymousId } from '@/hooks/useAnonymousId';
import { storeTokensForAmplify } from '@/features/auth/utils/oauth';
import type { PlanKey } from './premiumPlans';
import { stripePlan, type StripeCheckoutResult } from './stripeCheckout';

const KEY = 'cp_guest_purchase';
/** Set before the reload that follows the one-time sign-in: the signed-in page then confirms and reports the sale. */
export const GUEST_SIGNED_IN_KEY = 'cp_guest_purchase_signed_in';

export interface GuestPurchase { purchaseId: string; secret: string }

export function readGuestPurchase(): GuestPurchase | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as Partial<GuestPurchase> | null;
    return typeof v?.purchaseId === 'string' && typeof v.secret === 'string' ? { purchaseId: v.purchaseId, secret: v.secret } : null;
  } catch {
    return null;
  }
}
function keep(p: GuestPurchase): void { try { sessionStorage.setItem(KEY, JSON.stringify(p)); } catch { /* none */ } }
export function forgetGuestPurchase(): void { try { sessionStorage.removeItem(KEY); } catch { /* none */ } }

export type GuestCheckoutResult = StripeCheckoutResult | { ok: false; reason: 'too_many_checkouts' | 'checkout_completed' | 'signed_in' };

/** Opens a Stripe checkout for a visitor who is not signed in; keeps the purchase for this tab. */
export async function createGuestCheckout(
  key: PlanKey, country: string | null | undefined, shown?: { minor: string; currency: string }, fetchImpl: typeof fetch = fetch,
): Promise<GuestCheckoutResult> {
  try {
    const response = await fetchImpl(`${env.apiBaseUrl}/api/premium/stripe/guest-checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Anonymous-Id': getAnonymousId() },
      body: JSON.stringify({
        plan: stripePlan(key),
        ...(country ? { country } : {}),
        ...(shown ? { shownMinor: shown.minor, shownCurrency: shown.currency.toLowerCase() } : {}),
      }),
    });
    const body = await response.json().catch(() => null) as { url?: unknown; purchaseId?: unknown; secret?: unknown; error?: unknown } | null;
    if (response.ok && typeof body?.url === 'string' && body.url.startsWith('https://')
      && typeof body.purchaseId === 'string' && typeof body.secret === 'string') {
      keep({ purchaseId: body.purchaseId, secret: body.secret });
      return { ok: true, url: body.url };
    }
    const error = body?.error;
    if (error === 'checkout_in_progress' || error === 'plan_unavailable' || error === 'country_unavailable' || error === 'price_changed'
      || error === 'too_many_checkouts' || error === 'checkout_completed' || error === 'signed_in') return { ok: false, reason: error };
    return { ok: false, reason: 'failed' };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}

export type GuestStatus =
  | { state: 'unknown' | 'waiting' | 'closed' | 'error' }
  | { state: 'ready'; account: 'new' | 'existing'; email: string; canSignIn: boolean };

async function post(path: string, body: unknown, fetchImpl: typeof fetch): Promise<{ status: number; body: Record<string, unknown> | null }> {
  const response = await fetchImpl(`${env.apiBaseUrl}/api/premium/guest-purchase/${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json().catch(() => null) as Record<string, unknown> | null };
}

export async function fetchGuestStatus(p: GuestPurchase, fetchImpl: typeof fetch = fetch): Promise<GuestStatus> {
  try {
    const { status, body } = await post('status', p, fetchImpl);
    if (status === 404) return { state: 'unknown' };
    if (status !== 200 || !body) return { state: 'error' };
    if (body.state === 'ready' && (body.account === 'new' || body.account === 'existing') && typeof body.email === 'string') {
      return { state: 'ready', account: body.account, email: body.email, canSignIn: body.canSignIn === true };
    }
    if (body.state === 'waiting' || body.state === 'closed') return { state: body.state };
    return { state: 'error' };
  } catch {
    return { state: 'error' };
  }
}

/** The one-time sign-in to the account the purchase made: the tokens stored as the Google callback stores them. */
export async function signInAfterPurchase(p: GuestPurchase, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  try {
    const { status, body } = await post('sign-in', p, fetchImpl);
    if (status !== 200 || typeof body?.idToken !== 'string' || typeof body.accessToken !== 'string' || typeof body.refreshToken !== 'string') return false;
    storeTokensForAmplify({ id_token: body.idToken, access_token: body.accessToken, refresh_token: body.refreshToken });
    return true;
  } catch {
    return false;
  }
}

export type SetPasswordResult = { ok: true; email: string } | { ok: false; reason: 'invalid_link' | 'invalid_password' | 'busy' | 'failed'; message?: string };

/** The email's set-password link. */
export async function setPasswordFromLink(token: string, password: string, fetchImpl: typeof fetch = fetch): Promise<SetPasswordResult> {
  try {
    const { status, body } = await post('set-password', { token, password }, fetchImpl);
    if (status === 200 && typeof body?.email === 'string') return { ok: true, email: body.email };
    if (status === 410) return { ok: false, reason: 'invalid_link' };
    if (status === 400) return { ok: false, reason: 'invalid_password', message: typeof body?.message === 'string' ? body.message : undefined };
    if (status === 409) return { ok: false, reason: 'busy' };
    return { ok: false, reason: 'failed' };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}
