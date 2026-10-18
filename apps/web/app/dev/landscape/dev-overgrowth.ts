// VÝVOJOVÝ NÁSTROJ – jen pro /dev/landscape: ukázka zarůstání přílohu (fields.md – Zarůstání)
// – řada dílů nepaseného a nesečeného přílohu v každé fázi (louka, křoviny, mladý les) a za nimi
// les vsi v různém stáří s jedním pokáceným stromem. Rostliny kreslí scéna stejně jako ve hře
// (wild-growth.ts), stromy lesa vsi jsou překážky z herního jádra (`obstacleChangesAt`).
import {
  OVERGROWTH_STAGES,
  fieldPartsFromCells,
  obstacleChangesAt,
  surfaceAt,
  woodTreeId,
  type AddedObstacle,
  type Landscape,
  type TileCell,
  type VillageWood,
} from '@bohemia/game';
import { tileCenter } from '@/lib/scene/tile-at';
import type { SceneField } from '@/lib/scene/village-types';
import type { SceneWood } from '@/lib/village-view';

const DAYS_PER_YEAR = 365.25;
/** Herní den ukázky – jen poměr stáří lesa a kácení. */
const DEMO_DAY = Math.round(100 * DAYS_PER_YEAR);
/** Roky bez pastvy a seče dílů ukázky – louka, křoviny a mladý les. */
export const OVERGROWTH_DEMO_YEARS = [0, 3, 5, 8, 11, 14, 15, 20, 25, 29] as const;
/** Stáří lesa vsi v ukázce (od 30 let). */
export const WOOD_DEMO_AGES = [30, 40, 50, 70] as const;
const FOREST_FROM = OVERGROWTH_STAGES.find((s) => s.stage === 'forest')?.fromYears ?? 30;

export interface OvergrowthDemo {
  field: SceneField;
  woods: SceneWood[];
  /** Stromy lesa vsi – překážky přidané vsí (`obstacles.added`). */
  added: AddedObstacle[];
  /** Překážky krajiny na čtvercích ukázky – zmizí jako po založení pole. */
  cleared: number[];
  /** Střed ukázky (kamera). */
  center: { x: number; z: number };
}

/** Stadium dílu ukázky podle let bez pastvy a seče. */
function stageOf(years: number): 'meadow' | 'shrubs' | 'young-forest' {
  if (years >= 15) return 'young-forest';
  if (years >= 5) return 'shrubs';
  return 'meadow';
}

/**
 * Ukázka zarůstání u místa vsi: díly v řadě (roky bez pastvy a seče `OVERGROWTH_DEMO_YEARS`),
 * o řadu dál les vsi (stáří `WOOD_DEMO_AGES`, v nejstarším jeden strom pokácený před 5 lety).
 * Čtverce ve vodě se vynechají.
 */
export function demoOvergrowth(l: Landscape, fieldId: number): OvergrowthDemo {
  const { x: sx, y: sy } = l.villageSite;
  const usable = (cell: TileCell): boolean =>
    cell.x >= 0 &&
    cell.y >= 0 &&
    cell.x < l.size &&
    cell.y < l.size &&
    surfaceAt(l, cell.x, cell.y) !== 'water';
  const square = (cell: TileCell): { cell: TileCell; x: number; z: number; size: number } => {
    const c = tileCenter(l, cell.x, cell.y);
    return { cell, x: c.worldX, z: c.worldZ, size: l.cellSizeM };
  };
  const parts: SceneField['parts'] = [];
  OVERGROWTH_DEMO_YEARS.forEach((years, i) => {
    const cell = { x: sx - 5 + i, y: sy - 4 };
    if (!usable(cell)) return;
    const stage = stageOf(years);
    parts.push({
      ...square(cell),
      id: i + 1,
      stage,
      ...(stage === 'meadow' ? {} : { look: stage }),
      ...(years > 0 ? { overgrowth: years } : {}),
    });
  });
  const woods: SceneWood[] = [];
  const domain: VillageWood[] = [];
  WOOD_DEMO_AGES.forEach((age, i) => {
    const cell = { x: sx - 5 + i * 2, y: sy - 6 };
    if (!usable(cell)) return;
    const s = square(cell);
    woods.push({ ...s, surface: 'meadow', age });
    domain.push({
      cell,
      x: s.x,
      z: s.z,
      areaM2: s.size * s.size,
      surface: 'meadow',
      day: DEMO_DAY - Math.round((age - FOREST_FROM) * DAYS_PER_YEAR),
    });
  });
  const oldest = domain[domain.length - 1];
  const felled = oldest
    ? [{ id: woodTreeId(oldest.cell, 1), day: DEMO_DAY - Math.round(5 * DAYS_PER_YEAR) }]
    : [];
  const added = obstacleChangesAt(
    { clearedObstacles: [], felledTrees: felled, woods: domain },
    DEMO_DAY,
  ).added;
  const cells = [...parts.map((p) => p.cell), ...woods.map((w) => w.cell)];
  const site = tileCenter(l, sx, sy);
  const preview = fieldPartsFromCells(l, null, cells, [
    { x: site.worldX, z: site.worldZ, rotation: 0 },
  ]);
  const all = [...parts, ...woods];
  return {
    field: { id: fieldId, parts },
    woods,
    added: [...(added ?? [])],
    cleared: preview.parts.flatMap((p) => p.obstacleIds ?? []),
    center: {
      x: all.reduce((sum, p) => sum + p.x, 0) / Math.max(1, all.length),
      z: all.reduce((sum, p) => sum + p.z, 0) / Math.max(1, all.length),
    },
  };
}
