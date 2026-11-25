/**
 * Premium on /profile, IN ONE LINE (#467 plan B4; owner M1, 2026-11-24). Managing Premium (Manage, the refund,
 * every state's full wording) moved to /membership (PremiumStatus.tsx); here the account sees its plan and the
 * way there. The words are the owner-approved ones of the full card (2026-11-24), its first sentence per state.
 *
 * Title by plan (owner, 2026-11-24): "Free plan" for a known free account, "Premium" otherwise; until the account
 * is known nothing is claimed about it. Renders nothing for a guest, or when nobody sells and the account holds
 * nothing, as before.
 */
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/features/auth/AuthContext';
import { logGA4Event } from '@/services/analytics';
import { hasPremium, premiumGrant } from './paddleCheckout';
import { grantLineText } from './GrantLine';
import { usePremiumOffer } from './usePremiumOffer';
import { PAST_DUE_LINE } from './stripeCheckout';

function day(sqliteUtc: string | null): string | null {
  if (!sqliteUtc) return null;
  const at = new Date(`${sqliteUtc.replace(' ', 'T')}Z`);
  return Number.isNaN(at.getTime()) ? null : at.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}

export function PremiumCard() {
  const { user } = useAuth();
  const { provider, state, stateKnown } = usePremiumOffer({ prices: false });

  const holds = Boolean(state?.premium || state?.kind || state?.purchasePending || state?.refund?.available || state?.refund?.pending || premiumGrant(state));
  if (!user || (!provider && !holds)) return null;

  const ends = day(state?.periodEndsAt ?? null);
  const cancelling = state?.scheduledChange?.startsWith('cancel@') ?? false;
  const granted = premiumGrant(state) !== null;

  /* The first sentence of the full card's wording for this state (PremiumStatus.tsx). */
  let line: string | null = null;
  if (stateKnown && state) {
    if (state.premium) {
      line = state.kind === 'pass' ? `You have Premium until ${ends ?? 'the end of your year'}. It does not renew.`
        : state.status === 'past_due' ? PAST_DUE_LINE
          : `You have Premium.${ends ? (cancelling ? ` It ends on ${ends}.` : ` It renews on ${ends}.`) : ''}`;
    } else if (state.purchasePending) {
      line = granted ? "Your subscription's payment has not gone through yet." : "Your payment has not gone through yet, so you don't have Premium.";
    } else if (granted) {
      line = grantLineText(state);
    } else {
      line = 'Some features have a daily limit. Premium has none.';
    }
  }
  const linkText = stateKnown && state && !hasPremium(state) && !state.purchasePending ? 'See the plans' : 'Manage it on your Membership page';

  return (
    <Card data-testid="premium-card">
      <CardHeader><CardTitle>{stateKnown && !hasPremium(state) ? 'Free plan' : 'Premium'}</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm">
        {line && (
          <p className={state?.premium || granted || state?.purchasePending ? undefined : 'text-muted-foreground'}>
            {line}{' '}
            <Link
              to={linkText === 'See the plans' ? '/membership#plans' : '/membership'}
              onClick={() => logGA4Event({ name: 'premium_link_clicked', params: { from: 'profile' } })}
              className="text-link hover:underline"
            >
              {linkText}
            </Link>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
