/**
 * /set-password (#521 Phase F, F7; BUY_WITHOUT_ACCOUNT_DESIGN v4 2.4): the page the email after a purchase
 * without an account opens. The link is `/set-password#token=<token>`: main.tsx keeps the token for this tab and
 * removes it from the address bar before the first render and before analytics starts, so no page_view or tag
 * sees it. Choosing a password here sets it, marks the email verified (the link proves the buyer reads it), and
 * signs the buyer in.
 *
 * NOTHING HAPPENS ON ARRIVAL: mail scanners open every link in a message, so the token is used only when the
 * form is sent.
 *
 * noindex, in the prerendered HTML (generate-route-html.cjs): one person's link.
 */
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import SeoHead from '@/components/SeoHead';
import { useAuth } from '@/features/auth/AuthContext';
import { readSetPasswordToken, clearSetPasswordToken } from '@/features/premium/setPasswordToken';
import { setPasswordFromLink } from '@/features/premium/guestPurchase';
import { logGA4Event } from '@/services/analytics';

type Phase = 'idle' | 'working' | 'expired' | 'failed';

export default function SetPassword() {
  const navigate = useNavigate();
  const { signInWithEmail } = useAuth();
  const [token] = useState(() => readSetPasswordToken());
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [problem, setProblem] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || phase === 'working') return;
    if (password !== again) { setProblem('The two passwords are not the same.'); return; }
    setProblem(null);
    setPhase('working');
    const result = await setPasswordFromLink(token, password);
    if (result.ok === false) {
      if (result.reason === 'invalid_link') { clearSetPasswordToken(); setPhase('expired'); return; }
      setPhase('idle');
      setProblem(result.reason === 'invalid_password'
        ? (result.message ?? 'Choose a longer password, with at least one number.')
        : result.reason === 'busy' ? 'Your account is still being set up. Try again in a minute.'
          : 'Your password could not be set. Please try again in a moment.');
      return;
    }
    clearSetPasswordToken();
    logGA4Event({ name: 'guest_password_set', params: {} });
    try {
      /* Still signed in from the one-time sign-in on this device: the server has just ended that session, and
         Amplify refuses a sign-in while it thinks one is open (F9, Fable 7). */
      const { signOut } = await import('aws-amplify/auth');
      await signOut().catch(() => undefined);
      await signInWithEmail(result.email, password);
      navigate('/membership', { replace: true });
    } catch {
      navigate('/login', { replace: true });
    }
  };

  const field = 'w-full rounded-md border border-border bg-background px-3 py-2 text-foreground';
  return (
    <>
      <SeoHead routeKey="set-password" />
      <div className="bg-background flex flex-col">
        <div className="py-12 px-4 sm:px-6 lg:px-8 flex-grow">
          <div className="max-w-xl mx-auto">
            <h1 className="text-4xl font-bold text-foreground mb-8">Set your password</h1>
            <div className="surface-card rounded-lg p-6 space-y-4 text-foreground" data-testid="set-password-page">
              {!token || phase === 'expired' ? (
                <p>
                  This link has expired or was already used. Write to{' '}
                  <a href="mailto:support@chessplaybook.com" className="text-link hover:underline">support@chessplaybook.com</a>{' '}
                  and we will send you a new one.
                </p>
              ) : (
                <form onSubmit={onSubmit} className="space-y-4">
                  <p>Choose a password for your Chess Playbook account. You sign in with it and your email.</p>
                  <label className="block space-y-1">
                    <span className="text-sm">Password</span>
                    <input type="password" autoComplete="new-password" required minLength={8} value={password}
                      onChange={(e) => setPassword(e.target.value)} className={field} />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-sm">The same password again</span>
                    <input type="password" autoComplete="new-password" required minLength={8} value={again}
                      onChange={(e) => setAgain(e.target.value)} className={field} />
                  </label>
                  {problem && <p role="alert" className="text-sm text-destructive">{problem}</p>}
                  <button type="submit" disabled={phase === 'working'} className="v2-btn-gold h-11 px-6 font-semibold disabled:opacity-60">
                    {phase === 'working' ? 'Setting your password…' : 'Set password'}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
