/**
 * #559 (owner, 2026-11-28): on /play Why? he read the first reason and stopped. The second reason had no recording;
 * the site answers a missing file with its page, the browser refused to play it, and that refusal ended the whole
 * queue. A line that cannot be played is skipped: the lines after it are still said. Also: a page may start with his
 * voice on when the player has never chosen (/play), and a choice made anywhere wins.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const played: string[] = [];

class FakeAudio {
  src: string;
  volume = 1;
  paused = true;
  ended = false;
  currentTime = 0;
  playbackRate = 1;
  preload = '';
  private handlers: Record<string, Array<() => void>> = {};
  constructor(src = '') { this.src = src; }
  addEventListener(type: string, fn: () => void) { (this.handlers[type] ??= []).push(fn); }
  fire(type: string) { for (const fn of this.handlers[type] ?? []) fn(); }
  pause() { this.paused = true; }
  load() { /* released */ }
  removeAttribute() { this.src = ''; }
  play(): Promise<void> {
    if (this.src.includes('missing')) {
      // the browser refuses a page served as audio: the rejection comes first, the error event after it
      const e = Object.assign(new Error('not supported'), { name: 'NotSupportedError' });
      setTimeout(() => this.fire('error'), 5);
      return Promise.reject(e);
    }
    played.push(this.src);
    this.paused = false;
    setTimeout(() => { this.fire('playing'); setTimeout(() => { this.ended = true; this.fire('ended'); }, 20); }, 1);
    return Promise.resolve();
  }
}

import { useMasterVoice, MASTER_VOICE_KEY } from './useMasterVoice';

const line = (name: string) => ({ text: name, audioUrl: `/audio/master-v4/${name}.mp3` });

describe('useMasterVoice', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    played.length = 0;
    vi.stubGlobal('Audio', FakeAudio);
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false, json: () => Promise.resolve([]) })));
    localStorage.clear();
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('a line that cannot be played is skipped and the lines after it are said', async () => {
    localStorage.setItem(MASTER_VOICE_KEY, '1');
    const queue = [line('one'), line('missing'), line('three'), line('four')];
    renderHook(() => useMasterVoice(queue));
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(played).toEqual(['/audio/master-v4/one.mp3', '/audio/master-v4/three.mp3', '/audio/master-v4/four.mp3']);
  });

  it('defaultOn: on when the player has never chosen', () => {
    const { result } = renderHook(() => useMasterVoice(null, { defaultOn: true }));
    expect(result.current.on).toBe(true);
  });

  it('defaultOn: a choice made anywhere wins', () => {
    localStorage.setItem(MASTER_VOICE_KEY, '0');
    const { result } = renderHook(() => useMasterVoice(null, { defaultOn: true }));
    expect(result.current.on).toBe(false);
  });

  it('every page starts with his voice on when the player has never chosen (owner: "all voices")', () => {
    const { result } = renderHook(() => useMasterVoice(null));
    expect(result.current.on).toBe(true);
  });

  it('the trainer follows the site-wide choice until it has its own', () => {
    localStorage.setItem(MASTER_VOICE_KEY, '0');
    const { result } = renderHook(() => useMasterVoice(null, { voiceKey: 'cp_master_voice_openings' }));
    expect(result.current.on).toBe(false);
  });
});
