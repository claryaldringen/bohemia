import { obstaclesOf, tileCenterWorld, type Landscape } from '../domain/landscape';
import {
  NEW_VILLAGE_MIN_DISTANCE_M,
  advanceVillage,
  checkDwellingPlacement,
  checkVillageName,
  distanceToVillages,
  villagePoints,
  fieldPartsFromCells,
  forestEdgeDistanceM,
  foundVillage,
  withLivestockLand,
  normalizeVillageName,
  withPlots,
  type FieldInput,
  type PlacementVillage,
  type Position,
  type TileCell,
  type VillagePoint,
  type VillageState,
} from '../domain/village';
import type { SeedSource } from './settlements';
import type { VillageRepository, VillageResult } from './villages';

export interface FoundVillageInput {
  settlementId: string;
  landscape: Landscape;
  /** Dnešní herní den (index dne). */
  today: number;
  name: string;
  /** Poloha první zemnice. */
  dwelling: Position;
  /** Čtverce prvního pole – políčka krajiny; bez nich (prázdné) se ves založí bez pole. */
  fieldCells?: TileCell[];
}

const ALREADY_FOUNDED = 'Ves už je založená.';
/** Další ves na téže mapě musí stát dál od ostatních (migration.md – Odchod do nové vsi). */
export const TOO_CLOSE_TO_VILLAGE = `Nová ves musí stát nejméně ${NEW_VILLAGE_MIN_DISTANCE_M} m od jiné vsi.`;

/**
 * Založí první ves sídla: jméno, první zemnice a volitelně první pole (ověřené podle krajiny). Ves
 * se hned dopočítá do dneška – den založení už proběhl, jako po každé akci.
 */
export async function foundVillageForSettlement(
  deps: { villages: VillageRepository; seeds: SeedSource },
  input: FoundVillageInput,
): Promise<VillageResult> {
  if ((await deps.villages.listBySettlement(input.settlementId)).length > 0) {
    return { ok: false, reason: ALREADY_FOUNDED };
  }
  const founded = foundedVillage(deps.seeds, input);
  if (!founded.ok) return founded;
  const created = await deps.villages.create(input.settlementId, founded.name, founded.state);
  return created === null ? { ok: false, reason: ALREADY_FOUNDED } : { ok: true, village: created };
}

/**
 * Založí další ves na krajině sídla, které už nějakou ves má (víc vsí na téže mapě – migration.md):
 * stejně jako první ves, jen první zemnice musí stát aspoň NEW_VILLAGE_MIN_DISTANCE_M od staveb
 * ostatních vsí sídla. Sídlo bez vsi založí první ves (`foundVillageForSettlement`).
 */
export async function foundAnotherVillage(
  deps: { villages: VillageRepository; seeds: SeedSource },
  input: FoundVillageInput,
): Promise<VillageResult> {
  const others = await deps.villages.listBySettlement(input.settlementId);
  if (others.length === 0) return foundVillageForSettlement(deps, input);
  const cellCenter = (x: number, y: number): VillagePoint => tileCenterWorld(input.landscape, x, y);
  const points = others.flatMap((v) => villagePoints(v.state, cellCenter));
  if (distanceToVillages(input.dwelling, points) < NEW_VILLAGE_MIN_DISTANCE_M) {
    return { ok: false, reason: TOO_CLOSE_TO_VILLAGE };
  }
  const founded = foundedVillage(deps.seeds, input);
  if (!founded.ok) return founded;
  const village = await deps.villages.add(input.settlementId, founded.name, founded.state);
  return { ok: true, village };
}

/** Stav nové vsi dopočítaný do dneška a její jméno, nebo důvod odmítnutí česky. */
function foundedVillage(
  seeds: SeedSource,
  input: FoundVillageInput,
): { ok: true; state: VillageState; name: string } | { ok: false; reason: string } {
  const name = checkVillageName(input.name);
  if (!name.ok) return { ok: false, reason: name.reason ?? 'Neplatné jméno vsi.' };
  const obstacles = obstaclesOf(input.landscape);
  const dwelling = checkDwellingPlacement(
    input.landscape,
    null,
    'zemnice',
    input.dwelling,
    obstacles,
  );
  if (!dwelling.ok) return { ok: false, reason: dwelling.reason ?? 'Sem zemnice nepatří.' };
  const cells = input.fieldCells ?? [];
  let firstField: FieldInput | null = null;
  if (cells.length > 0) {
    // překážky na staveništi první zemnice osadníci odstraní při založení – pole je neplatí podruhé
    const founding: PlacementVillage = {
      dwellings: [],
      constructions: [],
      parts: [],
      obstacleChanges: { removed: dwelling.obstacleIds, stumps: [], saplings: [] },
    };
    const field = fieldPartsFromCells(
      input.landscape,
      founding,
      cells,
      [input.dwelling],
      obstacles,
    );
    if (!field.check.ok) return { ok: false, reason: field.check.reason ?? 'Sem pole nepatří.' };
    firstField = { parts: field.parts, sacred: field.spared };
  }

  const founded = foundVillage({
    seed: seeds.nextSeed(),
    day: input.today,
    dwellingPosition: { ...input.dwelling },
    firstField,
    dwellingObstacleIds: dwelling.obstacleIds,
    dwellingObstacleCost: dwelling.obstacleCost,
    dwellingClearedTrees: dwelling.obstacleCounts.tree ?? 0,
    obstacles,
    forestDistanceM: forestEdgeDistanceM(input.landscape, input.dwelling.x, input.dwelling.z),
    dwellingSpared: dwelling.spared,
  });
  // nová ves nemá polozemnice bez pozemku – rovnou převedená (`withPlots` ji už nebude měnit);
  // louka a les do 600 m od první zemnice – pastva a žaludy výchozího stáda (diet.md)
  const state = advanceVillage(
    withLivestockLand(withPlots(founded, input.landscape, obstacles), input.landscape),
    input.today,
    obstacles,
    input.landscape,
  );
  return { ok: true, state, name: normalizeVillageName(input.name) };
}
