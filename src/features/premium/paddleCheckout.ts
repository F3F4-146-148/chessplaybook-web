/**
 * Paddle checkout on the site (PREMIUM_OFFER_ANALYSIS section 9 item 5; 2026-11-13).
 *
 * Nothing here runs unless the API answers `GET /api/premium/checkout` with settings, which
 * production does not until launch: no Paddle script is loaded and no Premium control shows.
 *
 * Facts from developer.paddle.com (read 2026-11-13): Paddle.js is always loaded from
 * https://cdn.paddle.com/paddle/v2/paddle.js; `Paddle.Environment.set('sandbox')` comes before
 * `Paddle.Initialize({ token, eventCallback })`, which may run once per page; a checkout opens with
 * `items`, `customer.email` and `customData` (copied onto the subscription, which is how the
 * backend knows the account: owner, buying needs an account).
 */
import env from '@/config/env';
import fullPriceCountries from '@/config/premium-full-price-countries.json';
import { supported as paddleSupported } from '@/config/paddle-supported-countries.json';
import { STRIPE_ZERO_DECIMAL } from './stripeLocalPrices';

export interface CheckoutSettings {
  environment: 'sandbox' | 'production';
  clientToken: string;
  /** `oneYear`: paid once, never renewing (owner, 2026-11-13); null until configured. */
  prices: { monthly: string; yearly: string; oneYear: string | null };
}

/** A full refund within 30 days of a payment (owner, 2026-11-13). */
export interface RefundInfo {
  /* `premiumUntilAfter` (#467 E3): when paid Premium would end if this payment were refunded now (another
     pass runs on), null when at once. Optional: a backend from before E3 does not send it. */
  available: { kind: 'pass' | 'subscription'; until: string; totalMinor: string | null; currency: string | null; premiumUntilAfter?: string | null } | null;
  pending: boolean;
  /** While a refund waits: when paid Premium ends once it is confirmed (another pass runs on), else null (E4). */
  pendingPremiumUntilAfter?: string | null;
}

/* Currencies with no minor unit: Stripe's list, which holds Paddle's too (a refund amount can be either's). */
const ZERO_DECIMAL = STRIPE_ZERO_DECIMAL;

/** "€22.49", from Paddle's minor units; null when the amount is not known. */
export function formatMinor(totalMinor: string | null, currency: string | null): string | null {
  if (!totalMinor || !currency || !/^\d+$/.test(totalMinor)) return null;
  const amount = Number(totalMinor) / (ZERO_DECIMAL.has(currency) ? 1 : 100);
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

export interface PremiumState {
  refund?: RefundInfo;
  premium: boolean;
  kind: 'subscription' | 'pass' | null;
  status: string | null;
  /** A Stripe purchase not settled yet (a pending UPI payment, a renewal past due): no Buy (Codex review). */
  purchasePending?: boolean;
  /** A Stripe subscription not cancelled, with or without Premium (#467 E6): the checkout refuses a pass then.
      Optional: a backend from before E6 does not send it. */
  openSubscription?: boolean;
  periodEndsAt: string | null;
  scheduledChange: string | null;
  /*
    ADDED 2026-11-24 (Premium grants plan, B1): every field above stays PAID Premium. `entitled` is paid
    OR given by Chess Playbook (a grant), what the free-plan limits read; `grant` is the given Premium
    with its end (null = no end). Optional, because a backend from before this change sends neither:
    read them through hasPremium() and premiumGrant(), never directly.
  */
  entitled?: boolean;
  grant?: { endsAt: string | null } | null;
}

/** Whether the account has Premium, paid or given (an older backend: paid only). Offer Buy and Manage on `premium`. */
export function hasPremium(state: PremiumState | null | undefined): boolean {
  return Boolean(state && (state.entitled ?? state.premium));
}

/** The Premium given by Chess Playbook, if any; `endsAt` null means no end date. */
export function premiumGrant(state: PremiumState | null | undefined): { endsAt: string | null } | null {
  return state?.grant ?? null;
}

/**
 * Given Premium with NO end: nothing to buy (the server refuses every purchase, 409 already_premium, reason
 * grant). Every page offering Buy checks this beside `premium` (premium grants plan B4, B6). A grant WITH an
 * end does not block: its holder may buy before it ends.
 */
export function grantBlocksPurchase(state: PremiumState | null | undefined): boolean {
  const grant = premiumGrant(state);
  return grant !== null && grant.endsAt === null;
}

/**
 * A one-year-pass holder the server would sell another year to (#467 Phase E): holding a pass, no given
 * Premium without an end, no purchase or refund waiting, and the server SAYS no subscription is open
 * (E6; a backend from before E6 does not say, so no offer). The page adds its own conditions (a seller,
 * the plan's price).
 */
export function canAddPassYear(state: PremiumState | null | undefined): boolean {
  return Boolean(state?.premium) && state?.kind === 'pass' && !grantBlocksPurchase(state)
    && !state?.purchasePending && !state?.refund?.pending && state?.openSubscription === false;
}

interface PaddleGlobal {
  Environment: { set: (environment: string) => void };
  Initialize: (options: { token: string; eventCallback?: (event: { name?: string }) => void }) => void;
  Checkout: { open: (options: Record<string, unknown>) => void };
  PricePreview: (request: { items: Array<{ priceId: string; quantity: number }> }) => Promise<{
    data: {
      details: { lineItems: Array<{ price: { id: string }; formattedTotals: { total: string }; totals: { total: string } }> };
      currencyCode: string;
      address?: { countryCode?: string } | null;
    };
  }>;
}

declare global {
  interface Window { Paddle?: PaddleGlobal }
}

const SCRIPT = 'https://cdn.paddle.com/paddle/v2/paddle.js';

/** Who sells (STRIPE plan B6): one provider at a time, or none (production before launch). */
export type PaymentsProvider = 'paddle' | 'stripe';

export interface CheckoutAnswer {
  provider: PaymentsProvider | null;
  /** Paddle's settings; set only when Paddle sells. */
  settings: CheckoutSettings | null;
  /** #521 Phase F: Stripe sells to a visitor who is not signed in too (GUEST_CHECKOUT=on on the server). */
  guestCheckout?: boolean;
}

const NOBODY: CheckoutAnswer = { provider: null, settings: null, guestCheckout: false };

export async function fetchCheckoutSettings(fetchImpl: typeof fetch = fetch): Promise<CheckoutAnswer> {
  try {
    const response = await fetchImpl(`${env.apiBaseUrl}/api/premium/checkout`);
    if (!response.ok) return NOBODY;
    const body = await response.json() as { provider?: unknown; checkout?: CheckoutSettings | null; guestCheckout?: unknown };
    /* Stripe when the server says so, whatever else is sent (Fable review); Paddle only with its settings;
       an API from before B6 sends no provider, and its settings mean Paddle. */
    if (body.provider === 'stripe') return { provider: 'stripe', settings: null, guestCheckout: body.guestCheckout === true };
    if (body.checkout) return { provider: 'paddle', settings: body.checkout };
    return NOBODY;
  } catch {
    return NOBODY;
  }
}

let loading: Promise<PaddleGlobal> | null = null;
const completedListeners = new Set<() => void>();

/** Load and initialise Paddle.js once per page. */
export function loadPaddle(settings: CheckoutSettings): Promise<PaddleGlobal> {
  if (loading) return loading;
  loading = new Promise<PaddleGlobal>((resolve, reject) => {
    const ready = () => {
      const paddle = window.Paddle;
      if (!paddle) { reject(new Error('Paddle.js did not load')); return; }
      if (settings.environment === 'sandbox') paddle.Environment.set('sandbox');
      paddle.Initialize({
        token: settings.clientToken,
        eventCallback: (event) => {
          if (event?.name === 'checkout.completed') completedListeners.forEach((listener) => listener());
        },
      });
      resolve(paddle);
    };
    if (window.Paddle) { ready(); return; }
    const script = document.createElement('script');
    script.src = SCRIPT;
    script.async = true;
    script.onload = ready;
    script.onerror = () => { loading = null; reject(new Error('Paddle.js could not be loaded')); };
    document.head.appendChild(script);
  });
  return loading;
}

export function onCheckoutCompleted(listener: () => void): () => void {
  completedListeners.add(listener);
  return () => { completedListeners.delete(listener); };
}

export interface PlanPrice { priceId: string; total: string; cents: number; currency: string }

export interface Plans { yearly: PlanPrice; monthly: PlanPrice | null; oneYear: PlanPrice | null }

/** The countries that pay the full price, and may also subscribe monthly (owner, 2026-11-13). */
const FULL_PRICE = new Set(Object.entries(fullPriceCountries as Record<string, unknown>)
  .filter(([key]) => !key.startsWith('_')).flatMap(([, codes]) => codes as string[]));

/** The reduced-price currencies (scripts/paddle/local-currencies.json); every other one is full price. */
export const REDUCED_CURRENCIES = new Set(['INR', 'BRL', 'MXN', 'ZAR', 'ARS', 'CLP', 'COP', 'PEN', 'CNY', 'THB', 'VND', 'UAH', 'TRY']);

function isFullPriceCurrency(currency: string, preview: { data: { details: { lineItems: Array<{ totals: { total: string } }> } } }): boolean {
  const total = Number(preview.data.details.lineItems[0]?.totals.total ?? 0);
  if (currency === 'USD') return total >= 2000;
  /* The euro is used at both levels: the Balkans and Moldova pay EUR 5.49, the euro area EUR 22.49. */
  if (currency === 'EUR') return total >= 1000;
  return !REDUCED_CURRENCIES.has(currency);
}

const SELLS = new Set(paddleSupported);

export function isFullPriceCountry(countryCode: string | null | undefined): boolean {
  return Boolean(countryCode) && FULL_PRICE.has(countryCode!.toUpperCase());
}

/**
 * The visitor's own prices, in their own currency (Paddle localises by the visitor's address).
 * Monthly is offered only in the full-price countries (owner, 2026-11-13): elsewhere yearly and
 * one year only. Monthly is previewed on its own, because one preview must be in one currency and
 * in a reduced-price country the yearly price is local while monthly is not.
 */
export async function previewPlans(paddle: PaddleGlobal, settings: CheckoutSettings): Promise<Plans> {
  const yearlyIds = [settings.prices.yearly, ...(settings.prices.oneYear ? [settings.prices.oneYear] : [])];
  const yearly = await paddle.PricePreview({ items: yearlyIds.map((priceId) => ({ priceId, quantity: 1 })) });
  const read = (preview: typeof yearly, id: string): PlanPrice => {
    const line = preview.data.details.lineItems.find((l) => l.price.id === id)!;
    return { priceId: id, total: line.formattedTotals.total, cents: Number(line.totals.total), currency: preview.data.currencyCode };
  };
  /* The country when Paddle reports it (it does, from the visitor's IP: checked 2026-11-13); else the
     currency. EUR and USD are used at both levels and are told apart by amount; every other currency
     belongs to one level only. */
  const country = yearly.data.address?.countryCode?.toUpperCase();
  /* A country Paddle does not sell in is unknown, priced at the base, like no country (#261 review). */
  const known = Boolean(country) && SELLS.has(country!);
  const fullPrice = known ? isFullPriceCountry(country) : isFullPriceCurrency(yearly.data.currencyCode, yearly);
  let monthly: PlanPrice | null = null;
  if (fullPrice) {
    const preview = await paddle.PricePreview({ items: [{ priceId: settings.prices.monthly, quantity: 1 }] });
    monthly = read(preview, settings.prices.monthly);
  }
  return {
    yearly: read(yearly, settings.prices.yearly),
    monthly,
    oneYear: settings.prices.oneYear ? read(yearly, settings.prices.oneYear) : null,
  };
}

export function openCheckout(paddle: PaddleGlobal, priceId: string, account: { sub: string; email: string }): void {
  paddle.Checkout.open({
    items: [{ priceId, quantity: 1 }],
    customer: account.email ? { email: account.email } : undefined,
    customData: { cognitoSub: account.sub },
  });
}
