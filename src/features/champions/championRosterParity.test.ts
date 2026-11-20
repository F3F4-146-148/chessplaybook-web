import { describe, expect, it } from 'vitest';
import seed from '../../../backend/database/config/world-champions.json';
import { CHAMPION_ROSTER } from './championRoster';

/*
  PARITY WITH THE BACKEND'S OWN LIST (prerender plan D4, 2026-11-19). `/champions` and `/champions/list` are built from
  the bundled roster and no longer ask the API, so nothing at run time would show the two lists drifting apart: a
  champion added to the database and not to the file would simply be missing from both pages. This compares the file
  with the seed the database is made from (`migrate-players.ts`), offline, on every test run; `verify-champion-roster.mjs`
  compares it with a running API. Biographies are deliberately not compared: they are two different sets (owner,
  2026-11-19: the file's are the site's). Names ignore accents: the seed writes "Jose Raul Capablanca", the database and
  the file "José Raúl Capablanca".
*/
const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

describe('the bundled champion roster against the backend seed', () => {
  const seeded = [...(seed as { players: Array<{ slug: string; name: string; yearsChampion: string; displayOrder: number; playerType: string }> }).players]
    .filter((p) => p.playerType === 'world_champion')
    .sort((a, b) => a.displayOrder - b.displayOrder);
  const roster = Object.entries(CHAMPION_ROSTER);

  it('lists the same champions in the same order', () => {
    expect(roster.map(([key]) => key.toLowerCase())).toEqual(seeded.map((p) => p.slug));
  });

  it('gives each the same name and reign', () => {
    for (const [i, [key, player]] of roster.entries()) {
      expect(plain(player.fullName), key).toBe(plain(seeded[i].name));
      expect(player.championshipYears.replace('World Champion ', ''), key).toBe(seeded[i].yearsChampion);
    }
  });
});
