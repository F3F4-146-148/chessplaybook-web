/* #521 Phase F: the callback's one retry after the pre-sign-up trigger linked a Google sign-in. */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/config/env', () => ({ default: { cognitoDomain: 'auth.example', cognitoClientId: 'client' } }));
import { callbackErrorText, clearLinkRetry, shouldRetryAfterLink } from './oauth';

describe('callbackErrorText', () => {
  it('turns invalid_grant into words a person can act on, and leaves other errors as they are', () => {
    expect(callbackErrorText('Token exchange failed: {"error":"invalid_grant"}')).toMatch(/^We could not finish signing you in\./);
    expect(callbackErrorText('Session expired. Please try signing in again.')).toBe('Session expired. Please try signing in again.');
  });
});

const store = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};

describe('shouldRetryAfterLink', () => {
  it('retries once on our marker or Cognito\'s own wording, never twice', () => {
    const s = store();
    expect(shouldRetryAfterLink('PreSignUp failed with error CP_LINKED. ', s)).toBe(true);
    expect(shouldRetryAfterLink('PreSignUp failed with error CP_LINKED. ', s)).toBe(false);
    clearLinkRetry(s);
    expect(shouldRetryAfterLink('Already found an entry for username Google_1165', s)).toBe(true);
  });

  it('any other refusal is shown, not retried', () => {
    const s = store();
    expect(shouldRetryAfterLink(null, s)).toBe(false);
    expect(shouldRetryAfterLink('User is disabled.', s)).toBe(false);
    expect(s.getItem('cp_google_link_retry')).toBeNull();
  });
});
