/**
 * #521: a free player's plan session holds at most 20 positions (owner, option 1). Setup offers 10, 15 and 20 and
 * brings a longer value down; the next day is counted at the cap, and says so when a stored day was longer.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PlanSetup } from './PlanSetup';
import { deriveNext } from '../../hooks/usePlan';
import type { TrainingPlan } from '../../services/PlanApi';

const setup = (positions: number, cap: number | null, onPick = vi.fn()) => {
  render(
    <PlanSetup
      sessionsPerWeek={3} positionsPerSession={positions} weeks={4}
      onSessionsPerWeek={() => {}} onPositionsPerSession={onPick} onWeeks={() => {}}
      onGenerate={() => {}} onCancel={() => {}} sessionCap={cap}
    />,
  );
  return onPick;
};
const chips = () => screen.getAllByRole('button', { pressed: false })
  .concat(screen.queryAllByRole('button', { pressed: true }))
  .map(b => b.textContent)
  .filter(t => /^\d+$/.test(t ?? ''))
  .map(Number);

describe('plan setup for a free player (#521)', () => {
  it('offers 10, 15 and 20, and brings 25 down to 20', () => {
    const onPick = setup(25, 20);
    expect(chips()).toEqual(expect.arrayContaining([10, 15, 20]));
    expect(chips()).not.toContain(40);
    expect(onPick).toHaveBeenCalledWith(20);
  });

  it('with no cap (Premium, or the switch off) the shortcuts are 15, 25 and 40, and nothing moves', () => {
    const onPick = setup(25, null);
    expect(chips()).toEqual(expect.arrayContaining([15, 25, 40]));
    expect(onPick).not.toHaveBeenCalled();
  });
});

describe('the next plan day for a free player (#521)', () => {
  const plan = {
    id: 'p', status: 'active',
    items: [
      { id: 'a', scheduledOn: '2026-11-27', status: 'pending', total: 40, area: 'tactics', kind: 'training' },
      { id: 'b', scheduledOn: '2026-11-27', status: 'pending', total: 10, area: 'endgame', kind: 'training' },
    ],
  } as unknown as TrainingPlan;

  it('counts each block at the cap and says it was shortened', () => {
    expect(deriveNext(plan, 20)).toMatchObject({ nextDayTotal: 30, nextDayShortened: true });
  });
  it('with no cap, the stored day', () => {
    expect(deriveNext(plan)).toMatchObject({ nextDayTotal: 50, nextDayShortened: false });
  });
});
