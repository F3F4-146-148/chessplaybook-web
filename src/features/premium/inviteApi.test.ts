/** How the redeem call reads the server's HTTP answer (2026-11-25: a refused sign-in is not "couldn't check"). */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/features/auth/utils/getAuthToken', () => ({ getAuthHeader: async () => ({ Authorization: 'Bearer t' }) }));
import { redeemInvite } from './inviteApi';

const answer = (status: number, body: unknown = {}) => vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status })));

describe('redeemInvite', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('401: sign in again', async () => { answer(401); expect(await redeemInvite('x')).toEqual({ status: 'sign_in_again' }); });
  it('403: the email is not confirmed', async () => { answer(403); expect(await redeemInvite('x')).toEqual({ status: 'unconfirmed' }); });
  it('200: the server\'s answer', async () => { answer(200, { status: 'invalid' }); expect(await redeemInvite('x')).toEqual({ status: 'invalid' }); });
  it('500 and a network failure: null (Try again)', async () => {
    answer(500); expect(await redeemInvite('x')).toBeNull();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline'); })); expect(await redeemInvite('x')).toBeNull();
  });
});
