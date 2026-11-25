/**
 * Premium as one hook (2026-11-14): who sells, the visitor's own prices, the account's Premium state,
 * and buying. Shared by the account page's card and the Premium page, so the two cannot load or sell
 * differently.
 *
 * `provider` is null where nobody sells (production until launch): nothing can be bought. With Paddle,
 * prices come from Paddle's preview, localised by the visitor's address. With Stripe (STRIPE plan C1)
 * the page shows the table the server charges from (premiumPlans.plansForCountry), and buying sends
 * the browser to Stripe's checkout page. Buying needs an account (owner).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/features/auth/AuthContext';
import { ACCOUNT_PREMIUM_RETRIES_MS, useAccountPremium } from './AccountPremium';
import {
  canAddPassYear, fetchCheckoutSettings, grantBlocksPurchase, loadPaddle, onCheckoutCompleted, openCheckout, previewPlans,
  type CheckoutSettings, type PaymentsProvider, type Plans, type PremiumState,
} from './paddleCheckout';
import { createStripeCheckout, STRIPE_PENDING_LINE, STRIPE_REFUSAL } from './stripeCheckout';
import type { PlanKey } from './premiumPlans';

/* The read itself lives in premiumFetch.ts (#467 A1a), so the always-loaded provider can reach it lazily. */
export { fetchPremium } from './premiumFetch';

/** Retries of a failed entitlement lookup, then the state stays unknown (#261 review). Done by the provider now. */
export const ENTITLEMENT_RETRIES_MS = ACCOUNT_PREMIUM_RETRIES_MS;

/** The pass end before an extension was bought (sessionStorage), so the wait knows when the new year arrived. */
const EXTEND_KEY = 'cp_premium_extend_from';

/** Stripe sends the buyer back here after paying (backend/src/routes/stripe.ts, success_url). */
export const STRIPE_RETURN_PARAM = 'checkout';

/** How long Buy waits for the browser to leave for Stripe before it works again. */
export const LEAVE_TIMEOUT_MS = 20_000;

/** What buy() needs: the plan, Paddle's price id when Paddle sells, and the price shown (checked by the server). */
export interface BuyChoice { key: PlanKey; priceId: string | null; minor?: number; currency?: string }

export interface PremiumOffer {
  /** False until the API has said who sells. */
  checked: boolean;
  /** Who sells; null when nobody does. */
  provider: PaymentsProvider | null;
  /** Paddle's settings, only when Paddle sells. */
  settings: CheckoutSettings | null;
  /** Paddle's price preview, only when Paddle sells. */
  plans: Plans | null;
  /** The signed-in account's Premium; null for a guest or before it loads. */
  state: PremiumState | null;
  /**
   * True once it is known whether this visitor has Premium: a guest, nobody selling, or the account's
   * answer arrived. Until then nothing may offer to buy (#261 review: a Premium holder briefly saw Buy
   * while their account loaded).
   */
  stateKnown: boolean;
  /** True once a checkout completed on this page (or the buyer came back from Stripe's): nothing more may be bought. */
  purchased: boolean;
  /** True while waiting for another year a one-year-pass holder bought (the pass's end to move). */
  extendWait: boolean;
  /** True while a Stripe checkout is being opened: the Buy button and the plan choice wait (Fable, Codex). */
  busy: boolean;
  setState: (state: PremiumState | null) => void;
  message: string | null;
  setMessage: (message: string | null) => void;
  /** `country` decides Stripe's price, as it decided the price shown (useVisitorCountry). */
  buy: (choice: BuyChoice, country?: string | null) => Promise<void>;
}

/**
 * `prices: false` (the account page) skips loading Paddle.js and previewing prices, and does not handle
 * the return from Stripe: the page only manages Premium, the offer is on /premium. It reads the
 * account's state whatever the provider, so a holder can always manage and refund (Fable review).
 */
export function usePremiumOffer({ prices = true }: { prices?: boolean } = {}): PremiumOffer {
  const { user, isLoading: authLoading } = useAuth();
  const [checked, setChecked] = useState(false);
  const [provider, setProvider] = useState<PaymentsProvider | null>(null);
  const [settings, setSettings] = useState<CheckoutSettings | null>(null);
  const [plans, setPlans] = useState<Plans | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /* Cleared on unmount: nothing answers into, polls for or navigates from a page that has closed. */
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  /*
    THE ACCOUNT'S STATE IS SHARED (#467 plan A1b): it lives in AccountPremiumProvider, read once for the whole
    site, so the account menu, /membership, /profile and this page see the same answer, and a purchase seen here
    is seen everywhere. The provider keeps the rules that lived here: reads ordered (a slow first read cannot
    overwrite the poll's "you have Premium", Codex review), only for the account still signed in, retried, and
    known ONLY from a valid answer (#261 review).
  */
  const account = useAccountPremium();
  const userId = user?.userId ?? null;
  const currentUser = useRef<string | null>(userId);
  currentUser.current = userId;
  const state = account.state;
  const readPremium = account.refresh;
  const setState = account.setState;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const found = await fetchCheckoutSettings();
      if (cancelled) return;
      setProvider(found.provider);
      setSettings(found.settings);
      setChecked(true);
      if (!found.settings || !prices) return;
      try {
        const paddle = await loadPaddle(found.settings);
        const preview = await previewPlans(paddle, found.settings);
        if (!cancelled) setPlans(preview);
      } catch {
        if (!cancelled) setMessage('Prices could not be loaded. Please try again later.');
      }
    })();
    return () => { cancelled = true; };
  }, [prices]);

  /*
    The account's state, once there is an account (a guest has none): on the Premium page only when
    someone sells, on the account page always. Whether THIS consumer asks for it no longer clears it: the
    menu may have read it while nobody sells (A1b). A failed lookup stays unknown, so nothing can be bought,
    and the page says why.
  */
  const wantsState = Boolean(user) && (Boolean(provider) || !prices);
  const { load, failed } = account;
  useEffect(() => {
    if (wantsState) load();
  }, [wantsState, userId, load]);
  useEffect(() => {
    if (prices && wantsState && failed) setMessage('Your account could not be checked, so buying is paused. Please reload the page.');
  }, [prices, wantsState, failed]);
  const stateKnown = checked && !authLoading && (!provider || !user || (account.known && account.userId === user.userId));

  /* Set once a checkout completed: nothing more may be bought on this page (#261 review). */
  const [purchased, setPurchased] = useState(false);
  /* True while waiting for another year a pass holder bought (see awaitPremium). */
  const [extendWait, setExtendWait] = useState(false);

  /*
    After a purchase the provider tells our server by webhook; wait for it, up to a minute. Paddle's
    checkout.completed proves a payment, so its lines say so. A return from Stripe proves nothing (anyone
    can open /premium?checkout=success, and a delayed UPI payment can still fail), so its lines claim no
    payment, and after the wait buying is open again: the server refuses a second purchase (Fable review).
  */
  const awaitPremium = useCallback((from: 'paddle' | 'stripe') => {
    setPurchased(true);
    /* Waiting for ANOTHER YEAR (the extend key present), not a first purchase: the page shows the wait inside the
       holder box only then (Fable: after a first pass, the holder box said "waiting for your payment" for ever). */
    let extendingNow = false;
    try { extendingNow = sessionStorage.getItem(EXTEND_KEY) !== null; } catch { /* none */ }
    setExtendWait(extendingNow);
    setMessage(from === 'paddle' ? 'Thank you. Your Premium is being set up…' : 'Thank you. We are waiting for your payment to be confirmed…');
    let tries = 0;
    /* The wait belongs to the account that bought: it stops if another signs in (Codex, round two). */
    const forUser = currentUser.current;
    const live = () => mounted.current && currentUser.current === forUser;
    const poll = async () => {
      if (!live()) return;
      const next = await readPremium();
      if (!live()) return;
      /* Extending a pass: done when its end has moved (the new year added), not merely "has Premium". */
      let extendFrom: string | null = null;
      try { extendFrom = sessionStorage.getItem(EXTEND_KEY); } catch { /* none */ }
      const done = extendFrom !== null ? Boolean(next?.premium && next.periodEndsAt && next.periodEndsAt !== extendFrom) : Boolean(next?.premium);
      if (done) {
        try { sessionStorage.removeItem(EXTEND_KEY); } catch { /* none */ }
        setExtendWait(false);
        if (extendFrom !== null) { setPurchased(false); setExtendWait(false); }
        setMessage(null);
        return;
      }
      if (++tries < 30) { window.setTimeout(poll, 2000); return; }
      try { sessionStorage.removeItem(EXTEND_KEY); } catch { /* none */ }
      if (from === 'paddle') { setMessage('Your payment went through. Premium can take a few minutes to appear; reload this page soon.'); return; }
      setPurchased(false);
      setMessage(next?.purchasePending ? STRIPE_PENDING_LINE : 'We have not received a payment yet. If you paid, Premium can take a few minutes; reload this page soon.');
    };
    void poll();
  }, [readPremium]);

  useEffect(() => onCheckoutCompleted(() => awaitPremium('paddle')), [awaitPremium]);

  /* Back from Stripe's checkout page (?checkout=success): the same wait, once, for a signed-in buyer.
     The address loses the parameter, so a reload does not thank them again. */
  const returned = useRef(false);
  useEffect(() => {
    if (!prices || returned.current || provider !== 'stripe' || !user) return;
    const query = new URLSearchParams(window.location.search);
    if (query.get(STRIPE_RETURN_PARAM) !== 'success') return;
    returned.current = true;
    query.delete(STRIPE_RETURN_PARAM);
    const rest = query.toString();
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${rest ? `?${rest}` : ''}${window.location.hash}`);
    awaitPremium('stripe');
  }, [prices, provider, user, awaitPremium]);

  /*
    Each checkout attempt has a number (Codex, round two). Coming back with the Back button, or another
    account signing in, starts a new number: the old attempt's answer, redirect and timer are then ignored,
    so they can neither send this visitor to another account's checkout nor unlock a newer attempt.
  */
  const inFlight = useRef(false);
  const attemptNo = useRef(0);
  const release = useCallback(() => { attemptNo.current += 1; inFlight.current = false; setBusy(false); }, []);
  useEffect(() => {
    const onShow = (event: PageTransitionEvent) => { if (event.persisted) release(); };
    window.addEventListener('pageshow', onShow);
    return () => window.removeEventListener('pageshow', onShow);
  }, [release]);
  /* Only when an account that was signed in changes or signs out (signing in from nothing is the page loading). */
  const previousUser = useRef<string | null>(userId);
  useEffect(() => {
    const before = previousUser.current;
    previousUser.current = userId;
    if (before === null || before === userId) return;
    release();
    setPurchased(false);
    setMessage(null);
  }, [userId, release]);

  /* The last line of defence for every page using this hook: never a checkout while the account's
     state is unknown, for a Premium holder, while a purchase is not settled, after a completed purchase,
     or while one is opening (#261 review; Codex: the lock is a ref, so two clicks in one frame send one request). */
  const buy = useCallback(async (choice: BuyChoice, country?: string | null) => {
    /* A one-year pass on top of a one-year pass is sold (it starts where the first ends; the server allows it,
       routes/stripe.ts): the one exception to "never for a Premium holder" (owner, 2026-11-24). */
    /* The same rule as the page's button (canAddPassYear: no open subscription, no refund waiting; Fable). */
    const extending = choice.key === 'one_year' && state?.premium === true && canAddPassYear(state);
    if (!provider || !user || !stateKnown || (state?.premium && !extending) || grantBlocksPurchase(state) || state?.purchasePending || purchased || inFlight.current) return;
    /* The wait after paying ends when the pass's end moves, not when the account "has Premium" (it already
       does). Kept across Stripe's redirect, for this tab only. */
    try {
      /* Only with a known end to compare against (Fable): an empty one would end the wait at the first read. */
      if (extending && state?.periodEndsAt) sessionStorage.setItem(EXTEND_KEY, state.periodEndsAt);
      else sessionStorage.removeItem(EXTEND_KEY);
    } catch { /* storage unavailable: the wait ends at the first read, as for any holder */ }
    if (provider === 'stripe') {
      inFlight.current = true;
      const mine = ++attemptNo.current;
      const forUser = currentUser.current;
      /* Still this attempt, on this page, for the account that started it. */
      const current = () => mounted.current && attemptNo.current === mine && currentUser.current === forUser;
      setBusy(true);
      setMessage(null);
      const shown = choice.minor !== undefined && choice.currency ? { minor: String(choice.minor), currency: choice.currency } : undefined;
      const result = await createStripeCheckout(choice.key, country, undefined, shown);
      /* The visitor left the page, came back with Back, or another account signed in while the checkout was
         opening: never send them to it. */
      if (!current()) return;
      /* `ok === false`, not `!ok`: without strictNullChecks TypeScript narrows only this way. */
      if (result.ok !== false) {
        window.location.assign(result.url);
        /* Buy stays waiting while the browser leaves; if it never does, this attempt lets go (a newer one keeps its lock). */
        window.setTimeout(() => { if (current()) release(); }, LEAVE_TIMEOUT_MS);
        return;
      }
      release();
      if (result.reason === 'already_premium') {
        /* The server knows better than this page: read the account again and say what it is. */
        const next = await readPremium();
        if (!mounted.current || currentUser.current !== forUser) return;
        setMessage(next?.premium || grantBlocksPurchase(next) ? STRIPE_REFUSAL.already_premium : next?.purchasePending ? STRIPE_PENDING_LINE : STRIPE_REFUSAL.failed);
        return;
      }
      setMessage(STRIPE_REFUSAL[result.reason]);
      return;
    }
    if (!settings || !choice.priceId) return;
    try {
      openCheckout(await loadPaddle(settings), choice.priceId, { sub: user.userId, email: user.email });
    } catch {
      setMessage('Checkout could not be opened. Please try again later.');
    }
  }, [provider, settings, user, stateKnown, state, purchased, readPremium, release]);

  return { checked, provider, settings, plans, state, stateKnown, purchased, extendWait, busy, setState, message, setMessage, buy };
}
