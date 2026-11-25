/**
 * /membership (#467 plan B3; analysis §3.2; owner decisions M1-M9, 2026-11-24).
 *
 * The account's Premium in one place: its status and managing it (PremiumStatus, the card that used to be on
 * /profile), what Premium includes, and for a free account or a guest the plan cards (the same component as
 * /premium, M9). Buying hands over to /premium (M8): Continue opens /premium with the chosen plan, where Buy,
 * the checkout and the wait after paying live; Stripe returns there.
 *
 * Blocks decided by membershipBlocks (one pure function, tested on every combination).
 */
import { useEffect, useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Check } from 'lucide-react';
import { useAuth } from '@/features/auth/AuthContext';
import { logGA4Event } from '@/services/analytics';
import { useAccountPremium } from '../AccountPremium';
import { PlanCards, planCards, usePlanChoice } from '../PlanCards';
import { PremiumStatus } from '../PremiumStatus';
import { LIMITED } from '../premiumFeatures';
import { usePremiumOffer } from '../usePremiumOffer';
import { useVisitorCountry } from '../useVisitorCountry';
import { membershipBlocks } from './membershipBlocks';

export function MembershipPage() {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const account = useAccountPremium({ load: true });
  const { checked, provider, plans } = usePremiumOffer();
  const country = useVisitorCountry();
  const cards = useMemo(() => planCards(checked, provider, plans, country), [checked, provider, plans, country]);
  const choice = usePlanChoice(cards);

  const blocks = membershipBlocks({
    signedIn: Boolean(user),
    provider: checked ? provider : null,
    state: account.state,
    known: account.known,
    failed: account.failed,
  });
  const show = (id: string) => blocks.includes(id as never);

  /* What the visitor saw, once per account state (B6). */
  const viewState = isLoading || !checked ? null : !user ? 'guest' : account.failed && !account.known ? 'failed' : !account.known ? null : blocks.find((b) => b !== 'compare') ?? 'none';
  useEffect(() => {
    if (viewState) logGA4Event({ name: 'membership_viewed', params: { state: viewState } });
  }, [viewState]);

  /* "See the plans" from /profile lands on #plans: scroll there once the cards are drawn (an in-app link starts
     at the top, #293). */
  useEffect(() => {
    if (location.hash !== '#plans' || !show('plans') || !cards) return;
    document.getElementById('plans')?.scrollIntoView({ block: 'start' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.hash, cards, blocks.join()]);

  const onContinue = () => {
    if (!choice.chosen) return;
    logGA4Event({ name: 'premium_link_clicked', params: { from: 'membership' } });
    navigate(`/premium?plan=${choice.chosen.key}`);
  };

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10 md:py-14">
      <h1 className="font-playfair text-[32px] font-semibold leading-tight md:text-[40px]">Membership</h1>

      <div className="mt-6 space-y-6">
        {show('couldNotCheck') && (
          <p role="status" className="rounded-lg border border-border bg-card p-4 text-[15px]" data-membership="could-not-check">
            Your membership could not be checked. Please reload the page.
          </p>
        )}

        {show('status') && <PremiumStatus plansHref="#plans" />}

        {show('includes') && (
          <section aria-labelledby="membership-includes" className="rounded-lg border border-border bg-card p-5" data-membership="includes">
            <h2 id="membership-includes" className="text-[17px] font-semibold">What Premium includes</h2>
            <ul className="mt-3 space-y-2 text-[15px]">
              {LIMITED.map(([feature]) => (
                <li key={feature} className="flex gap-2.5"><Check className="mt-0.5 h-4 w-4 shrink-0 text-link" strokeWidth={3} aria-hidden />{feature}, as many as you like</li>
              ))}
            </ul>
          </section>
        )}

        {show('signIn') && (
          <p className="text-[15px]" data-membership="sign-in">
            <Link to={`/login?returnTo=${encodeURIComponent('/membership')}`} className="text-link hover:underline">Sign in</Link> to see your membership.
          </p>
        )}

        {show('plans') && cards && (
          /* --pu: 1px: the cards' sizes are /premium's multiples of its hero unit; here, the design sizes. */
          <section id="plans" aria-labelledby="membership-plans" className="scroll-mt-20" style={{ ['--pu' as string]: '1px' }} data-membership="plans">
            <h2 id="membership-plans" className="mb-3 text-[17px] font-semibold">Premium plans</h2>
            <PlanCards cards={cards} choice={choice} disabled={false} />
            <button
              type="button"
              onClick={onContinue}
              disabled={!choice.chosen}
              className="v2-btn-gold mt-4 h-12 w-full text-[16px] font-semibold disabled:opacity-60"
              data-membership="continue"
            >
              {choice.chosen ? `Continue with ${choice.chosen.title}` : 'Continue'}
            </button>
            <p className="mt-2 text-[13px] text-foreground/80">
              <Link to="/refund-policy" className="hover:text-link">Full refund within 30 days, for any reason.</Link>
            </p>
          </section>
        )}

        <p className="text-[15px]" data-membership="compare">
          <Link to="/premium#premium-compare" className="text-link hover:underline">Compare Free and Premium</Link>
        </p>
      </div>
    </div>
  );
}
