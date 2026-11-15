export type PremiumPlan = 'monthly' | 'yearly' | 'one_year';
export interface LocalPrice { currency: string; countries: string[]; [tier: string]: unknown }
export interface CountryPrice { currency: string; minor: string; amount: number }
interface PaddlePrice {
  unit_price: { amount: string; currency_code: string };
  unit_price_overrides: Array<{ country_codes: string[]; unit_price: { amount: string; currency_code: string } }>;
}
export function fullPriceCountries(lists: Record<string, unknown>): string[];
export function catalogPrices(local: Record<string, LocalPrice>, lists: Record<string, unknown>, supported: string[]): Record<PremiumPlan, PaddlePrice>;
export function priceFor(country: string | null | undefined, plan: PremiumPlan, local: Record<string, LocalPrice>, lists: Record<string, unknown>, supported: string[]): CountryPrice | null;
