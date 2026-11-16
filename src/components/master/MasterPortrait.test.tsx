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
    const img = box.querySelector('img')!;
    expect(img.getAttribute('alt')).toBe('');
    expect(img.getAttribute('src')).toBe('/assets/master-v2/master-pleased-half-300-mirror.webp');
  });

  it('keeps the previous expression underneath while the new one fades in, then drops it', async () => {
    vi.useFakeTimers();
    const { container, rerender } = render(<MasterPortrait expression="thinking" variant="head" facing="left" size={62} />);
    rerender(<MasterPortrait expression="pleased" variant="head" facing="left" size={62} />);
    expect(container.querySelectorAll('img')).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(250);
    const imgs = container.querySelectorAll('img');
    expect(imgs).toHaveLength(1);
    expect(imgs[0].getAttribute('src')).toContain('master-pleased-head-');
    vi.useRealTimers();
  });
});
