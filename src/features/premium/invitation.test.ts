/**
 * The invitation link's token (premium grants plan D6): read from the fragment, stored, the fragment removed.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { captureInviteFromLocation, clearInvite, INVITE_KEY, limitInvite, readInvite } from './invitation';

const TOKEN = 'A'.repeat(20) + '_-' + 'b'.repeat(21); // 43 base64url characters
const OTHER = 'Z'.repeat(43);
const NOW = Date.parse('2026-11-24T12:00:00Z');

function at(url: string) { window.history.replaceState(null, '', url); }

describe('the invitation link (D6)', () => {
  beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
  afterEach(() => at('/'));

  it('stores the token and removes it from the address, keeping the path and query', () => {
    at(`/premium?x=1#invite=${TOKEN}`);
    expect(captureInviteFromLocation(window.location, NOW)).toBe(true);
    expect(window.location.hash).toBe('');
    expect(window.location.pathname + window.location.search).toBe('/premium?x=1');
    expect(window.location.href).not.toContain(TOKEN);
    expect(readInvite(NOW)).toBe(TOKEN);
  });

  it('Fable: anything after the token (a link rewriter\'s "&x=1") is removed with it; the token is still stored', () => {
    at(`/premium#invite=${TOKEN}&utm=1`);
    expect(captureInviteFromLocation(window.location, NOW)).toBe(true);
    expect(window.location.href).not.toContain(TOKEN);
    expect(readInvite(NOW)).toBe(TOKEN);
  });

  it('Fable: with both storages blocked, the token is kept for this page\'s life', () => {
    const real = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new DOMException('blocked', 'SecurityError'); };
    try {
      at(`/premium#invite=${TOKEN}`); captureInviteFromLocation(window.location, NOW);
    } finally { Storage.prototype.setItem = real; }
    expect(readInvite(NOW)).toBe(TOKEN);
    clearInvite();
    expect(readInvite(NOW)).toBeNull();
  });

  it('Fable: signing out (clearUserLocalStorage) keeps the invitation, so the right account can sign in', async () => {
    at(`/premium#invite=${TOKEN}`); captureInviteFromLocation(window.location, NOW);
    const { clearUserLocalStorage } = await import('@/features/auth/utils/oauth');
    clearUserLocalStorage();
    expect(readInvite(NOW)).toBe(TOKEN);
  });

  it('a malformed token is removed from the address and never stored', () => {
    at('/premium#invite=short');
    expect(captureInviteFromLocation(window.location, NOW)).toBe(true);
    expect(window.location.hash).toBe('');
    expect(readInvite(NOW)).toBeNull();
  });

  it('any other fragment is left alone', () => {
    at('/premium#premium-compare');
    expect(captureInviteFromLocation(window.location, NOW)).toBe(false);
    expect(window.location.hash).toBe('#premium-compare');
  });

  it('a newer link replaces an older one', () => {
    at(`/premium#invite=${TOKEN}`); captureInviteFromLocation(window.location, NOW);
    at(`/premium#invite=${OTHER}`); captureInviteFromLocation(window.location, NOW);
    expect(readInvite(NOW)).toBe(OTHER);
  });

  it('kept at most until the server says it expires, then gone; 7 days without a word from the server', () => {
    at(`/premium#invite=${TOKEN}`); captureInviteFromLocation(window.location, NOW);
    expect(readInvite(NOW + 7 * 86_400_000 - 1)).toBe(TOKEN);
    expect(readInvite(NOW + 7 * 86_400_000)).toBeNull();
    expect(localStorage.getItem(INVITE_KEY)).toBeNull();
    at(`/premium#invite=${TOKEN}`); captureInviteFromLocation(window.location, NOW);
    limitInvite(TOKEN, '2026-11-25 12:00:00.000');
    expect(readInvite(Date.parse('2026-11-25T11:59:59Z'))).toBe(TOKEN);
    expect(readInvite(Date.parse('2026-11-25T12:00:00Z'))).toBeNull();
  });

  it('Codex: a new link that only fits in sessionStorage (localStorage full) wins over the older one left in localStorage', () => {
    localStorage.setItem(INVITE_KEY, JSON.stringify({ token: TOKEN, until: NOW + 86_400_000 }));
    const real = Storage.prototype.setItem;
    Storage.prototype.setItem = function (this: Storage, k: string, v: string) {
      if (this === window.localStorage) throw new DOMException('full', 'QuotaExceededError');
      return real.call(this, k, v);
    };
    try {
      at(`/premium#invite=${OTHER}`); captureInviteFromLocation(window.location, NOW);
    } finally { Storage.prototype.setItem = real; }
    expect(readInvite(NOW)).toBe(OTHER);
  });

  it('clearInvite forgets it', () => {
    at(`/premium#invite=${TOKEN}`); captureInviteFromLocation(window.location, NOW);
    clearInvite();
    expect(readInvite(NOW)).toBeNull();
  });

  it('imports nothing: main.tsx loads it before rendering, so aws-amplify must not come with it', () => {
    const source = readFileSync(path.join(__dirname, 'invitation.ts'), 'utf8');
    expect(source).not.toMatch(/^\s*import[\s{(]/m);
    expect(source).not.toMatch(/\bimport\s*\(/);
    expect(source).not.toMatch(/^\s*export\s[^;]*\sfrom\s/m);
  });
});
