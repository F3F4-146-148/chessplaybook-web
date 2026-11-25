/**
 * WHICH BLOCKS /membership SHOWS (#467 plan B3). The account's dimensions are independent (paid Premium, a grant,
 * a pending purchase, a refund), so the page is a stack of blocks, each decided on its own, in a fixed order.
 * One pure function, tested on every combination that can occur (membershipBlocks.test.ts).
 *
 * The status block is the full account card (PremiumStatus): it already says, per state, the paid Premium, the
 * grant, a pending payment, the refund and the free plan, in the owner-approved words.
 */
import { grantBlocksPurchase, hasPremium, premiumGrant, type PaymentsProvider, type PremiumState } from '../paddleCheckout';

export type BlockId = 'couldNotCheck' | 'status' | 'includes' | 'signIn' | 'plans' | 'compare';

export interface MembershipInput {
  signedIn: boolean;
  /** Who sells; null when nobody does. */
  provider: PaymentsProvider | null;
  /** The account's last valid answer (null for a guest or before one). */
  state: PremiumState | null;
  /** A valid answer for this account arrived. */
  known: boolean;
  /** The lookup failed after its retries. */
  failed: boolean;
}

/** Holds something to manage whoever sells (PremiumStatus's own rule). */
export function holdsSomething(state: PremiumState | null): boolean {
  return Boolean(state?.premium || state?.kind || state?.purchasePending || state?.refund?.available || state?.refund?.pending || premiumGrant(state));
}

export function membershipBlocks({ signedIn, provider, state, known, failed }: MembershipInput): BlockId[] {
  const blocks: BlockId[] = [];
  if (signedIn && failed && !known) {
    /* Nothing about the account can be said, and nothing may be offered (a failed read is not "no Premium"). */
    return ['couldNotCheck', 'compare'];
  }
  if (signedIn && known && (provider || holdsSomething(state))) blocks.push('status');
  if (signedIn && known && hasPremium(state)) blocks.push('includes');
  if (!signedIn) blocks.push('signIn');
  const mayBuy = provider !== null && (!signedIn || (known && !state?.premium && !state?.purchasePending && !grantBlocksPurchase(state)));
  if (mayBuy) blocks.push('plans');
  blocks.push('compare');
  return blocks;
}
