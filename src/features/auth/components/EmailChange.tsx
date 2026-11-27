/**
 * Changing the account's email on /profile (moved from /membership: owner, 2026-11-27, membership is about the plan) (#521 Phase F, F7b; BUY_WITHOUT_ACCOUNT_DESIGN v4 2.5). For a
 * PASSWORD account only: a Google account's email is Google's. Cognito's own two steps: the new address gets a
 * code, and the email changes only once the code is confirmed (the pool requires it). Then the server writes the
 * refreshed token's verified email to our record and the account's Stripe customers.
 *
 * Amplify is imported when someone presses Change email, never with the page (it stays out of the first bundle).
 */
import { useEffect, useState, type FormEvent } from 'react';
import env from '@/config/env';
import { useAuth } from '@/features/auth/AuthContext';
import { getAuthHeader } from '@/features/auth/utils/getAuthToken';
import { logGA4Event } from '@/services/analytics';

type Step = 'show' | 'address' | 'code' | 'working';

const nameOf = (error: unknown) => (error as { name?: string } | null)?.name ?? '';

/** True for an account signed in with a password (its ID token names no outside provider). */
async function isPasswordAccount(): Promise<boolean> {
  const { fetchAuthSession } = await import('aws-amplify/auth');
  const payload = (await fetchAuthSession()).tokens?.idToken?.payload as Record<string, unknown> | undefined;
  return Boolean(payload) && !payload!.identities;
}

export function EmailChange() {
  const { user } = useAuth();
  const [password, setPassword] = useState<boolean | null>(null);
  const [step, setStep] = useState<Step>('show');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [current, setCurrent] = useState(user?.email ?? '');
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    isPasswordAccount().then((p) => { if (live) setPassword(p); }).catch(() => { if (live) setPassword(false); });
    return () => { live = false; };
  }, [user?.userId]);
  useEffect(() => { setCurrent(user?.email ?? ''); }, [user?.email]);

  if (!user || password !== true) return null;

  const sendCode = async (event: FormEvent) => {
    event.preventDefault();
    const next = email.trim().toLowerCase();
    if (!next || next === current.toLowerCase()) { setNote('Enter a different email.'); return; }
    setStep('working');
    setNote(null);
    try {
      const { updateUserAttributes } = await import('aws-amplify/auth');
      await updateUserAttributes({ userAttributes: { email: next } });
      setStep('code');
    } catch (error) {
      setStep('address');
      setNote(nameOf(error) === 'AliasExistsException' ? 'An account with this email already exists.' : 'The code could not be sent. Please try again.');
    }
  };

  const confirm = async (event: FormEvent) => {
    event.preventDefault();
    setStep('working');
    setNote(null);
    try {
      const { confirmUserAttribute, fetchAuthSession } = await import('aws-amplify/auth');
      await confirmUserAttribute({ userAttributeKey: 'email', confirmationCode: code.trim() });
      await fetchAuthSession({ forceRefresh: true });
      const response = await fetch(`${env.apiBaseUrl}/api/account/email-changed`, { method: 'POST', headers: { ...(await getAuthHeader()) } });
      const body = await response.json().catch(() => null) as { email?: unknown } | null;
      const changed = typeof body?.email === 'string' ? body.email : email.trim().toLowerCase();
      setCurrent(changed);
      setEmail('');
      setCode('');
      setStep('show');
      /* Cognito has the new email either way; say so plainly when our part did not finish (F9, Fable 5). */
      setNote(response.ok ? `Your email is now ${changed}.`
        : `Your email is now ${changed}. Receipts may still go to your old email for a while; write to support@chessplaybook.com if they do.`);
      logGA4Event({ name: 'account_email_changed', params: {} });
    } catch (error) {
      setStep('code');
      const name = nameOf(error);
      setNote(name === 'CodeMismatchException' ? 'That code is not right. Check the email and try again.'
        : name === 'ExpiredCodeException' ? 'That code has expired. Send a new one.' : 'Your email could not be changed. Please try again.');
    }
  };

  const field = 'w-full rounded-md border border-border bg-background px-3 py-2 text-[15px] text-foreground';
  return (
    <section aria-labelledby="profile-email" className="rounded-lg border border-border bg-card p-5" data-profile="email">
      <h2 id="profile-email" className="text-[17px] font-semibold">Email</h2>
      {step === 'show' && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[15px]">
          <span>{current}</span>
          <button type="button" onClick={() => { setStep('address'); setNote(null); }} className="text-link hover:underline">Change email</button>
        </div>
      )}
      {(step === 'address' || (step === 'working' && !code)) && (
        <form onSubmit={sendCode} className="mt-3 space-y-3">
          <label className="block space-y-1">
            <span className="text-[14px]">New email</span>
            <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={field} />
          </label>
          <div className="flex gap-3">
            <button type="submit" disabled={step === 'working'} className="v2-btn-gold h-10 px-5 font-semibold disabled:opacity-60">Send code</button>
            <button type="button" onClick={() => { setStep('show'); setNote(null); }} className="text-[15px] hover:underline">Cancel</button>
          </div>
        </form>
      )}
      {(step === 'code' || (step === 'working' && code)) && (
        <form onSubmit={confirm} className="mt-3 space-y-3">
          <p className="text-[15px]">We sent a code to {email.trim().toLowerCase()}. Enter it here.</p>
          <label className="block space-y-1">
            <span className="text-[14px]">Code</span>
            <input inputMode="numeric" autoComplete="one-time-code" required value={code} onChange={(e) => setCode(e.target.value)} className={field} />
          </label>
          <button type="submit" disabled={step === 'working'} className="v2-btn-gold h-10 px-5 font-semibold disabled:opacity-60">Change email</button>
        </form>
      )}
      {note && <p role="status" className="mt-3 text-[14px] text-foreground/85">{note}</p>}
    </section>
  );
}
