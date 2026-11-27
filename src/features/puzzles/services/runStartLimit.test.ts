/**
 * #521: a run or a plan day refused because today's free puzzles are used up. The limit is reported (the site's
 * dialog) and the error carries it with the plain sentence the card shows, never the server's `daily_limit` code.
 * A refusal of a request with no identity is an ordinary failed request.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const headers = vi.hoisted(() => ({ value: { 'X-Anonymous-Id': 'anon-1' } as Record<string, string> }));
const reported = vi.hoisted(() => ({ reportDailyLimit: vi.fn() }));
vi.mock('@/features/auth/utils/getAuthToken', () => ({ getRequestHeaders: async () => headers.value }));
vi.mock('@/services/freePlanLimit', async (original) => ({ ...(await original<object>()), ...reported }));

import { SessionApiError, startSession } from './PuzzleSessionApi';
import { PlanApiError, startPlanItem } from './PlanApi';

const refusal = { success: false, error: 'daily_limit', feature: 'puzzle', limit: 5, resetsAt: '2026-11-26T22:00:00Z' };
const limit = { feature: 'puzzle', limit: 5, resetsAt: refusal.resetsAt };
const answer = (status: number, body: unknown) =>
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status })));
const caught = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => e);

describe('a refused run or plan day (#521)', () => {
  beforeEach(() => { headers.value = { 'X-Anonymous-Id': 'anon-1' }; reported.reportDailyLimit.mockReset(); });
  afterEach(() => vi.unstubAllGlobals());

  it('a run: the limit is reported and the error says it plainly', async () => {
    answer(402, refusal);
    const error = await caught(startSession({ total: 10, selection: 'adaptive' })) as SessionApiError;
    expect(error).toBeInstanceOf(SessionApiError);
    expect(error.limit).toEqual(limit);
    expect(error.message).toMatch(/^You've used today's 5 free puzzles\./);
    expect(error.message).not.toContain('daily_limit');
    expect(reported.reportDailyLimit).toHaveBeenCalledWith(limit);
  });

  it('a plan day: the limit is reported and the error says it plainly', async () => {
    answer(402, refusal);
    const error = await caught(startPlanItem('plan-1', 'item-1')) as PlanApiError;
    expect(error).toBeInstanceOf(PlanApiError);
    expect(error.limit).toEqual(limit);
    expect(error.message).toMatch(/^You've used today's 5 free puzzles\./);
    expect(reported.reportDailyLimit).toHaveBeenCalledWith(limit);
  });

  it('no identity sent: an ordinary failure, not the limit', async () => {
    headers.value = {};
    answer(402, refusal);
    const error = await caught(startSession({ total: 10 })) as SessionApiError;
    expect(error.limit).toBeNull();
    expect(reported.reportDailyLimit).not.toHaveBeenCalled();
  });

  it('a run already going is still the 409 with the run to resume', async () => {
    answer(409, { success: false, error: 'A session is already active', data: { id: 'run-1' } });
    const error = await caught(startSession({ total: 10 })) as SessionApiError;
    expect(error.status).toBe(409);
    expect(error.active).toEqual({ id: 'run-1' });
    expect(reported.reportDailyLimit).not.toHaveBeenCalled();
  });
});
