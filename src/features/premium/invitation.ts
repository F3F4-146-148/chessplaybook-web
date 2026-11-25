/**
 * A Premium invitation link, the visitor's side (premium grants plan D6, 2026-11-24).
 *
 * The link is `/premium#invite=<token>`. The token sits in the fragment so it never reaches CloudFront's logs or the
 * server; it is read here and the fragment removed from the address bar BEFORE the first render and before analytics
 * starts (main.tsx), so no page_view, beacon or tag ever sees it. It is kept in localStorage (sessionStorage if that is
 * blocked) until the server's answer settles it: a terminal answer clears it; a sign-in with the wrong email or a
 * network failure keeps it. It is not one of clearUserLocalStorage's keys, so it survives signing out to sign in again.
 *
 * NO IMPORTS: main.tsx imports this before rendering, so anything here lands in the entry chunk (aws-amplify must not:
 * the API calls are in inviteApi.ts, loaded with the banner).
 */

export const INVITE_KEY = 'cp_premium_invite';
/** The server's token: 43 base64url characters (backend invitations.ts isTokenShaped). */
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
/** Kept at most this long when the server has not said when it expires (the link lives 7 days). */
const FALLBACK_MS = 7 * 86_400_000;

interface Stored { token: string; until: number }

/* Both storages blocked (Fable): kept for this page's life, so the first visit still works. */
let memory: Stored | null = null;

function stores(): Storage[] {
  const out: Storage[] = [];
  try { if (window.localStorage) out.push(window.localStorage); } catch { /* blocked */ }
  try { if (window.sessionStorage) out.push(window.sessionStorage); } catch { /* blocked */ }
  return out;
}

function write(value: Stored): void {
  const all = stores();
  for (const s of all) {
    try {
      s.setItem(INVITE_KEY, JSON.stringify(value));
      /* The store that took it is the only one holding a token: a full localStorage that refused this write must not
         keep handing out the OLDER invitation (Codex). */
      for (const other of all) if (other !== s) { try { other.removeItem(INVITE_KEY); } catch { /* none */ } }
      memory = null;
      return;
    } catch { /* full or blocked: try the next */ }
  }
  memory = value;
}

/** Fired after a link was captured on a page already open (a fragment-only navigation): the banner reads it again. */
export const INVITE_EVENT = 'cp-premium-invite';

export function clearInvite(): void {
  memory = null;
  for (const s of stores()) { try { s.removeItem(INVITE_KEY); } catch { /* none */ } }
}

/**
 * Read `#invite=` from the address, store it (a newer link replaces an older one) and remove the fragment. Run once,
 * before rendering. Anything after the token (a link rewriter's '&x=1') is removed with it (Fable); only a token-shaped
 * value is stored. Any other fragment is left alone.
 */
export function captureInviteFromLocation(loc: Location = window.location, nowMs = Date.now()): boolean {
  const match = /^#invite=([^&]*)/.exec(loc.hash);
  if (!match) return false;
  try { window.history.replaceState(window.history.state, '', loc.pathname + loc.search); } catch { /* none */ }
  if (TOKEN.test(match[1])) write({ token: match[1], until: nowMs + FALLBACK_MS });
  return true;
}

/** The stored token, or null when there is none or it has run out (then it is cleared). */
export function readInvite(nowMs = Date.now()): string | null {
  for (const s of stores()) {
    let raw: string | null = null;
    try { raw = s.getItem(INVITE_KEY); } catch { continue; }
    if (!raw) continue;
    try {
      const v = JSON.parse(raw) as Stored;
      if (typeof v?.token === 'string' && TOKEN.test(v.token) && typeof v.until === 'number' && v.until > nowMs) return v.token;
    } catch { /* malformed */ }
    clearInvite();
    return null;
  }
  if (memory && memory.until > nowMs) return memory.token;
  memory = null;
  return null;
}

/** Keep the token no longer than the server says the invitation lives. */
export function limitInvite(token: string, expiresAtSqliteUtc: string): void {
  const until = Date.parse(`${expiresAtSqliteUtc.replace(' ', 'T')}Z`);
  if (Number.isFinite(until)) write({ token, until });
}

