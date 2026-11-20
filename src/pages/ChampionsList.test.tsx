import { fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { SiteShell } from '@/app/SiteShell';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ChampionsList from './ChampionsList';

vi.mock('@/components/Navigation', () => ({ Navigation: () => <nav>Navigation</nav> }));
vi.mock('@/components/Footer', () => ({ Footer: () => <footer>Footer</footer> }));
vi.mock('@/components/SeoHead', () => ({ default: ({ children }: { children?: React.ReactNode }) => <div data-testid="seo-head">{children}</div> }));

function renderPage() {
  /*
    RENDERED INSIDE THE SHELL, because that is where the page lives (#55). The
    nav, the page frame and the footer belong to `SiteShell` now; a page test
    that mounted the page alone would assert a nav the page no longer owns.
  */
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}><MemoryRouter><SiteShell><ChampionsList /></SiteShell></MemoryRouter></QueryClientProvider>);
}

beforeEach(() => vi.stubGlobal('fetch', vi.fn(() => new Promise(() => undefined))));
afterEach(() => vi.unstubAllGlobals());

/* The list is the site's own roster, bundled (prerender plan D3): rendered at once, in the build and the browser. */
describe('ChampionsList visual, data and SEO contract', () => {
  it('renders the whole chronology on the first render, with no request for it', () => {
    renderPage();
    expect(screen.getByRole('table', { name: 'Complete chronology' })).toBeVisible();
    expect(screen.getByText('18 champions')).toBeVisible();
    expect(screen.queryByText(/Loading/)).toBeNull();
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes('players_list'))).toBe(false);
  });

  it('preserves newest-first rows while showing historical champion numbers', () => {
    renderPage();
    const rows = within(screen.getByRole('table', { name: 'Complete chronology' })).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(18);
    expect(rows[0]).toHaveTextContent('18');
    expect(rows[0]).toHaveTextContent('Gukesh Dommaraju');
    expect(rows.at(-1)).toHaveTextContent('1');
    expect(rows.at(-1)).toHaveTextContent('Wilhelm Steinitz');
  });

  it('keeps ItemList positions independent from historical champion numbers', () => {
    renderPage();
    const scripts = screen.getByTestId('seo-head').querySelectorAll('script');
    expect(scripts).toHaveLength(2);
    const itemList = JSON.parse(scripts[1].textContent ?? '{}');
    expect(itemList.numberOfItems).toBe(18);
    expect(itemList.itemListElement[0]).toMatchObject({ position: 1, item: { name: 'Gukesh Dommaraju' } });
    expect(itemList.itemListElement[17]).toMatchObject({ position: 18, item: { name: 'Wilhelm Steinitz' } });
  });

  it('uses one accessible internal Games destination per champion', () => {
    renderPage();
    expect(screen.getAllByRole('link', { name: /^View games by / })).toHaveLength(18);
    expect(screen.getByRole('link', { name: 'View games by Garry Kasparov' })).toHaveAttribute('href', '/champions/kasparov/games');
    expect(document.querySelector('a button, button a')).toBeNull();
  });

  it('retains native labelled table semantics and minimum-size controls', () => {
    renderPage();
    const table = screen.getByRole('table', { name: 'Complete chronology' });
    expect(table.querySelectorAll('th[scope="col"]')).toHaveLength(5);
    expect(screen.getByRole('link', { name: 'View Champions Gallery' })).toHaveClass('min-h-10');
    expect(screen.getByRole('link', { name: 'View games by Gukesh Dommaraju' })).toHaveClass('min-h-10');
  });

  it('hides only a failed flag and retains the row metadata', () => {
    const { container } = renderPage();
    const flags = container.querySelectorAll<HTMLImageElement>('img[src*="flagcdn.com"]');
    expect(flags).toHaveLength(18);
    fireEvent.error(flags[0]);
    expect(container.querySelectorAll('img[src*="flagcdn.com"]')).toHaveLength(17);
    expect(screen.getByText('Gukesh Dommaraju')).toBeVisible();
    expect(screen.getAllByText('India').length).toBeGreaterThan(0);
  });
});
