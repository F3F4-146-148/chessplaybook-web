/**
 * THE PLAN CARDS, SHARED (#467 plan B1). The radio cards of /premium, now also on /membership: the owner's rule
 * (2026-11-24, M9) is that a second page shows the plans only through /premium's own component, never a copy,
 * so prices, currencies and wording cannot drift (the 2026-11-15 "one place sells" incident).
 *
 * CONTROLLED. The cards render what `usePlanChoice` holds; the page owns one choice and hands it to every part
 * that needs it (/premium: the cards, Buy and the phone's bar). Two calls of the hook on one page would be two
 * different choices.
 *
 * Sizes are /premium's own classes, multiples of `--pu` (index.css): a page that is not /premium's hero sets
 * `--pu: 1px` on a wrapper to get the design sizes. Moved from PremiumPage.tsx unchanged, markup and classes
 * character for character (B1's proof: /premium pixel- and HTML-identical).
 */
import { useEffect, useState, type KeyboardEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Check } from 'lucide-react';
import { logGA4Event } from '@/services/analytics';
import { defaultPlan, plansForCountry, plansFromPaddle, savingPercent, type PlanKey, type ShownPlan } from './premiumPlans';
import type { PaymentsProvider, Plans } from './paddleCheckout';

const PLAN_KEYS: PlanKey[] = ['yearly', 'monthly', 'one_year'];

/**
 * The visitor's cards: Paddle's preview when Paddle sells, else the table for the visitor's country (Stripe's
 * prices, and the prices before launch). null while unknown. One function for every page that shows them.
 */
export function planCards(checked: boolean, provider: PaymentsProvider | null, plans: Plans | null, country: string | null | undefined): ShownPlan[] | null {
  if (!checked) return null;
  if (provider === 'paddle') return plans ? plansFromPaddle(plans) : null;
  return country === undefined ? null : plansForCountry(country);
}

export interface PlanChoice {
  selected: PlanKey | null;
  chosen: ShownPlan | null;
  choose: (key: PlanKey) => void;
  onPlanKey: (e: KeyboardEvent<HTMLButtonElement>, i: number) => void;
}

/**
 * The chosen plan: the one carried through sign-in (?plan=), else the first card (defaultPlan). `locked`: while a
 * purchase opens or waits, the plan being bought stays the plan shown (Codex review; owner, while waiting).
 */
export function usePlanChoice(cards: ShownPlan[] | null, { locked = false }: { locked?: boolean } = {}): PlanChoice {
  const [params] = useSearchParams();
  const [selected, setSelected] = useState<PlanKey | null>(null);
  useEffect(() => {
    if (!cards || (selected && cards.some((c) => c.key === selected))) return;
    const asked = params.get('plan') as PlanKey | null;
    setSelected(asked && PLAN_KEYS.includes(asked) && cards.some((c) => c.key === asked) ? asked : defaultPlan(cards));
  }, [cards, params, selected]);
  const chosen = cards?.find((c) => c.key === selected) ?? null;

  const choose = (key: PlanKey) => {
    if (key === selected) return; // the chosen card clicked again is not a choice (#261 review)
    if (locked) return; // the plan being bought stays the plan shown (Codex review; owner, while waiting)
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
  return { selected, chosen, choose, onPlanKey };
}

export function PlanCards({ cards, choice, disabled }: { cards: ShownPlan[]; choice: PlanChoice; disabled: boolean }) {
  const { selected, choose, onPlanKey } = choice;
  const save = savingPercent(cards);
  return (
    <div data-premium="plans" role="radiogroup" aria-label="Plans" className="flex flex-col gap-2.5 md:gap-[calc(10*var(--pu))]">
      {cards.map((plan, i) => {
        const on = plan.key === selected;
        return (
          <button
            key={plan.key}
            type="button"
            role="radio"
            aria-checked={on}
            aria-disabled={disabled || undefined}
            /* A radio group is one tab stop; the arrow keys move the choice (#261 review). */
            tabIndex={on || (!selected && i === 0) ? 0 : -1}
            onKeyDown={(e) => onPlanKey(e, i)}
            onClick={() => choose(plan.key)}
            data-plan={plan.key}
            className="v2-card-glass flex w-full items-center gap-3 px-4 py-3 text-left transition aria-disabled:cursor-not-allowed aria-disabled:opacity-60 md:gap-[calc(12*var(--pu))] md:px-[calc(16*var(--pu))] md:py-[calc(12*var(--pu))]"
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
  );
}
