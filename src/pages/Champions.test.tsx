import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { backendAPIClient } from '@/services/BackendAPIClient';
import { CHAMPION_ROSTER } from '@/features/champions/championRoster';

vi.mock('@/components/Navigation', () => ({
  Navigation: () => <nav data-testid="navigation" />,
}));

vi.mock('@/components/Footer', () => ({
  Footer: () => <footer data-testid="footer" />,
}));

vi.mock('@/components/SeoHead', () => ({
  default: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

import Champions from './Champions';

function renderPage() {
  return render(
    <MemoryRouter>
      <Champions />
    </MemoryRouter>,
  );
}

/*
  The gallery is the site's own roster, bundled (prerender plan D3, 2026-11-19): the same in the build and the browser.
  It used to swap to the API's biographies after the first paint; owner: the file's are kept, the API is not asked.
*/
describe('Champions data and route contract', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => undefined)));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders all 18 champions with the file\'s biographies on the first render, asking nothing', () => {
    const getPlayers = vi.spyOn(backendAPIClient, 'getPlayers');
    renderPage();
    expect(screen.getAllByRole('article')).toHaveLength(18);
    expect(screen.getByText('18 champions')).toBeVisible();
    expect(screen.getByText(CHAMPION_ROSTER.Fischer.biography)).toBeVisible();
    expect(screen.queryByLabelText('Loading champions')).toBeNull();
    expect(getPlayers).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('keeps the reign order of the roster, newest first', () => {
    renderPage();
    const cards = screen.getAllByRole('article');
    expect(cards[0]).toHaveTextContent('Gukesh Dommaraju');
    expect(cards.at(-1)).toHaveTextContent('Wilhelm Steinitz');
  });

  it('preserves SEO structure and all existing card destinations', () => {
    const { container } = renderPage();

    expect(screen.getByRole('heading', { level: 1, name: 'World Chess Champions' })).toBeVisible();
    expect(container.querySelectorAll('script[type="application/ld+json"]')).toHaveLength(1);
    /*
      THE FOOTER IS NOT THIS PAGE'S ANY MORE (#72). It moved to the content
      layout route, so asserting it here would test the shell through a page -
      and would have passed just as well against the arrangement where all 32
      pages rendered their own. `pageKind.test.tsx` owns it now, including the
      node-identity check a presence assertion cannot make.
    */
    expect(screen.getAllByRole('link', { name: 'View all games by Gukesh Dommaraju' })[0]).toHaveAttribute(
      'href',
      '/champions/gukesh/games',
    );
    expect(screen.getAllByRole('link', { name: /Best 100/ })[0]).toHaveAttribute(
      'href',
      '/champions/gukesh/best-games',
    );
    expect(screen.getAllByRole('link', { name: 'View all games by Gukesh Dommaraju' })[1]).toHaveAttribute(
      'href',
      '/champions/gukesh/games',
    );
  });
});
