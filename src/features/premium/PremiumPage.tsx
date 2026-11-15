/**
 * The Premium page (/premium), redesigned (#261; analysis: docs/Features Development/
 * PREMIUM_PAGE_VISUAL_ANALYSIS.md, copy approved by the owner 2026-11-14). Design v2 only: with
 * DESIGN_V2_LIVE off, src/pages/Premium.tsx serves PremiumClassic.
 *
 * Every claim is what the code does. The limits are the server's numbers (FREE_PLAN_ALLOWANCE).
 * The prices are Paddle's own preview once checkout is live; before that, the table Paddle is given,
 * for the visitor's country (premiumPlans / countryPrices), so a visitor anywhere sees their price.
 * Nothing offers to buy until it is known whether the visitor already has Premium. Buying needs an
 * account; a guest signs in and comes back with the chosen plan still chosen.
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { BarChart3, Check, ChevronDown, Crown, GraduationCap, Lightbulb, ShieldCheck, Sparkles } from 'lucide-react';
import SeoHead from '@/components/SeoHead';
import { useAuth } from '@/features/auth/AuthContext';
import { GoldGradientDefs } from '@/features/home/GoldGradientDefs';
import { FREE_PLAN_ALLOWANCE as A } from '@/services/freePlanLimit';
import { logGA4Event } from '@/services/analytics';
import { usePremiumOffer } from './usePremiumOffer';
import { useVisitorCountry } from './useVisitorCountry';
import { defaultPlan, plansForCountry, plansFromPaddle, savingPercent, type PlanKey, type ShownPlan } from './premiumPlans';

const perDay = (n: number) => `${n} a day`;
/* premium-v2 (2026-11-15): the trainer at 9.Ne5 and the opened explanation; assets/ is immutable, so a
   new folder rather than new pictures under the old names. */
const img = (name: string) => `/assets/premium-v2/${name}.jpg`;

/*
  What each feature gives, under its sentence (owner, 2026-11-15: the Game reports row looked orphaned
  beside its tall picture). Every point is what the page does today: the trainer's hint appears by
  itself after a minute and untrained lines come first; the report's summary links "the critical
  moment" and, when a champion played the opening, their best games (GameStatsCard); the explanation's
  sections; the Challenge's 18 champions and its verdict.
*/
const BENEFITS = [
  {
    icon: GraduationCap, title: 'Opening Trainer', img: 'trainer', layers: ['trainer-board', 'trainer-why'] as const,
    line: 'Learn opening repertoires, such as the London, the French or the Slav, move by move, then play them from memory.',
    points: ['The reason for every move, in plain English.', 'A hint when you are stuck.', 'Training starts with the lines you have not learned yet.'],
    free: `Free: ${A.opening_variation} new variation and ${A.opening_session} training session a day.`,
  },
  {
    icon: BarChart3, title: 'Game reports', img: 'report-seesaw', line: 'See your accuracy and the moves that changed the game.',
    points: ['Accuracy for both players, and every move rated from Brilliant to Blunder.', 'A link to the critical moment of the game.', 'When a World Champion played your opening, a link to their best games in it.'],
    free: `Free: ${perDay(A.game_report)}.`,
  },
  {
    icon: Lightbulb, title: 'Explain a Position', img: 'explain', line: 'Get any position explained in plain English, not engine numbers.',
    points: ['What matters now, in one sentence.', 'Threats, king safety, pieces and pawns, each in its own section.', 'Any position: paste a FEN or a Lichess link.'],
    free: `Free: ${perDay(A.explain_position)}.`,
  },
  {
    icon: Crown, title: 'Champion Challenge', img: 'challenge', line: "Play your move in a World Champion's position, then see what they played.",
    points: ['18 World Champions, from Steinitz to Gukesh.', 'After your move, see what the champion played and how good yours was.'],
    free: `Free: ${A.challenge_session} session a day.`,
  },
];

const LIMITED = [
  ['Opening variations to learn', perDay(A.opening_variation)],
  ['Opening training sessions', perDay(A.opening_session)],
  ['Game reports', perDay(A.game_report)],
  ['Position explanations', perDay(A.explain_position)],
  ['Champion Challenge', perDay(A.challenge_session)],
] as const;

const ALWAYS_FREE = [
  'Puzzles, as many as you like',
  'Training plans',
  "Every World Champion's games and their best games",
  'Live broadcasts of the World Championship cycle',
  'Play online against other players',
  'Play the computer, from Beginner to Grandmaster',
  'Analysis board with Stockfish',
  'Chess news',
];

const FAQ = [
  ['Can I get my money back?', 'Yes. Any payment is refunded in full within 30 days, for any reason, from your account page. A refund ends Premium.'],
  ['How do I cancel?', 'From your account page. Premium stays until the end of the period you paid for.'],
  ['What if a renewal payment fails?', 'Paddle tries again for a short time. If it still fails, the subscription ends.'],
  ['What is the one-year option?', 'One payment for one year of Premium. It does not renew, so there is nothing to cancel.'],
  ["Why is my price different from a friend's?", 'Prices are set for each country and shown in your currency. Tax is included.'],
  ['When do the free limits reset?', 'Once a day. When you reach one, we show you when it is back, in your own time.'],
  ['What happens if I delete my account?', 'Premium ends at once and any subscription is cancelled. If you want a refund, ask for it first.'],
  ['Will the price go up?', 'If it ever changes, we email you at least 30 days before.'],
] as const;

const PLAN_KEYS: PlanKey[] = ['yearly', 'monthly', 'one_year'];

function day(sqliteUtc: string | null): string | null {
  if (!sqliteUtc) return null;
  const at = new Date(`${sqliteUtc.replace(' ', 'T')}Z`);
  return Number.isNaN(at.getTime()) ? null : at.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function PremiumPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { checked, settings, plans, state, stateKnown, purchased, message, buy } = usePremiumOffer();
  const country = useVisitorCountry();

  const live = Boolean(settings);
  /* The cards: Paddle's preview when checkout is live, else the table for the visitor's country. */
  const cards: ShownPlan[] | null = useMemo(() => {
    if (!checked) return null;
    if (live) return plans ? plansFromPaddle(plans) : null;
    return country === undefined ? null : plansForCountry(country);
  }, [checked, live, plans, country]);
  const save = cards ? savingPercent(cards) : null;

  /* The chosen plan: the one carried through sign-in (?plan=), else the first card. */
  const [selected, setSelected] = useState<PlanKey | null>(null);
  useEffect(() => {
    if (!cards || (selected && cards.some((c) => c.key === selected))) return;
    const asked = params.get('plan') as PlanKey | null;
    setSelected(asked && PLAN_KEYS.includes(asked) && cards.some((c) => c.key === asked) ? asked : defaultPlan(cards));
  }, [cards, params, selected]);
  const chosen = cards?.find((c) => c.key === selected) ?? null;
  const first = cards?.[0] ?? null;

  const hasPremium = Boolean(state?.premium);
  const canBuy = live && stateKnown && !hasPremium && !purchased && chosen !== null && chosen.priceId !== null;
  const buyLabel = user ? 'Buy' : 'Sign in to buy';

  const choose = (key: PlanKey) => {
    if (key === selected) return; // the chosen card clicked again is not a choice (#261 review)
    setSelected(key);
    logGA4Event({ name: 'premium_plan_selected', params: { plan: key } });
  };
  /* Arrow keys within the plan radio group: move the choice and the focus, wrapping (WAI-ARIA radio group). */
  const onPlanKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    if (!cards) return;
    const step = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (i + step + cards.length) % cards.length;
    choose(cards[next].key);
    (e.currentTarget.parentElement?.children[next] as HTMLElement | undefined)?.focus();
  };
  const onBuy = (control: 'plans' | 'sticky_bar') => {
    if (!chosen || !chosen.priceId) return;
    logGA4Event({ name: 'premium_buy_clicked', params: { plan: chosen.key, signed_in: Boolean(user), control } });
    if (user) void buy(chosen.priceId);
    else navigate(`/login?returnTo=${encodeURIComponent(`/premium?plan=${chosen.key}`)}`);
  };

  /* The phone's bar: once the plans have scrolled above the screen, and only when there is something to buy. */
  const plansRef = useRef<HTMLElement>(null);
  const [plansAbove, setPlansAbove] = useState(false);
  useEffect(() => {
    const el = plansRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setPlansAbove(!e.isIntersecting && e.boundingClientRect.top < 0));
    io.observe(el);
    return () => io.disconnect();
  }, []);
  /* R7: instant for a visitor who asked for reduced motion (the arrow's bounce is already motion-safe). */
  const scrollBehavior = (): ScrollBehavior =>
    (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth');
  const toPlans = () => plansRef.current?.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });

  /* The cue that the page goes on (owner): the hero fills the first screen and ends on it, and the
     arrow leads to the comparison, which follows the plans as on Notion's, Raycast's and chess.com's pages. */
  const unlocksRef = useRef<HTMLElement>(null);
  const toUnlocks = () => unlocksRef.current?.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });

  /* The legal line, rendered in one of two places by window height (B3). */
  const legalText = (
    <>
      {!live && 'Prices are set for each country and shown in your currency. '}
      {/* The reseller is named here only once checkout is live (owner, 2026-11-14); the Terms always name it. */}
      {live && 'Our order process is conducted by our online reseller Paddle.com, which is the Merchant of Record for all our orders. '}
      Prices include any sales tax or VAT. See the <Link to="/terms" className="text-link hover:underline">Terms of Service</Link>.
    </>
  );

  const ends = day(state?.periodEndsAt ?? null);
  const cancelling = state?.scheduledChange?.startsWith('cancel@') ?? false;
  const premiumLine = !hasPremium ? null
    : state?.kind === 'pass' ? `You have Premium${ends ? ` until ${ends}` : ''}.`
    : `You have Premium.${ends ? (cancelling ? ` It ends on ${ends}.` : ` It renews on ${ends}.`) : ''}`;

  return (
    <div className="premium-page relative bg-background text-foreground">
      <SeoHead routeKey="premium" />
      <GoldGradientDefs />

      {/* HERO WITH THE PLANS: the choice and the price on the first screen (owner, 2026-11-14) */}
      <section ref={plansRef} id="plans" data-premium="hero" data-cards={!hasPremium && cards?.length === 2 ? 2 : 3} aria-labelledby="premium-plans" className="premium-hero relative flex scroll-mt-16 flex-col overflow-hidden">
        <div className="pointer-events-none absolute inset-0" style={{
          background: 'radial-gradient(60% 70% at 78% 30%, hsl(var(--gold-bottom) / 0.20), transparent 60%), radial-gradient(40% 50% at 10% 0%, hsl(var(--gold-top) / 0.08), transparent 60%)',
        }} />
        <div className="v2-grain pointer-events-none absolute inset-0" />
        {/* The content row: top-anchored (its top spacing is .premium-hero-content in index.css), it
            fills the first screen so the arrow row sits at its foot. `content-start` keeps the grid's
            row at its content's height; the collage stays centred in it, as before (B0). Its width is
            fixed, not shrink-to-fit: centred with mx-auto in a flex column it took its content's width,
            so the layout moved sideways whenever the longest line changed (the legal line leaving on
            short windows, a holder's card: 984 against 1112px). 1112 = two 512px columns (the content's
            max-w-lg) + the 40px gap + 48px padding, the approved width at 1908 (B3). */}
        {/* SIZED FROM THE WINDOW'S HEIGHT (a scaled laptop, 2026-11-15): from md up every size in the
            first screen is a multiple of --pu, one design pixel, which shrinks when the window under the
            nav is shorter than the hero needs (index.css, .premium-hero-content). A 1920x1080 screen at
            ~190% is a 1012x530 window: in fixed pixels the hero needed 539px under a 484px nav-less
            window, cut the plans and looked oversized. Small text keeps a 12px floor (owner). Phones
            scroll and keep their sizes (--pu is 1px there). */}
        <div className="premium-hero-content relative mx-auto grid w-full max-w-[1112px] flex-1 content-start items-center gap-10 px-4 pb-4 md:max-w-[calc(1112*var(--pu))] md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:gap-[calc(40*var(--pu))] md:px-[calc(24*var(--pu))] wideshort:grid-cols-1">
          <div data-premium="content" className="min-w-0 self-start">
            <p className="mb-2 inline-flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.18em] text-link md:mb-[calc(8*var(--pu))] md:text-[length:max(12px,calc(12*var(--pu)))]">
              <Sparkles className="h-4 w-4 v2-gold-icon" fill="none" aria-hidden /> Chess Playbook
            </p>
            <h1 className="font-playfair text-[48px] font-semibold leading-[1.02] md:text-[length:calc(64*var(--pu))] short:text-[length:calc(52*var(--pu))]">
              <span className="v2-gold-text">Premium</span>
            </h1>
            <p className="mt-1 font-playfair text-[24px] leading-tight md:text-[length:calc(28*var(--pu))]">Train with no daily limits</p>
            <p className="mt-3 max-w-md text-[15px] leading-relaxed text-foreground/85 md:mt-[calc(12*var(--pu))] md:max-w-[calc(448*var(--pu))] md:text-[length:max(13px,calc(16*var(--pu)))]">
              Learn your openings, review your games and explain positions as often as you want.
            </p>
            <h2 id="premium-plans" className="sr-only">Choose your plan</h2>

            {hasPremium ? (
              <div data-premium="holder" className="v2-card-editorial mt-6 p-5 md:mt-[calc(24*var(--pu))]">
                <p className="text-[16px]">{premiumLine}</p>
                <Link to="/profile" className="mt-2 inline-block text-[15px] text-link hover:underline">Manage it on your account page</Link>
              </div>
            ) : (
              <div className="mt-6 max-w-lg md:mt-[calc(24*var(--pu))] md:max-w-[calc(512*var(--pu))]">
                {cards === null ? (
                  <p data-premium="loading" role="status" className="flex min-h-[204px] items-center text-[15px] text-foreground/75 md:min-h-[calc(204*var(--pu))]">{message ?? 'Loading prices…'}</p>
                ) : (
                  <div data-premium="plans" role="radiogroup" aria-label="Plans" className="flex flex-col gap-2.5 md:gap-[calc(10*var(--pu))]">
                    {cards.map((plan, i) => {
                      const on = plan.key === selected;
                      return (
                        <button
                          key={plan.key}
                          type="button"
                          role="radio"
                          aria-checked={on}
                          /* A radio group is one tab stop; the arrow keys move the choice (#261 review). */
                          tabIndex={on || (!selected && i === 0) ? 0 : -1}
                          onKeyDown={(e) => onPlanKey(e, i)}
                          onClick={() => choose(plan.key)}
                          data-plan={plan.key}
                          className="v2-card-glass flex w-full items-center gap-3 px-4 py-3 text-left transition md:gap-[calc(12*var(--pu))] md:px-[calc(16*var(--pu))] md:py-[calc(12*var(--pu))]"
                          style={on ? { boxShadow: 'inset 0 0 0 2px hsl(var(--primary)), 0 12px 30px hsl(var(--background) / 0.55), 0 0 28px hsl(var(--primary) / 0.16)' } : undefined}
                        >
                          <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full md:h-[calc(20*var(--pu))] md:w-[calc(20*var(--pu))] ${on ? 'bg-primary text-primary-foreground' : 'ring-1 ring-border-strong'}`}>
                            {on && <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <span className="text-[15px] font-semibold md:text-[length:max(13px,calc(15*var(--pu)))]">{plan.title}</span>
                              {plan.key === 'yearly' && save !== null && (
                                <span className="v2-btn-gold px-2 py-0.5 text-[11px] font-semibold md:text-[length:max(11px,calc(11*var(--pu)))]">Save {save}% against paying monthly</span>
                              )}
                            </span>
                            <span className="mt-0.5 block text-[13px] text-foreground/70 md:text-[length:max(12px,calc(13*var(--pu)))]">{plan.terms}</span>
                          </span>
                          <span className="shrink-0 text-right">
                            <span className="block font-playfair text-[26px] font-semibold leading-none tabular-nums md:text-[length:calc(26*var(--pu))]">{plan.price}</span>
                            <span className="text-[13px] text-foreground/70 md:text-[length:max(12px,calc(13*var(--pu)))]">{plan.unit}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="mt-4 flex flex-col gap-2 md:mt-[calc(16*var(--pu))]">
                  {live ? (
                    <button
                      type="button"
                      data-premium="action"
                      onClick={() => onBuy('plans')}
                      disabled={!canBuy}
                      className="v2-btn-gold h-12 w-full text-[16px] font-semibold disabled:cursor-wait disabled:opacity-60 md:h-[calc(48*var(--pu))] md:text-[length:max(14px,calc(16*var(--pu)))]"
                    >
                      {chosen ? `${buyLabel}: ${chosen.price} ${chosen.unit}` : buyLabel}
                    </button>
                  ) : (
                    <p data-premium="action" className="w-full rounded-full px-4 py-3 text-center text-[15px] font-semibold text-foreground/85 ring-1 ring-primary/50 md:py-[calc(12*var(--pu))] md:text-[length:max(13px,calc(15*var(--pu)))]">
                      You can buy Premium here soon.
                    </p>
                  )}
                  {cards !== null && message && <p role="status" className="text-[13px] text-foreground/85">{message}</p>}
                  <p data-premium="refund" className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-foreground/80 md:text-[length:max(12px,calc(13*var(--pu)))]">
                    <Link to="/refund-policy" className="inline-flex items-center gap-1.5 hover:text-link">
                      <ShieldCheck className="h-4 w-4 v2-gold-icon" fill="none" aria-hidden /> Full refund within 30 days, for any reason.
                    </Link>
                    {live && !user && <span>A free account is all you need.</span>}
                  </p>
                  {/* Under the button only where the first screen has room (B3). */}
                  <p data-premium="legal" className="hidden text-[12px] leading-relaxed text-muted-foreground md:text-[length:max(12px,calc(12*var(--pu)))] tall-only:block">{legalText}</p>
                </div>
              </div>
            )}
          </div>

          <div data-premium="collage" className="relative hidden h-[460px] md:block md:h-[calc(460*var(--pu))] wideshort:hidden" aria-hidden>
            <div className="absolute inset-x-6 bottom-2 top-10 rounded-full blur-3xl" style={{ background: 'hsl(var(--gold-bottom) / 0.18)' }} />
            <img src={img('trainer')} alt="" width={1737} height={1191} className="v2-ring-warm absolute left-0 top-0 w-[88%] -rotate-[2deg] rounded-xl shadow-[0_30px_60px_rgba(0,0,0,0.55)]" />
            <img src={img('report-seesaw')} alt="" width={768} height={1085} className="v2-ring-warm absolute bottom-0 right-0 h-auto w-[40%] rotate-[3deg] rounded-xl shadow-[0_30px_60px_rgba(0,0,0,0.6)]" />
          </div>
        </div>
        {/* MORE BELOW (owner): the homepage's arrow, in its own row at the foot of the first screen, to
            the comparison. In flow, so it can never cover the content. Not rendered (so not focusable)
            where its tier does not hold it: the shortest and wide short windows, where the content cut
            by the fold is the cue (owner decision 2), and phones shorter than `phonearrow`. The tiers
            depend on the number of plan cards (data-cards on the hero); the rules are .premium-arrow-row
            in index.css. */}
        <div className="premium-arrow-row relative h-[52px] items-center justify-center md:h-[80px]">
          <button
            type="button"
            onClick={toUnlocks}
            data-premium="arrow"
            aria-label="Scroll to compare Free and Premium"
            className="flex flex-col items-center gap-1 md:gap-1.5"
          >
            <span className="hidden text-[11px] font-semibold uppercase tracking-[0.18em] text-link md:inline md:text-[length:max(11px,calc(11*var(--pu)))]">Compare Free and Premium</span>
            <span className="v2-arrow v2-arrow-lg motion-safe:animate-bounce [animation-duration:2.2s]">
              <ChevronDown className="h-5 w-5 v2-gold-icon" fill="none" aria-hidden />
            </span>
          </button>
        </div>
      </section>

      {/* The same legal line just after the first screen, on short windows and phones (owner decisions
          1 and 4): the refund line stays by the button. Exactly one of the two renderings shows. */}
      {!hasPremium && (
        <div className="mx-auto w-full max-w-[1112px] px-4 pt-2 md:max-w-[calc(1112*var(--pu))] md:px-[calc(24*var(--pu))] tall-only:hidden">
          <p data-premium="legal" className="max-w-lg text-[12px] leading-relaxed text-muted-foreground md:max-w-[calc(512*var(--pu))] md:text-[length:max(12px,calc(12*var(--pu)))]">{legalText}</p>
        </div>
      )}

      {/* FREE AND PREMIUM */}
      <section ref={unlocksRef} aria-labelledby="premium-compare" className="mx-auto max-w-3xl scroll-mt-16 px-4 py-10 md:max-w-[calc(768*var(--pv))] md:px-[calc(24*var(--pv))] md:py-[calc(56*var(--pv))]">
        <h2 id="premium-compare" data-premium="compare-heading" className="text-center font-playfair text-[30px] font-semibold md:text-[length:calc(40*var(--pv))]">Free and Premium</h2>
        <div className="v2-card-editorial mt-8 overflow-hidden md:mt-[calc(32*var(--pv))]">
          <table className="premium-compare w-full text-left text-[14px] md:text-[length:calc(15*var(--pv))]">
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className="p-4 font-normal"><span className="sr-only">Feature</span></th>
                <th scope="col" className="p-4 font-semibold text-foreground/80">Free</th>
                <th scope="col" className="p-4 font-semibold text-link" style={{ background: 'hsl(var(--primary) / 0.08)' }}>Premium</th>
              </tr>
            </thead>
            <tbody>
              {LIMITED.map(([f, free]) => (
                <tr key={f} className="border-b border-border">
                  <th scope="row" className="p-4 font-normal">{f}</th>
                  <td className="whitespace-nowrap p-4 text-foreground/70">{free}</td>
                  <td className="p-4 font-semibold" style={{ background: 'hsl(var(--primary) / 0.08)' }}>
                    <span className="inline-flex items-center gap-2"><Check className="h-4 w-4 text-link" strokeWidth={3} aria-hidden />Unlimited</span>
                  </td>
                </tr>
              ))}
              <tr className="border-b border-border">
                <th scope="rowgroup" colSpan={3} className="px-4 pb-3 pt-6 text-left">
                  <span className="font-playfair text-[20px] font-semibold md:text-[length:calc(20*var(--pv))]">Free for everyone</span>
                  <span className="mt-1 block text-[13px] font-normal text-foreground/70 md:text-[length:calc(13*var(--pv))]">No limits, with or without an account.</span>
                </th>
              </tr>
              {ALWAYS_FREE.map((f) => (
                <tr key={f} className="border-b border-border last:border-0">
                  <th scope="row" className="p-4 font-normal">{f}</th>
                  <td className="p-4"><Check className="h-4 w-4 text-foreground/80" strokeWidth={3} role="img" aria-label="Included" /></td>
                  <td className="p-4" style={{ background: 'hsl(var(--primary) / 0.08)' }}><Check className="h-4 w-4 text-link" strokeWidth={3} role="img" aria-label="Included" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* WHAT PREMIUM UNLOCKS */}
      <section aria-labelledby="premium-unlocks" className="mx-auto max-w-6xl px-4 py-10 md:max-w-[calc(1152*var(--pv))] md:px-[calc(24*var(--pv))] md:py-[calc(64*var(--pv))]">
        <h2 id="premium-unlocks" className="text-center font-playfair text-[30px] font-semibold md:text-[length:calc(40*var(--pv))]">What Premium unlocks</h2>
        <div className="mt-10 flex flex-col gap-8 md:mt-[calc(40*var(--pv))] md:gap-[calc(56*var(--pv))]">
          {BENEFITS.map((b, i) => (
            <div key={b.title} className={`grid items-center gap-6 md:grid-cols-2 md:gap-[calc(48*var(--pv))] ${i % 2 ? 'md:[&>*:first-child]:order-2' : ''}`}>
              {/* A picture never taller than the window (2026-11-15): sized by width alone, the portrait
                  game report was 1.01 of a 1524x731 window and 1.19 of a 1012x530 one, its text centred
                  in the middle of it. The card shrinks to the picture. */}
              {b.layers ? (
                /* The board, with the reasons' card over its corner (as /explain's hero does), so the
                   reasons stay readable: ~13px at 1524 wide, where the whole trainer put them at ~7px. The
                   card hangs below rank 4, so the pieces the reasons name (Ne5, c6, g4, f7, Qa4) stay visible. */
                <div className="relative mx-auto w-full max-w-[min(100%,calc(70vh*1.2))] pb-[24%]" role="img" aria-label={`${b.title} on Chess Playbook`}>
                  <div className="v2-card-editorial w-[70%] overflow-hidden p-2 shadow-[0_24px_50px_rgba(0,0,0,0.45)]">
                    <img src={img(b.layers[0])} alt="" loading="lazy" decoding="async" className="block h-auto w-full rounded-lg" />
                  </div>
                  <img src={img(b.layers[1])} alt="" loading="lazy" decoding="async" className="v2-ring-warm absolute bottom-0 right-0 h-auto w-[80%] rounded-xl md:w-[58%] shadow-[0_30px_60px_rgba(0,0,0,0.6)]" />
                </div>
              ) : (
                <div className="v2-card-editorial mx-auto w-fit max-w-full overflow-hidden p-2 shadow-[0_24px_50px_rgba(0,0,0,0.45)]">
                  <img src={img(b.img)} alt={`${b.title} on Chess Playbook`} loading="lazy" decoding="async" className="block h-auto max-h-[min(70vh,calc(640*var(--pv)))] w-auto max-w-full rounded-lg" />
                </div>
              )}
              <div>
                <span className="v2-arrow v2-arrow-lg mb-4"><b.icon className="h-5 w-5 v2-gold-icon" fill="none" aria-hidden /></span>
                <h3 className="font-playfair text-[26px] font-semibold leading-tight md:text-[length:calc(32*var(--pv))]">{b.title}</h3>
                <p className="mt-3 max-w-md text-[16px] leading-relaxed text-foreground/85 md:max-w-[calc(448*var(--pv))] md:text-[length:calc(16*var(--pv))]">{b.line}</p>
                <ul className="mt-4 max-w-md space-y-2 text-[15px] leading-snug text-foreground/80 md:max-w-[calc(448*var(--pv))] md:text-[length:calc(15*var(--pv))]">
                  {b.points.map((pt) => (
                    <li key={pt} className="flex gap-2.5"><Check className="mt-0.5 h-4 w-4 shrink-0 text-link" strokeWidth={3} aria-hidden />{pt}</li>
                  ))}
                </ul>
                <div className="mt-4 flex flex-wrap gap-2 text-[13px] md:text-[length:calc(13*var(--pv))]">
                  <span className="rounded-full px-3 py-1 text-foreground/75 ring-1 ring-border">{b.free}</span>
                  <span className="rounded-full px-3 py-1 font-semibold text-link ring-1 ring-primary/50">Premium: unlimited</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* QUESTIONS */}
      <section aria-labelledby="premium-questions" className="mx-auto max-w-3xl px-4 py-10 md:max-w-[calc(768*var(--pv))] md:px-[calc(24*var(--pv))] md:py-[calc(56*var(--pv))]">
        <h2 id="premium-questions" className="text-center font-playfair text-[30px] font-semibold md:text-[length:calc(40*var(--pv))]">Questions</h2>
        <div className="mt-8 divide-y divide-border border-y border-border">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[16px] font-semibold md:text-[length:calc(16*var(--pv))] [&::-webkit-details-marker]:hidden">
                {q}
                <ChevronDown className="h-5 w-5 shrink-0 text-link transition-transform group-open:rotate-180" aria-hidden />
              </summary>
              <p className="mt-3 text-[15px] leading-relaxed text-foreground/80 md:text-[length:calc(15*var(--pv))]">{a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* CLOSING BAND */}
      <section className="mx-auto max-w-6xl px-4 pb-24 md:max-w-[calc(1152*var(--pv))] md:px-[calc(24*var(--pv))] md:pb-[calc(80*var(--pv))]">
        <div className="v2-card-editorial v2-glow-panel flex flex-col items-center gap-5 px-6 py-12 text-center">
          <p className="font-playfair text-[28px] font-semibold leading-tight md:text-[length:calc(36*var(--pv))]">Train as much as you want, every day.</p>
          <button type="button" onClick={toPlans} className="v2-btn-gold inline-flex h-12 items-center px-7 text-[15px] font-semibold md:h-[calc(48*var(--pv))] md:text-[length:calc(15*var(--pv))]">Choose your plan</button>
        </div>
      </section>

      {/* PHONE BAR: only with something to buy */}
      {canBuy && chosen && (
        <div className={`fixed inset-x-0 bottom-0 z-40 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] transition-transform md:hidden ${plansAbove ? 'translate-y-0' : 'translate-y-full'}`}>
          <div className="v2-card-glass flex items-center justify-between gap-3 px-4 py-3">
            <span className="text-[15px]"><span className="font-semibold tabular-nums">{chosen.price}</span> <span className="text-foreground/75">{chosen.unit}</span></span>
            <button type="button" onClick={() => onBuy('sticky_bar')} className="v2-btn-gold h-10 px-5 text-[14px] font-semibold">{buyLabel}</button>
          </div>
        </div>
      )}
    </div>
  );
}
