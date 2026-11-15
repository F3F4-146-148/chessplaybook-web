/**
 * The app must not be re-created when the deferred auth provider arrives (2026-11-15).
 *
 * It was swapped in AROUND the app, a different component at the app's position, so React threw the
 * whole tree away and built it again: in Safari (no requestIdleCallback, a 3s timer) every page lost
 * what the visitor had done in its first seconds and fetched its data twice (measured on production:
 * WebKit re-created the tree ~3.3s after load). This mounts a page, lets the real provider load, and
 * requires the page to have mounted once and to read the real provider's value.
 */
import { act, render } from '@testing-library/react';
import { useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';

/* A stand-in for the real provider (the real one pulls aws-amplify): it hands up a signed-in user. */
vi.mock('@/features/auth/AuthContext', async () => {
  const React = await import('react');
  const { AuthContext } = await import('@/features/auth/authContextValue');
  const noop = () => Promise.resolve() as never;
  const value = {
    user: { userId: 'u1', email: 'a@example.com', username: 'Ana' }, isLoading: false,
    signInWithEmail: noop, signUpWithEmail: noop, confirmEmail: noop, resendCode: noop,
    signInWithGoogle: noop, signOutUser: noop, requestPasswordReset: noop, confirmNewPassword: noop,
  };
  return {
    /* Like the real one: with children it provides around them, with onValue it hands the value up. */
    AuthProvider: ({ children, onValue }: { children?: React.ReactNode; onValue?: (v: typeof value) => void }) => {
      React.useEffect(() => { onValue?.(value); }, [onValue]);
      return children === undefined ? null : React.createElement(AuthContext.Provider, { value }, children);
    },
    useAuth: () => React.useContext(AuthContext),
  };
});

import { Providers } from './providers';
import { useAuth } from '@/features/auth/AuthContext';

describe('Providers', () => {
  it('keeps the app mounted when the real auth provider arrives', async () => {
    vi.useFakeTimers();
    const mounts = { n: 0 };
    const seen: Array<string | null> = [];
    function Page() {
      const auth = useAuth();
      seen.push(auth?.user?.username ?? null);
      useEffect(() => { mounts.n += 1; }, []);
      return null;
    }
    render(<Providers><Page /></Providers>);
    expect(mounts.n).toBe(1);

    // jsdom has no requestIdleCallback: the provider loads on its 3s timer, then its value is handed up.
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    await act(async () => { await vi.runAllTimersAsync(); });
    vi.useRealTimers();

    expect(seen.at(-1)).toBe('Ana');
    expect(mounts.n).toBe(1);
  });
});
