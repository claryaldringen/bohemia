import { obstaclesOf } from '../domain/landscape';
import {
  NEW_VILLAGE_MIN_DISTANCE_M,
  distanceToVillages,
  failStewardDeparture,
  freeVillageSite,
  pendingStewardDepartures,
  settleStewardDeparture,
  squareCenter,
  stewardDepartureOrigin,
  travellingVillage,
  villagePoints,
  type StewardDeparture,
  type VillagePoint,
  type VillageState,
} from '../domain/village';
import { settlementLandscape } from './enter-game';
import { foundedVillageState } from './found-village';
import { OWN_MAP_THERE, targetSettlement } from './new-village';
import { findPlayerVillage } from './player-villages';
import type { LandscapeSource, SeedSource, Settlement, SettlementRepository } from './settlements';
import type { VillageRecord, VillageRepository } from './villages';

// Vybavení odchozí schránky správce (steward.md – Kde správce běží): syn vojvody odešel v simulaci
// (osadníci jsou v `steward.departures` mateřské vsi) a tady vznikne nová ves – na téže mapě
// založená, nebo na nové mapě na cestě. Idempotentně podle id záznamu: nová ves nese klíč založení
// (`VillageState.origin`) a úložiště ji podruhé nezaloží; záznam pak dostane id nové vsi.

export interface SettleStewardDeparturesDeps {
  settlements: SettlementRepository;
  villages: VillageRepository;
  /** Seed krajiny nového sídla (nová mapa) – jen při jeho vzniku. */
  seeds: SeedSource;
  landscapes?: LandscapeSource;
}

export interface SettleStewardDeparturesInput {
  playerId: string;
  /** Mateřská ves – její schránka. */
  villageId: string;
}

/** Kolikrát se zkusí uložit značku vybavení do mateřské vsi při souběžném zápisu. */
const MARK_ATTEMPTS = 5;

/**
 * Vybaví schránku mateřské vsi `villageId` hráče: pro každý záznam bez vsi založí ves (nebo najde
 * tu, kterou založilo dřívější či souběžné volání – podle klíče založení) a záznam označí jejím id.
 * Na téže mapě se ves založí v den odchodu na místě ze záznamu; na nové mapě vznikne (nebo se
 * použije prázdné vlastní) sídlo v prvním směru bez vlastní vsi a lidé jsou na cestě – po příjezdu
 * správce umístí první zemnici sám. Nová ves se dopočítá při příštím načtení. Vrací vsi ze
 * záznamů, které se teď vybavily (i nalezené); ves, která hráči nepatří – nic.
 */
export async function settleStewardDepartures(
  deps: SettleStewardDeparturesDeps,
  input: SettleStewardDeparturesInput,
): Promise<VillageRecord[]> {
  const found = await findPlayerVillage(deps, input);
  if (!found) return [];
  const settled: VillageRecord[] = [];
  for (const record of pendingStewardDepartures(found.village.state)) {
    const origin = stewardDepartureOrigin(found.village.id, record.id);
    const village =
      (await deps.villages.findByOrigin(origin)) ??
      (await createVillage(deps, input.playerId, found.settlement, record, origin));
    if (!village) {
      // nikam nejde – započítat pokus, po několika se záznam nezkouší (osadníci zůstanou v něm)
      await updateRecord(deps.villages, found.village.id, (s) =>
        failStewardDeparture(s, record.id),
      );
      continue;
    }
    await markSettled(deps.villages, found.village.id, record.id, village.id);
    settled.push(village);
  }
  return settled;
}

/**
 * Totéž, ale chyba (výpadek DB, nová mapa) se zaloguje a nic nevybaví – načtení hry kvůli ní
 * nespadne; schránka je idempotentní, vybaví se při příštím načtení.
 */
export async function settleStewardDeparturesSafely(
  deps: SettleStewardDeparturesDeps,
  input: SettleStewardDeparturesInput,
  log: (message: string, error: unknown) => void = console.error,
): Promise<VillageRecord[]> {
  try {
    return await settleStewardDepartures(deps, input);
  } catch (error) {
    log(`Ves ${input.villageId}: vybavení odchozí schránky správce selhalo.`, error);
    return [];
  }
}

/**
 * Založí ves záznamu: na téže mapě v místě ze záznamu, jinak (místo mezitím nevyhovuje) na nové
 * mapě, a když tam nejde (žádný směr bez vlastní vsi, mapa bez místa ve světě), na nejbližším
 * volném místě téže mapy. Null – nikam (záznam čeká na další volání).
 */
async function createVillage(
  deps: SettleStewardDeparturesDeps,
  playerId: string,
  settlement: Settlement,
  record: StewardDeparture,
  origin: string,
): Promise<VillageRecord | null> {
  const settlers = record.settlers;
  if (!settlers) return null;
  if (record.dwelling) {
    const here = await createHere(deps, settlement, record, origin, record.dwelling);
    if (here) return here;
  }
  for (const { direction, travelDays } of record.directions) {
    const target = await targetSettlement(deps, settlement, playerId, direction);
    if (!target.ok) {
      // souběžné vybavení mezitím ves tím směrem založilo – je to ona
      if (target.reason === OWN_MAP_THERE) {
        const again = await deps.villages.findByOrigin(origin);
        if (again) return again;
        continue;
      }
      break;
    }
    const state = travellingVillage(settlers, record.seed, record.id, {
      direction,
      departedDay: record.id,
      arrivalDay: record.id + travelDays,
    });
    const village = await deps.villages.addOnce(target.settlement.id, record.name, {
      ...state,
      origin,
    });
    if (village) return village;
  }
  // na novou mapu nejde – nejbližší volné místo téže mapy (migration.md – Víc vsí)
  const landscape = settlementLandscape(settlement, deps.landscapes);
  const points = await mapPoints(deps, settlement);
  const site = freeVillageSite(landscape, points, obstaclesOf(landscape));
  return site ? createHere(deps, settlement, record, origin, site) : null;
}

/** Ves záznamu založená na téže mapě v místě `dwelling` v den odchodu; neplatné místo – null. */
async function createHere(
  deps: SettleStewardDeparturesDeps,
  settlement: Settlement,
  record: StewardDeparture,
  origin: string,
  dwelling: NonNullable<StewardDeparture['dwelling']>,
): Promise<VillageRecord | null> {
  if (!record.settlers) return null;
  // stavby vsí mapy se od odchodu mohly změnit – místo musí dál ležet daleko od nich
  if (
    distanceToVillages(dwelling, await mapPoints(deps, settlement)) < NEW_VILLAGE_MIN_DISTANCE_M
  ) {
    return null;
  }
  const landscape = settlementLandscape(settlement, deps.landscapes);
  const founded = foundedVillageState(
    record.seed,
    { landscape, today: record.id, dwelling, settlers: record.settlers },
    undefined,
    await deps.villages.weatherSeedOf(settlement.id),
  );
  if (!founded.ok) return null;
  const state: VillageState = { ...founded.state, origin };
  return deps.villages.addOnce(settlement.id, record.name, state);
}

/** Body staveb všech vsí sídla (m) – vzdálenost nové vsi od nich (migration.md – Víc vsí). */
async function mapPoints(
  deps: SettleStewardDeparturesDeps,
  settlement: Settlement,
): Promise<VillagePoint[]> {
  const landscape = settlementLandscape(settlement, deps.landscapes);
  return (await deps.villages.listBySettlement(settlement.id)).flatMap((v) =>
    villagePoints(v.state, (x, y, grid) => squareCenter(landscape, grid, { x, y })),
  );
}

/**
 * Záznam `id` schránky mateřské vsi dostane id nové vsi (`settleStewardDeparture`) – při souběžném
 * zápisu znovu načíst a zkusit znovu; už vybavený záznam nic nemění.
 */
function markSettled(
  villages: VillageRepository,
  villageId: string,
  id: number,
  newVillageId: string,
): Promise<void> {
  return updateRecord(villages, villageId, (state) =>
    settleStewardDeparture(state, id, newVillageId),
  );
}

/** Změna stavu mateřské vsi s opakováním při souběžném zápisu; beze změny (týž objekt) nic neukládá. */
async function updateRecord(
  villages: VillageRepository,
  villageId: string,
  change: (state: VillageState) => VillageState,
): Promise<void> {
  for (let attempt = 0; attempt < MARK_ATTEMPTS; attempt++) {
    const current = await villages.find(villageId);
    if (!current) return;
    const next = change(current.state);
    if (next === current.state) return;
    if (await villages.save(villageId, next, current.version)) return;
  }
}
