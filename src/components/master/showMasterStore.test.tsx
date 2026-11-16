import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';

let resolveServer: (v: { showMaster?: boolean } | null) => void = () => {};
vi.mock('@/services/UserPreferencesService', () => ({
  userPreferencesService: {
    loadFromServer: vi.fn(() => new Promise((r) => { resolveServer = r; })),
    save: vi.fn(),
  },
}));

import { SHOW_MASTER_STORAGE_KEY, resetShowMasterStoreForTests, useShowMaster } from './showMasterStore';
import { userPreferencesService } from '@/services/UserPreferencesService';
import { PuzzleAppearanceCard } from '@/features/puzzles/components/PuzzleAppearanceCard';

function Probe() {
  const { show, setShow } = useShowMaster();
  return <button data-testid="probe" onClick={() => setShow(!show)}>{show ? 'shown' : 'hidden'}</button>;
}

beforeEach(() => {
  localStorage.clear();
  resetShowMasterStoreForTests();
  vi.mocked(userPreferencesService.save).mockClear();
});
afterEach(() => resetShowMasterStoreForTests());

describe('the "Show the Master" choice', () => {
  it('is on by default (owner, Q1)', () => {
    render(<Probe />);
    expect(screen.getByTestId('probe').textContent).toBe('shown');
  });

  it('a choice is kept in this browser and sent to the server', () => {
    render(<Probe />);
    fireEvent.click(screen.getByTestId('probe'));
    expect(screen.getByTestId('probe').textContent).toBe('hidden');
    expect(localStorage.getItem(SHOW_MASTER_STORAGE_KEY)).toBe('0');
    expect(userPreferencesService.save).toHaveBeenCalledWith({ showMaster: false });
  });

  it('the server\'s choice applies (another device), unless the visitor chose since asking', async () => {
    render(<Probe />);
    await act(async () => { resolveServer({ showMaster: false }); });
    expect(screen.getByTestId('probe').textContent).toBe('hidden');

    resetShowMasterStoreForTests();
    localStorage.clear();
    render(<Probe />);
    const probes = screen.getAllByTestId('probe');
    fireEvent.click(probes[probes.length - 1]); // chose "hidden" before the server answered
    fireEvent.click(probes[probes.length - 1]); // and back to "shown"
    await act(async () => { resolveServer({ showMaster: false }); });
    expect(probes[probes.length - 1].textContent).toBe('shown');
  });
});

describe('the Appearance card control', () => {
  it('is drawn only where the page passes it', () => {
    const { rerender } = render(<PuzzleAppearanceCard currentThemeId="blue" onThemeChange={() => {}} onToggleSound={() => {}} />);
    expect(screen.queryByRole('button', { name: /the Master/ })).toBeNull();
    rerender(<PuzzleAppearanceCard currentThemeId="blue" onThemeChange={() => {}} onToggleSound={() => {}} showMaster onToggleShowMaster={() => {}} />);
    const button = screen.getByRole('button', { name: 'Hide the Master' });
    expect(button.getAttribute('aria-pressed')).toBe('true');
  });
});
