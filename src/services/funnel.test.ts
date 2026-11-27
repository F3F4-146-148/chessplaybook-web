/**
 * The funnel's first touch and daily visit (#46): only a path and a host leave the
 * browser, the first touch is sent once, the visit once a Bucharest day.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const headers = vi.hoisted(() => ({ value: { 'X-Anonymous-Id': 'anon-1' } as Record<string, string> }));
vi.mock('@/features/auth/utils/getAuthToken', () => ({ getRequestHeaders: async () => headers.value }));

import {
  readFirstTouch, bucharestDay, captureFirstTouch, recordVisit, countFirstDayAttempt, seenBeforeThisLoad,
  onFirstInteraction, hasInteracted, resetInteractionForTests, resetFunnelMemoryForTests, flushFunnelMemory,
} from './funnel';
import { resetConsentForTests, saveConsent } from './consent';

/** A visitor outside the consent countries (the state every earlier test assumed). */
const outsideConsentCountries = () => resetConsentForTests({ status: 'resolved', required: false, choice: null });

const at = new Date('2026-11-12T10:00:00Z');
const loc = (pathAndQuery: string) => {
  const url = new URL(pathAndQuery, 'https://www.chessplaybook.com');
  return { pathname: url.pathname, search: url.search, host: url.host };
};

describe('readFirstTouch', () => {
  it('keeps the path, the utm values and a paid click, never the click id', () => {
    const t = readFirstTouch(loc('/puzzles?utm_source=google&utm_medium=cpc&utm_campaign=in-puzzles&gclid=ABC123'), 'https://www.google.com/search?q=chess', at);
    expect(t).toEqual({
      touchedAt: '2026-11-12T10:00:00.000Z', landingPath: '/puzzles', utmSource: 'google', utmMedium: 'cpc',
      utmCampaign: 'in-puzzles', utmContent: undefined, paidClick: true, referrerHost: 'www.google.com',
    });
    expect(JSON.stringify(t)).not.toContain('ABC123');
    expect(JSON.stringify(t)).not.toContain('q=chess');
  });

  it('keeps the ad keyword Google Ads fills into utm_term', () => {
    const t = readFirstTouch(loc('/puzzles?utm_source=google&utm_medium=cpc&utm_campaign=example&utm_term=chess+puzzles&gad_source=1'), '', at);
    expect(t.utmTerm).toBe('chess puzzles');
  });

  it('a click id alone marks a paid click', () => {
    expect(readFirstTouch(loc('/?gbraid=x'), '', at).paidClick).toBe(true);
    expect(readFirstTouch(loc('/?utm_medium=email'), '', at).paidClick).toBe(false);
  });

  it('our own pages are not a referrer', () => {
    expect(readFirstTouch(loc('/'), 'https://www.chessplaybook.com/news', at).referrerHost).toBeUndefined();
  });

  it('drops a utm value the server would refuse', () => {
    expect(readFirstTouch(loc('/?utm_campaign=%3Cscript%3E'), '', at).utmCampaign).toBeUndefined();
  });
});

describe('bucharestDay', () => {
  it('is the day in Bucharest, not UTC', () => {
    expect(bucharestDay(new Date('2026-11-12T22:30:00Z'))).toBe('2026-11-13');
  });
});

describe('recordVisit', () => {
  beforeEach(() => {
    localStorage.clear();
    resetFunnelMemoryForTests();
    outsideConsentCountries();
    headers.value = { 'X-Anonymous-Id': 'anon-1' };
  });
  const ok = () => vi.fn(async () => new Response(null, { status: 204 }));

  it('sends the first touch once and the visit once a day', async () => {
    window.history.replaceState(null, '', '/puzzles?utm_source=google&utm_medium=cpc');
    captureFirstTouch(at);
    const fetchImpl = ok();
    await recordVisit({ fetchImpl, now: at });
    await recordVisit({ fetchImpl, now: at });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const body = JSON.parse((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.firstTouch.landingPath).toBe('/puzzles');

    await recordVisit({ fetchImpl, now: new Date('2026-11-13T10:00:00Z') });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const next = JSON.parse((fetchImpl.mock.calls[1] as unknown as [string, RequestInit])[1].body as string);
    expect(next).toEqual({});
  });

  it('a failed send is tried again on the next load', async () => {
    const fail = vi.fn(async () => new Response(null, { status: 503 }));
    await recordVisit({ fetchImpl: fail, now: at });
    const fetchImpl = ok();
    await recordVisit({ fetchImpl, now: at });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('signed in with no token right now: sends nothing', async () => {
    headers.value = {};
    const fetchImpl = ok();
    await recordVisit({ fetchImpl, now: at });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('the first touch is captured once; a later page does not replace it', () => {
    window.history.replaceState(null, '', '/explain');
    captureFirstTouch(at);
    window.history.replaceState(null, '', '/puzzles');
    captureFirstTouch(at);
    expect(JSON.parse(localStorage.getItem('cp_first_touch')!).landingPath).toBe('/explain');
  });
});

/* A fake window: jsdom can only dispatch untrusted events, and the gate ignores those. */
function fakeTarget() {
  const handlers = new Map<string, (event: Event) => void>();
  return {
    addEventListener: (name: string, handler: (event: Event) => void) => { handlers.set(name, handler); },
    removeEventListener: (name: string) => { handlers.delete(name); },
    fire: (name: string, isTrusted = true) => handlers.get(name)?.({ isTrusted } as Event),
    listening: () => [...handlers.keys()].sort(),
  };
}

describe('onFirstInteraction', () => {
  beforeEach(() => resetInteractionForTests());

  it('waits for a real input, ignores script-made events, and runs once', () => {
    const target = fakeTarget();
    const callback = vi.fn();
    onFirstInteraction(callback, target as unknown as Window);
    expect(target.listening()).toEqual(['keydown', 'pointerdown', 'wheel']);
    target.fire('pointerdown', false);
    expect(callback).not.toHaveBeenCalled();
    expect(hasInteracted()).toBe(false);
    target.fire('wheel');
    expect(callback).toHaveBeenCalledTimes(1);
    expect(hasInteracted()).toBe(true);
    expect(target.listening()).toEqual([]);
  });

  it('does not listen for scroll, which a script can cause', () => {
    const target = fakeTarget();
    onFirstInteraction(vi.fn(), target as unknown as Window);
    expect(target.listening()).not.toContain('scroll');
  });

  it('runs at once when the page has already been used', () => {
    const first = fakeTarget();
    onFirstInteraction(vi.fn(), first as unknown as Window);
    first.fire('keydown');
    const callback = vi.fn();
    onFirstInteraction(callback, fakeTarget() as unknown as Window);
    expect(callback).toHaveBeenCalledTimes(1);
  });
});

describe('countFirstDayAttempt (funnel stage 3b)', () => {
  beforeEach(() => { localStorage.clear(); resetFunnelMemoryForTests(); outsideConsentCountries(); });
  const later = new Date('2026-11-12T15:00:00Z');

  it('is true once, on the fifth attempt of the first day', () => {
    captureFirstTouch(at, false);
    const results = Array.from({ length: 7 }, () => countFirstDayAttempt(later));
    expect(results).toEqual([false, false, false, false, true, false, false]);
  });

  it('counts nothing on a later day', () => {
    captureFirstTouch(at, false);
    for (let i = 0; i < 4; i++) countFirstDayAttempt(later);
    expect(countFirstDayAttempt(new Date('2026-11-13T10:00:00Z'))).toBe(false);
  });

  it('never counts a browser with no first day: a returning player is not a new one', () => {
    localStorage.setItem('cp_first_touch_sent', '1');
    captureFirstTouch(at, false);
    expect(Array.from({ length: 6 }, () => countFirstDayAttempt(later))).not.toContain(true);
  });

  it('never counts a browser that was here before this load, even with no first-touch keys', () => {
    captureFirstTouch(at, true);
    expect(localStorage.getItem('cp_first_touch')).not.toBeNull();
    expect(Array.from({ length: 6 }, () => countFirstDayAttempt(later))).not.toContain(true);
  });

  it('a guest id or a stored sign-in means the browser was here before', () => {
    expect(seenBeforeThisLoad()).toBe(false);
    localStorage.setItem('cp_anonymous_id', 'x');
    expect(seenBeforeThisLoad()).toBe(true);
    localStorage.clear();
    localStorage.setItem('CognitoIdentityServiceProvider.abc.LastAuthUser', 'sub');
    expect(seenBeforeThisLoad()).toBe(true);
  });
});

describe('consent (#564, D3): a UK or EEA visitor before Measurement is accepted', () => {
  beforeEach(() => {
    localStorage.clear();
    resetFunnelMemoryForTests();
    resetConsentForTests({ status: 'resolved', required: true, choice: null });
    headers.value = { 'X-Anonymous-Id': 'anon-1' };
  });
  const ok = () => vi.fn(async () => new Response(null, { status: 204 }));

  it('stores nothing, and still sends the first touch with the visit', async () => {
    window.history.replaceState(null, '', '/puzzles?utm_source=google&utm_campaign=search-west-puzzles');
    captureFirstTouch(at, false);
    const fetchImpl = ok();
    await recordVisit({ fetchImpl, now: at });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const body = JSON.parse((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.firstTouch.utmCampaign).toBe('search-west-puzzles');
    for (let i = 0; i < localStorage.length; i++) expect(localStorage.key(i)).not.toMatch(/^cp_(first|visit)/);
    expect(localStorage.length).toBe(0);
  });

  it('sends the visit once in this page, from memory', async () => {
    captureFirstTouch(at, false);
    const fetchImpl = ok();
    await recordVisit({ fetchImpl, now: at });
    await recordVisit({ fetchImpl, now: at });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('writes what it kept once Measurement is accepted', async () => {
    captureFirstTouch(at, false);
    await recordVisit({ fetchImpl: ok(), now: at });
    expect(localStorage.getItem('cp_first_touch_sent')).toBeNull();
    saveConsent(true, false, at);
    flushFunnelMemory();
    expect(localStorage.getItem('cp_first_touch_sent')).toBe('1');
    expect(localStorage.getItem('cp_visit_day')).toBe(bucharestDay(at));
  });
});
