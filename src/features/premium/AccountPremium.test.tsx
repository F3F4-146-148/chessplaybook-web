/**
 * The shared account-premium state (#467 plan A1a): lazy, ordered, cleared on a change of user, retried
 * after a failure, and kept out of the first bundle's import graph.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextType } from '@/features/auth/authContextValue';
import { ACCOUNT_PREMIUM_RETRIES_MS, AccountPremiumProvider, useAccountPremium } from './AccountPremium';
import type { PremiumState } from './paddleCheckout';

const noop = () => Promise.resolve() as never;
function auth(userId: string | null): AuthContextType {
  return {
    user: userId ? { userId, email: `${userId}@example.com`, username: userId } : null, isLoading: false,
    signInWithEmail: noop, signUpWithEmail: noop, confirmEmail: noop, resendCode: noop,
    signInWithGoogle: noop, signOutUser: noop, requestPasswordReset: noop, confirmNewPassword: noop,
  };
}
const premium = (on: boolean): PremiumState => ({ premium: on } as PremiumState);

function setup(fetchPremium: () => Promise<PremiumState | null>, initialUser: string | null = 'u1') {
  let user = initialUser;
  const loads = vi.fn(async () => fetchPremium);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <AuthContext.Provider value={auth(user)}>
      <AccountPremiumProvider fetcher={loads}>{children}</AccountPremiumProvider>
    </AuthContext.Provider>
  );
  return { wrapper, loads, setUser: (next: string | null) => { user = next; } };
}

describe('AccountPremiumProvider', () => {
  beforeEach(() => { vi.useRealTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('fetches nothing until a consumer asks', async () => {
    const fetchPremium = vi.fn(async () => premium(true));
    const { wrapper, loads } = setup(fetchPremium);
    const { result } = renderHook(() => useAccountPremium(), { wrapper });
    await act(async () => { await Promise.resolve(); });
    expect(loads).not.toHaveBeenCalled();
    expect(fetchPremium).not.toHaveBeenCalled();
    expect(result.current.known).toBe(false);
    expect(result.current.state).toBeNull();
  });

  it('a consumer with load reads once and shares the answer', async () => {
    const fetchPremium = vi.fn(async () => premium(true));
    const { wrapper } = setup(fetchPremium);
    const { result } = renderHook(() => ({ a: useAccountPremium({ load: true }), b: useAccountPremium({ load: true }) }), { wrapper });
    await waitFor(() => expect(result.current.a.known).toBe(true));
    expect(result.current.b.state?.premium).toBe(true);
    expect(fetchPremium).toHaveBeenCalledTimes(1);
  });

  it('a guest is never read', async () => {
    const fetchPremium = vi.fn(async () => premium(true));
    const { wrapper } = setup(fetchPremium, null);
    const { result } = renderHook(() => useAccountPremium({ load: true }), { wrapper });
    await act(async () => { await Promise.resolve(); });
    expect(fetchPremium).not.toHaveBeenCalled();
    expect(result.current.known).toBe(false);
  });

  it('a slow first read cannot overwrite a later one', async () => {
    let releaseFirst: (v: PremiumState) => void = () => {};
    const fetchPremium = vi.fn()
      .mockImplementationOnce(() => new Promise<PremiumState>((r) => { releaseFirst = r; }))
      .mockImplementationOnce(async () => premium(true));
    const { wrapper } = setup(fetchPremium);
    const { result } = renderHook(() => useAccountPremium(), { wrapper });
    let first: Promise<PremiumState | null> = Promise.resolve(null);
    act(() => { first = result.current.refresh(); });
    let second: PremiumState | null = null;
    await act(async () => { second = await result.current.refresh(); });
    expect(second).toEqual(premium(true));
    await waitFor(() => expect(fetchPremium).toHaveBeenCalledTimes(2));
    await act(async () => { releaseFirst(premium(false)); expect(await first).toBeNull(); });
    expect(result.current.state?.premium).toBe(true);
  });

  it('refresh resolves to the state it applied', async () => {
    const { wrapper } = setup(async () => premium(true));
    const { result } = renderHook(() => useAccountPremium(), { wrapper });
    let got: PremiumState | null = null;
    await act(async () => { got = await result.current.refresh(); });
    expect(got).toEqual(premium(true));
    expect(result.current.known).toBe(true);
  });

  it('a change of user clears the state and drops a read still on its way', async () => {
    let release: (v: PremiumState) => void = () => {};
    const fetchPremium = vi.fn()
      .mockImplementationOnce(async () => premium(true))
      .mockImplementationOnce(() => new Promise<PremiumState>((r) => { release = r; }));
    const { wrapper, setUser } = setup(fetchPremium);
    const { result, rerender } = renderHook(() => useAccountPremium(), { wrapper });
    await act(async () => { await result.current.refresh(); });
    expect(result.current.known).toBe(true);
    let late: Promise<PremiumState | null> = Promise.resolve(null);
    act(() => { late = result.current.refresh(); });
    await waitFor(() => expect(fetchPremium).toHaveBeenCalledTimes(2));
    setUser('u2');
    rerender();
    expect(result.current.known).toBe(false);
    expect(result.current.state).toBeNull();
    await act(async () => { release(premium(true)); expect(await late).toBeNull(); });
    expect(result.current.state).toBeNull();
    expect(result.current.userId).toBe('u2');
  });

  it('sign-out clears the state', async () => {
    const { wrapper, setUser } = setup(async () => premium(true));
    const { result, rerender } = renderHook(() => useAccountPremium({ load: true }), { wrapper });
    await waitFor(() => expect(result.current.known).toBe(true));
    setUser(null);
    rerender();
    expect(result.current.known).toBe(false);
    expect(result.current.state).toBeNull();
  });

  it('retries, reports failed, and a later load tries again', async () => {
    vi.useFakeTimers();
    const fetchPremium = vi.fn<() => Promise<PremiumState | null>>(async () => null);
    const { wrapper } = setup(fetchPremium);
    const { result } = renderHook(() => useAccountPremium({ load: true }), { wrapper });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    for (const ms of ACCOUNT_PREMIUM_RETRIES_MS) await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
    expect(fetchPremium).toHaveBeenCalledTimes(1 + ACCOUNT_PREMIUM_RETRIES_MS.length);
    expect(result.current.failed).toBe(true);
    expect(result.current.known).toBe(false);

    fetchPremium.mockImplementation(async () => premium(false));
    await act(async () => { result.current.load(); await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.failed).toBe(false);
    expect(result.current.known).toBe(true);
    expect(result.current.state?.premium).toBe(false);
  });

  it('setState counts as the newest read', async () => {
    let release: (v: PremiumState) => void = () => {};
    const fetchPremium = vi.fn(() => new Promise<PremiumState>((r) => { release = r; }));
    const { wrapper } = setup(fetchPremium);
    const { result } = renderHook(() => useAccountPremium(), { wrapper });
    let pending: Promise<PremiumState | null> = Promise.resolve(null);
    act(() => { pending = result.current.refresh(); });
    await waitFor(() => expect(fetchPremium).toHaveBeenCalledTimes(1));
    act(() => { result.current.setState(premium(true)); });
    await act(async () => { release(premium(false)); await pending; });
    expect(result.current.state?.premium).toBe(true);
  });

  it('throws without the provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useAccountPremium())).toThrow(/AccountPremiumProvider/);
    spy.mockRestore();
  });
});

describe('the first bundle stays without aws-amplify', () => {
  /* providers.tsx is always loaded; so is everything it imports statically. Only premiumFetch.ts reaches
     the sign-in code, and only through the provider's dynamic import(). */
  const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
  const staticImports = (src: string) =>
    [...src.matchAll(/^\s*import\s+(?!type\b)[^;]*?from\s+['"]([^'"]+)['"]/gm)].map((m) => m[1]);

  it('AccountPremium.tsx imports no sign-in code statically', () => {
    const imports = staticImports(read('src/features/premium/AccountPremium.tsx'));
    for (const banned of ['aws-amplify', 'getAuthToken', '@/features/auth/AuthContext', './usePremiumOffer', './premiumFetch']) {
      expect(imports.some((i) => i.includes(banned))).toBe(false);
    }
    expect(read('src/features/premium/AccountPremium.tsx')).toMatch(/import\('\.\/premiumFetch'\)/);
  });

  it('providers.tsx imports no sign-in code statically', () => {
    const imports = staticImports(read('src/app/providers.tsx'));
    for (const banned of ['aws-amplify', 'getAuthToken', '@/features/auth/AuthContext', 'usePremiumOffer', 'premiumFetch']) {
      expect(imports.some((i) => i === banned || i.endsWith(banned) || i.includes(`/${banned}`))).toBe(false);
    }
  });
});
