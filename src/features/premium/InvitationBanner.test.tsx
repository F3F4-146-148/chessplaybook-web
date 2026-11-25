/**
 * The invitation banner (premium grants plan D6), one test per server answer, the owner-approved wording (2026-11-24).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

let user: { userId: string; email: string; username: string } | null = null;
const signOutUser = vi.fn();
const refresh = vi.fn(async () => null);
const peek = vi.fn();
const redeem = vi.fn();
const events: unknown[] = [];
vi.mock('@/features/auth/AuthContext', () => ({ useAuth: () => ({ user, isLoading: false, signOutUser }) }));
vi.mock('./AccountPremium', () => ({ useAccountPremium: () => ({ refresh }) }));
vi.mock('./inviteApi', () => ({ peekInvite: (t: string) => peek(t), redeemInvite: (t: string) => redeem(t) }));
vi.mock('@/services/analytics', () => ({ logGA4Event: (e: unknown) => events.push(e) }));

import { InvitationBanner } from './InvitationBanner';
import { INVITE_KEY, readInvite } from './invitation';

const TOKEN = 'k'.repeat(43);
function store() { localStorage.setItem(INVITE_KEY, JSON.stringify({ token: TOKEN, until: Date.now() + 86_400_000 })); }
const banner = () => document.querySelector('[data-premium="invite"]');
const show = () => render(<MemoryRouter><InvitationBanner /></MemoryRouter>);

describe('the invitation banner on /premium (D6)', () => {
  beforeEach(() => { localStorage.clear(); sessionStorage.clear(); user = null; peek.mockReset(); redeem.mockReset(); refresh.mockClear(); events.length = 0; });

  it('nothing without an invitation, and nothing asked of the server', async () => {
    show();
    await new Promise((r) => setTimeout(r, 20));
    expect(banner()).toBeNull();
    expect(peek).not.toHaveBeenCalled();
  });

  it('signed out: the invitation, its length and the masked email, with Sign in and Create a free account returning here', async () => {
    store();
    peek.mockResolvedValue({ valid: true, email: 'm***@gmail.com', length: { kind: 'months', months: 12 }, expiresAt: '2099-01-01 00:00:00.000' });
    show();
    expect(await screen.findByText("You're invited to Premium for 12 months. Sign in or create a free account with m***@gmail.com to start it.")).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Sign in' }).getAttribute('href')).toBe('/login?returnTo=%2Fpremium');
    expect(screen.getByRole('link', { name: 'Create a free account' }).getAttribute('href')).toBe('/signup?returnTo=%2Fpremium');
    expect(redeem).not.toHaveBeenCalled();
    expect(readInvite()).toBe(TOKEN);
  });

  it('signed out, no end date', async () => {
    store();
    peek.mockResolvedValue({ valid: true, email: 'm***@gmail.com', length: { kind: 'none' }, expiresAt: '2099-01-01 00:00:00.000' });
    show();
    expect(await screen.findByText(/You're invited to Premium with no end date\./)).toBeTruthy();
  });

  it('signed out, not valid: said, and the token forgotten', async () => {
    store();
    peek.mockResolvedValue({ valid: false });
    show();
    expect(await screen.findByText('This invitation has expired or was already used. Write to support@chessplaybook.com for a new one.')).toBeTruthy();
    expect(readInvite()).toBeNull();
  });

  it('signed in: redeemed, said, the account re-read, the token forgotten; never the token in an event', async () => {
    store();
    user = { userId: 's', email: 'me@example.com', username: 'me' };
    redeem.mockResolvedValue({ status: 'granted', grantId: 1, endsAt: null });
    show();
    expect(await screen.findByText('Your Premium has started. It has no end date.')).toBeTruthy();
    expect(refresh).toHaveBeenCalled();
    expect(readInvite()).toBeNull();
    expect(JSON.stringify(events)).not.toContain(TOKEN);
    expect(events).toEqual([{ name: 'premium_invite', params: { state: 'granted' } }]);
  });

  it('signed in with the wrong email: said with both masked, Sign out offered, the token KEPT', async () => {
    store();
    user = { userId: 's', email: 'j@example.com', username: 'j' };
    redeem.mockResolvedValue({ status: 'wrong_email', invited: 'm***@gmail.com', signedIn: 'j***@yahoo.com' });
    show();
    expect(await screen.findByText("This invitation is for m***@gmail.com. You're signed in as j***@yahoo.com. Sign out and sign in with m***@gmail.com to use it.")).toBeTruthy();
    screen.getByRole('button', { name: 'Sign out' }).click();
    expect(signOutUser).toHaveBeenCalled();
    expect(readInvite()).toBe(TOKEN);
  });

  it('Codex: a new user object for the same account (a token refresh) mid-redeem neither re-sends nor drops the answer', async () => {
    store();
    user = { userId: 's', email: 'me@example.com', username: 'me' };
    let release!: (v: unknown) => void;
    redeem.mockReturnValue(new Promise((r) => { release = r; }));
    const view = show();
    await waitFor(() => expect(redeem).toHaveBeenCalledTimes(1));
    user = { userId: 's', email: 'me@example.com', username: 'me' }; // the auth layer's refresh: same account, new object
    view.rerender(<MemoryRouter><InvitationBanner /></MemoryRouter>);
    release({ status: 'granted', grantId: 1, endsAt: null });
    expect(await screen.findByText('Your Premium has started. It has no end date.')).toBeTruthy();
    expect(redeem).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalled();
  });

  it('Codex: "already yours" says Premium is running only while the given Premium is; else the invitation reads as used', async () => {
    store();
    user = { userId: 's', email: 'me@example.com', username: 'me' };
    redeem.mockResolvedValue({ status: 'already_yours' });
    refresh.mockResolvedValueOnce({ premium: false, kind: null, entitled: true, grant: { endsAt: null } } as never);
    const one = show();
    expect(await screen.findByText('This invitation is already yours. Your Premium is running.')).toBeTruthy();
    one.unmount();
    store();
    refresh.mockResolvedValueOnce({ premium: false, kind: null, entitled: false, grant: null } as never);
    show();
    expect(await screen.findByText('This invitation has expired or was already used. Write to support@chessplaybook.com for a new one.')).toBeTruthy();
    expect(readInvite()).toBeNull();
  });

  it('Fable: signing out after a grant asks nothing more and keeps the grant line (no "expired" peek)', async () => {
    store();
    user = { userId: 's', email: 'me@example.com', username: 'me' };
    redeem.mockResolvedValue({ status: 'granted', grantId: 1, endsAt: null });
    const view = show();
    expect(await screen.findByText('Your Premium has started. It has no end date.')).toBeTruthy();
    user = null;
    view.rerender(<MemoryRouter><InvitationBanner /></MemoryRouter>);
    await new Promise((r) => setTimeout(r, 30));
    expect(peek).not.toHaveBeenCalled();
    expect(redeem).toHaveBeenCalledTimes(1);
  });

  it('Fable: already Premium from us re-reads the account', async () => {
    store();
    user = { userId: 's', email: 'me@example.com', username: 'me' };
    redeem.mockResolvedValue({ status: 'already_granted' });
    show();
    expect(await screen.findByText("You already have Premium from us with no end date, so you don't need this invitation.")).toBeTruthy();
    expect(refresh).toHaveBeenCalled();
  });

  it('Codex: a link opened in this tab later (main.tsx\'s event) is read and asked about', async () => {
    peek.mockResolvedValue({ valid: true, email: 'm***@gmail.com', length: { kind: 'none' }, expiresAt: '2099-01-01 00:00:00.000' });
    show();
    await new Promise((r) => setTimeout(r, 20));
    expect(banner()).toBeNull();
    store();
    window.dispatchEvent(new Event('cp-premium-invite'));
    expect(await screen.findByText(/You're invited to Premium with no end date\./)).toBeTruthy();
  });

  it.each([
    ['already_granted', "You already have Premium from us with no end date, so you don't need this invitation."],
    ['used_by_other', 'You already used this invitation with another way of signing in. Sign in that way to use your Premium.'],
    ['invalid', 'This invitation has expired or was already used. Write to support@chessplaybook.com for a new one.'],
  ])('signed in, %s: said, the token forgotten', async (status, words) => {
    store();
    user = { userId: 's', email: 'me@example.com', username: 'me' };
    redeem.mockResolvedValue({ status });
    show();
    expect(await screen.findByText(words)).toBeTruthy();
    expect(readInvite()).toBeNull();
  });

  it('the server not reached: "Try again" asks again, and the token is kept', async () => {
    store();
    user = { userId: 's', email: 'me@example.com', username: 'me' };
    redeem.mockResolvedValueOnce(null).mockResolvedValueOnce({ status: 'granted', grantId: 1, endsAt: null });
    show();
    expect(await screen.findByText("We couldn't check your invitation.")).toBeTruthy();
    expect(readInvite()).toBe(TOKEN);
    screen.getByRole('button', { name: 'Try again' }).click();
    await waitFor(() => expect(screen.getByText('Your Premium has started. It has no end date.')).toBeTruthy());
  });

  it('2026-11-25: a refused sign-in (401) is not the "could not check" line: Sign in again signs out and returns here; the token is kept', async () => {
    store();
    user = { userId: 's', email: 'me@example.com', username: 'me' };
    signOutUser.mockResolvedValue(undefined);
    redeem.mockResolvedValue({ status: 'sign_in_again' });
    render(<MemoryRouter initialEntries={['/premium']}><Routes><Route path="/premium" element={<InvitationBanner />} /><Route path="/login" element={<p>login page</p>} /></Routes></MemoryRouter>);
    expect(await screen.findByText('Your sign-in has run out. Sign in again to start your Premium.')).toBeTruthy();
    expect(readInvite()).toBe(TOKEN);
    expect(events).toEqual([{ name: 'premium_invite', params: { state: 'sign_in_again' } }]);
    screen.getByRole('button', { name: 'Sign in again' }).click();
    expect(await screen.findByText('login page')).toBeTruthy();
    expect(signOutUser).toHaveBeenCalled();
    expect(readInvite()).toBe(TOKEN);
  });

  it('2026-11-25: an unconfirmed email (403) is said as such, with no button, and the token is kept', async () => {
    store();
    user = { userId: 's', email: 'me@example.com', username: 'me' };
    redeem.mockResolvedValue({ status: 'unconfirmed' });
    show();
    expect(await screen.findByText("We can't start your Premium until your email address is confirmed. Write to support@chessplaybook.com and we'll sort it out.")).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
    expect(readInvite()).toBe(TOKEN);
  });
});
