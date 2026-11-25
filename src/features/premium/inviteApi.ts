/** The invitation's two server calls (grants plan D4/D6). Kept apart from invitation.ts, which the entry chunk loads. */
import env from '@/config/env';
import { getAuthHeader } from '@/features/auth/utils/getAuthToken';

export type InviteLength = { kind: 'months'; months: number } | { kind: 'until'; day: string } | { kind: 'none' };
export type PeekAnswer = { valid: true; email: string; length: InviteLength; expiresAt: string } | { valid: false };
export type RedeemAnswer =
  | { status: 'granted'; grantId: number; endsAt: string | null }
  | { status: 'already_yours' } | { status: 'already_granted' }
  | { status: 'wrong_email'; invited: string; signedIn: string }
  | { status: 'used_by_other' } | { status: 'invalid' }
  /* Ours, not the server's: the server refused the sign-in itself. 401 = no usable token (the session ran out), 403 =
     a token the strict check refuses (an unconfirmed email). Before 2026-11-25 both read as "couldn't check". */
  | { status: 'sign_in_again' } | { status: 'unconfirmed' };

/** null = the server could not be reached or answered something else (the token is kept, "Try again"). */
export async function peekInvite(token: string): Promise<PeekAnswer | null> {
  try {
    const r = await fetch(`${env.apiBaseUrl}/api/premium/invitations/peek`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }), cache: 'no-store',
    });
    return r.ok ? await r.json() as PeekAnswer : null;
  } catch { return null; }
}

export async function redeemInvite(token: string): Promise<RedeemAnswer | null> {
  try {
    const r = await fetch(`${env.apiBaseUrl}/api/premium/invitations/redeem`, {
      method: 'POST', headers: { ...(await getAuthHeader()), 'Content-Type': 'application/json' }, body: JSON.stringify({ token }), cache: 'no-store',
    });
    if (r.status === 401) return { status: 'sign_in_again' };
    if (r.status === 403) return { status: 'unconfirmed' };
    return r.ok ? await r.json() as RedeemAnswer : null;
  } catch { return null; }
}
