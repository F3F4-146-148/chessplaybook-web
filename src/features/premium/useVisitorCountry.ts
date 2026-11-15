/**
 * The visitor's country (ISO alpha-2), for the Premium page's price before checkout is live (#261).
 * `/geo.json` is answered by the CloudFront viewer-request function from CloudFront's own
 * geolocation of the request: nothing stored, no cookie. Once checkout is live, Paddle's own price
 * preview decides instead.
 *
 * `undefined` while asking, `null` when it is not known (the dev server has no CloudFront: there
 * `?country=GB` stands in for it). An unknown country is priced like the US: the full price, the base Paddle charges a buyer it cannot place.
 */
import { useEffect, useState } from 'react';

export function useVisitorCountry(): string | null | undefined {
  const [country, setCountry] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    if (import.meta.env.DEV) {
      const forced = new URLSearchParams(window.location.search).get('country');
      if (forced) { setCountry(forced.toUpperCase()); return; }
    }
    let cancelled = false;
    fetch('/geo.json', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { country?: unknown } | null) => {
        if (cancelled) return;
        const cc = typeof body?.country === 'string' && /^[A-Z]{2}$/.test(body.country) ? body.country : null;
        setCountry(cc);
      })
      .catch(() => { if (!cancelled) setCountry(null); });
    return () => { cancelled = true; };
  }, []);
  return country;
}
