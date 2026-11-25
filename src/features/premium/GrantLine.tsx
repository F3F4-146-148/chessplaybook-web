/**
 * Premium given by Chess Playbook, in one line (premium grants plan B6). Exported so every place that shows
 * the account's Premium (the account card, the Premium page, #467's /membership) says it the same way.
 * Renders nothing when the account has no grant.
 */
import { premiumGrant, type PremiumState } from './paddleCheckout';

/**
 * The LAST DAY a grant covers, as the visitor's date: "24 February 2027". `ends_at` is exclusive (the first
 * moment with no Premium): a grant "until 24 February" ends at the next midnight in Bucharest, 22:00 UTC, and
 * that instant read in Bucharest is already the 25th (Fable review). So the moment just before it is shown.
 * `timeZone` for tests only.
 */
export function grantDay(sqliteUtc: string, timeZone?: string): string | null {
  const end = new Date(`${sqliteUtc.replace(' ', 'T')}Z`).getTime();
  if (Number.isNaN(end)) return null;
  return new Date(end - 1).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric', timeZone });
}

/** The line itself, or null with no grant. `offerPlans` adds the nudge shown next to Buy for a grant that ends. */
export function grantLineText(state: PremiumState | null | undefined, offerPlans = false): string | null {
  const grant = premiumGrant(state);
  if (!grant) return null;
  if (grant.endsAt === null) return 'We gave you Premium with no end date.';
  const until = grantDay(grant.endsAt);
  const line = until ? `We gave you Premium until ${until}.` : 'We gave you Premium for a while.';
  return offerPlans ? `${line} After that, you can choose a plan.` : line;
}

export function GrantLine({ state, offerPlans = false, className }: { state: PremiumState | null | undefined; offerPlans?: boolean; className?: string }) {
  const text = grantLineText(state, offerPlans);
  if (!text) return null;
  return <p data-premium="grant" className={className}>{text}</p>;
}
