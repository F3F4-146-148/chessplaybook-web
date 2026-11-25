import { describe, expect, it } from 'vitest';
import type { PremiumState } from '../paddleCheckout';
import { membershipBlocks, type MembershipInput } from './membershipBlocks';

const NONE = { available: null, pending: false };
const free = { premium: false, kind: null, status: null, periodEndsAt: null, scheduledChange: null, purchasePending: false, refund: NONE, entitled: false, grant: null } as unknown as PremiumState;
const sub = { ...free, premium: true, kind: 'subscription', status: 'active', periodEndsAt: '2027-11-23 12:00:00.000', entitled: true } as PremiumState;
const at = (over: Partial<MembershipInput>): MembershipInput => ({ signedIn: true, provider: 'stripe', state: free, known: true, failed: false, ...over });
const s = (o: Record<string, unknown>) => ({ ...free, ...o }) as unknown as PremiumState;

describe('membershipBlocks, every combination that can occur', () => {
  it('free, signed in: the status (free plan), then the plans', () => {
    expect(membershipBlocks(at({}))).toEqual(['status', 'plans', 'compare']);
  });
  it('a guest: sign in, the plans', () => {
    expect(membershipBlocks(at({ signedIn: false, state: null, known: false }))).toEqual(['signIn', 'plans', 'compare']);
  });
  it('a failed lookup: says so, offers nothing', () => {
    expect(membershipBlocks(at({ state: null, known: false, failed: true }))).toEqual(['couldNotCheck', 'compare']);
  });
  it('still loading: nothing about the account yet, nothing to buy', () => {
    expect(membershipBlocks(at({ state: null, known: false }))).toEqual(['compare']);
  });
  it('paid, active / cancelling / past due: status and what Premium includes, no plans', () => {
    for (const state of [sub, s({ ...sub, scheduledChange: 'cancel@x' }), s({ ...sub, status: 'past_due' })]) {
      expect(membershipBlocks(at({ state }))).toEqual(['status', 'includes', 'compare']);
    }
  });
  it('a pass: no plans', () => {
    expect(membershipBlocks(at({ state: s({ premium: true, kind: 'pass', entitled: true }) }))).toEqual(['status', 'includes', 'compare']);
  });
  it('refund available or requested, with and without a grant: no plans while paid Premium lasts', () => {
    expect(membershipBlocks(at({ state: s({ ...sub, refund: { available: { until: 'x' }, pending: false } }) }))).toEqual(['status', 'includes', 'compare']);
    expect(membershipBlocks(at({ state: s({ ...sub, refund: { available: null, pending: true }, grant: { endsAt: null } }) }))).toEqual(['status', 'includes', 'compare']);
  });
  it('a payment not settled: the status (Manage), no plans', () => {
    expect(membershipBlocks(at({ state: s({ purchasePending: true, kind: 'subscription' }) }))).toEqual(['status', 'compare']);
  });
  it('a grant with no end: the status, includes, no plans (every purchase refused)', () => {
    expect(membershipBlocks(at({ state: s({ entitled: true, grant: { endsAt: null } }) }))).toEqual(['status', 'includes', 'compare']);
  });
  it('a grant with an end: the status, includes, and the plans (a holder may buy before it ends)', () => {
    expect(membershipBlocks(at({ state: s({ entitled: true, grant: { endsAt: '2027-02-24 22:00:00.000' } }) }))).toEqual(['status', 'includes', 'plans', 'compare']);
  });
  it('a grant with a paid subscription: no plans', () => {
    expect(membershipBlocks(at({ state: s({ ...sub, grant: { endsAt: '2027-02-24 22:00:00.000' } }) }))).toEqual(['status', 'includes', 'compare']);
  });
  it('a grant with a pending purchase: no plans', () => {
    expect(membershipBlocks(at({ state: s({ entitled: true, purchasePending: true, grant: { endsAt: '2027-02-24 22:00:00.000' } }) }))).toEqual(['status', 'includes', 'compare']);
  });
  it('nobody sells: a holder still manages; a free account is told nothing to buy', () => {
    expect(membershipBlocks(at({ provider: null, state: sub }))).toEqual(['status', 'includes', 'compare']);
    expect(membershipBlocks(at({ provider: null }))).toEqual(['compare']);
    expect(membershipBlocks(at({ provider: null, signedIn: false, state: null, known: false }))).toEqual(['signIn', 'compare']);
  });
});
