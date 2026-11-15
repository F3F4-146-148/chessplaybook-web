/**
 * Premium on the account page: where a player MANAGES Premium they have (when it renews or ends,
 * Paddle's customer portal, the 30-day refund). Renders nothing unless the API has checkout settings,
 * so it is invisible in production until launch and live on staging (sandbox).
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
import { formatMinor } from './paddleCheckout';
import { fetchPremium, usePremiumOffer } from './usePremiumOffer';

function day(sqliteUtc: string | null): string | null {
  if (!sqliteUtc) return null;
  const at = new Date(`${sqliteUtc.replace(' ', 'T')}Z`);
  return Number.isNaN(at.getTime()) ? null : at.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}

export function PremiumCard() {
  const { user } = useAuth();
  const { settings, state, stateKnown, setState, message, setMessage } = usePremiumOffer({ prices: false });
  const [busy, setBusy] = useState(false);
  const [confirmRefund, setConfirmRefund] = useState(false);

  if (!settings || !user) return null;

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
      const response = await fetch(`${env.apiBaseUrl}/api/premium/refund`, { method: 'POST', headers: await getAuthHeader() });
      if (response.ok) {
        setConfirmRefund(false);
        setMessage(null);
        /* A failed re-read is not "no Premium" (#261 review): keep the state we have. */
        const next = await fetchPremium();
        if (next) setState(next);
      } else {
        setMessage('The refund could not be requested. Please try again, or write to support@chessplaybook.com.');
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

  return (
    <Card data-testid="premium-card">
      <CardHeader><CardTitle>Premium</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm">
        {state?.premium ? (
          <>
            {state.kind === 'pass' ? (
              <p>
                You have Premium until {ends ?? 'the end of your year'}. It does not renew;{' '}
                <Link to="/premium" className="text-link hover:underline">another year</Link> can be added whenever you like.
              </p>
            ) : (
              <>
                <p>You have Premium.{ends && (cancelling ? ` It ends on ${ends}.` : ` It renews on ${ends}.`)}</p>
                <Button variant="outline" onClick={manage} disabled={busy}>Manage your subscription</Button>
              </>
            )}
            {state.refund?.pending && (
              <p className="text-muted-foreground">Your refund has been requested. Premium ends when Paddle confirms it.</p>
            )}
            {refundable && !state.refund?.pending && (
              confirmRefund ? (
                <div className="space-y-2">
                  <p>
                    Refund {refundAmount ?? 'your payment'} in full? Premium ends once the refund is confirmed
                    {refundable.kind === 'subscription' ? ', and your subscription is cancelled.' : '.'}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="destructive" onClick={refund} disabled={busy}>Yes, refund me</Button>
                    <Button variant="outline" onClick={() => setConfirmRefund(false)} disabled={busy}>Keep Premium</Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-1">
                  <Button variant="outline" onClick={() => setConfirmRefund(true)} disabled={busy}>Cancel and get a full refund</Button>
                  {refundUntil && <p className="text-muted-foreground">A full refund is possible until {refundUntil}.</p>}
                </div>
              )
            )}
          </>
        ) : stateKnown ? (
          /* Known to have no Premium (a failed lookup is not "no Premium": the hook says so instead). */
          <p className="text-muted-foreground">
            Unlimited game reports and explanations, and the full opening trainer.{' '}
            <Link to="/premium" className="text-link hover:underline">See the plans</Link>
          </p>
        ) : null}
        {message && <p role="status" className="text-muted-foreground">{message}</p>}
      </CardContent>
    </Card>
  );
}
