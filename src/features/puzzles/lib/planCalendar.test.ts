import { describe, expect, it } from 'vitest';

import type { PlanItem, TrainingPlan } from '../services/PlanApi';
import {
  buildPlanCalendar, calendarBlocksForDay, collapseEmptyWeeks, groupPlanItemsByDay, weeksWithSessions,
} from './planCalendar';

function item(overrides: Partial<PlanItem> = {}): PlanItem {
  return {
    id: 'item-1',
    scheduledOn: '2026-08-07',
    ordinal: 0,
    area: 'tactics',
    total: 25,
    kind: 'training',
    sessionId: null,
    status: 'pending',
    ...overrides,
  };
}

function plan(items: PlanItem[], overrides: Partial<TrainingPlan> = {}): TrainingPlan {
  return {
    id: 'plan-1',
    status: 'active',
    sessionsPerWeek: 3,
    positionsPerSession: 25,
    startsOn: '2026-08-07',
    endsOn: '2026-09-03',
    targetEvent: null,
    createdAt: '2026-08-07T08:00:00Z',
    endedAt: null,
    items,
    progress: {
      items: items.length,
      completed: items.filter(entry => entry.status === 'completed').length,
      positions: items.reduce((sum, entry) => sum + entry.total, 0),
      positionsDone: 0,
      finished: false,
    },
    ...overrides,
  };
}

describe('plan calendar grouping', () => {
  it('keeps calendar weeks Monday–Sunday with inert days before a mid-week start', () => {
    const weeks = buildPlanCalendar(plan([item()]), '2026-08-07');
    expect(weeks[0].startsOn).toBe('2026-08-03');
    expect(weeks[0].days.map(day => day.iso)).toEqual([
      '2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06',
      '2026-08-07', '2026-08-08', '2026-08-09',
    ]);
    expect(weeks[0].days.slice(0, 4).every(day => !day.inPlan && !day.isRest)).toBe(true);
    expect(weeks[0].days[4].isToday).toBe(true);
  });

  it('crosses month boundaries without shifting calendar dates', () => {
    const weeks = buildPlanCalendar(plan([
      item({ scheduledOn: '2026-08-31' }),
      item({ id: 'item-2', scheduledOn: '2026-09-02' }),
    ], { startsOn: '2026-08-31', endsOn: '2026-09-06' }));
    expect(weeks).toHaveLength(1);
    expect(weeks[0].days[0].iso).toBe('2026-08-31');
    expect(weeks[0].days[6].iso).toBe('2026-09-06');
  });

  it('orders multiple blocks on a bunched day by ordinal', () => {
    const items = [
      item({ id: 'later', ordinal: 1, area: 'endgame' }),
      item({ id: 'first', ordinal: 0, area: 'tactics' }),
    ];
    expect(groupPlanItemsByDay(items).get('2026-08-07')?.map(entry => entry.id))
      .toEqual(['first', 'later']);
    expect(calendarBlocksForDay(items).map(block => block.key)).toEqual(['first', 'later']);
  });

  it('collapses the final review into one mixed block with the full day total', () => {
    const review = [
      item({ id: 'r1', kind: 'review', area: 'tactics', total: 8, status: 'completed' }),
      item({ id: 'r2', kind: 'review', area: 'middlegame', total: 8, ordinal: 1, status: 'completed' }),
      item({ id: 'r3', kind: 'review', area: 'endgame', total: 9, ordinal: 2, status: 'completed' }),
    ];
    expect(calendarBlocksForDay(review)).toMatchObject([{
      area: 'mixed', total: 25, kind: 'review', status: 'completed',
    }]);
  });

  it('marks empty in-plan dates as rest and reports zero progress for an untouched week', () => {
    const weeks = buildPlanCalendar(plan([item()]));
    expect(weeks[0].days.find(day => day.iso === '2026-08-08')?.isRest).toBe(true);
    expect(weeks[0].completedItems).toBe(0);
    expect(weeks[0].totalItems).toBe(1);
  });
});

describe('collapsed empty weeks (#549)', () => {
  // The owner's plan: started 25 Aug, every session moved to 24 Nov - 19 Dec.
  const moved = ['2026-11-24', '2026-11-26', '2026-11-28', '2026-12-01', '2026-12-03', '2026-12-19']
    .map((scheduledOn, n) => item({ id: `m-${n}`, scheduledOn }));
  const owners = plan(moved, { startsOn: '2026-08-25', endsOn: '2026-12-19' });

  it('folds the weeks before the first session into one row', () => {
    const weeks = buildPlanCalendar(owners, '2026-11-27');
    expect(weeks).toHaveLength(17);
    const rows = collapseEmptyWeeks(weeks);
    expect(rows[0]).toEqual({ kind: 'gap', from: '2026-08-25', to: '2026-11-22', weeks: 13 });
    expect(rows[1]).toMatchObject({ kind: 'week', label: 1 });
    expect(rows[1].kind === 'week' && rows[1].week.startsOn).toBe('2026-11-23');
  });

  it('folds a gap in the middle too, and numbers only the weeks drawn', () => {
    const rows = collapseEmptyWeeks(buildPlanCalendar(owners, '2026-11-27'));
    // Weeks of 30 Nov and 14 Dec have sessions; 7 Dec does not.
    const kinds = rows.map(row => row.kind === 'gap' ? `gap:${row.weeks}` : `W${row.label}`);
    expect(kinds).toEqual(['gap:13', 'W1', 'W2', 'gap:1', 'W3']);
  });

  it('never folds the week holding today', () => {
    const rows = collapseEmptyWeeks(buildPlanCalendar(owners, '2026-10-07'));
    expect(rows.some(row => row.kind === 'week' && row.week.days.some(day => day.isToday))).toBe(true);
  });

  it('leaves a plan without gaps as it was', () => {
    const fresh = plan([item({ scheduledOn: '2026-08-10' }), item({ id: 'b', scheduledOn: '2026-08-17' })],
      { startsOn: '2026-08-10', endsOn: '2026-08-23' });
    const rows = collapseEmptyWeeks(buildPlanCalendar(fresh, '2026-08-09'));
    expect(rows.map(row => row.kind)).toEqual(['week', 'week']);
  });

  it('counts the weeks that hold a session as the plan length', () => {
    expect(weeksWithSessions(buildPlanCalendar(owners, '2026-11-27'))).toBe(3);
  });
});
