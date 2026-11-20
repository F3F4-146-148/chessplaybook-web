import type { Player, PlayersMap } from '@/types/chess';
import type { ChampionListEntry } from './components/ChampionChronologyRow';
import { CHAMPION_ROSTER } from './championRoster';

const countryNames: Record<string, string> = {
  Gukesh: 'India', Ding: 'China', Carlsen: 'Norway', Anand: 'India',
  Kramnik: 'Russia', Kasparov: 'Russia', Karpov: 'Russia', Fischer: 'United States',
  Spassky: 'Russia', Petrosian: 'Armenia/USSR', Tal: 'Latvia/USSR', Smyslov: 'USSR',
  Botvinnik: 'USSR', Euwe: 'Netherlands', Alekhine: 'Russia/France',
  Capablanca: 'Cuba', Lasker: 'Germany', Steinitz: 'Austria',
};

const countryCodes: Record<string, string> = {
  Gukesh: 'in', Ding: 'cn', Carlsen: 'no', Anand: 'in', Kramnik: 'ru',
  Kasparov: 'ru', Karpov: 'ru', Fischer: 'us', Spassky: 'ru', Petrosian: 'am',
  Tal: 'lv', Smyslov: 'ru', Botvinnik: 'ru', Euwe: 'nl', Alekhine: 'ru',
  Capablanca: 'cu', Lasker: 'de', Steinitz: 'at',
};

export const parseChampionsList = (data: PlayersMap): ChampionListEntry[] =>
  Object.entries(data).map(([name, info]: [string, Player]) => ({
    name,
    fullName: info.fullName,
    championshipYears: info.championshipYears,
    biography: info.biography,
    countryName: countryNames[name] ?? 'Unknown',
    countryCode: countryCodes[name],
  }));

/**
 * The chronology, newest first, from the bundled roster (prerender plan D3): it was fetched through React Query from
 * the same file, so the page first rendered "Loading champions list", in the build too.
 */
export const CHAMPIONS_LIST: ChampionListEntry[] = parseChampionsList(CHAMPION_ROSTER);
