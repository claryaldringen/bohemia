import { dateOfDayIndex } from '../calendar';
import type { CalendarDate } from '../calendar';
import { SLAUGHTER_DAY, spoilMeat } from './diet';
import {
  feedHay,
  herdHayCoverage,
  isHayWinter,
  MOWING_DAY,
  planMowing,
  rotHay,
  spoilOldHay,
  villageHay,
  villageHayKg,
  winterHayKg,
} from './hay';
import { herdingCoverage } from './herding';
import type { Landscape, ObstacleLayer } from '../landscape';
import {
  BIRTH_DAY,
  LIVESTOCK,
  ensureLivestock,
  herdBirths,
  herdLosses,
  householdCount,
  slaughter,
  starveHerds,
  wantedWinterHerds,
} from './livestock';
import { OXEN, penDay, penOxen, trainTeamsWhenReady, villageOxen, villagePens } from './oxen';
import { walkDistancesTo } from './paths/village';
import { villageRoadWalk } from './paths/walking';
import type { ChronicleEvent, VillageState } from './types';

// Den hospodářství vsi (diet.md, oxen.md) – stáda, seno a ohrady v pevném pořadí, před plánem
// osevu a prací dne: roční ztráty stád a seno ve stohu (každý den), ohrady (výcvik, stáří
// spřežení, 1. 3. pokrytí sena) a 1. 3. zimní úhyn stáda, 1. 4. mláďata a konec zimy, výcvik
// spřežení, kdykoli jde (začíná sám), 1. 6. zkažené loňské seno a plán seče (s krajinou
// i přirozené louky), 1. 9. zkažené maso, 1. 11. porážka a začátek zimy, v zimě seno. Mléko a vejce se jí čerstvé v kroku jídla (diet.ts),
// dojení, péče a pasení jsou práce dne.

/** Konec zimy pro voly a stádo (1. 3.) – pokrytí sena rozhodne o jarní orbě a úhynu. */
const WINTER_END = { month: 3, day: 1 } as const;

function isOn(date: CalendarDate, target: { month: number; day: number }): boolean {
  return date.month === target.month && date.day === target.day;
}

/**
 * Krávy, které ves drží vždy (diet.md – Skladba stáda; Martin 19. 10. 2026: krávy „potřebujeme
 * kvůli tažným volům“): kráva na 2 domácnosti (mléko – jako výchozí stádo) a na každou ohradu tolik
 * krav, aby šlo cvičit spřežení (OXEN.minCows – dvě telata a chovná kráva); aspoň chovný pár.
 */
export function breedingCows(state: VillageState): number {
  return Math.max(
    LIVESTOCK.breedingMin,
    householdCount(state) / LIVESTOCK.householdsPerCow,
    villagePens(state).length * OXEN.minCows,
  );
}

/**
 * Voli, kteří budou přes zimu žrát seno – ohrada bez spřežení a výcviku počítá se dvěma voly
 * (výcvik se dá zadat kdykoli a telata seno potřebují – oxen.md).
 */
function hayOxen(state: VillageState): number {
  return villagePens(state).reduce((sum, pen) => sum + Math.max(penOxen(pen), OXEN.teamSize), 0);
}

/**
 * Seno, které ves na zimu potřebuje (kg – oxen.md, Seno): zimní stádo, které si chce nechat
 * (nosnost pastvy, lesa a pasáků zmenšená podle potřeby – `wantedWinterHerds`), a voli ohrad, po
 * zimní dávce celou zimu.
 */
export function winterHayNeedKg(state: VillageState, day: number): number {
  const herds = wantedWinterHerds(state, day, {
    oxen: villageOxen(state),
    minCows: breedingCows(state),
    herding: herdingCoverage(state),
  });
  return winterHayKg(herds, hayOxen(state));
}

/**
 * Den hospodářství (mutuje stav); vrací události kroniky. S krajinou seče i přirozené louky,
 * od nejbližší po pěšinách (vrstva překážek zpřesní síť pěšin jako u dílů pole).
 */
export function husbandryDay(
  state: VillageState,
  day: number,
  toolCoverage: number,
  landscape: Landscape | null = null,
  obstacles: ObstacleLayer | null = null,
): ChronicleEvent[] {
  const date = dateOfDayIndex(day);
  const livestock = ensureLivestock(state);
  // nemoci, vlci, úrazy – denní díl ročních ztrát; seno ve stohu ztrácí počasím
  herdLosses(state);
  rotHay(state);
  const winterEnd = isOn(date, WINTER_END);
  // pokrytí sena stáda – s voly, kteří zimu přečkali (dřív, než penDay rozhodne o jejich úhynu)
  const herdCoverage = winterEnd ? herdHayCoverage(state, villageOxen(state), livestock.herds) : 1;
  const events = penDay(state, day, winterEnd, toolCoverage);
  if (winterEnd) {
    const starved = starveHerds(state, day, herdCoverage);
    if (starved) events.push(starved);
  }
  if (isOn(date, BIRTH_DAY)) {
    herdBirths(state);
    if (state.hay) delete state.hay.winter;
  }
  // co ulehčí práci a ves to má, vesničané používají sami – spřežení se cvičí bez hráče, první
  // vhodný den (oxen.md – Spřežení, Martin 19. 10. 2026); po mláďatech, ať jsou telata
  trainTeamsWhenReady(
    state,
    day,
    obstacles,
    landscape ? () => villageRoadWalk(state, landscape) : undefined,
  );
  if (isOn(date, MOWING_DAY)) {
    // stoh přes rok – zbytek loňského sena se zkazil (oxen.md – Seno)
    spoilOldHay(state);
    const walk = landscape
      ? (targets: readonly { x: number; z: number }[]): number[] | null =>
          walkDistancesTo(state, day, landscape, obstacles, targets)
      : null;
    const mowing = planMowing(
      state,
      day,
      winterHayNeedKg(state, day),
      toolCoverage,
      landscape,
      walk,
    );
    if (mowing || state.hay) state.hay = { ...villageHay(state), mowing };
  }
  // uzené maso z loňské porážky vydrží přes žně – 1. 9. se zbytek zkazí (diet.md)
  const spoiled = spoilMeat(state, day);
  if (spoiled) events.push(spoiled);
  if (isOn(date, SLAUGHTER_DAY)) {
    const event = slaughter(state, day, {
      oxen: villageOxen(state),
      hayKg: villageHayKg(state),
      minCows: breedingCows(state),
      herding: herdingCoverage(state),
    });
    if (event) events.push(event);
    // nový rok pasení – od porážky do porážky
    delete livestock.herding;
    if (state.hay)
      state.hay.winter = { oxenNeedKg: 0, oxenEatenKg: 0, herdNeedKg: 0, herdEatenKg: 0 };
  }
  if (isHayWinter(day)) feedHay(state, villageOxen(state), livestock.herds);
  return events;
}
