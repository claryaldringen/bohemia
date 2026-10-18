// Půda pro kalibraci vsi (measure-village.ts): kde hráč zakládá pole, odkud bere dřevo a kde
// stojí obydlí, hřbitov a sad.
//
// - `real` (výchozí): skutečná krajina sídla z generátoru (`CURRENT_LAYER_VERSIONS`, vrstva
//   překážek), obydlí uprostřed místa pro vesnici. Hráč zakládá čtverce (louka, křoviny i les do
//   800 m) v pořadí podle úrody za člověkoden prvního oběhu: čistá úroda let osevu (úrodnost,
//   popel z mýcení) ÷ (založení povrchu a překážek + polní práce let osevu se vzdáleností), podle
//   pravidel hry – pořadí je stejné i ve variantě, aby se varianty lišily jen cenou a úrodou
//   louky. Ceny dílů při založení počítá `fieldPartsFromCells` podle stavu vsi jako ve hře.
// - `v1`: syntetická krajina z doby krajin verze 1 – 35 ha louky s úrodností 70 (50–600 m
//   podle pořadí), za ní 165 ha lesa s úrodností 60 (50–800 m), les jako mřížka stromů
//   (≈ 258 na ha) na východ od vsi od 50 m. Pro srovnání se staršími měřeními a pro sondy.
//
// Varianta `meadow-burn` (jen kalibrace, ne pravidlo hry): drn louky se místo motyky pálí –
// založení louky 50 člověkodní na hektar místo 100 a první sezóna osevu s úrodností o 20 nižší
// (`applyVariantToNewParts`, po první sklizni `restoreBurnedAfterHarvest`).
import {
  CURRENT_LAYER_VERSIONS,
  generateLandscape,
  obstaclesOf,
  packObstacles,
  surfaceAt,
  tileCenterWorld,
  type Landscape,
  type ObstacleLayer,
  type ObstaclePlacement,
} from '../../src/domain/landscape';
import {
  FERTILITY,
  FIELD_LIMITS,
  FOREST_BONUS,
  MAX_FIELD_CELLS,
  NO_CRAFTS,
  SEED_KG_PER_HA,
  distanceFactor,
  fieldPartsFromCells,
  fieldWorkPerHa,
  forestEdgeDistanceM,
  foundingCostPerHa,
  grossYieldPerHa,
  placementVillageOf,
  type CemeterySquareInput,
  type FieldPart,
  type FieldTask,
  type OrchardSquareInput,
  type PartInput,
  type Position,
  type SparedSacred,
  type TileCell,
  type VillageState,
} from '../../src/domain/village';
import { ROTATION } from './steady-state';

export type LandKind = 'real' | 'v1';
export const LAND_KINDS: readonly LandKind[] = ['real', 'v1'];
export type Variant = 'base' | 'meadow-burn';
export const VARIANTS: readonly Variant[] = ['base', 'meadow-burn'];
/** Pálení drnu (jen kalibrace): založení louky za hektar a úrodnost první sezóny navíc. */
export const MEADOW_BURN = { foundingPerHa: 50, firstSeasonFertility: -20 } as const;

const M2_PER_HA = 10_000;
const PART_M2 = 225;
const FIELD_TASKS: readonly FieldTask[] = ['dig', 'sow', 'weed', 'harvest', 'thresh'];
// hřbitov: čtverce za sebou v ose x, první 200 m od obydlí, 150 m od vody; sad 22 čtverců
// (≈ 0,5 ha) 120 m od obydlí – mimo půdu pro pole (políčka mimo mřížku krajiny)
const CEMETERY_FIRST_CELL = 13;
const CEMETERY_WATER_M = 150;
const ORCHARD_SQUARES = 22;
const ORCHARD_DISTANCE_M = 120;

export interface DwellingSite {
  obstacles: ObstacleLayer;
  forestDistanceM: number;
}

export interface LandBatch {
  parts: PartInput[];
  /** Pozice dalšího čtverce v pořadí hráče. */
  next: number;
  sacred?: SparedSacred;
}

export interface CalibrationLand {
  readonly kind: LandKind;
  /**
   * Krajina pro simulaci (přestavba polozemnice bez pozemku na volné políčko – `advanceVillage`);
   * syntetická krajina žádnou nemá (obydlí se přestaví na místě).
   */
  readonly landscape: Landscape | null;
  readonly obstacles: ObstacleLayer;
  /** Kde stojí všechna obydlí (poloha bez významu – jen vzdálenosti). */
  readonly position: Position;
  readonly site: DwellingSite;
  /** Přirozená úrodnost čtverce na pozici `cursor` (odhad pole, než ves nějaké má). */
  fertilityAt(cursor: number): number;
  /** Je čtverec na pozici `cursor` les? */
  isForest(cursor: number): boolean;
  /** Díly z dalších (nejvýš) `count` čtverců v pořadí hráče; null, když půda došla. */
  take(state: VillageState | null, day: number, cursor: number, count: number): LandBatch | null;
  cemeterySquare(index: number): CemeterySquareInput;
  orchardSquares(): OrchardSquareInput[];
}

function orchardSquares(): OrchardSquareInput[] {
  return Array.from({ length: ORCHARD_SQUARES }, (_, i) => ({
    cell: { x: i, y: -5 },
    areaM2: PART_M2,
    distanceM: ORCHARD_DISTANCE_M,
    obstacleCost: 0,
  }));
}

function cemeterySquare(position: Position, index: number, cellY: number): CemeterySquareInput {
  const x = CEMETERY_FIRST_CELL + index;
  return {
    cell: { x, y: cellY },
    x: position.x + x * 15 + 7.5,
    z: position.z + 7.5,
    waterDistanceM: CEMETERY_WATER_M,
    obstacleCost: 0,
  };
}

// --- syntetická krajina (verze 1) -------------------------------------------------------

const V1 = {
  meadow: { ha: 35, fertility: 70, fromM: 50, toM: 600 },
  forest: { ha: 165, fertility: 60, fromM: 50, toM: 800 },
  treesPerHa: 258,
  forestEdgeM: 50,
} as const;
const V1_MEADOW_PARTS = Math.round((V1.meadow.ha * M2_PER_HA) / PART_M2);
const V1_FOREST_PARTS = Math.round((V1.forest.ha * M2_PER_HA) / PART_M2);
let v1Forest: ObstacleLayer | null = null;

/** Les syntetické krajiny: stromy po mřížce od 50 m na východ od vsi (±960 m). */
function syntheticForest(): ObstacleLayer {
  if (v1Forest) return v1Forest;
  const spacing = Math.sqrt(M2_PER_HA / V1.treesPerHa);
  const trees: ObstaclePlacement[] = [];
  let id = 1;
  for (let x = V1.forestEdgeM; x < 950; x += spacing) {
    for (let z = -950; z < 950; z += spacing) {
      trees.push({ id: id++, kind: 'tree', look: 'beech-1', x, z, rotation: 0, scale: 1 });
    }
  }
  v1Forest = packObstacles(trees, 128, 15);
  return v1Forest;
}

/** Díl syntetické krajiny podle pořadí zakládání; null, když půda došla. */
function v1Part(index: number): PartInput | null {
  const lerp = (from: number, to: number, t: number): number => from + (to - from) * t;
  if (index < V1_MEADOW_PARTS) {
    const m = V1.meadow;
    return {
      areaM2: PART_M2,
      distanceM: lerp(m.fromM, m.toM, index / (V1_MEADOW_PARTS - 1)),
      naturalFertility: m.fertility,
      surface: 'meadow',
      obstacleCost: 0,
    };
  }
  const j = index - V1_MEADOW_PARTS;
  if (j >= V1_FOREST_PARTS) return null;
  const f = V1.forest;
  // stromy dílu lesa: 5 nebo 6, v průměru hustota lesa (stromy jsou v ceně za hektar)
  const trees = Math.floor(((j + 1) * PART_M2 * V1.treesPerHa) / M2_PER_HA);
  const before = Math.floor((j * PART_M2 * V1.treesPerHa) / M2_PER_HA);
  return {
    areaM2: PART_M2,
    distanceM: lerp(f.fromM, f.toM, j / (V1_FOREST_PARTS - 1)),
    naturalFertility: f.fertility,
    surface: 'forest',
    obstacleCost: 0,
    trees: trees - before,
  };
}

/** Syntetická krajina z doby krajin verze 1 (sondy a srovnání se staršími měřeními). */
export function syntheticLand(): CalibrationLand {
  const obstacles = syntheticForest();
  const position = { x: 0, z: 0, rotation: 0 };
  return {
    kind: 'v1',
    landscape: null,
    obstacles,
    position,
    site: { obstacles, forestDistanceM: V1.forestEdgeM },
    fertilityAt: (cursor) => v1Part(cursor)?.naturalFertility ?? V1.meadow.fertility,
    isForest: (cursor) => cursor >= V1_MEADOW_PARTS,
    take: (_state, _day, cursor, count) => {
      const parts: PartInput[] = [];
      for (let i = cursor; i < cursor + count; i++) {
        const part = v1Part(i);
        if (part === null) break;
        parts.push(part);
      }
      return parts.length === 0 ? null : { parts, next: cursor + parts.length };
    },
    cemeterySquare: (index) => cemeterySquare(position, index, 0),
    orchardSquares,
  };
}

/** Syntetický díl pro sondy – plocha louky v1 (úrodnost 70). */
export const V1_MEADOW_FERTILITY = V1.meadow.fertility;

/**
 * Louka a les do 600 m od vsi na syntetické krajině – pastva a žaludy stád (diet.md): louka celá,
 * les rovnoměrně 50–800 m od obydlí.
 */
export const V1_LIVESTOCK_LAND = {
  meadowHa: V1.meadow.ha,
  forestHa: (V1.forest.ha * (600 - V1.forest.fromM)) / (V1.forest.toM - V1.forest.fromM),
} as const;

// --- skutečná krajina -------------------------------------------------------------------

/**
 * Jak hráč čtverec cení (pravidla hry): čistá úroda let osevu (kg) na člověkoden založení a polní
 * práce těch let (vzdálenost, popel z mýcení lesa a první sezóna bez pletí).
 */
export function squareValue(part: PartInput): number {
  const ha = part.areaM2 / M2_PER_HA;
  const forest = part.surface === 'forest';
  const workPerHa = FIELD_TASKS.reduce((sum, t) => sum + fieldWorkPerHa(t, NO_CRAFTS.tools), 0);
  let kg = 0;
  let labor = foundingCostPerHa(part.surface, NO_CRAFTS.tools) * ha + part.obstacleCost;
  for (let season = 0; season < ROTATION.sown; season++) {
    let fertility = part.naturalFertility * (1 - FERTILITY.sowDepletion * season);
    if (forest) fertility += FOREST_BONUS.bySeason[season] ?? 0;
    fertility = Math.min(100, fertility);
    kg += (grossYieldPerHa(fertility) - SEED_KG_PER_HA) * ha;
    const weedFree = forest && season === 0;
    const work = workPerHa - (weedFree ? fieldWorkPerHa('weed', NO_CRAFTS.tools) : 0);
    labor += work * ha * distanceFactor(part.distanceM);
  }
  return kg / labor;
}

/**
 * Skutečná krajina sídla ze seedu (pásmo srovnatelnosti jako nové sídlo). Pořadí čtverců hráče
 * se počítá jednou: náhled všech čtverců do 800 m (bez vody a políček kolem obydlí) a řazení
 * podle `squareValue`, při shodě blíž první.
 */
export function realLand(seed: number): CalibrationLand {
  const landscape = generateLandscape(seed, CURRENT_LAYER_VERSIONS);
  const obstacles = obstaclesOf(landscape);
  const site = landscape.villageSite;
  const center = tileCenterWorld(landscape, site.x, site.y);
  const position: Position = { x: center.x, z: center.z, rotation: 0 };
  const reach = Math.ceil(FIELD_LIMITS.maxDistanceM / landscape.cellSizeM) + 1;
  const cells: TileCell[] = [];
  for (
    let y = Math.max(0, site.y - reach);
    y <= Math.min(landscape.size - 1, site.y + reach);
    y++
  ) {
    for (
      let x = Math.max(0, site.x - reach);
      x <= Math.min(landscape.size - 1, site.x + reach);
      x++
    ) {
      // obydlí stojí uprostřed místa pro vesnici – jeho políčko a sousední zůstávají volné
      if (Math.abs(x - site.x) <= 1 && Math.abs(y - site.y) <= 1) continue;
      if (surfaceAt(landscape, x, y) === 'water') continue;
      cells.push({ x, y });
    }
  }
  const candidates: { part: PartInput; value: number }[] = [];
  for (let i = 0; i < cells.length; i += MAX_FIELD_CELLS) {
    const preview = fieldPartsFromCells(
      landscape,
      null,
      cells.slice(i, i + MAX_FIELD_CELLS),
      [position],
      obstacles,
    );
    for (const part of preview.parts) {
      if (part.distanceM > FIELD_LIMITS.maxDistanceM) continue;
      candidates.push({ part, value: squareValue(part) });
    }
  }
  candidates.sort(
    (a, b) =>
      b.value - a.value ||
      a.part.distanceM - b.part.distanceM ||
      (a.part.cell?.y ?? 0) - (b.part.cell?.y ?? 0) ||
      (a.part.cell?.x ?? 0) - (b.part.cell?.x ?? 0),
  );
  const ordered = candidates.map((c) => c.part);
  return {
    kind: 'real',
    landscape,
    obstacles,
    position,
    site: { obstacles, forestDistanceM: forestEdgeDistanceM(landscape, position.x, position.z) },
    fertilityAt: (cursor) => ordered[cursor]?.naturalFertility ?? 60,
    isForest: (cursor) => ordered[cursor]?.surface === 'forest',
    take: (state, day, cursor, count) => {
      if (cursor >= ordered.length) return null;
      // políčka pozemků polozemnic (přestavba na volné políčko) pole nedostane – přeskočí se
      const plots = new Set(
        [...(state?.dwellings ?? []), ...(state?.constructions ?? [])].flatMap((d) =>
          d.plot ? [`${d.plot.cell.x},${d.plot.cell.y}`] : [],
        ),
      );
      const chosen: TileCell[] = [];
      let next = cursor;
      while (chosen.length < count && next < ordered.length) {
        const cell = ordered[next++]?.cell;
        if (cell && !plots.has(`${cell.x},${cell.y}`)) chosen.push(cell);
      }
      if (chosen.length === 0) return null;
      const village = state ? placementVillageOf(state, day) : null;
      const preview = fieldPartsFromCells(landscape, village, chosen, [position], obstacles);
      return { parts: preview.parts, next, sacred: preview.spared };
    },
    // políčka hřbitova mimo mřížku krajiny – nepřekryjí čtverce polí
    cemeterySquare: (index) => cemeterySquare(position, index, -10),
    orchardSquares,
  };
}

export function createLand(kind: LandKind, seed: number): CalibrationLand {
  return kind === 'real' ? realLand(seed) : syntheticLand();
}

// --- varianta pálení drnu ---------------------------------------------------------------

/** Díl louky s pálením drnu nese přirozenou úrodnost, kterou mu vrátí první sklizeň. */
type BurnedPart = FieldPart & { burnedFertility?: number };

/**
 * Po založení vsi nebo pole (`fromId` = `nextId` před akcí): u varianty `meadow-burn` zlevní nově
 * zakládané díly louky na 50 člověkodní za hektar (+ překážky) i stavbu pole o totéž a sníží jim
 * úrodnost o 20 až do první sklizně. Mutuje stav – kopii, kterou akce vrátila.
 */
export function applyVariantToNewParts(
  state: VillageState,
  fromId: number,
  variant: Variant,
): void {
  if (variant !== 'meadow-burn') return;
  const savedByField = new Map<number, number>();
  for (const part of state.parts as BurnedPart[]) {
    if (part.id < fromId || part.surface !== 'meadow' || part.state !== 'founding') continue;
    const saved =
      (foundingCostPerHa('meadow', NO_CRAFTS.tools) - MEADOW_BURN.foundingPerHa) *
      (part.areaM2 / M2_PER_HA);
    part.foundingCost -= saved;
    savedByField.set(part.fieldId, (savedByField.get(part.fieldId) ?? 0) + saved);
    part.burnedFertility = part.naturalFertility;
    part.naturalFertility = Math.max(0, part.naturalFertility + MEADOW_BURN.firstSeasonFertility);
  }
  for (const c of state.constructions) {
    if (c.kind !== 'field' || c.fieldId === null) continue;
    c.cost -= savedByField.get(c.fieldId) ?? 0;
  }
}

/** 31. 8. po sklizni: díly s pálením drnu, které už jednou sklidily, mají zase svou úrodnost. */
export function restoreBurnedAfterHarvest(state: VillageState): void {
  for (const part of state.parts as BurnedPart[]) {
    if (part.burnedFertility === undefined || part.state !== 'sown') continue;
    part.naturalFertility = part.burnedFertility;
    delete part.burnedFertility;
  }
}

/** Přirozená úrodnost dílu bez snížení za pálení drnu. */
export function naturalFertilityOf(part: FieldPart): number {
  return (part as BurnedPart).burnedFertility ?? part.naturalFertility;
}
