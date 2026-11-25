/**
 * ONE ACCOUNT-PREMIUM STATE FOR THE WHOLE SITE (#467 plan A1a).
 *
 * Every place that shows the signed-in account's Premium (the account menu's plan line, /membership,
 * /profile's line, /premium) reads it from here, so a purchase or a refund seen by one is seen by all.
 * Before this each usePremiumOffer() call held its own copy and fetched on its own: a menu in the nav
 * would have fetched on every page and kept "Free plan" after a purchase made on another page.
 *
 * Rules:
 * - LAZY. Nothing is fetched until a consumer calls load() (the menu on its first open, a Premium page
 *   on mount). A page load with the menu closed costs no request.
 * - NO aws-amplify IN THE FIRST BUNDLE. This module is mounted by providers.tsx, which is always loaded
 *   and deliberately imports no sign-in code. The user is read from AuthContext (authContextValue.ts,
 *   amplify-free) and the fetch, which needs the sign-in token, is imported on the first load().
 * - `known` only after a VALID answer for the current user (a failed read is not "no Premium", #261).
 * - `failed` after the retries (1 s, 3 s) all fail; NOT sticky: the next load() tries again.
 * - Ordered reads: each read is numbered when it starts; an answer applies only if no later-started read
 *   has applied, and only for the user still signed in (the Codex rule that used to live in the hook).
 * - Cleared on sign-out and on a change of user.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AuthContext } from '@/features/auth/authContextValue';
import type { PremiumState } from './paddleCheckout';

/** Retries of a failed lookup, then `failed` (#261 review). Same values as usePremiumOffer's. */
export const ACCOUNT_PREMIUM_RETRIES_MS = [1000, 3000];

type Fetcher = () => Promise<PremiumState | null>;

export interface AccountPremium {
  /** The signed-in account this state belongs to; null for a guest or while sign-in loads. */
  userId: string | null;
  /** The last valid answer for `userId`; null before one, for a guest, or after sign-out. */
  state: PremiumState | null;
  /** True once a valid answer for `userId` arrived. */
  known: boolean;
  /** True when the last load's attempts all failed. The next load() tries again. */
  failed: boolean;
  /** Read the state unless it is already known or being read. Safe to call often. */
  load: () => void;
  /** Read it again now; resolves to the state applied, or null when the read failed or was superseded. */
  refresh: () => Promise<PremiumState | null>;
  /** A state learned elsewhere (a refund's re-read): counts as the newest read. */
  setState: (next: PremiumState | null) => void;
}

const AccountPremiumContext = createContext<AccountPremium | null>(null);

const loadFetcher: () => Promise<Fetcher> = () => import('./premiumFetch').then((m) => m.fetchPremium);

export function AccountPremiumProvider({ children, fetcher }: { children: ReactNode; fetcher?: () => Promise<Fetcher> }) {
  const userId = useContext(AuthContext)?.user?.userId ?? null;
  const [state, setRawState] = useState<PremiumState | null>(null);
  const [stateFor, setStateFor] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const currentUser = useRef<string | null>(userId);
  currentUser.current = userId;
  const started = useRef(0);
  const applied = useRef(0);
  const inFlight = useRef<string | null>(null);
  const getFetch = useRef<Promise<Fetcher> | null>(null);
  const timers = useRef<number[]>([]);

  const fetchOnce = useCallback(async (): Promise<PremiumState | null> => {
    getFetch.current ??= (fetcher ?? loadFetcher)();
    const fetchPremium = await getFetch.current;
    return fetchPremium();
  }, [fetcher]);

  /* One numbered read. Applies its answer only if nothing newer applied and the user is the same. */
  const read = useCallback(async (): Promise<PremiumState | null> => {
    const seq = ++started.current;
    const forUser = currentUser.current;
    if (!forUser) return null;
    const next = await fetchOnce();
    if (!next || forUser !== currentUser.current || seq < applied.current) return null;
    applied.current = seq;
    setRawState(next);
    setStateFor(forUser);
    setFailed(false);
    return next;
  }, [fetchOnce]);

  const clearTimers = () => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
  };

  /* Sign-out or another account: drop everything, including reads still on their way. Only on a CHANGE:
     a child's effects run before this one, so on mount a consumer's first load() has already started and
     a reset here would throw its answer away (found by AccountPremium.test.tsx). */
  const lastUser = useRef<string | null>(userId);
  useEffect(() => {
    if (lastUser.current === userId) return;
    lastUser.current = userId;
    clearTimers();
    started.current += 1;
    applied.current = started.current;
    inFlight.current = null;
    setRawState(null);
    setStateFor(null);
    setFailed(false);
  }, [userId]);
  useEffect(() => () => clearTimers(), []);

  const known = userId !== null && stateFor === userId;

  const load = useCallback(() => {
    const forUser = currentUser.current;
    if (!forUser || inFlight.current === forUser) return;
    if (stateFor === forUser) return;
    inFlight.current = forUser;
    setFailed(false);
    const attempt = (tries: number) => {
      void read().then((next) => {
        if (forUser !== currentUser.current) return;
        if (next) { inFlight.current = null; return; }
        if (tries < ACCOUNT_PREMIUM_RETRIES_MS.length) {
          timers.current.push(window.setTimeout(() => attempt(tries + 1), ACCOUNT_PREMIUM_RETRIES_MS[tries]));
        } else {
          inFlight.current = null;
          setFailed(true);
        }
      });
    };
    attempt(0);
  }, [read, stateFor]);

  const refresh = useCallback(() => read(), [read]);

  const setState = useCallback((next: PremiumState | null) => {
    applied.current = ++started.current;
    setRawState(next);
    setStateFor(next ? currentUser.current : null);
  }, []);

  const value = useMemo<AccountPremium>(
    () => ({ userId, state: known ? state : null, known, failed, load, refresh, setState }),
    [userId, state, known, failed, load, refresh, setState],
  );
  return <AccountPremiumContext.Provider value={value}>{children}</AccountPremiumContext.Provider>;
}

/**
 * The account's Premium. `{ load: true }` reads it when the component mounts (and again for a new
 * user); without it the component only reads what another consumer loaded. Throws without the provider:
 * a private fallback would bring back the copies this module exists to remove.
 */
export function useAccountPremium({ load = false }: { load?: boolean } = {}): AccountPremium {
  const value = useContext(AccountPremiumContext);
  if (!value) throw new Error('useAccountPremium needs AccountPremiumProvider (src/app/providers.tsx)');
  const { userId, load: doLoad } = value;
  useEffect(() => {
    if (load && userId) doLoad();
  }, [load, userId, doLoad]);
  return value;
}
