import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/services/analytics', () => ({ logGA4Event: vi.fn() }));
import { logGA4Event } from '@/services/analytics';
import type { PremiumState } from './paddleCheckout';
import { minorToAmount, purchaseEventFor, reportPurchase } from './purchaseEvent';

const bought = (over: Partial<PremiumState> = {}): PremiumState => ({
  premium: true, kind: 'subscription', status: 'active', periodEndsAt: '2027-11-27T10:00:00Z', scheduledChange: null,
  refund: {
    available: { kind: 'subscription', until: '2026-12-27T10:00:00Z', totalMinor: '2249', currency: 'eur' },
    pending: false,
  },
  ...over,
});

describe('purchase event (#559)', () => {
  beforeEach(() => { vi.mocked(logGA4Event).mockClear(); sessionStorage.clear(); });

  it('converts minor units, with zero-decimal currencies as they are', () => {
    expect(minorToAmount('2249', 'EUR')).toBe(22.49);
    expect(minorToAmount('3990', 'jpy')).toBe(3990);
    expect(minorToAmount(null, 'EUR')).toBeUndefined();
    expect(minorToAmount('12.5', 'EUR')).toBeUndefined();
  });

  it('names the payment, its amount and currency, and never an identity', () => {
    const event = purchaseEventFor(bought(), 'stripe');
    expect(event).toEqual({
      name: 'purchase',
      params: { transaction_id: 'stripe-subscription-2026-12-27T10:00:00Z', value: 22.49, currency: 'EUR', kind: 'subscription', provider: 'stripe' },
    });
  });

  it('sends nothing without Premium, and no amount when the payment is not known', () => {
    expect(purchaseEventFor(bought({ premium: false }), 'stripe')).toBeNull();
    expect(purchaseEventFor(null, 'stripe')).toBeNull();
    const noPayment = purchaseEventFor(bought({ kind: 'pass', refund: { available: null, pending: false } }), 'stripe');
    expect(noPayment?.params).toEqual({ transaction_id: 'stripe-pass-2027-11-27T10:00:00Z', kind: 'pass', provider: 'stripe' });
  });

  it('is sent once per purchase in a tab', () => {
    expect(reportPurchase(bought(), 'stripe')).toBe(true);
    expect(reportPurchase(bought(), 'stripe')).toBe(false);
    expect(logGA4Event).toHaveBeenCalledTimes(1);
    /* Another purchase (another year) is another event. */
    const second = bought({ refund: { available: { kind: 'pass', until: '2027-01-10T10:00:00Z', totalMinor: '549', currency: 'INR' }, pending: false } });
    expect(reportPurchase(second, 'stripe')).toBe(true);
    expect(logGA4Event).toHaveBeenCalledTimes(2);
  });
});
