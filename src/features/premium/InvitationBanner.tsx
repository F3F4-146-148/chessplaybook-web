/**
 * The invitation banner on /premium (premium grants plan D6; wording owner-approved 2026-11-24).
 *
 * Renders nothing on the server and on the first client render (the built page hydrates unchanged); an effect reads
 * the stored token and asks the server: signed out, what the invitation is (peek); signed in, redeem it. Every answer
 * is said. A terminal answer clears the token; the wrong email and a failed request keep it (sign in again, Try again).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Gift } from 'lucide-react';
import { useAuth } from '@/features/auth/AuthContext';
import { logGA4Event } from '@/services/analytics';
import { useAccountPremium } from './AccountPremium';
import { grantDay } from './GrantLine';
import { clearInvite, INVITE_EVENT, limitInvite, readInvite } from './invitation';
import { premiumGrant } from './paddleCheckout';
import { peekInvite, redeemInvite, type InviteLength } from './inviteApi';

type View =
  | { kind: 'checking' }
  | { kind: 'invited'; email: string; length: InviteLength }
  | { kind: 'granted'; endsAt: string | null }
  | { kind: 'already_yours' } | { kind: 'already_granted' }
  | { kind: 'wrong_email'; invited: string; signedIn: string }
  | { kind: 'used_by_other' } | { kind: 'invalid' } | { kind: 'error' }
  | { kind: 'sign_in_again' } | { kind: 'unconfirmed' };

const RETURN = encodeURIComponent('/premium');

function untilDay(day: string): string {
  const at = new Date(`${day}T12:00:00Z`);
  return Number.isNaN(at.getTime()) ? day : at.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export function lengthWords(length: InviteLength): string {
  if (length.kind === 'months') return `for ${length.months} ${length.months === 1 ? 'month' : 'months'}`;
  if (length.kind === 'until') return `until ${untilDay(length.day)}`;
  return 'with no end date';
}

export function InvitationBanner() {
  const { user, isLoading, signOutUser } = useAuth();
  const navigate = useNavigate();
  const account = useAccountPremium();
  const [token, setToken] = useState<string | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [attempt, setAttempt] = useState(0);
  /* A final answer for this token: nothing more is asked about it (Codex: a later auth change re-asked). */
  const settled = useRef(false);
  const refresh = useRef(account.refresh);
  refresh.current = account.refresh;
  /* The account, by id: the auth layer hands out a new user object on every token refresh, and a redeem must not be
     re-sent (and its answer dropped) for that (Codex). */
  const sub = user?.userId ?? null;

  /* After hydration only: the built page has no banner, so the first client render must not either. A link opened in
     this tab later (main.tsx catches it) is read again. */
  useEffect(() => {
    const read = () => { settled.current = false; setToken(readInvite()); setAttempt((n) => n + 1); };
    read();
    window.addEventListener(INVITE_EVENT, read);
    return () => window.removeEventListener(INVITE_EVENT, read);
  }, []);

  useEffect(() => {
    if (!token || isLoading || settled.current) return;
    let live = true;
    setView({ kind: 'checking' });
    void (async () => {
      if (!sub) {
        const peek = await peekInvite(token);
        if (!live) return;
        if (peek === null) { setView({ kind: 'error' }); return; }
        if (!peek.valid) { clearInvite(); settled.current = true; setView({ kind: 'invalid' }); logGA4Event({ name: 'premium_invite', params: { state: 'invalid' } }); return; }
        limitInvite(token, peek.expiresAt);
        setView({ kind: 'invited', email: peek.email, length: peek.length });
        logGA4Event({ name: 'premium_invite', params: { state: 'invited' } });
        return;
      }
      const answer = await redeemInvite(token);
      if (!live) return;
      if (answer === null) { setView({ kind: 'error' }); return; }
      logGA4Event({ name: 'premium_invite', params: { state: answer.status } });
      if (answer.status === 'wrong_email') { setView({ kind: 'wrong_email', invited: answer.invited, signedIn: answer.signedIn }); return; }
      /* The server refused the sign-in, not the invitation: the token is kept, as for the wrong email. */
      if (answer.status === 'sign_in_again' || answer.status === 'unconfirmed') { setView({ kind: answer.status }); return; }
      clearInvite();
      settled.current = true;
      if (answer.status === 'granted') {
        setView({ kind: 'granted', endsAt: answer.endsAt });
        void refresh.current();
        return;
      }
      if (answer.status === 'already_yours') {
        /* "Your Premium is running" only while it is (Codex): an invitation used long ago whose Premium has ended or
           was withdrawn reads as used. The account is re-read either way, so the page shows the truth. */
        const now = await refresh.current();
        if (!live) return;
        setView(premiumGrant(now) ? { kind: 'already_yours' } : { kind: 'invalid' });
        return;
      }
      /* Already Premium from us: the page is re-read too, so it shows that Premium (Fable). */
      if (answer.status === 'already_granted') void refresh.current();
      setView({ kind: answer.status });
    })();
    return () => { live = false; };
  }, [token, sub, isLoading, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  /* Nothing while the server is asked (a fraction of a second): no wording beyond the owner-approved lines. */
  if (!token || !view || view.kind === 'checking') return null;

  const line = (() => {
    switch (view.kind) {
      case 'invited': return `You're invited to Premium ${lengthWords(view.length)}. Sign in or create a free account with ${view.email} to start it.`;
      case 'granted': return view.endsAt ? `Your Premium has started. It runs until ${grantDay(view.endsAt) ?? view.endsAt}.` : 'Your Premium has started. It has no end date.';
      case 'already_yours': return 'This invitation is already yours. Your Premium is running.';
      case 'already_granted': return "You already have Premium from us with no end date, so you don't need this invitation.";
      case 'wrong_email': return `This invitation is for ${view.invited}. You're signed in as ${view.signedIn}. Sign out and sign in with ${view.invited} to use it.`;
      case 'used_by_other': return 'You already used this invitation with another way of signing in. Sign in that way to use your Premium.';
      case 'invalid': return 'This invitation has expired or was already used. Write to support@chessplaybook.com for a new one.';
      case 'error': return "We couldn't check your invitation.";
      case 'sign_in_again': return 'Your sign-in has run out. Sign in again to start your Premium.';
      case 'unconfirmed': return "We can't start your Premium until your email address is confirmed. Write to support@chessplaybook.com and we'll sort it out.";
    }
  })();

  return (
    <div data-premium="invite" role="status" className="v2-card-editorial mt-6 p-5 text-[15px] md:mt-[calc(24*var(--pu))]">
      <p className="flex items-start gap-2"><Gift className="mt-0.5 h-5 w-5 shrink-0 v2-gold-icon" fill="none" aria-hidden /><span>{line}</span></p>
      {view.kind === 'invited' && (
        <div className="mt-4 flex flex-wrap gap-3">
          <Link to={`/login?returnTo=${RETURN}`} className="v2-btn-gold inline-flex h-11 items-center px-5 font-semibold">Sign in</Link>
          <Link to={`/signup?returnTo=${RETURN}`} className="inline-flex h-11 items-center rounded-md border border-border px-5 font-semibold hover:border-link">Create a free account</Link>
        </div>
      )}
      {view.kind === 'wrong_email' && (
        <button type="button" onClick={() => { void signOutUser(); }} className="mt-4 inline-flex h-11 items-center rounded-md border border-border px-5 font-semibold hover:border-link">Sign out</button>
      )}
      {view.kind === 'sign_in_again' && (
        /* Signed out first: the app still believes in the session, and the token survives sign-out (invitation.ts). */
        <button type="button" onClick={() => { void signOutUser().catch(() => undefined).then(() => navigate(`/login?returnTo=${RETURN}`)); }} className="v2-btn-gold mt-4 inline-flex h-11 items-center px-5 font-semibold">Sign in again</button>
      )}
      {view.kind === 'error' && (
        <button type="button" onClick={retry} className="mt-4 inline-flex h-11 items-center rounded-md border border-border px-5 font-semibold hover:border-link">Try again</button>
      )}
    </div>
  );
}
