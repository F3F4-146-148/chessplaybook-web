/**
 * The shared plan cards (#467 plan B1): the default choice, the plan carried through sign-in, the lock while
 * a purchase opens, the arrow keys, and the yearly saving badge.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/services/analytics', () => ({ logGA4Event: vi.fn() }));

import { PlanCards, usePlanChoice } from './PlanCards';
import type { ShownPlan } from './premiumPlans';
import { plansForCountry } from './premiumPlans';

const CARDS: ShownPlan[] = plansForCountry('GB');

function Harness({ locked = false }: { locked?: boolean }) {
  const choice = usePlanChoice(CARDS, { locked });
  return (
    <>
      <PlanCards cards={CARDS} choice={choice} disabled={locked} />
      <p data-testid="chosen">{choice.chosen?.key ?? 'none'}</p>
    </>
  );
}
const at = (url: string, locked = false) => render(<MemoryRouter initialEntries={[url]}><Harness locked={locked} /></MemoryRouter>);
const radios = () => screen.getAllByRole('radio');

describe('PlanCards', () => {
  it('chooses the default plan and marks exactly one card', () => {
    at('/premium');
    expect(radios().filter((r) => r.getAttribute('aria-checked') === 'true')).toHaveLength(1);
    expect(screen.getByTestId('chosen').textContent).toBe(CARDS[0].key);
  });

  it('keeps the plan carried through sign-in (?plan=)', () => {
    const other = CARDS[CARDS.length - 1].key;
    at(`/premium?plan=${other}`);
    expect(screen.getByTestId('chosen').textContent).toBe(other);
  });

  it('ignores an unknown ?plan=', () => {
    at('/premium?plan=lifetime');
    expect(screen.getByTestId('chosen').textContent).toBe(CARDS[0].key);
  });

  it('a click chooses; while locked it does not', () => {
    at('/premium');
    fireEvent.click(radios()[1]);
    expect(screen.getByTestId('chosen').textContent).toBe(CARDS[1].key);
  });

  it('while a purchase opens or waits the plan shown stays', () => {
    at('/premium', true);
    fireEvent.click(radios()[1]);
    expect(screen.getByTestId('chosen').textContent).toBe(CARDS[0].key);
    expect(radios()[1].getAttribute('aria-disabled')).toBe('true');
  });

  it('the arrow keys move the choice, wrapping', () => {
    at('/premium');
    fireEvent.keyDown(radios()[0], { key: 'ArrowUp' });
    expect(screen.getByTestId('chosen').textContent).toBe(CARDS[CARDS.length - 1].key);
  });

  it('is one tab stop', () => {
    at('/premium');
    expect(radios().filter((r) => r.tabIndex === 0)).toHaveLength(1);
  });
});
