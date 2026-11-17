import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const flags = vi.hoisted(() => ({ MASTER_LIVE: true }));
vi.mock('@/design/designFlags', () => flags);

import { MasterPortrait } from './MasterPortrait';

describe('MasterPortrait', () => {
  it('draws nothing while MASTER_LIVE is off, so every page is exactly today\'s', () => {
    flags.MASTER_LIVE = false;
    const { container } = render(<MasterPortrait expression="thinking" variant="head" facing="left" size={62} />);
    expect(container.innerHTML).toBe('');
    flags.MASTER_LIVE = true;
  });

  it('draws nothing when the visitor has turned him off', () => {
    const { container } = render(<MasterPortrait expression="thinking" variant="head" facing="left" size={62} show={false} />);
    expect(container.innerHTML).toBe('');
  });

  it('is a fixed square, decorative, and faces the board', () => {
    const { container } = render(<MasterPortrait expression="pleased" variant="half" facing="right" size={230} />);
    const box = container.firstElementChild as HTMLElement;
    expect(box.getAttribute('aria-hidden')).toBe('true');
    expect(box.style.width).toBe('230px');
    expect(box.style.height).toBe('230px');
    const img = box.querySelector('img[data-master-base]')!;
    expect(img.getAttribute('alt')).toBe('');
    expect(img.getAttribute('src')).toBe('/assets/master-v4/master-pleased-half-300-mirror.webp');
  });

  it('keeps the previous expression underneath while the new one fades in, then drops it', async () => {
    vi.useFakeTimers();
    const { container, rerender } = render(<MasterPortrait expression="thinking" variant="head" facing="left" size={62} />);
    rerender(<MasterPortrait expression="pleased" variant="head" facing="left" size={62} />);
    expect(container.querySelectorAll('img[data-master-base]')).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(250);
    const imgs = container.querySelectorAll('img[data-master-base]');
    expect(imgs).toHaveLength(1);
    expect(imgs[0].getAttribute('src')).toContain('master-pleased-head-');
    vi.useRealTimers();
  });

  it("carries the pose's six mouths and two blink frames, transparent and loaded, placed on the picture", () => {
    const { container } = render(<MasterPortrait expression="thinking" variant="head" facing="right" size={64} />);
    const layers = [...container.querySelectorAll<HTMLImageElement>('img[data-master-layer]')];
    expect(layers.map((l) => l.dataset.masterLayer).sort()).toEqual(
      ['eyes-half', 'eyes-shut', 'mouth-A', 'mouth-E', 'mouth-F', 'mouth-M', 'mouth-O', 'mouth-U']);
    for (const l of layers) {
      expect(l.style.opacity).toBe('0');
      expect(l.getAttribute('src')).toMatch(/^\/assets\/master-v4\/master-thinking-.*-head-112-mirror\.webp$/);
      expect(l.getAttribute('srcset')).toContain('-head-224-mirror.webp 2x');
      expect(l.style.left).toMatch(/%$/);
    }
  });

  it('has no layers on the finished "speaking" picture', () => {
    const { container } = render(<MasterPortrait expression="speaking" variant="head" facing="left" size={64} />);
    expect(container.querySelectorAll('img[data-master-layer]')).toHaveLength(0);
  });

  it("shows the mouth of the cue at the audio's time, a little ahead, and closes it when the audio stops", async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'] });
    const audio = { currentTime: 0, paused: false, ended: false } as unknown as HTMLAudioElement;
    const cues = [
      { shape: 'X' as const, start: 0, end: 0.2 },
      { shape: 'M' as const, start: 0.2, end: 0.3 },
      { shape: 'A' as const, start: 0.3, end: 0.6 },
      { shape: 'X' as const, start: 0.6, end: 0.8 },
    ];
    const { container } = render(<MasterPortrait expression="talking" variant="head" facing="left" size={64} speech={{ audio, cues }} />);
    const box = container.firstElementChild as HTMLElement;
    const on = () => [...container.querySelectorAll<HTMLImageElement>('img[data-master-layer^="mouth-"]')]
      .filter((l) => l.style.opacity === '1').map((l) => l.dataset.masterLayer);
    await vi.advanceTimersByTimeAsync(20);
    expect(box.dataset.masterMouth).toBe('X');
    expect(on()).toEqual([]);
    (audio as { currentTime: number }).currentTime = 0.18; // 0.21 with the lead: the M
    await vi.advanceTimersByTimeAsync(20);
    expect(on()).toEqual(['mouth-M']);
    (audio as { currentTime: number }).currentTime = 0.4;
    await vi.advanceTimersByTimeAsync(20);
    expect(on()).toEqual(['mouth-A']);
    (audio as { paused: boolean }).paused = true;
    await vi.advanceTimersByTimeAsync(20);
    expect(on()).toEqual([]);
    vi.useRealTimers();
  });

  it('blinks: half, shut, half, open, within six seconds', async () => {
    vi.useFakeTimers();
    const { container } = render(<MasterPortrait expression="pleased" variant="head" facing="left" size={64} />);
    const shut = () => container.querySelector<HTMLImageElement>('img[data-master-layer="eyes-shut"]')!.style.opacity;
    let seen = false;
    for (let t = 0; t < 6100 && !seen; t += 10) {
      await vi.advanceTimersByTimeAsync(10);
      if (shut() === '1') seen = true;
    }
    expect(seen).toBe(true);
    await vi.advanceTimersByTimeAsync(200);
    expect(shut()).toBe('0');
    vi.useRealTimers();
  });
});
