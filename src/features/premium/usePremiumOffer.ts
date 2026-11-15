/**
 * Premium as one hook (2026-11-14): checkout settings, the visitor's own prices, the account's
 * Premium state, and buying. Shared by the account page's card and the Premium page, so the two
 * cannot load or sell differently.
 *
 * `settings` is null where the API has no Paddle settings (production until launch): no Paddle
 * script is loaded and nothing can be bought. Prices come from Paddle, which localises them by the
 * visitor's address, so a guest sees their own price too; buying needs an account (owner).
 */
import { useCallback, useEffect, useState } from 'react';
import env from '@/config/env';
import { getAuthHeader } from '@/features/auth/utils/getAuthToken';
import { useAuth } from '@/features/auth/AuthContext';
import {
  fetchCheckoutSettings, loadPaddle, onCheckoutCompleted, openCheckout, previewPlans,
  type CheckoutSettings, type Plans, type PremiumState,
} from './paddleCheckout';

export async function fetchPremium(): Promise<PremiumState | null> {
  try {
    const response = await fetch(`${env.apiBaseUrl}/api/premium`, { headers: await getAuthHeader() });
    return response.ok ? await response.json() as PremiumState : null;
  } catch {
    return null;
  }
}

/** Retries of a failed entitlement lookup, then the state stays unknown (#261 review). */
export const ENTITLEMENT_RETRIES_MS = [1000, 3000];

export interface PremiumOffer {
  /** False until the checkout settings have been asked for. */
  checked: boolean;
  settings: CheckoutSettings | null;
  plans: Plans | null;
  /** The signed-in account's Premium; null for a guest or before it loads. */
  state: PremiumState | null;
  /**
   * True once it is known whether this visitor has Premium: a guest, no checkout settings, or the
   * account's answer arrived. Until then nothing may offer to buy (#261 review: a Premium holder
   * briefly saw Buy while their account loaded).
   */
  stateKnown: boolean;
  /** True once Paddle reported a completed checkout on this page: nothing more may be bought. */
  purchased: boolean;
  setState: (state: PremiumState | null) => void;
  message: string | null;
  setMessage: (message: string | null) => void;
  buy: (priceId: string) => Promise<void>;
}

/**
 * `prices: false` (the account page) skips loading Paddle.js and previewing prices: the page only
 * manages Premium, the offer is on /premium. Buying still loads Paddle.js on demand.
 */
export function usePremiumOffer({ prices = true }: { prices?: boolean } = {}): PremiumOffer {
  const { user, isLoading: authLoading } = useAuth();
  const [checked, setChecked] = useState(false);
  const [settings, setSettings] = useState<CheckoutSettings | null>(null);
  const [plans, setPlans] = useState<Plans | null>(null);
  const [state, setState] = useState<PremiumState | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const found = await fetchCheckoutSettings();
      if (cancelled) return;
      setSettings(found);
      setChecked(true);
      if (!found || !prices) return;
      try {
        const paddle = await loadPaddle(found);
        const preview = await previewPlans(paddle, found);
        if (!cancelled) setPlans(preview);
      } catch {
        if (!cancelled) setMessage('Prices could not be loaded. Please try again later.');
      }
    })();
    return () => { cancelled = true; };
  }, [prices]);

  /*
    The account's state, once there are settings and an account (a guest has none). Known ONLY from a
    valid answer (#261 review, Fable and Codex): a failed lookup (network, 401, 5xx) returns null, and
    taking null as "no Premium" offered a Premium holder Buy. A failure is retried; if it keeps
    failing, the state stays unknown, so nothing can be bought, and the page says why.
  */
  const [stateFor, setStateFor] = useState<string | null>(null);
  useEffect(() => {
    if (!settings || !user) { setState(null); return; }
    let cancelled = false;
    let timer: number | undefined;
    const attempt = (tries: number) => {
      void fetchPremium().then((next) => {
        if (cancelled) return;
        if (next) { setState(next); setStateFor(user.userId); return; }
        if (tries < ENTITLEMENT_RETRIES_MS.length) timer = window.setTimeout(() => attempt(tries + 1), ENTITLEMENT_RETRIES_MS[tries]);
        else setMessage('Your account could not be checked, so buying is paused. Please reload the page.');
      });
    };
    attempt(0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [settings, user]);
  const stateKnown = checked && !authLoading && (!settings || !user || stateFor === user.userId);

  /* Set once Paddle reports a completed checkout: nothing more may be bought on this page (#261 review). */
  const [purchased, setPurchased] = useState(false);

  /* After a purchase, Paddle tells our server by webhook; wait for it, up to a minute. */
  useEffect(() => onCheckoutCompleted(() => {
    setPurchased(true);
    setMessage('Thank you. Your Premium is being set up…');
    let tries = 0;
    const poll = async () => {
      const next = await fetchPremium();
      if (next?.premium) { setState(next); setMessage(null); return; }
      if (++tries < 30) window.setTimeout(poll, 2000);
      else setMessage('Your payment went through. Premium can take a few minutes to appear; reload this page soon.');
    };
    void poll();
  }), []);

  /* The last line of defence for every page using this hook: never a checkout while the account's
     state is unknown, for a Premium holder, or after a completed purchase (#261 review). */
  const buy = useCallback(async (priceId: string) => {
    if (!settings || !user || !stateKnown || state?.premium || purchased) return;
    try {
      openCheckout(await loadPaddle(settings), priceId, { sub: user.userId, email: user.email });
    } catch {
      setMessage('Checkout could not be opened. Please try again later.');
    }
  }, [settings, user, stateKnown, state, purchased]);

  return { checked, settings, plans, state, stateKnown, purchased, setState, message, setMessage, buy };
}
