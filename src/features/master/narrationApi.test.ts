import { afterEach, describe, expect, it, vi } from 'vitest';

import { eventLine } from './eventLines';
import { fetchNarration, MASTER_VOICE } from './narrationApi';

afterEach(() => vi.unstubAllGlobals());

describe('fetchNarration', () => {
  it('names the voice in the request, so a browser never reuses an answer from an older voice', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ text: 'I push my pawn to e4.', audioUrl: '/a.mp3', cuesUrl: '/a.json' }) });
    vi.stubGlobal('fetch', fetch);
    const line = await fetchNarration('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'e2e4');
    expect(new URL(fetch.mock.calls[0][0], 'http://x').searchParams.get('voice')).toBe(MASTER_VOICE);
    expect(line).toEqual({ text: 'I push my pawn to e4.', audioUrl: '/a.mp3', cuesUrl: '/a.json' });
  });

  it('is the voice of the start and end lines too (one voice per game)', () => {
    expect(eventLine('start', 0).audioUrl).toContain(`/audio/master-v${MASTER_VOICE}/`);
  });
});
