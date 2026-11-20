import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { GamesTablePlaceholder, GAMES_PER_PAGE } from './GamesTablePlaceholder';

/*
  The champion list pages are built into their HTML in this state (prerender plan D1). It must hold a page of rows (the
  loaded table is the same height, so nothing below moves when the games arrive) and no words a search result could
  show: the build guard refuses "Loading" anywhere in a built page's text.
*/
describe('GamesTablePlaceholder', () => {
  it('is a full page of blank rows, with no loading words in its text', () => {
    const { container } = render(<GamesTablePlaceholder pagination="h-10" />, { wrapper: MemoryRouter });
    expect(container.querySelectorAll('tbody tr')).toHaveLength(GAMES_PER_PAGE);
    expect(container.textContent).not.toMatch(/Loading/);
    expect(screen.getByRole('status', { name: 'Loading games' })).toBeTruthy();
    expect(container.querySelector('.animate-spin')).toBeNull();
  });

  it('keeps the frame when the games could not be loaded, and retries', () => {
    const onRetry = vi.fn();
    const { container } = render(<GamesTablePlaceholder pagination="h-9" onRetry={onRetry} />, { wrapper: MemoryRouter });
    expect(container.querySelectorAll('tbody tr')).toHaveLength(GAMES_PER_PAGE);
    expect(screen.getByText('The games could not be loaded.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
