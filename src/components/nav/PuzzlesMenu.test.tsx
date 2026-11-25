import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PuzzlesMenu, PuzzlesMenuGroup, isPuzzlesPath, puzzlesItems } from './PuzzlesMenu';

const logGA4Event = vi.fn();
vi.mock('@/services/analytics', () => ({ logGA4Event: (e: unknown) => logGA4Event(e) }));

function inRouter(ui: React.ReactElement, path = '/puzzles') {
  return render(<MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>);
}

beforeEach(() => logGA4Event.mockClear());

describe('the Puzzles list in the nav', () => {
  it('holds the two ways in, in order, the second on its own page', () => {
    expect(puzzlesItems('x').map((i) => [i.id, i.to, i.label])).toEqual([
      ['puzzles', '/puzzles', 'Puzzles'],
      ['my_games', '/puzzles/from-games', 'From My Games'],
    ]);
  });

  it('keeps both links in the page while the list is closed, so crawlers still see them', () => {
    const { container } = inRouter(<PuzzlesMenu isActive={false} />);
    const list = container.querySelector('.nav-play-list') as HTMLElement;
    expect(list.hidden).toBe(true);
    const hrefs = [...list.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(['/puzzles', '/puzzles/from-games']);
  });

  it('goes to /puzzles when the item itself is pressed, and says which menu it is', () => {
    const { container } = inRouter(<PuzzlesMenu isActive={false} />);
    const trigger = container.querySelector('.nav-play > a') as HTMLAnchorElement;
    expect(trigger.getAttribute('href')).toBe('/puzzles');
    expect(container.querySelector('.nav-play')?.getAttribute('data-nav-menu')).toBe('puzzles');
  });

  it('opens from the keyboard (Arrow Down) and closes on Escape', () => {
    const { container } = inRouter(<PuzzlesMenu isActive={false} />);
    const list = container.querySelector('.nav-play-list') as HTMLElement;
    const trigger = container.querySelector('.nav-play > a') as HTMLAnchorElement;
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    expect(list.hidden).toBe(false);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(list.hidden).toBe(true);
  });

  it('is marked current when the page is one of its own', () => {
    const { container } = inRouter(<PuzzlesMenu isActive />, '/puzzles/from-games');
    expect(container.querySelector('.nav-play > a [data-active="true"]')).not.toBeNull();
  });

  it('reports which item was pressed, and from where', () => {
    const { container } = inRouter(<PuzzlesMenu isActive={false} />);
    const trigger = container.querySelector('.nav-play > a') as HTMLAnchorElement;
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    fireEvent.click(container.querySelector('[data-play-item="my_games"]') as HTMLElement);
    expect(logGA4Event).toHaveBeenCalledWith({ name: 'nav_puzzles_menu_clicked', params: { item: 'my_games', surface: 'desktop' } });
  });
});

describe('Puzzles is current wherever the trainer lives', () => {
  it.each(['/puzzles', '/puzzles/progress', '/puzzles/plan', '/puzzles/from-games'])('%s', (path) => {
    expect(isPuzzlesPath(path)).toBe(true);
  });

  it.each(['/', '/play', '/puzzles-x', '/player/someone'])('%s is not', (path) => {
    expect(isPuzzlesPath(path)).toBe(false);
  });
});

describe('the phone menu group', () => {
  it('is closed on another page, and its links really are not drawn (the class hides them, not only the attribute)', () => {
    const { container } = inRouter(<PuzzlesMenuGroup isActive={false} onNavigate={() => {}} />, '/news');
    const list = container.querySelector('[data-play-item]')?.parentElement as HTMLElement;
    expect(list.hidden).toBe(true);
    expect(list.classList.contains('hidden')).toBe(true);
    expect(list.classList.contains('flex')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: /Puzzles/ }));
    expect(list.hidden).toBe(false);
    expect(list.classList.contains('flex')).toBe(true);
  });

  it('starts open on a puzzles page, and pressing a link closes the menu and reports it', () => {
    const onNavigate = vi.fn();
    const { container } = inRouter(<PuzzlesMenuGroup isActive onNavigate={onNavigate} />, '/puzzles/plan');
    const list = container.querySelector('[data-play-item]')?.parentElement as HTMLElement;
    expect(list.hidden).toBe(false);
    fireEvent.click(container.querySelector('[data-play-item="my_games"]') as HTMLElement);
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(logGA4Event).toHaveBeenCalledWith({ name: 'nav_puzzles_menu_clicked', params: { item: 'my_games', surface: 'mobile' } });
  });
});
