/**
 * Cookie consent for UK, EEA and Swiss visitors (#564, COOKIE_CONSENT_ANALYSIS).
 *
 * Owner decisions (2026-11-27):
 * - D1: only visitors from the EEA, the UK and Switzerland are asked; a country we cannot
 *   read counts as one of them. Everyone else gets the site as before.
 * - D2: Google Consent Mode v2, ADVANCED: GA4 loads for everyone, with the four signals denied
 *   until the visitor accepts (the defaults are set in index.html, before any tag). The Meta
 *   Pixel has nothing like it, so it does not load at all until advertising is accepted.
 * - D3: our own first touch is sent from the URL without being stored (see funnel.ts); the
 *   other measurement keys and the presence heartbeat wait for Measurement.
 * - D4: Accept all / Reject all / Choose, with two switches (Measurement, Advertising).
 *
 * The visitor's answer is kept in `cp_consent` (strictly necessary: it is the answer). A stored
 * answer is honoured whatever the country, so anyone who opens the settings gets their choice.
 */

export interface ConsentChoice {
  v: number;
  measurement: boolean;
  advertising: boolean;
  /** ISO time of the answer. */
  at: string;
}

export type ConsentState =
  | { status: 'pending' }
  | { status: 'resolved'; required: boolean; choice: ConsentChoice | null };

export const CONSENT_KEY = 'cp_consent';
/** Raise when what the banner asks changes: older answers are asked again. */
export const CONSENT_VERSION = 1;

/** EU 27, Iceland, Liechtenstein, Norway, the UK and Switzerland. Keep in step with index.html's region list (a test reads both). */
export const CONSENT_COUNTRIES: ReadonlySet<string> = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU',
  'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
  'IS', 'LI', 'NO',
  'GB', 'CH',
]);

/** Keys our own measurement writes; deleted when Measurement is refused. */
export const MEASUREMENT_KEYS = [
  'cp_first_touch', 'cp_first_touch_sent', 'cp_visit_day', 'cp_first_day', 'cp_first_day_attempts',
  'cp_first_day_five', 'chessplaybook.visitor.v1',
] as const;
const MEASUREMENT_SESSION_KEYS = ['chessplaybook.presence.session.v1'] as const;

/** Does a visitor from this country need to be asked? `null` (unknown) counts as yes. */
export function countryRequiresConsent(country: string | null): boolean {
  return country === null || CONSENT_COUNTRIES.has(country);
}

export function parseChoice(raw: string | null): ConsentChoice | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<ConsentChoice>;
    if (value?.v !== CONSENT_VERSION || typeof value.measurement !== 'boolean' || typeof value.advertising !== 'boolean') return null;
    return { v: value.v, measurement: value.measurement, advertising: value.advertising, at: String(value.at ?? '') };
  } catch {
    return null;
  }
}

/** Whether `kind` may run in this state. Pending is no. */
export function allows(state: ConsentState, kind: 'measurement' | 'advertising'): boolean {
  if (state.status !== 'resolved') return false;
  if (state.choice) return state.choice[kind];
  return !state.required;
}

// ---- The live state -----------------------------------------------------------------------

let state: ConsentState = { status: 'pending' };
let settingsOpen = false;
const listeners = new Set<() => void>();
let started = false;

function emit(): void {
  for (const listener of listeners) listener();
}

export function getConsentState(): ConsentState {
  return state;
}
export function isSettingsOpen(): boolean {
  return settingsOpen;
}
export function subscribeConsent(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function measurementAllowed(): boolean {
  return allows(state, 'measurement');
}
export function advertisingAllowed(): boolean {
  return allows(state, 'advertising');
}

/** Resolves once the state is known (at once when it already is). */
export function whenConsentResolved(): Promise<ConsentState> {
  if (state.status === 'resolved') return Promise.resolve(state);
  return new Promise((resolve) => {
    const stop = subscribeConsent(() => {
      if (state.status === 'resolved') { stop(); resolve(state); }
    });
  });
}

type Gtag = (...args: unknown[]) => void;
function gtagConsent(measurement: boolean, advertising: boolean): void {
  const gtag = (window as unknown as { gtag?: Gtag }).gtag;
  if (typeof gtag !== 'function') return;
  gtag('consent', 'update', {
    analytics_storage: measurement ? 'granted' : 'denied',
    ad_storage: advertising ? 'granted' : 'denied',
    ad_user_data: advertising ? 'granted' : 'denied',
    ad_personalization: advertising ? 'granted' : 'denied',
  });
}

function readStoredChoice(): ConsentChoice | null {
  try { return parseChoice(localStorage.getItem(CONSENT_KEY)); } catch { return null; }
}

/** A local host is never a real visitor: dev servers, previews and probes answer no `/geo.json`. */
function isLocalHost(): boolean {
  return /^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname);
}

async function readCountry(): Promise<{ country: string | null; local: boolean }> {
  const forced = new URLSearchParams(window.location.search).get('country');
  if (isLocalHost()) {
    // ?country=GB shows the banner on a local host; without it a local host is asked nothing.
    return forced && /^[A-Za-z]{2}$/.test(forced) ? { country: forced.toUpperCase(), local: false } : { country: 'XX', local: true };
  }
  try {
    const response = await fetch('/geo.json', { cache: 'no-store' });
    if (!response.ok) return { country: null, local: false };
    const body = (await response.json()) as { country?: unknown };
    return { country: typeof body?.country === 'string' && /^[A-Z]{2}$/.test(body.country) ? body.country : null, local: false };
  } catch {
    return { country: null, local: false };
  }
}

/** Read the stored answer and the country once; idempotent. */
export async function startConsent(): Promise<ConsentState> {
  if (started) return whenConsentResolved();
  started = true;
  const choice = readStoredChoice();
  if (choice) {
    // index.html already applied it to Consent Mode before any tag; required is moot.
    state = { status: 'resolved', required: true, choice };
    emit();
    return state;
  }
  const { country } = await readCountry();
  const required = countryRequiresConsent(country);
  state = { status: 'resolved', required, choice: null };
  // Google's own region default may disagree with ours; say what we know. Only ever grant on a
  // country we positively read as outside the list.
  gtagConsent(!required, !required);
  emit();
  return state;
}

/** Record the visitor's answer, apply it, and close the settings. */
export function saveConsent(measurement: boolean, advertising: boolean, now = new Date()): void {
  const choice: ConsentChoice = { v: CONSENT_VERSION, measurement, advertising, at: now.toISOString() };
  try { localStorage.setItem(CONSENT_KEY, JSON.stringify(choice)); } catch { /* private mode: asked again next visit */ }
  const required = state.status === 'resolved' ? state.required : true;
  state = { status: 'resolved', required, choice };
  settingsOpen = false;
  gtagConsent(measurement, advertising);
  if (!measurement) {
    try {
      for (const key of MEASUREMENT_KEYS) localStorage.removeItem(key);
      for (const key of MEASUREMENT_SESSION_KEYS) sessionStorage.removeItem(key);
    } catch { /* nothing stored */ }
  }
  emit();
}

/** The footer's and the Privacy page's "Cookie settings". */
export function openConsentSettings(): void {
  settingsOpen = true;
  emit();
}
export function closeConsentSettings(): void {
  settingsOpen = false;
  emit();
}

/** For tests. */
export function resetConsentForTests(next: ConsentState = { status: 'pending' }): void {
  state = next;
  settingsOpen = false;
  started = false;
  listeners.clear();
}
