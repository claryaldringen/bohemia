// Pole a jejich díly pro panel a scénu.

import {
  VillageFieldPart,
  VillageOrchardSquare,
  VillageView,
  DAYS_PER_YEAR,
} from './village-view-types';
import { SceneFieldPart } from './village-view-scene-types';
import {
  CELL_SIZE_M,
  effectiveFertility,
  fallowYears,
  partYearWork,
  partWalkDistance,
  squareExpectedYieldKg,
  squareWalkDistance,
  villageHoldings,
  forestBonus,
  partStage,
  partOvergrowthYears,
  isOvergrown,
  squareCenter,
  type Crop,
  type FieldPart,
  type FieldSurface,
  type Landscape,
  type OrchardSquare,
  type PartStage,
  type PartYearWork,
  type SquareGrid,
  type TileCell,
  type VillageState,
} from '@bohemia/game';

/** Krok průběhu zakládání dílu pro scénu – obtisk se nepřestavuje při každém dotazu. */
const FOUNDING_WORK_STEP = 20;

/**
 * Díl pole pro scénu. Zakládaný díl nese průběh (`work`): 0 = jen vytyčený (kolíky a provázek),
 * pak se drn rozrývá po řádcích – zakládá se po dílech od nejbližšího k obydlí, rozpracovaný je
 * vždy jen jeden. Vzhled ostatních dílů zatím odhadne scéna (field-look.ts).
 */
export function scenePart(
  landscape: Landscape,
  part: { id: number; foundingDone: number; foundingCost: number },
  cell: TileCell,
  stage: PartStage,
  grid?: SquareGrid,
): SceneFieldPart {
  // natočené pole (fields.md – Natočené stavby): střed čtverce v mřížce pole a natočení
  const center = squareCenter(landscape, grid, cell);
  const scene: SceneFieldPart = {
    id: part.id,
    cell: { x: cell.x, y: cell.y },
    x: center.x,
    z: center.z,
    size: landscape.cellSizeM,
    ...(grid ? { rotation: grid.rotation } : {}),
    stage,
  };
  if (stage === 'founding') {
    const done = part.foundingCost > 0 ? part.foundingDone / part.foundingCost : 0;
    const step = Math.round(done * FOUNDING_WORK_STEP) / FOUNDING_WORK_STEP;
    scene.work = done > 0 ? Math.min(1, Math.max(1 / FOUNDING_WORK_STEP, step)) : 0;
  }
  return scene;
}

/** Měsíc, kdy zelený len kvete – pole zmodrá (fields.md – Len, Co hráč vidí). */
export const FLAX_BLOOM_MONTH = 6;

/**
 * Pole pro panel výběru – výměra, úrodnost vážená plochou, díly podle stadia, povrchu a plodiny
 * a díly s popelem z vymýceného lesa.
 */
export function fieldViews(state: VillageState, day: number): VillageView['fields'] {
  const holdings = villageHoldings(state);
  const work = partYearWork(state, day);
  const holdingOf = (id: number): number | null => {
    const at = holdings.byPart.get(id);
    return at ? (holdings.sectors[at.sector]?.dwellingId ?? null) : null;
  };
  return state.fields.map((f) => {
    const parts = state.parts.filter((p) => p.fieldId === f.id);
    const areaM2 = parts.reduce((sum, p) => sum + p.areaM2, 0);
    const fertility =
      areaM2 > 0
        ? parts.reduce((sum, p) => sum + effectiveFertility(p, day) * p.areaM2, 0) / areaM2
        : 0;
    const stages: Partial<Record<PartStage, number>> = {};
    const surfaces: Partial<Record<FieldSurface, number>> = {};
    const crops: Partial<Record<Crop, number>> = {};
    let ashParts = 0;
    let ashBonus = 0;
    let overgrowingM2 = 0;
    for (const p of parts) {
      if (p.state === 'fallow' && (partOvergrowthYears(p) > 0 || isOvergrown(p))) {
        overgrowingM2 += p.areaM2;
      }
      const stage = partStage(p, day);
      stages[stage] = (stages[stage] ?? 0) + 1;
      surfaces[p.surface] = (surfaces[p.surface] ?? 0) + 1;
      if (p.state === 'sown') {
        const crop = p.crop ?? 'spring';
        crops[crop] = (crops[crop] ?? 0) + 1;
      }
      if (p.bonusUntilDay !== null && p.bonusUntilDay >= day) ashParts++;
      ashBonus = Math.max(ashBonus, forestBonus(p, day));
    }
    return {
      id: f.id,
      areaM2,
      fertility,
      stages,
      surfaces,
      crops,
      ashParts,
      ashBonus,
      overgrowingM2,
      parts: parts.map((p) => fieldPartView(p, day, holdingOf(p.id), work.get(p.id))),
    };
  });
}

/** Podíl na setiny – v pohledu stačí, panel ukazuje celá procenta. */
const hundredths = (share: number): number => Math.round(share * 100) / 100;

/** Díl pole pro panel vybraného dílu – úsporně (výchozí údaje chybí). */
function fieldPartView(
  part: FieldPart,
  day: number,
  holding: number | null,
  work: PartYearWork | undefined,
): VillageFieldPart {
  const ash = forestBonus(part, day);
  const crop = work?.crop;
  const areaM2 = Math.round(part.areaM2);
  const fertility = Math.round(effectiveFertility(part, day));
  const naturalFertility = Math.round(part.naturalFertility);
  return {
    id: part.id,
    ...(areaM2 !== CELL_SIZE_M * CELL_SIZE_M ? { areaM2 } : {}),
    fertility,
    ...(naturalFertility !== fertility ? { naturalFertility } : {}),
    ...(ash > 0 ? { ashBonus: ash } : {}),
    ...(part.surface !== 'meadow' ? { surface: part.surface } : {}),
    walkM: Math.round(partWalkDistance(part)),
    ...(holding !== null ? { holding } : {}),
    ...(part.state === 'sown' ? { sownYears: part.sownYears } : {}),
    ...(part.state === 'fallow' ? { fallowYears: fallowYears(part, day) } : {}),
    ...(work
      ? {
          work: {
            ...(crop
              ? {
                  crop: {
                    crop: crop.crop,
                    prep: crop.prep && { task: crop.prep.task, share: hundredths(crop.prep.share) },
                    sow: hundredths(crop.sow),
                    harvest: hundredths(crop.harvest),
                  },
                }
              : {}),
            ...(work.mow !== undefined ? { mow: hundredths(work.mow) } : {}),
          },
        }
      : {}),
    ...(part.state === 'founding'
      ? {
          founding: {
            progress: hundredths(part.foundingCost > 0 ? part.foundingDone / part.foundingCost : 0),
            laborLeft: Math.round(Math.max(0, part.foundingCost - part.foundingDone) * 10) / 10,
            trees: part.trees ?? 0,
          },
        }
      : {}),
  };
}

/** Čtverec sadu pro panel vybraného čtverce. */
export function orchardSquareView(
  square: OrchardSquare,
  day: number,
  waits: boolean,
): VillageOrchardSquare {
  const planted = square.plantedDay;
  const planting =
    planted !== null
      ? null
      : hundredths(square.plantingCost > 0 ? square.plantingDone / square.plantingCost : 0);
  return {
    cell: { x: square.cell.x, y: square.cell.y },
    areaM2: Math.round(square.areaM2),
    ageYears: planted === null ? null : Math.max(0, Math.floor((day - planted) / DAYS_PER_YEAR)),
    expectedYieldKg: Math.round(squareExpectedYieldKg(square, day)),
    planting,
    plantingWaits: planting !== null && waits,
    renewal: square.renewal !== undefined,
    walkM: Math.round(squareWalkDistance(square)),
  };
}
