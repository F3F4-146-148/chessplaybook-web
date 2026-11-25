/**
 * The account's Premium, read from the API (GET /api/premium). Its own module because it imports the
 * sign-in token code (getAuthToken, which pulls aws-amplify): the always-loaded AccountPremiumProvider
 * reaches it only through a dynamic import, so the site's first bundle stays without aws-amplify
 * (providers.tsx; #467 plan A1a).
 *
 * null means the read failed (network, 401, 5xx), never "no Premium" (#261 review).
 */
import env from '@/config/env';
import { getAuthHeader } from '@/features/auth/utils/getAuthToken';
import type { PremiumState } from './paddleCheckout';

export async function fetchPremium(): Promise<PremiumState | null> {
  try {
    const response = await fetch(`${env.apiBaseUrl}/api/premium`, { headers: await getAuthHeader() });
    return response.ok ? await response.json() as PremiumState : null;
  } catch {
    return null;
  }
}
