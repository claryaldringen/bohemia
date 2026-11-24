import type { NearbyVillage, VillageNearby, VillageState } from '../domain/village';
import { cellDistance, ringCells } from '../domain/world/placement';
import { villagesAt, type MarketDeps } from './market';
import { crossesIsolation, placeOf, sleeps, stepToward } from './shipments';

// Okolí vsi (markets.md – Rozhodnutí plánu 3, bod 1): server po dopočtu vsi – tam, kde doručuje
// poštu mezi vsemi (`advancePlayer`, `advanceDynasty`, `dynastyForVillage`) – pošle vsi snímek
// vsí na 8 sousedních mapách událostí schránky `nearby`, když okolí chybí nebo je staré
// `NEARBY_REFRESH_DAYS` dní. Ves ho použije na začátku dne události (`applyNearby`), takže
// rozhodnutí podle okolí zůstanou uvnitř dne a výsledek nezávisí na kouscích dopočtu.

/**
 * Technická mez, ne pravidlo – okolí je snímek, který se celý nahradí (Rozhodnutí 1): stav vsi
 * neroste a worker nečte sousedy každý den; mez určuje jen, jak rychle se ves dozví o nové vsi
 * za kopcem (proto ne v `rules*.ts`).
 */
export const NEARBY_REFRESH_DAYS = 30;

/** Co okolí potřebuje: vsi (záznamy a schránku) a sídla (držitelé políček, poloha). */
export type NearbyDeps = Pick<MarketDeps, 'villages' | 'settlements'>;

/** Okolí chybí, nebo je staré aspoň `NEARBY_REFRESH_DAYS` dní (`lastDay − nearby.day`). */
export function nearbyStale(state: VillageState): boolean {
  return state.nearby === undefined || state.lastDay - state.nearby.day >= NEARBY_REFRESH_DAYS;
}

/** Pořadí id vsí podle kódů znaků – nezávisí na jazyku prostředí (na rozdíl od `localeCompare`). */
function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Snímek okolí vsi `villageId` na den `lastDay + 1`: vsi sídel na 8 sousedních mapách
 * (`villagesAt` – i vsi téhož hráče) bez spících (`sleeps`), archivovaných (`placeOf` null)
 * a přes odříznutí (`crossesIsolation`); `cells` a `firstStep` jako přehled trhu a výprava.
 * Řazeno podle `cells`, pak `villageId`. Spící, odříznutá nebo archivovaná ves sama – null.
 */
export async function nearbyVillages(
  deps: NearbyDeps,
  villageId: string,
): Promise<VillageNearby | null> {
  const home = await deps.villages.find(villageId);
  if (!home || sleeps(home)) return null;
  const homePlace = await placeOf(deps, home);
  // odříznutý rod sousední mapy nemá – místní mřížka není mapa světa (newcomers.md)
  if (!homePlace || homePlace.isolated) return null;
  const villages: NearbyVillage[] = [];
  for (const id of await villagesAt(deps, ringCells(homePlace.cell, 1), null)) {
    const record = await deps.villages.find(id);
    if (!record || sleeps(record)) continue;
    const place = await placeOf(deps, record);
    if (!place || crossesIsolation(homePlace, place)) continue;
    villages.push({
      villageId: id,
      name: record.name,
      cells: cellDistance(homePlace.cell, place.cell),
      firstStep: stepToward(homePlace.cell, place.cell),
    });
  }
  villages.sort((a, b) => a.cells - b.cells || compareIds(a.villageId, b.villageId));
  return {
    day: home.state.lastDay + 1,
    self: { villageId: home.id, name: home.name },
    villages,
  };
}

/**
 * Pošle vsi `villageId` okolí (`nearbyVillages`) do schránky na den `lastDay + 1` s `ref`
 * `nearby:<ves>:<den>` – druhý zápis téhož dne se zahodí. Prázdné okolí se zapíše také (snímek
 * nahradí starý). true = zapsáno; spící nebo odříznutá ves, nebo duplicita – false.
 */
export async function refreshNearby(deps: NearbyDeps, villageId: string): Promise<boolean> {
  const nearby = await nearbyVillages(deps, villageId);
  if (!nearby) return false;
  const posted = await deps.villages.inbox.post({
    villageId,
    day: nearby.day,
    ref: `nearby:${villageId}:${nearby.day}`,
    body: { kind: 'nearby', nearby },
  });
  return posted !== null;
}

/** Jako `refreshNearby`, chybu zapíše do logu a vrátí false – dopočet vsi nezastaví. */
export async function refreshNearbySafely(
  deps: NearbyDeps,
  villageId: string,
  log: (message: string, error: unknown) => void = console.error,
): Promise<boolean> {
  try {
    return await refreshNearby(deps, villageId);
  } catch (error) {
    log(`Ves ${villageId}: obnova okolí selhala.`, error);
    return false;
  }
}
