// Psi dvorce (wildlife.md – Psi – smečka dvorce): chov 1. 5. (existující dvorec bez smečky ji založí hned), krmení obilím po koních a lidech.
import { drawGrainPits } from '../fields/grain-pits';
import { horseGrainToday, villageHorses } from '../livestock/horses';
import { dogsWanted, huntPool } from './hunt-party';
import { isWildlifeYearDay } from './wildlife';
import { lordFamily } from '../people/lord';
import { MANOR_DOGS } from '../rules/rules-wildlife';
import type { VillageState } from '../types';

const EPSILON = 1e-6;

/**
 * Roční přepočet smečky 1. 5. (mutuje stav; volá `wildlifeYearDay`): ubude 10 %, nakrmená smečka
 * (`dogs.fed`; nová je nakrmená) dostane nejvýš 2 štěňata do počtu, který dvorec chce.
 */
export function dogsYear(state: VillageState, day: number): void {
  const w = state.wildlife;
  if (!w) return;
  // smečka vznikne hned, ne až 1. 5. (návrh Clauda): ves bez smečky má první zimu se psy; po vzniku
  // `dogs` existuje, takže převod proběhne jednou
  if (!w.dogs && !isWildlifeYearDay(day)) {
    const wantedNow = dogsWanted(huntPool(state, day, lordFamily(state, day)));
    if (wantedNow > 0) w.dogs = { count: wantedNow, fed: true };
    return;
  }
  if (!isWildlifeYearDay(day)) return;
  const family = lordFamily(state, day);
  const wanted = dogsWanted(huntPool(state, day, family));
  const fed = w.dogs?.fed ?? true;
  let count = (w.dogs?.count ?? 0) * (1 - MANOR_DOGS.lossPerYear);
  if (fed) count += Math.min(MANOR_DOGS.puppiesPerYear, Math.max(0, wanted - count));
  if (count > EPSILON || w.dogs) w.dogs = { count, fed };
}

/**
 * Obilí smečky po jídle dne (mutuje stav; jako `feedHorseGrain` – lidé a koně napřed): psi dostanou
 * obilí, jen když ves nešetří (`state.hungry`) a po jídle lidí a koní zbude do sklizně
 * (`spareKg`, `daysToHarvest`) i na ně. Hladová ves psy nekrmí (`dogs.fed = false`, štěňata
 * nepřibudou). Dvorec bez psů stav nemění.
 */
export function feedDogs(
  state: VillageState,
  day: number,
  spareKg: number,
  daysToHarvest: number,
): void {
  const dogs = state.wildlife?.dogs;
  if (!dogs) return;
  const want = dogs.count * MANOR_DOGS.grainKgPerDay;
  if (want <= 0) {
    dogs.fed = true;
    return;
  }
  const days = Math.max(1, daysToHarvest);
  const horses = villageHorses(state);
  const horseReserve =
    state.horsesFed === true && horses.length > 0 ? horseGrainToday(horses, day) * days : 0;
  const fed =
    state.hungry !== true &&
    state.storesKg >= want - EPSILON &&
    spareKg - horseReserve >= want * days - EPSILON;
  if (fed) {
    state.storesKg = Math.max(0, state.storesKg - want);
    // obilí psů jde z otevřené jámy hned, ne až zítra (production-chains.md – Obilné jámy)
    drawGrainPits(state);
  }
  dogs.fed = fed;
}
