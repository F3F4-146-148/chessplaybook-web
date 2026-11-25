import { describe, expect, it } from 'vitest';
import { hasPremium, premiumGrant, type PremiumState } from './paddleCheckout';

const base: PremiumState = { premium: false, kind: null, status: null, periodEndsAt: null, scheduledChange: null };

describe('hasPremium and premiumGrant (Premium grants plan, B1)', () => {
  it('reads an older backend, which sends neither entitled nor grant, as paid Premium only', () => {
    expect(hasPremium({ ...base, premium: true, kind: 'subscription' })).toBe(true);
    expect(hasPremium(base)).toBe(false);
    expect(premiumGrant({ ...base, premium: true })).toBeNull();
  });

  it('counts given Premium: entitled with no paid Premium', () => {
    const granted = { ...base, entitled: true, grant: { endsAt: null } };
    expect(hasPremium(granted)).toBe(true);
    expect(premiumGrant(granted)).toEqual({ endsAt: null });
  });

  it('trusts entitled over premium once the backend sends it', () => {
    expect(hasPremium({ ...base, premium: true, entitled: false })).toBe(false);
  });

  it('is false with no state', () => {
    expect(hasPremium(null)).toBe(false);
    expect(hasPremium(undefined)).toBe(false);
    expect(premiumGrant(null)).toBeNull();
  });
});

describe('grantBlocksPurchase and the grant line (Premium grants plan B6)', () => {
  it('only a grant with NO end blocks buying', async () => {
    const { grantBlocksPurchase } = await import('./paddleCheckout');
    expect(grantBlocksPurchase({ ...base, grant: { endsAt: null } })).toBe(true);
    expect(grantBlocksPurchase({ ...base, grant: { endsAt: '2027-02-24 22:00:00.000' } })).toBe(false);
    expect(grantBlocksPurchase(base)).toBe(false);
    expect(grantBlocksPurchase(null)).toBe(false);
  });

  it('says the end date, or that there is none, and nothing without a grant', async () => {
    const { grantLineText } = await import('./GrantLine');
    expect(grantLineText({ ...base, grant: { endsAt: null } })).toBe('We gave you Premium with no end date.');
    expect(grantLineText({ ...base, grant: { endsAt: '2027-02-24 12:00:00.000' } })).toMatch(/^We gave you Premium until .*2027\.$/);
    expect(grantLineText({ ...base, grant: { endsAt: '2027-02-24 12:00:00.000' } }, true)).toMatch(/2027\. After that, you can choose a plan\.$/);
    expect(grantLineText({ ...base, grant: { endsAt: null } }, true)).toBe('We gave you Premium with no end date.');
    expect(grantLineText(base)).toBeNull();
  });
});

describe('the grant end date shows the last day covered (Fable review)', () => {
  it('a grant until the end of 24 February in Bucharest reads 24 February in Bucharest and in London', async () => {
    const { grantDay } = await import('./GrantLine');
    // 2027-02-24 22:00 UTC = 00:00 on 25 February in Bucharest (UTC+2): the first moment with no Premium.
    expect(grantDay('2027-02-24 22:00:00.000', 'Europe/Bucharest')).toMatch(/24/);
    expect(grantDay('2027-02-24 22:00:00.000', 'Europe/London')).toMatch(/24/);
    expect(grantDay('2027-02-24 22:00:00.000', 'Europe/Bucharest')).not.toMatch(/25/);
    expect(grantDay('not a time')).toBeNull();
  });
});
