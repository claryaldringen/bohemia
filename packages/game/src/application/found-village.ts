import { obstaclesOf, type Landscape } from '../domain/landscape';
import {
  advanceVillage,
  checkDwellingPlacement,
  checkVillageName,
  fieldPartsFromCells,
  forestEdgeDistanceM,
  foundVillage,
  normalizeVillageName,
  type FieldInput,
  type PlacementVillage,
  type Position,
  type TileCell,
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

/**
 * Založí ves sídla: jméno, první zemnice a volitelně první pole (ověřené podle krajiny). Ves se
 * hned dopočítá do dneška – den založení už proběhl, jako po každé akci.
 */
export async function foundVillageForSettlement(
  deps: { villages: VillageRepository; seeds: SeedSource },
  input: FoundVillageInput,
): Promise<VillageResult> {
  if ((await deps.villages.find(input.settlementId)) !== null) {
    return { ok: false, reason: ALREADY_FOUNDED };
  }
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
    firstField = { parts: field.parts };
  }

  const founded = foundVillage({
    seed: deps.seeds.nextSeed(),
    day: input.today,
    dwellingPosition: { ...input.dwelling },
    firstField,
    dwellingObstacleIds: dwelling.obstacleIds,
    dwellingObstacleCost: dwelling.obstacleCost,
    dwellingClearedTrees: dwelling.obstacleCounts.tree ?? 0,
    obstacles,
    forestDistanceM: forestEdgeDistanceM(input.landscape, input.dwelling.x, input.dwelling.z),
  });
  const state = advanceVillage(founded, input.today, obstacles);
  const created = await deps.villages.create(
    input.settlementId,
    normalizeVillageName(input.name),
    state,
  );
  return created === null ? { ok: false, reason: ALREADY_FOUNDED } : { ok: true, village: created };
}
