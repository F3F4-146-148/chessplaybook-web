/**
 * The cookie consent banner (#564, COOKIE_CONSENT_ANALYSIS section 4.4).
 *
 * Shown to a visitor from the EEA, the UK or Switzerland who has not answered yet, and to anyone
 * who opens "Cookie settings" (the footer, the Privacy page). A bar over the foot of the window:
 * it never moves the page (a Workspace page still fits) and it does not block it.
 *
 * It never MOVES the page, but while it is open it publishes its height (`--consent-banner-h` on the root) and the
 * pages add that much room at their foot, so what it covers can be scrolled above it: on a phone it covered the
 * puzzle card's main button (Next puzzle, See Premium) with nowhere to scroll (owner, 2026-11-28). Shrinking the page
 * instead was rejected: every first visit from the UK and EEA would shift the layout as the banner appeared.
 *
 * Accept all and Reject all have the same size and the same look, on the first layer: refusing must
 * be as easy as accepting. Choose shows the two purposes, both off until the visitor turns one on.
 * Renders nothing until the state is known, so the built (prerendered) HTML never contains it.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  closeConsentSettings, getConsentState, isSettingsOpen, saveConsent, startConsent, subscribeConsent,
} from '@/services/consent';

type Snapshot = { show: boolean; fromSettings: boolean; measurement: boolean; advertising: boolean };

function snapshot(): Snapshot {
  const state = getConsentState();
  const fromSettings = isSettingsOpen();
  if (state.status !== 'resolved') return { show: false, fromSettings, measurement: false, advertising: false };
  return {
    show: fromSettings || (state.required && state.choice === null),
    fromSettings,
    measurement: state.choice?.measurement ?? false,
    advertising: state.choice?.advertising ?? false,
  };
}

// useSyncExternalStore needs a stable value between changes.
let last: Snapshot = snapshot();
function stableSnapshot(): Snapshot {
  const next = snapshot();
  if (next.show !== last.show || next.fromSettings !== last.fromSettings || next.measurement !== last.measurement || next.advertising !== last.advertising) last = next;
  return last;
}
/* Three equal buttons on one row; a long label wraps inside its button on a small phone instead of spilling out. */
const BUTTON = 'h-auto min-h-9 whitespace-normal leading-tight py-1.5 px-2';
const HIDDEN: Snapshot = { show: false, fromSettings: false, measurement: false, advertising: false };

export function ConsentBanner() {
  const view = useSyncExternalStore(subscribeConsent, stableSnapshot, () => HIDDEN);
  const [choosing, setChoosing] = useState(false);
  const [measurement, setMeasurement] = useState(false);
  const [advertising, setAdvertising] = useState(false);

  useEffect(() => { void startConsent(); }, []);

  /* Its height while open, for the pages' room at their foot (index.css, workspace.css). Removed when it closes. */
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    const root = document.documentElement;
    if (!view.show || !el) { root.style.removeProperty('--consent-banner-h'); return; }
    const publish = () => root.style.setProperty('--consent-banner-h', `${Math.ceil(el.getBoundingClientRect().height)}px`);
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(el);
    return () => { observer.disconnect(); root.style.removeProperty('--consent-banner-h'); };
  }, [view.show]);

  // Opening the settings shows the visitor's current answer in the switches.
  useEffect(() => {
    if (!view.show) return;
    setMeasurement(view.measurement);
    setAdvertising(view.advertising);
    setChoosing(view.fromSettings);
  }, [view.show, view.fromSettings, view.measurement, view.advertising]);

  if (!view.show) return null;

  const answer = (m: boolean, a: boolean, how: 'accept_all' | 'reject_all' | 'choose') => {
    saveConsent(m, a);
    // After the update, so an accept is counted normally and a refusal as Consent Mode's cookieless ping.
    // Lazily: analytics.ts carries react-ga4, which the first load must not.
    void import('@/services/analytics').then(({ logGA4Event }) =>
      logGA4Event({ name: 'consent_choice', params: { choice: how, measurement: m, advertising: a } }));
  };

  return (
    <div
      ref={box}
      role="region"
      aria-label="Cookies on Chess Playbook"
      data-consent-banner
      className="fixed inset-x-0 bottom-0 z-[60] flex justify-center p-2 sm:p-4 pointer-events-none"
    >
      <div className="surface-card rounded-lg pointer-events-auto w-full max-w-2xl p-4 text-sm text-foreground">
        <h2 className="font-semibold text-base">Cookies on Chess Playbook</h2>
        <p className="mt-1">
          We use some essential cookies to make this site work. We'd also like to use analytics and advertising
          cookies to understand how you use the site and to measure our ads.{' '}
          <Link to="/privacy" className="text-link underline underline-offset-2">View cookies</Link>
        </p>

        {choosing && (
          <div className="mt-3 space-y-3">
            <div className="flex items-center justify-between gap-4">
              <span>
                <span className="font-medium">Essential cookies</span>
                <span className="block text-muted-foreground">Needed for the site to work, for example to keep you signed in and save your puzzle progress.</span>
              </span>
              <span className="text-muted-foreground whitespace-nowrap">Always on</span>
            </div>
            <label className="flex items-center justify-between gap-4">
              <span>
                <span className="font-medium">Analytics cookies</span>
                <span className="block text-muted-foreground">Help us understand how people use the site so we can improve it.</span>
              </span>
              <Switch checked={measurement} onCheckedChange={setMeasurement} aria-label="Analytics cookies" />
            </label>
            <label className="flex items-center justify-between gap-4">
              <span>
                <span className="font-medium">Advertising cookies</span>
                <span className="block text-muted-foreground">Used by Google and Meta to measure our ads and show you relevant ads on other sites.</span>
              </span>
              <Switch checked={advertising} onCheckedChange={setAdvertising} aria-label="Advertising cookies" />
            </label>
          </div>
        )}

        {/* Accept all is the rightmost of the three (owner, 2026-11-28: the right side is where people press most
            easily). Position only: the three keep one size and one look, so refusing stays as easy as accepting. */}
        <div className="mt-3 grid grid-cols-3 gap-2">
          {choosing ? (
            <Button variant="secondary" size="sm" className={BUTTON} onClick={() => answer(measurement, advertising, 'choose')}>Save preferences</Button>
          ) : (
            <Button variant="secondary" size="sm" className={BUTTON} onClick={() => setChoosing(true)}>Manage cookies</Button>
          )}
          <Button variant="secondary" size="sm" className={BUTTON} onClick={() => answer(false, false, 'reject_all')}>Reject all</Button>
          <Button variant="secondary" size="sm" className={BUTTON} onClick={() => answer(true, true, 'accept_all')}>Accept all</Button>
        </div>
        {view.fromSettings && (
          <button type="button" onClick={closeConsentSettings} className="mt-2 text-muted-foreground underline underline-offset-2">
            Close
          </button>
        )}
      </div>
    </div>
  );
}
