/**
 * The Premium page (/premium, 2026-11-14): what Premium adds, the visitor's own price, and buying.
 * PREMIUM_OFFER_ANALYSIS section 9 item 4; it is what a buyer judges and what Paddle's reviewer reads.
 *
 * Every line is what the code does. Premium today is the free plan without its daily limits
 * (backend FREE_PLAN_LIMITS, mirrored and test-pinned in FREE_PLAN_ALLOWANCE); nothing else is
 * claimed. Prices come from Paddle in the visitor's currency (usePremiumOffer), or, when Stripe sells,
 * from the table the server charges from (premiumPlans.plansForCountry; Codex review: this rollback page
 * must not stop selling when Stripe sells). Where nobody sells (production before launch) the page names
 * the US price, says that prices are set per country, sells nothing, and does not name the payment provider. Buying needs an account (owner, 2026-11-13), so a guest is sent
 * to sign in and brought back here.
 *
 * A Document page in the current design system; the visual direction (#186) restyles it later.
 */
import { Link, useNavigate } from 'react-router-dom';
import { Check } from 'lucide-react';
import SeoHead from '@/components/SeoHead';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/AuthContext';
import { usePremiumOffer } from '@/features/premium/usePremiumOffer';
import { useVisitorCountry } from '@/features/premium/useVisitorCountry';
import { plansForCountry } from '@/features/premium/premiumPlans';
import { grantBlocksPurchase } from '@/features/premium/paddleCheckout';
import { STRIPE_UNAVAILABLE_LINE, stripeUnavailableIn } from '@/features/premium/stripeCheckout';
import { PendingLine } from '@/features/premium/PendingLine';
import { InvitationBanner } from '@/features/premium/InvitationBanner';
import { FREE_PLAN_ALLOWANCE } from '@/services/freePlanLimit';
import { logGA4Event } from '@/services/analytics';

const H2 = 'text-2xl font-semibold text-foreground mb-4';
const P = 'text-muted-foreground mb-4';
const A = 'text-link hover:underline';

const perDay = (n: number) => `${n} a day`;

/** What each plan gives, row by row. The limited rows read the server's own numbers. */
const ROWS: Array<{ feature: string; free: string; premium: string }> = [
  { feature: 'Opening variations to learn', free: perDay(FREE_PLAN_ALLOWANCE.opening_variation), premium: 'Unlimited' },
  { feature: 'Opening training sessions', free: perDay(FREE_PLAN_ALLOWANCE.opening_session), premium: 'Unlimited' },
  { feature: 'Game reports', free: perDay(FREE_PLAN_ALLOWANCE.game_report), premium: 'Unlimited' },
  { feature: 'Position explanations', free: perDay(FREE_PLAN_ALLOWANCE.explain_position), premium: 'Unlimited' },
  { feature: 'Puzzle explanations', free: perDay(FREE_PLAN_ALLOWANCE.puzzle_explanation), premium: 'Unlimited' },
  { feature: 'Champion Challenge', free: perDay(FREE_PLAN_ALLOWANCE.challenge_session), premium: 'Unlimited' },
  { feature: 'Puzzles', free: perDay(FREE_PLAN_ALLOWANCE.puzzle), premium: 'Unlimited' },
  { feature: 'Training plans', free: 'Unlimited', premium: 'Unlimited' },
  { feature: 'Champion games, play and news', free: 'Unlimited', premium: 'Unlimited' },
];

type PlanKey = 'yearly' | 'monthly' | 'one_year';

/** One plan as this page shows and buys it, from Paddle's preview or the Stripe table. */
interface ClassicPlan { total: string; priceId: string | null; minor: number; currency: string }

function PlanRow({ plan, kind, label, note, primary, onBuy, action, disabled }: {
  plan: ClassicPlan; kind: PlanKey; label: string; note: string; primary: boolean;
  onBuy: (kind: PlanKey, plan: ClassicPlan) => void; action: string; disabled: boolean;
}) {
  return (
    <div className="surface-card flex flex-col gap-3 rounded-lg p-4 sm:flex-row sm:items-center sm:justify-between" data-plan={kind}>
      <div>
        <p className="text-lg font-semibold text-foreground">{plan.total} <span className="text-base font-normal text-muted-foreground">{label}</span></p>
        <p className="text-sm text-muted-foreground">{note}</p>
      </div>
      <Button variant={primary ? 'default' : 'outline'} onClick={() => onBuy(kind, plan)} disabled={disabled} className="shrink-0">{action}</Button>
    </div>
  );
}

const PremiumClassic = () => {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();
  const { checked, provider, settings, plans, state, stateKnown, purchased, busy, message, buy } = usePremiumOffer();
  const country = useVisitorCountry();

  const action = user ? 'Buy' : 'Sign in to buy';
  /* A guest signs in first and comes back here (buying needs an account). */
  const onBuy = (kind: PlanKey, plan: ClassicPlan) => {
    if (busy) return;
    logGA4Event({ name: 'premium_buy_clicked', params: { plan: kind, signed_in: Boolean(user) } });
    if (user) void buy({ key: kind, priceId: plan.priceId, minor: plan.minor, currency: plan.currency }, country);
    else navigate(`/login?returnTo=${encodeURIComponent('/premium')}`);
  };

  /* The plans in one shape: Paddle's preview, or the Stripe table for the visitor's country (once known). */
  const shown = ((): { yearly: ClassicPlan | null; monthly: ClassicPlan | null; oneYear: ClassicPlan | null } | null => {
    if (provider === 'paddle') {
      if (!plans) return null;
      const from = (p: typeof plans.yearly | null) => p && { total: p.total, priceId: p.priceId, minor: p.cents, currency: p.currency };
      return { yearly: from(plans.yearly), monthly: from(plans.monthly), oneYear: from(plans.oneYear) };
    }
    if (provider === 'stripe') {
      if (country === undefined) return null;
      const cards = plansForCountry(country);
      const at = (key: PlanKey) => {
        const c = cards.find((x) => x.key === key);
        return c ? { total: c.price, priceId: null, minor: c.minor, currency: c.currency } : null;
      };
      return { yearly: at('yearly'), monthly: at('monthly'), oneYear: at('one_year') };
    }
    return null;
  })();

  const prices = () => {
    if (!checked || isLoading) return <p className={P}>Loading prices…</p>;
    if (!provider) {
      return (
        <>
          <p className={P}>
            In the United States, Premium is US$25 a year or US$5 a month. Prices are set for each country,
            and you see yours in your own currency before you pay.
          </p>
          <p className={P}>You can buy Premium here soon.</p>
        </>
      );
    }
    if (state?.premium) {
      return (
        <p className={P}>
          You have Premium. You can manage it on your <Link to="/membership" className={A}>Membership page</Link>.
        </p>
      );
    }
    /* Premium we gave with no end: nothing to buy (premium grants plan B6). */
    if (grantBlocksPurchase(state)) return <p className={P}>We gave you Premium with no end date.</p>;
    if (provider === 'stripe' && stripeUnavailableIn(country)) return <p className={P}>{STRIPE_UNAVAILABLE_LINE}</p>;
    if (state?.purchasePending && !purchased) return <p className={P}><PendingLine linkClassName={A} /></p>;
    if (!shown?.yearly) return message ? null : <p className={P}>Loading prices…</p>;
    /* A failed account lookup is not "no Premium" (#261 review): no plans to buy until it is known. */
    if (!stateKnown || purchased) return message ? null : <p className={P}>Loading prices…</p>;
    const go = onBuy;
    return (
      <div className="space-y-3">
        <PlanRow plan={shown.yearly} kind="yearly" label="a year" note="Renews every year. Cancel at any time." primary onBuy={go} action={action} disabled={busy} />
        {shown.monthly && (
          <PlanRow plan={shown.monthly} kind="monthly" label="a month" note="Renews every month. Cancel at any time." primary={false} onBuy={go} action={action} disabled={busy} />
        )}
        {shown.oneYear && (
          <PlanRow plan={shown.oneYear} kind="one_year" label="once" note="One year of Premium. It does not renew." primary={false} onBuy={go} action={action} disabled={busy} />
        )}
        {!user && <p className="text-sm text-muted-foreground">Buying needs a free account, so Premium is yours on every device.</p>}
      </div>
    );
  };

  return (
    <>
      <SeoHead routeKey="premium" />

      <div className="bg-background flex flex-col">
        <div className="py-12 px-4 sm:px-6 lg:px-8 flex-grow">
          <div className="max-w-4xl mx-auto">
            <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-4">Premium</h1>
            <p className="text-lg text-muted-foreground mb-10">Train as much as you want, every day.</p>
            {/* The invitation banner, as on the v2 page (2026-11-25): a rollback must not leave an invitation link saying nothing. */}
            <div className="-mt-6 mb-10 empty:hidden"><InvitationBanner /></div>

            <section className="mb-10" aria-labelledby="premium-plans">
              <h2 id="premium-plans" className={H2}>Free and Premium</h2>
              <div className="surface-card overflow-hidden rounded-lg">
                <table className="w-full text-left text-sm sm:text-base">
                  <thead>
                    <tr className="border-b border-border">
                      <th scope="col" className="p-3 font-semibold text-foreground"><span className="sr-only">Feature</span></th>
                      <th scope="col" className="p-3 font-semibold text-foreground">Free</th>
                      <th scope="col" className="p-3 font-semibold text-foreground">Premium</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ROWS.map((row) => (
                      <tr key={row.feature} className="border-b border-border last:border-b-0">
                        <th scope="row" className="p-3 font-normal text-foreground">{row.feature}</th>
                        <td className="p-3 text-muted-foreground">{row.free}</td>
                        <td className="p-3 text-foreground">
                          {row.premium === 'Unlimited' && row.free !== 'Unlimited' ? (
                            <span className="inline-flex items-center gap-1.5"><Check className="h-4 w-4 text-success" aria-hidden />Unlimited</span>
                          ) : row.premium}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="mb-10" aria-labelledby="premium-price">
              <h2 id="premium-price" className={H2}>Price</h2>
              {prices()}
              {message && <p role="status" className="mt-3 text-sm text-muted-foreground">{message}</p>}
            </section>

            <section className="mb-10" aria-labelledby="premium-refund">
              <h2 id="premium-refund" className={H2}>Your money back</h2>
              <p className={P}>
                You can have a full refund of any payment within 30 days, for any reason. See the{' '}
                <Link to="/refund-policy" className={A}>Refund Policy</Link>.
              </p>
              {/* The reseller is named here only once checkout is live (owner, 2026-11-14); the Terms always name it. */}
              <p className={P}>
                {provider === 'stripe' && (
                  <>
                    Premium is sold through Link (Stripe), the Merchant of Record for all our orders.{' '}
                    <a href="https://link.com/terms" target="_blank" rel="noopener noreferrer" className={A}>Link's terms</a> also apply.{' '}
                  </>
                )}
                {provider === 'paddle' && settings && 'Our order process is conducted by our online reseller Paddle.com, which is the Merchant of Record for all our orders. '}
                Prices include any sales tax or VAT. See the{' '}
                <Link to="/terms" className={A}>Terms of Service</Link>.
              </p>
            </section>
          </div>
        </div>
      </div>
    </>
  );
};

export default PremiumClassic;
