import { describe, expect, it } from 'vitest';
import { CHAMPION_ROSTER } from './championRoster';

/*
  `/champions` and `/champions/list` are built from this file into their HTML (prerender plan D3), with no API behind
  them any more, so a hole in it is a hole on the page. Its agreement with the API is D4's guard.
*/
describe('the bundled champion roster', () => {
  const entries = Object.entries(CHAMPION_ROSTER);

  it('holds all 18 champions, newest first', () => {
    expect(entries).toHaveLength(18);
    expect(entries[0][0]).toBe('Gukesh');
    expect(entries.at(-1)?.[0]).toBe('Steinitz');
  });

  it('gives every champion a name, a reign, a portrait and a biography', () => {
    for (const [key, player] of entries) {
      expect(key, key).toMatch(/^[A-Z][a-z]+$/);
      expect(player.fullName, key).toBeTruthy();
      expect(player.championshipYears, key).toMatch(/^World Champion \d{4}/);
      expect(player.imagePath, key).toMatch(/^assets\/images\/champions\/portraits-v1\/[A-Za-z]+\.webp$/);
      expect(player.biography.length, key).toBeGreaterThan(60);
    }
  });
});
