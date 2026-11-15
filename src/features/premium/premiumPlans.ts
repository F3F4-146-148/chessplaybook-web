/**
 * The plan cards of the Premium page (#261), from either source, in one shape:
 *   live checkout: Paddle's own price preview for the visitor (usePremiumOffer);
 *   before checkout is live: the table Paddle is given, for the visitor's country (countryPrices).
 * Where a monthly plan exists (the full-price countries) the cards are the year (chosen first),
 * the month and the one-year pass; elsewhere the pass (chosen first) and the year, at one price.
 */
import local from '@/config/premium-local-prices.json';
import lists from '@/config/premium-full-price-countries.json';
import { supported as paddleSupported } from '@/config/paddle-supported-countries.json';
import { priceFor, type LocalPrice, type PremiumPlan } from './countryPrices';
import type { Plans } from './paddleCheckout';

export type PlanKey = PremiumPlan;

export interface ShownPlan {
  key: PlanKey;
  title: string;
  /** The price as shown, in the buyer's currency. */
  price: string;
  /** "a year", "a month" or "once". */
  unit: string;
  terms: string;
  /** In the currency's minor units, for the saving. */
  minor: number;
  currency: string;
  /** Paddle's price id; null before checkout is live. */
  priceId: string | null;
}

const COPY: Record<PlanKey, { unit: string; terms: string }> = {
  yearly: { unit: 'a year', terms: 'Renews every year. Cancel at any time.' },
  monthly: { unit: 'a month', terms: 'Renews every month. Cancel at any time.' },
  one_year: { unit: 'once', terms: 'One payment for one year. It does not renew.' },
};

function arrange(byKey: Partial<Record<PlanKey, Omit<ShownPlan, 'key' | 'title' | 'unit' | 'terms'>>>): ShownPlan[] {
  const card = (key: PlanKey, title: string, terms = COPY[key].terms): ShownPlan | null => {
    const p = byKey[key];
    return p ? { ...p, key, title, unit: COPY[key].unit, terms } : null;
  };
  const cards = byKey.monthly
    ? [card('yearly', 'Yearly'), card('monthly', 'Monthly'), card('one_year', 'One year')]
    : [card('one_year', 'Pay once'), card('yearly', 'Renews every year', 'Cancel at any time.')];
  return cards.filter((c): c is ShownPlan => c !== null);
}

/** Cards from Paddle's preview (checkout live). */
export function plansFromPaddle(plans: Plans): ShownPlan[] {
  const from = (p: Plans['yearly'] | null) => p && { price: p.total, minor: p.cents, currency: p.currency, priceId: p.priceId };
  return arrange({
    yearly: from(plans.yearly) ?? undefined,
    monthly: from(plans.monthly) ?? undefined,
    one_year: from(plans.oneYear) ?? undefined,
  });
}

function format(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency', currency, minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

/** Cards from the table Paddle is given, for a country (before checkout is live). */
export function plansForCountry(country: string | null | undefined): ShownPlan[] {
  const L = (local as { prices: Record<string, LocalPrice> }).prices;
  const at = (plan: PlanKey) => {
    const p = priceFor(country, plan, L, lists, paddleSupported);
    return p ? { price: format(p.amount, p.currency), minor: Number(p.minor), currency: p.currency, priceId: null as string | null } : undefined;
  };
  return arrange({ yearly: at('yearly'), monthly: at('monthly'), one_year: at('one_year') });
}

/** "Save N% against paying monthly": both prices, one currency, rounded down; else null. */
export function savingPercent(cards: ShownPlan[]): number | null {
  const y = cards.find((c) => c.key === 'yearly');
  const m = cards.find((c) => c.key === 'monthly');
  if (!y || !m || y.currency !== m.currency || !(y.minor > 0) || !(m.minor > 0)) return null;
  const n = Math.floor(((12 * m.minor - y.minor) / (12 * m.minor)) * 100);
  return n >= 1 && n <= 99 ? n : null;
}

/** The plan chosen when the page opens: the first card (the year, or the pass where there is no monthly). */
export function defaultPlan(cards: ShownPlan[]): PlanKey | null {
  return cards[0]?.key ?? null;
}
