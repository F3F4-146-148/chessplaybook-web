/**
 * Cookie consent (#564): who is asked, what an answer allows, and that Consent Mode hears it.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CONSENT_COUNTRIES, CONSENT_KEY, CONSENT_VERSION, MEASUREMENT_KEYS, allows, countryRequiresConsent,
  getConsentState, openConsentSettings, isSettingsOpen, parseChoice, resetConsentForTests, saveConsent, startConsent,
} from './consent';

const gtag = vi.fn();
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  resetConsentForTests();
  gtag.mockReset();
  (window as unknown as { gtag: typeof gtag }).gtag = gtag;
  window.history.replaceState(null, '', '/');
});

describe('who is asked', () => {
  it('asks the EEA, the UK and Switzerland, and an unknown country', () => {
    for (const cc of ['GB', 'DE', 'NL', 'IE', 'SE', 'NO', 'IS', 'CH', 'RO']) expect(countryRequiresConsent(cc)).toBe(true);
    expect(countryRequiresConsent(null)).toBe(true);
  });
  it('does not ask India, the US, Canada or Australia', () => {
    for (const cc of ['IN', 'US', 'CA', 'AU', 'NZ', 'UZ']) expect(countryRequiresConsent(cc)).toBe(false);
  });
  it('index.html denies by default in exactly the same countries', () => {
    const html = readFileSync(resolve(__dirname, '../../index.html'), 'utf8');
    const match = html.match(/region:\[([^\]]+)\]/);
    expect(match).not.toBeNull();
    const listed = new Set(match![1].split(',').map((s) => s.trim().replace(/'/g, '')));
    expect([...listed].sort()).toEqual([...CONSENT_COUNTRIES].sort());
    expect(CONSENT_COUNTRIES.size).toBe(32);
  });
  it('index.html reads the same key and version as this module', () => {
    const html = readFileSync(resolve(__dirname, '../../index.html'), 'utf8');
    expect(html).toContain(`localStorage.getItem('${CONSENT_KEY}')`);
    expect(html).toContain(`c.v===${CONSENT_VERSION}`);
  });
});

describe('what a state allows', () => {
  it('allows nothing while pending', () => {
    expect(allows({ status: 'pending' }, 'measurement')).toBe(false);
    expect(allows({ status: 'pending' }, 'advertising')).toBe(false);
  });
  it('allows everything outside the consent countries', () => {
    expect(allows({ status: 'resolved', required: false, choice: null }, 'advertising')).toBe(true);
  });
  it('allows nothing in them until an answer, then exactly the answer', () => {
    expect(allows({ status: 'resolved', required: true, choice: null }, 'measurement')).toBe(false);
    const choice = { v: CONSENT_VERSION, measurement: true, advertising: false, at: '' };
    expect(allows({ status: 'resolved', required: true, choice }, 'measurement')).toBe(true);
    expect(allows({ status: 'resolved', required: true, choice }, 'advertising')).toBe(false);
  });
  it('ignores a stored answer of another version or shape', () => {
    expect(parseChoice(JSON.stringify({ v: CONSENT_VERSION + 1, measurement: true, advertising: true }))).toBeNull();
    expect(parseChoice('{"v":1,"measurement":"yes","advertising":true}')).toBeNull();
    expect(parseChoice('not json')).toBeNull();
  });
});

describe('startConsent', () => {
  it('honours a stored answer without asking the country', async () => {
    localStorage.setItem(CONSENT_KEY, JSON.stringify({ v: CONSENT_VERSION, measurement: false, advertising: false, at: 'x' }));
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const state = await startConsent();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(state).toMatchObject({ status: 'resolved', choice: { measurement: false } });
    fetchSpy.mockRestore();
  });
  it('treats a local host as outside the consent countries, and ?country=GB as inside', async () => {
    expect(await startConsent()).toMatchObject({ status: 'resolved', required: false });
    expect(gtag).toHaveBeenCalledWith('consent', 'update', expect.objectContaining({ analytics_storage: 'granted', ad_storage: 'granted' }));
    resetConsentForTests();
    gtag.mockReset();
    window.history.replaceState(null, '', '/?country=gb');
    expect(await startConsent()).toMatchObject({ status: 'resolved', required: true, choice: null });
    expect(gtag).toHaveBeenCalledWith('consent', 'update', expect.objectContaining({ analytics_storage: 'denied', ad_user_data: 'denied' }));
  });
});

describe('saveConsent', () => {
  beforeEach(() => resetConsentForTests({ status: 'resolved', required: true, choice: null }));

  it('stores the answer, tells Consent Mode and closes the settings', () => {
    openConsentSettings();
    saveConsent(true, false, new Date('2026-11-27T12:00:00Z'));
    expect(parseChoice(localStorage.getItem(CONSENT_KEY))).toEqual({ v: CONSENT_VERSION, measurement: true, advertising: false, at: '2026-11-27T12:00:00.000Z' });
    expect(gtag).toHaveBeenCalledWith('consent', 'update', {
      analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied',
    });
    expect(isSettingsOpen()).toBe(false);
    expect(getConsentState()).toMatchObject({ choice: { measurement: true, advertising: false } });
  });

  it('removes our measurement keys when Measurement is refused, and keeps the rest', () => {
    for (const key of MEASUREMENT_KEYS) localStorage.setItem(key, '1');
    localStorage.setItem('cp_anonymous_id', 'guest');
    sessionStorage.setItem('chessplaybook.presence.session.v1', 'p');
    saveConsent(false, false);
    for (const key of MEASUREMENT_KEYS) expect(localStorage.getItem(key)).toBeNull();
    expect(sessionStorage.getItem('chessplaybook.presence.session.v1')).toBeNull();
    expect(localStorage.getItem('cp_anonymous_id')).toBe('guest');
  });
});
