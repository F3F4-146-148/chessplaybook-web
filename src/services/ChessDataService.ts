/**
 * Service for loading the champion roster. (Its reader of the bundled /assets/pgn/ collection files, which
 * nothing called, went with the files in #335: the champion games are never handed out in bulk.)
 */

import type { PlayersMap } from '../types/chess';

class ChessDataService {
  private playersCache: PlayersMap | null = null;

  /**
   * Load players list from JSON
   */
  async loadPlayers(): Promise<PlayersMap> {
    if (this.playersCache) {
      return this.playersCache;
    }

    try {
      const response = await fetch('/assets/players/players_list.json');
      if (!response.ok) {
        throw new Error(`Failed to load players: ${response.statusText}`);
      }
      this.playersCache = await response.json();
      return this.playersCache!;
    } catch (error) {
      console.error('Error loading players:', error);
      throw error;
    }
  }

  /**
   * Order a list of champion slugs by reign, newest first — the order
   * `/champions` renders and the order visitors expect everywhere else.
   *
   * The order is the key order of `players_list.json`, which is authored
   * newest-first. That is deliberately the same mechanism the Champions page
   * uses (it maps `Object.entries` with no sort), so the two cannot drift: if
   * the file is ever re-ordered, both move together. Parsing
   * `championshipYears` instead would be more explicit but would introduce a
   * second, independent notion of order — exactly the drift worth avoiding.
   *
   * Champions missing from the file keep a stable place at the end rather than
   * disappearing, so a newly baked champion still shows up if the roster JSON
   * has not caught up.
   */
  orderByReign<T>(items: T[], nameOf: (item: T) => string, players: PlayersMap | null): T[] {
    if (!players) return items;
    const rank = new Map(Object.keys(players).map((name, i) => [name, i]));
    const missing = Object.keys(players).length;
    return [...items].sort((a, b) => {
      const ra = rank.get(nameOf(a)) ?? missing;
      const rb = rank.get(nameOf(b)) ?? missing;
      return ra === rb ? nameOf(a).localeCompare(nameOf(b)) : ra - rb;
    });
  }

  /**
   * Get list of available player names
   */
  async getPlayerNames(): Promise<string[]> {
    const players = await this.loadPlayers();
    return Object.keys(players);
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.playersCache = null;
  }
}

// Export singleton instance
export const chessDataService = new ChessDataService();
