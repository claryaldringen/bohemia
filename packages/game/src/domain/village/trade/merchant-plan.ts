// Plán cizích kupců (markets.md – Rozhodnutí plánu 4, bod 5; návrh Clauda): kupec je tržní den ve vsi
// u stezky podle plánu, ne karavana posouvaná světem. Průjezdy spojení jsou čistá funkce seedu
// zastávky (`MerchantStop.seed` – svět a spojení), roku a průjezdu – bez stavu, stejné po kouscích
// i vcelku. Po ostrém spuštění se plán nemění (zlatý otisk v testu).
import { TOTAL_GAME_DAYS, dateOfDayIndex, dayIndexOf } from '../../calendar';
import { createRandom, deriveSeed } from '../../landscape/random';
import { MERCHANTS } from '../rules';
import type { MerchantStop } from '../types';

/** Příjezd cizích kupců na zastávku vsi. */
export interface MerchantVisit {
  /** `merchants:<stop.key>:<rok>:<průjezd>`. */
  key: string;
  /** První tržní den kupců ve vsi. */
  day: number;
}

const LAST_WORLD_DAY = TOTAL_GAME_DAYS - 1;

/**
 * Den, kdy průjezd `pass` roku `year` dojede do vsi: začátek okna průjezdu + losovaný den, pak po
 * políčkách cesty od prvního uzlu, nebo zpátky. Smí vyjít až za koncem světa.
 */
function passDay(stop: MerchantStop, year: number, pass: number): number {
  const random = createRandom(deriveSeed(stop.seed, 'pass:' + year + ':' + pass));
  const start =
    dayIndexOf({ year, month: 1, day: 1 }) +
    pass * MERCHANTS.passSpacingDays +
    Math.floor(random.next() * MERCHANTS.passWindowDays);
  const back = random.next() < 0.5;
  const cells = back ? stop.length - 1 - stop.index : stop.index;
  return start + cells * MERCHANTS.daysPerCell;
}

/** Příjezdy kupců na zastávky vsi v dnech `fromDay` … `toDay` (včetně), seřazené podle dne, pak `key`. */
export function merchantVisits(
  stops: readonly MerchantStop[],
  fromDay: number,
  toDay: number,
): MerchantVisit[] {
  const from = Math.max(0, fromDay);
  const to = Math.min(LAST_WORLD_DAY, toDay);
  if (stops.length === 0 || from > to) return [];
  const visits: MerchantVisit[] = [];
  const lastYear = dateOfDayIndex(to).year;
  for (const stop of stops) {
    // průjezd, který dojede v den `from`, vyjel nejvýš o délku cesty dřív – i loni
    const earliest = Math.max(0, from - stop.length * MERCHANTS.daysPerCell);
    for (let year = dateOfDayIndex(earliest).year; year <= lastYear; year++) {
      for (let pass = 0; pass < MERCHANTS.passesPerYear; pass++) {
        const day = passDay(stop, year, pass);
        if (day < from || day > to) continue;
        visits.push({ key: `merchants:${stop.key}:${year}:${pass}`, day });
      }
    }
  }
  return visits.sort((a, b) => a.day - b.day || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/** Nejbližší příjezd v den ≥ `fromDay` (do konce světa); bez zastávek, nebo za koncem světa null. */
export function nextMerchantVisit(
  stops: readonly MerchantStop[],
  fromDay: number,
): MerchantVisit | null {
  if (stops.length === 0) return null;
  // po rocích průjezdů (364 dní) – příjezd je hned v prvním, žádný jen u konce světa
  const span = MERCHANTS.passesPerYear * MERCHANTS.passSpacingDays;
  for (let from = fromDay; from <= LAST_WORLD_DAY; from += span) {
    const [visit] = merchantVisits(stops, from, from + span - 1);
    if (visit) return visit;
  }
  return null;
}
