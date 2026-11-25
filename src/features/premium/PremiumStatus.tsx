/**
 * THE ACCOUNT'S PREMIUM, IN FULL (#467 plan B4): the status block of /membership. It was the Premium card on
 * /profile; it moved here whole (every state's owner-approved wording, 2026-11-24, unchanged) when managing
 * Premium moved to /membership. /profile keeps a one-line summary (PremiumCard.tsx) that links here.
 *
 * Where a player MANAGES Premium they have (when it renews or ends,
 * the provider's customer portal, the 30-day refund). Renders nothing unless someone sells (Paddle or
 * Stripe, one at a time), so it is invisible in production until launch and live on staging (sandbox).
 * Manage and refund go to the provider that took the payment (the server decides, STRIPE plan B5).
 *
 * IT DOES NOT SELL (owner, 2026-11-15). It once showed its own prices and buy buttons, a second copy
 * of the offer that drifted from /premium (it offered Buy to a holder whose account lookup failed
 * after /premium had been fixed). Selling lives only on /premium; here a player without Premium gets
 * a link to it. The account's state comes from usePremiumOffer, shared with /premium.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import env from '@/config/env';
import { getAuthHeader } from '@/features/auth/utils/getAuthToken';
import { useAuth } from '@/features/auth/AuthContext';
import { canAddPassYear, formatMinor, grantBlocksPurchase, hasPremium, premiumGrant } from './paddleCheckout';
import { grantLineText } from './GrantLine';
import { fetchPremium, usePremiumOffer } from './usePremiumOffer';
import { PAST_DUE_LINE } from './stripeCheckout';

function day(sqliteUtc: string | null): string | null {
  if (!sqliteUtc) return null;
  const at = new Date(`${sqliteUtc.replace(' ', 'T')}Z`);
  return Number.isNaN(at.getTime()) ? null : at.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}

/** `plansHref`: where "See the plans" goes; on /membership the plans are on the same page. */
export function PremiumStatus({ plansHref = '/premium' }: { plansHref?: string } = {}) {
  const { user } = useAuth();
  const { provider, state, stateKnown, setState, message, setMessage } = usePremiumOffer({ prices: false });
  const [busy, setBusy] = useState(false);
  const [confirmRefund, setConfirmRefund] = useState(false);

  /* Shown when someone sells, or when the account has Premium or a payment to manage whoever sells today:
     the Terms send a holder here to cancel and to get a refund (Fable review). */
  const holds = Boolean(state?.premium || state?.kind || state?.purchasePending || state?.refund?.available || state?.refund?.pending || premiumGrant(state));
  if (!user || (!provider && !holds)) return null;

  const manage = async () => {
    setBusy(true);
    try {
      const response = await fetch(`${env.apiBaseUrl}/api/premium/portal`, { method: 'POST', headers: await getAuthHeader() });
      const body = await response.json().catch(() => null) as { url?: string } | null;
      if (body?.url) window.location.assign(body.url);
      else setMessage('The subscription page could not be opened. Please try again later.');
    } finally {
      setBusy(false);
    }
  };

  /* A full refund within 30 days of a payment (owner, 2026-11-13). Two steps, because it ends Premium. */
  const refund = async () => {
    setBusy(true);
    try {
      /* The payment this confirmation is about (its `until`): the server refuses another (#467, Codex). */
      const response = await fetch(`${env.apiBaseUrl}/api/premium/refund`, {
        method: 'POST',
        headers: { ...(await getAuthHeader()), 'Content-Type': 'application/json' },
        body: JSON.stringify({ until: state?.refund?.available?.until ?? null }),
      });
      if (response.ok) {
        setConfirmRefund(false);
        setMessage(null);
        /* A failed re-read is not "no Premium" (#261 review): keep the state we have. */
        const next = await fetchPremium();
        if (next) setState(next);
      } else {
        setMessage('The refund could not be requested. Please try again, or write to support@chessplaybook.com.');
        /* Refused because the payments changed (another tab, a refund made meanwhile): show what is true now,
           and ask again rather than keep a confirmation about a payment that is no longer the one offered. */
        if (response.status === 409) {
          setConfirmRefund(false);
          const next = await fetchPremium();
          if (next) setState(next);
        }
      }
    } finally {
      setBusy(false);
    }
  };

  const ends = day(state?.periodEndsAt ?? null);
  const cancelling = state?.scheduledChange?.startsWith('cancel@') ?? false;
  const refundable = state?.refund?.available ?? null;
  const refundAmount = refundable ? formatMinor(refundable.totalMinor, refundable.currency) : null;
  const refundUntil = refundable ? day(refundable.until) : null;
  /* Two passes (#467 E4, owner-approved 2026-11-24): refunding one year keeps the other, so say until when. */
  const keepsAfter = day(refundable?.premiumUntilAfter ?? null);
  const keepsAfterPending = day(state?.refund?.pendingPremiumUntilAfter ?? null);
  /* Premium given by Chess Playbook (premium grants plan B6): said beside the paid block, never instead of it. */
  const granted = premiumGrant(state) !== null;
  /* A given Premium that ends, and nothing paid or pending: the line offers the plans (row 5 of the owner's wording). */
  const offerPlans = granted && !state?.premium && !state?.purchasePending && !grantBlocksPurchase(state);

  return (
    <Card data-testid="premium-status">
      {/* The account's plan as the title (owner, 2026-11-24: "Premium" above a free account's card was misleading).
          "Free plan", the Terms' word for it; "free account" would be true of a Premium holder too. Until the
          account is known, "Premium": the card is about Premium, and nothing is claimed about the account. */}
      <CardHeader><CardTitle>{stateKnown && !hasPremium(state) ? 'Free plan' : 'Premium'}</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm">
        {/* THE WORDING, ONE ROW PER STATE (owner-approved 2026-11-24, Fable and Codex consulted): every Premium
            line opens with "You have Premium" (paid) or "We gave you Premium" (given); no limits and no numbers
            in the free plan's line, which must stay true as limits change. */}
        {granted && (
          <p data-premium="grant">
            {grantLineText(state, offerPlans)}
            {offerPlans && <>{' '}<Link to={plansHref} className="text-link hover:underline">See the plans</Link></>}
          </p>
        )}
        {state?.premium ? (
          <>
            {state.kind === 'pass' ? (
              granted ? (
                <p>Your one-year pass ends on {ends ?? 'the end of your year'}.</p>
              ) : (
                <p>
                  You have Premium until {ends ?? 'the end of your year'}. It does not renew.
                  {/* Only where /premium would sell it (Fable, #467): else the link led to a page with nothing to buy. */}
                  {canAddPassYear(state) && <>{' '}<Link to="/premium" className="text-link hover:underline">Add another year</Link></>}
                </p>
              )
            ) : (
              <>
                <p>{state.status === 'past_due' ? PAST_DUE_LINE
                  : granted ? <>{ends ? (cancelling ? `Your subscription ends on ${ends}.` : `Your subscription renews on ${ends}.`) : 'You also have a subscription.'}</>
                  : <>You have Premium.{ends && (cancelling ? ` It ends on ${ends}.` : ` It renews on ${ends}.`)}</>}</p>
                <Button variant="outline" onClick={manage} disabled={busy}>Manage your subscription</Button>
              </>
            )}
            {state.refund?.pending && (
              <p className="text-muted-foreground">{granted ? 'Your refund has been requested. You keep the Premium we gave you.'
                : keepsAfterPending ? `Your refund has been requested. You keep Premium until ${keepsAfterPending}.`
                  : 'Your refund has been requested. Premium ends once it is confirmed.'}</p>
            )}
            {refundable && !state.refund?.pending && (
              confirmRefund ? (
                <div className="space-y-2">
                  <p>
                    {granted ? (
                      <>Refund {refundAmount ?? 'your payment'} in full?{refundable.kind === 'subscription' ? ' Your subscription is cancelled and you keep the Premium we gave you.' : ' You keep the Premium we gave you.'}</>
                    ) : keepsAfter ? (
                      <>Refund {refundAmount ?? 'your payment'} in full? You keep Premium until {keepsAfter}.</>
                    ) : (
                      <>
                        Refund {refundAmount ?? 'your payment'} in full? Premium ends once the refund is confirmed
                        {refundable.kind === 'subscription' ? ', and your subscription is cancelled.' : '.'}
                      </>
                    )}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="destructive" onClick={refund} disabled={busy}>Yes, refund me</Button>
                    <Button variant="outline" onClick={() => setConfirmRefund(false)} disabled={busy}>Keep Premium</Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-1">
                  <Button variant="outline" onClick={() => setConfirmRefund(true)} disabled={busy}>{refundable.kind === 'pass' ? 'Get a full refund' : 'Cancel and get a full refund'}</Button>
                  {refundUntil && <p className="text-muted-foreground">A full refund is possible until {refundUntil}.</p>}
                </div>
              )
            )}
          </>
        ) : state?.purchasePending ? (
          /* A subscription with no Premium yet not over (a pending first payment, a renewal past due, a refund
             about to cancel it): /premium sends the visitor here, so here is where it is managed (Fable, Codex). */
          <>
            <p>{granted ? "Your subscription's payment has not gone through yet." : "Your payment has not gone through yet, so you don't have Premium."}</p>
            <Button variant="outline" onClick={manage} disabled={busy}>Manage your subscription</Button>
          </>
        ) : stateKnown && !granted ? (
          /* Known to have no Premium (a failed lookup is not "no Premium": the hook says so instead). */
          <p className="text-muted-foreground">
            Some features have a daily limit. Premium has none.{' '}
            <Link to={plansHref} className="text-link hover:underline">See the plans</Link>
          </p>
        ) : null}
        {message && <p role="status" className="text-muted-foreground">{message}</p>}
      </CardContent>
    </Card>
  );
}
