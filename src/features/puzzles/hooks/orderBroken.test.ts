import { describe, expect, it } from 'vitest';

import type { PlanItem, TrainingPlan } from '../services/PlanApi';
import { orderBroken } from './usePlan';

const item = (scheduledOn: string, kind: PlanItem['kind'], status: PlanItem['status'] = 'pending'): PlanItem => ({
  id: `${scheduledOn}-${kind}`, scheduledOn, ordinal: 0, area: kind === 'review' ? 'mixed' : 'tactics',
  total: 25, kind, sessionId: null, status,
});
const plan = (items: PlanItem[]) => ({ id: 'p', status: 'active', items } as unknown as TrainingPlan);

describe('orderBroken (#549)', () => {
  it('is true for training after a pending review: the order the old reflow left', () => {
    expect(orderBroken(plan([item('2026-11-24', 'review'), item('2026-11-26', 'training')]))).toBe(true);
  });
  it('is false when the review is last', () => {
    expect(orderBroken(plan([item('2026-11-24', 'training'), item('2026-11-26', 'review')]))).toBe(false);
  });
  it('is false when the review was started early: the player chose that', () => {
    expect(orderBroken(plan([item('2026-11-24', 'review', 'abandoned'), item('2026-11-26', 'training')]))).toBe(false);
  });
  it('is false for a plan with no review', () => {
    expect(orderBroken(plan([item('2026-11-24', 'training')]))).toBe(false);
  });
});
