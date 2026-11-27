/**
 * Buying without an account, the browser's half (#521 Phase F, F7).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createGuestCheckout, fetchGuestStatus, forgetGuestPurchase, readGuestPurchase, setPasswordFromLink, signInAfterPurchase } from './guestPurchase';
import { captureSetPasswordToken, clearSetPasswordToken, readSetPasswordToken } from './setPasswordToken';

const answer = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
const SECRET = 'S'.repeat(43);
const ID = 'b1f0c2d4-1111-4222-8333-444455556666';

afterEach(() => { forgetGuestPurchase(); clearSetPasswordToken(); localStorage.clear(); });

describe('createGuestCheckout', () => {
  it('sends the guest id, keeps the purchase for this tab, and returns Stripe\'s address', async () => {
    let sent: RequestInit | undefined;
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      sent = init;
      return new Response(JSON.stringify({ url: 'https://checkout.stripe.com/c/pay/x', purchaseId: ID, secret: SECRET }), { status: 200 });
    }) as unknown as typeof fetch;
    const result = await createGuestCheckout('yearly', 'IN', { minor: '54900', currency: 'INR' }, fetchImpl);
    expect(result).toEqual({ ok: true, url: 'https://checkout.stripe.com/c/pay/x' });
    expect(readGuestPurchase()).toEqual({ purchaseId: ID, secret: SECRET });
    expect(new Headers(sent?.headers).get('X-Anonymous-Id')).toMatch(/^[0-9a-f-]{36}$/);
    expect(new Headers(sent?.headers).get('Authorization')).toBeNull();
    expect(JSON.parse(String(sent?.body))).toEqual({ plan: 'yearly', country: 'IN', shownMinor: '54900', shownCurrency: 'inr' });
  });

  it('names the server\'s refusals, and keeps nothing', async () => {
    expect(await createGuestCheckout('yearly', 'IN', undefined, answer(429, { error: 'too_many_checkouts' }))).toEqual({ ok: false, reason: 'too_many_checkouts' });
    expect(await createGuestCheckout('yearly', 'IN', undefined, answer(409, { error: 'checkout_completed' }))).toEqual({ ok: false, reason: 'checkout_completed' });
    expect(await createGuestCheckout('yearly', 'IN', undefined, answer(500, {}))).toEqual({ ok: false, reason: 'failed' });
    /* A non-https address is never followed. */
    expect(await createGuestCheckout('yearly', 'IN', undefined, answer(200, { url: 'http://x', purchaseId: ID, secret: SECRET }))).toEqual({ ok: false, reason: 'failed' });
    expect(readGuestPurchase()).toBeNull();
  });
});

describe('fetchGuestStatus and the one-time sign-in', () => {
  const p = { purchaseId: ID, secret: SECRET };
  it('reads the states', async () => {
    expect(await fetchGuestStatus(p, answer(200, { state: 'waiting' }))).toEqual({ state: 'waiting' });
    expect(await fetchGuestStatus(p, answer(404, { error: 'unknown_purchase' }))).toEqual({ state: 'unknown' });
    expect(await fetchGuestStatus(p, answer(200, { state: 'ready', account: 'new', email: 'a@b.c', canSignIn: true })))
      .toEqual({ state: 'ready', account: 'new', email: 'a@b.c', canSignIn: true });
    expect(await fetchGuestStatus(p, answer(502, {}))).toEqual({ state: 'error' });
  });

  it('stores the tokens as Amplify reads them', async () => {
    const payload = btoa(JSON.stringify({ sub: 'new-sub-1' }));
    const ok = await signInAfterPurchase(p, answer(200, { idToken: `h.${payload}.s`, accessToken: 'a', refreshToken: 'r', expiresIn: 3600 }));
    expect(ok).toBe(true);
    const keys = Object.keys(localStorage);
    expect(keys.some((k) => k.endsWith('.LastAuthUser') && localStorage.getItem(k) === 'new-sub-1')).toBe(true);
    expect(keys.some((k) => k.endsWith('new-sub-1.refreshToken') && localStorage.getItem(k) === 'r')).toBe(true);
    expect(await signInAfterPurchase(p, answer(409, { error: 'not_allowed' }))).toBe(false);
  });
});

describe('the set-password link', () => {
  it('takes the token from the address bar on /set-password only, and removes it', () => {
    window.history.replaceState(null, '', `/set-password#token=${SECRET}`);
    expect(captureSetPasswordToken()).toBe(true);
    expect(window.location.hash).toBe('');
    expect(readSetPasswordToken()).toBe(SECRET);
    clearSetPasswordToken();
    window.history.replaceState(null, '', `/premium#token=${SECRET}`);
    expect(captureSetPasswordToken()).toBe(false);
    expect(readSetPasswordToken()).toBeNull();
  });

  it('reads the server\'s answers', async () => {
    expect(await setPasswordFromLink(SECRET, 'x', answer(200, { email: 'a@b.c' }))).toEqual({ ok: true, email: 'a@b.c' });
    expect(await setPasswordFromLink(SECRET, 'x', answer(410, { error: 'invalid_link' }))).toEqual({ ok: false, reason: 'invalid_link' });
    expect(await setPasswordFromLink(SECRET, 'x', answer(400, { error: 'invalid_password', message: 'Too short' })))
      .toEqual({ ok: false, reason: 'invalid_password', message: 'Too short' });
  });
});
