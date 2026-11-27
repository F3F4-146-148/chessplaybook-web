/**
 * The day's summary is said once (owner, 2026-11-27): after the ask appears, the page rebuilds the summary from the
 * refused puzzle's answer on every render, so a move stepped through on the board (a re-render) restarted the Master
 * from his first line. A re-render with the same summary must never start him again.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DaySummaryCard } from './DaySummaryCard';
import { MASTER_VOICE_KEY } from '@/features/master/useMasterVoice';
import type { DaySummary } from '../lib/daySummary';

const played: string[] = [];

class FakeAudio {
  src = '';
  preload = '';
  volume = 1;
  currentTime = 0;
  paused = true;
  constructor(src?: string) { if (src) this.src = src; }
  play() { played.push(this.src); this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; }
  load() {}
  addEventListener() {}
  removeEventListener() {}
  removeAttribute() {}
}

/** A fresh object each call, with the same content: what `asDaySummary(askLimit.daySummary)` gives every render. */
const summary = (): DaySummary => ({
  day: '2026-11-27', points: [1200, 1210, 1225], attempts: 5, solved: 4, shape: 'up', heading: 'Today',
  lines: [{ key: '0123456789abcdef', text: 'A good day.' }, { key: 'fedcba9876543210', text: 'Five more tomorrow.' }],
} as unknown as DaySummary);

describe('DaySummaryCard voice', () => {
  beforeEach(() => {
    played.length = 0;
    window.localStorage.setItem(MASTER_VOICE_KEY, '1');
    vi.stubGlobal('Audio', FakeAudio);
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('[]'))));
  });

  it('a re-render with an equal summary does not start him again', async () => {
    const view = render(<MemoryRouter><DaySummaryCard summary={summary()} /></MemoryRouter>);
    await new Promise((r) => setTimeout(r, 30));
    const first = played.length;
    expect(first).toBeGreaterThan(0);
    for (let i = 0; i < 3; i++) {
      view.rerender(<MemoryRouter><DaySummaryCard summary={summary()} /></MemoryRouter>);
      await new Promise((r) => setTimeout(r, 30));
    }
    expect(played.length).toBe(first);
  });

  it('a different summary (new lines) is said', async () => {
    const view = render(<MemoryRouter><DaySummaryCard summary={summary()} /></MemoryRouter>);
    await new Promise((r) => setTimeout(r, 30));
    const first = played.length;
    const other = { ...summary(), lines: [{ key: 'aaaaaaaaaaaaaaaa', text: 'Another line.' }] } as unknown as DaySummary;
    view.rerender(<MemoryRouter><DaySummaryCard summary={other} /></MemoryRouter>);
    await new Promise((r) => setTimeout(r, 30));
    expect(played.length).toBeGreaterThan(first);
  });
});
