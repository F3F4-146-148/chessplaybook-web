/**
 * The set-password link's token (#521 Phase F, F7): `/set-password#token=<token>`. Taken from the address bar
 * before the first render and before analytics starts (main.tsx), kept for this tab only, as the invitation
 * link's token is (invitation.ts).
 */
const KEY = 'cp_set_password_token';
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
let memory: string | null = null;

/** True when the address carried a token (it is then removed from the address bar). */
export function captureSetPasswordToken(loc: Location = window.location): boolean {
  const match = /^#token=([^&]*)/.exec(loc.hash);
  if (!match || loc.pathname.replace(/\/+$/, '') !== '/set-password') return false;
  try { window.history.replaceState(window.history.state, '', loc.pathname + loc.search); } catch { /* none */ }
  if (TOKEN.test(match[1])) {
    memory = match[1];
    try { sessionStorage.setItem(KEY, match[1]); } catch { /* the in-memory copy serves this page load */ }
  }
  return true;
}

export function readSetPasswordToken(): string | null {
  try {
    const stored = sessionStorage.getItem(KEY);
    if (stored && TOKEN.test(stored)) return stored;
  } catch { /* none */ }
  return memory;
}

export function clearSetPasswordToken(): void {
  memory = null;
  try { sessionStorage.removeItem(KEY); } catch { /* none */ }
}
