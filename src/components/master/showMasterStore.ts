import { useSyncExternalStore } from 'react';

import { userPreferencesService } from '@/services/UserPreferencesService';

/**
 * THE "SHOW THE MASTER" CHOICE (MASTER_CHARACTER_IMPLEMENTATION_PLAN A3, #186).
 *
 * Built exactly like the board theme's store (`useBoardTheme.ts`): this browser's choice in localStorage
 * answers at once, the server's (`show_master` on user_preferences, kept for a guest and an account alike)
 * arrives after and wins unless the visitor chose in between, and another tab's change is heard through the
 * `storage` event. On by default (owner, Q1).
 */
export const SHOW_MASTER_STORAGE_KEY = 'cp_show_master';

let current: boolean | null = null;
let started = false;
/** Bumped by every local choice, so a server answer that started earlier cannot overwrite it. */
let localChanges = 0;
const listeners = new Set<() => void>();

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

function fromStorage(): boolean {
  try {
    return storage()?.getItem(SHOW_MASTER_STORAGE_KEY) !== '0';
  } catch {
    return true;
  }
}

function set(value: boolean) {
  if (current === value) return;
  current = value;
  listeners.forEach((l) => l());
}

function loadFromServer() {
  const asked = localChanges;
  userPreferencesService.loadFromServer().then((prefs) => {
    if (typeof prefs?.showMaster !== 'boolean' || localChanges !== asked) return;
    try {
      storage()?.setItem(SHOW_MASTER_STORAGE_KEY, prefs.showMaster ? '1' : '0');
    } catch {
      /* the choice still applies for this visit */
    }
    set(prefs.showMaster);
  });
}

function start() {
  if (started) return;
  started = true;
  current ??= fromStorage();
  loadFromServer();
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => {
      if (e.key === SHOW_MASTER_STORAGE_KEY) set(e.newValue !== '0');
    });
  }
}

function subscribe(listener: () => void) {
  start();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): boolean {
  return (current ??= fromStorage());
}

export function setShowMaster(value: boolean) {
  localChanges++;
  try {
    storage()?.setItem(SHOW_MASTER_STORAGE_KEY, value ? '1' : '0');
  } catch {
    /* the choice still applies for this visit */
  }
  set(value);
  userPreferencesService.save({ showMaster: value });
}

/** Re-resolve after the identity changes (sign-in, sign-out), as `reloadBoardTheme` does. */
export function reloadShowMaster() {
  set(fromStorage());
  if (started) loadFromServer();
}

export function useShowMaster() {
  const show = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return { show, setShow: setShowMaster };
}

/** Tests only: forget everything, as a fresh page load would. */
export function resetShowMasterStoreForTests() {
  current = null;
  started = false;
  localChanges = 0;
  listeners.clear();
}
