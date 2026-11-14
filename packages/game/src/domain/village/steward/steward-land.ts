// Mapa hodnot krajiny pro správce vsi (steward.md – Mapa hodnot krajiny). Části, které závisí jen
// na krajině (úrodnost, výšky nad potokem, záplavy, svah, vzdálenost k vodě a lesu, překážky), se
// počítají jednou pro objekt krajiny; části ze stavu vsi (území, zabraná políčka) v den správce.
// Jen deterministická matematika (ESLint pravidlo vrstvy překážek) – plán se ukládá do stavu
// a dopočet po kouscích ho musí zopakovat.

import { OBSTACLE_KINDS, SURFACE_CODES, tileCenterWorld, type Landscape } from '../../landscape';
import type { ObstacleLayer } from '../../landscape';
import type { PartInput } from '../core/actions';
import { villageCentre } from '../people/departure';
import { landAreaAt, landscapeLandAreas } from '../paths/terrain';
import { ROTATION } from '../fields/field-capacity';
import { distanceFactor, grossYieldPerHa } from '../fields/fields';
import { waterFetchingLabor } from '../core/labor';
import { streamHeights } from '../disasters/part-protection';
import { cellsUnderPolygon } from '../placement/placement-geometry';
import { villageOrigin } from '../placement/placement-squares';
import { placementVillageOf } from '../placement/placement-village';
import { NO_CRAFTS, fieldWorkPerHa, foundingCostPerHa } from '../core/productivity';
import { FLOOD, FLOOD_WATER, PROTECTION } from '../rules/rules-disasters';
import {
  FERTILITY,
  FIELD_LIMITS,
  FOREST_BONUS,
  OBSTACLE_COST,
  SEED_KG_PER_HA,
} from '../rules/rules-fields';
import { WATER_FETCHING } from '../rules/rules-people';
import { STEWARD } from '../rules/rules-steward';
import { villageLandSquares } from '../placement/squares';
import type { FieldTask, VillageState } from '../types';
import { edgeWeight } from '../wildlife/wildlife-damage';

const M2_PER_HA = 10_000;
const DAYS_PER_YEAR = 365;
const FIELD_TASKS: readonly FieldTask[] = ['dig', 'sow', 'weed', 'harvest', 'thresh'];
/** Daleko – políčko bez vody nebo lesa na mapě (v políčkách; konečné kvůli JSON). */
const FAR_TILES = 1 << 12;

/**
 * Jak se čtverec cení (pravidla hry): čistá úroda let osevu (kg) na člověkoden založení a polní
 * práce těch let (vzdálenost, popel z mýcení lesa a první sezóna bez pletí). Základ mapy hodnot
 * pole; skript měření (`scripts/lib/calibration-land.ts`) podle ní řadí čtverce hráče.
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

/** Hodnoty políček krajiny (index y × size + x), které závisí jen na krajině. */
export interface LandValues {
  readonly size: number;
  readonly cellSizeM: number;
  /** Výška nad potokem (m; voda 0, mapa bez vody Infinity) – `streamHeights`. */
  readonly streamHeightM: Float32Array;
  /** Očekávaný podíl úrody, který záplavy za rok nechají (1 = nad vodou). */
  readonly floodKept: Float32Array;
  /** Očekávaná naplavenina za rok – podíl přirozené úrodnosti navíc. */
  readonly silt: Float32Array;
  /** Největší rozdíl výšky proti čtyřem sousedům (m). */
  readonly slopeM: Float32Array;
  /** Vzdálenost od středu políčka k okraji nejbližšího políčka vody a lesa (m; v nich 0). */
  readonly waterDistM: Float32Array;
  readonly forestDistM: Float32Array;
}

const landValuesCache = new WeakMap<Landscape, LandValues>();

/** Hodnoty políček krajiny – jednou pro každý objekt krajiny (mezipaměť procesu). */
export function landValues(landscape: Landscape): LandValues {
  const cached = landValuesCache.get(landscape);
  if (cached) return cached;
  const size = landscape.size;
  const n = size * size;
  const streamHeightM = streamHeights(landscape);
  const floodKept = new Float32Array(n).fill(1);
  const silt = new Float32Array(n);
  const slopeM = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const flood = expectedFlood(streamHeightM[i]!);
    floodKept[i] = flood.kept;
    silt[i] = flood.silt;
    const x = i % size;
    const h = landscape.heights[i]!;
    let slope = 0;
    if (x > 0) slope = Math.max(slope, Math.abs(h - landscape.heights[i - 1]!));
    if (x < size - 1) slope = Math.max(slope, Math.abs(h - landscape.heights[i + 1]!));
    if (i >= size) slope = Math.max(slope, Math.abs(h - landscape.heights[i - size]!));
    if (i + size < n) slope = Math.max(slope, Math.abs(h - landscape.heights[i + size]!));
    slopeM[i] = slope;
  }
  const values: LandValues = {
    size,
    cellSizeM: landscape.cellSizeM,
    streamHeightM,
    floodKept,
    silt,
    slopeM,
    waterDistM: edgeDistances(landscape, SURFACE_CODES.water),
    forestDistM: edgeDistances(landscape, SURFACE_CODES.forest),
  };
  landValuesCache.set(landscape, values);
  return values;
}

/**
 * Očekávaná ztráta záplav políčka výšky `heightM` nad potokem za rok: četnosti stupňů vody
 * (`FLOOD_WATER.levels`) × ztráta pásma hloubky (`FLOOD.bands` – jarní voda bere ozim, letní
 * nesklizenou úrodu, podle `springShare`) a naplavenina pásma.
 */
function expectedFlood(heightM: number): { kept: number; silt: number } {
  let loss = 0;
  let silt = 0;
  for (const level of FLOOD_WATER.levels) {
    const depth = level.heightM - heightM;
    if (level.level === null || depth <= 0) continue;
    const band =
      FLOOD.bands.find((b) => depth <= b.maxDepthM) ?? FLOOD.bands[FLOOD.bands.length - 1]!;
    const share =
      FLOOD_WATER.springShare * (1 - band.winterKept) +
      (1 - FLOOD_WATER.springShare) * (1 - band.cropKept);
    loss += level.chance * share;
    silt += level.chance * band.silt;
  }
  return { kept: 1 - loss, silt };
}

/**
 * Vzdálenost od středu políčka k okraji nejbližšího políčka povrchu `code` (m) – dvouprůchodová
 * transformace vzdálenosti s celočíselnými posuny (jen sčítání, násobení a odmocnina – přesné
 * v IEEE 754). Bez takového políčka `FAR_TILES` políček.
 */
function edgeDistances(landscape: Landscape, code: number): Float32Array {
  const size = landscape.size;
  const n = size * size;
  const dx = new Int32Array(n).fill(FAR_TILES);
  const dy = new Int32Array(n).fill(FAR_TILES);
  for (let i = 0; i < n; i++) {
    if (landscape.surface[i] === code) {
      dx[i] = 0;
      dy[i] = 0;
    }
  }
  const d2 = (i: number): number => dx[i]! * dx[i]! + dy[i]! * dy[i]!;
  const relax = (i: number, x: number, y: number, ox: number, oy: number): void => {
    const nx = x + ox;
    const ny = y + oy;
    if (nx < 0 || ny < 0 || nx >= size || ny >= size) return;
    const j = ny * size + nx;
    if (dx[j] === FAR_TILES) return;
    const cx = dx[j]! + ox;
    const cy = dy[j]! + oy;
    if (cx * cx + cy * cy < d2(i)) {
      dx[i] = cx;
      dy[i] = cy;
    }
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      relax(i, x, y, -1, 0);
      relax(i, x, y, 0, -1);
      relax(i, x, y, -1, -1);
      relax(i, x, y, 1, -1);
    }
    for (let x = size - 1; x >= 0; x--) relax(y * size + x, x, y, 1, 0);
  }
  for (let y = size - 1; y >= 0; y--) {
    for (let x = size - 1; x >= 0; x--) {
      const i = y * size + x;
      relax(i, x, y, 1, 0);
      relax(i, x, y, 0, 1);
      relax(i, x, y, -1, 1);
      relax(i, x, y, 1, 1);
    }
    for (let x = 0; x < size; x++) relax(y * size + x, x, y, -1, 0);
  }
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const tiles = dx[i] === FAR_TILES ? FAR_TILES : Math.sqrt(d2(i));
    out[i] = tiles === 0 ? 0 : (tiles - 0.5) * landscape.cellSizeM;
  }
  return out;
}

const obstacleCostCache = new WeakMap<ObstacleLayer, Float32Array>();

/**
 * Cena překážek políček (člověkodny – `OBSTACLE_COST` po kusech, i v lese; skalní výchoz
 * Infinity) z vrstvy překážek krajiny; pokácené a odstraněné překážky vsí se nepočítají (odhad pro plán). Jednou pro vrstvu.
 */
export function tileObstacleCosts(landscape: Landscape, obstacles: ObstacleLayer): Float32Array {
  const cached = obstacleCostCache.get(obstacles);
  if (cached && cached.length === landscape.size * landscape.size) return cached;
  const size = landscape.size;
  const half = (size * landscape.cellSizeM) / 2;
  const out = new Float32Array(size * size);
  // skalní výchoz se neodstraní – políčko pole nebude
  const prices = OBSTACLE_KINDS.map((kind) =>
    kind === 'outcrop' ? Infinity : OBSTACLE_COST[kind],
  );
  for (let i = 0; i < obstacles.count; i++) {
    const tx = Math.floor((obstacles.x[i]! + half) / landscape.cellSizeM);
    const ty = Math.floor((obstacles.z[i]! + half) / landscape.cellSizeM);
    if (tx < 0 || ty < 0 || tx >= size || ty >= size) continue;
    out[ty * size + tx]! += prices[obstacles.kind[i]!] ?? 0;
  }
  obstacleCostCache.set(obstacles, out);
  return out;
}

/** Podíl úrody, který díl ve vzdálenosti `forestDistM` od lesa nechá počasí (ochrana zeleně). */
function weatherKept(forestDistM: number): number {
  const { fullGreenM, noGreenM } = PROTECTION;
  const green = Math.min(1, Math.max(0, (noGreenM - forestDistM) / (noGreenM - fullGreenM)));
  return 1 - STEWARD.weatherLoss * (1 - green);
}

/**
 * Políčka krajiny jako čtverce pole (index y × size + x), za léta osevu jako `squareValue`: čistá
 * úroda (kg, úrodnost s naplaveninou), založení (člověkodny – povrch a překážky), polní práce bez
 * vzdálenosti (člověkodny) a co z úrody nechají záplavy, zvěř u lesa (`edgeWeight`) a počasí
 * (ochrana zeleně – odhad z blízkosti lesa). Voda a skalní výchoz mají úrodu 0.
 */
export interface FieldCells {
  readonly kg: Float32Array;
  readonly found: Float32Array;
  readonly work: Float32Array;
  readonly kept: Float32Array;
}

const fieldCellsCache = new WeakMap<ObstacleLayer, { landscape: Landscape; cells: FieldCells }>();

/** Čtverce pole pro celou krajinu – jednou pro krajinu a její vrstvu překážek. */
export function fieldCells(landscape: Landscape, obstacles: ObstacleLayer): FieldCells {
  const cached = fieldCellsCache.get(obstacles);
  if (cached?.landscape === landscape) return cached.cells;
  const values = landValues(landscape);
  const obstacleCosts = tileObstacleCosts(landscape, obstacles);
  const n = landscape.size * landscape.size;
  const ha = (landscape.cellSizeM * landscape.cellSizeM) / M2_PER_HA;
  const cells: FieldCells = {
    kg: new Float32Array(n),
    found: new Float32Array(n),
    work: new Float32Array(n),
    kept: new Float32Array(n),
  };
  const workPerHa = FIELD_TASKS.reduce((sum, t) => sum + fieldWorkPerHa(t, NO_CRAFTS.tools), 0);
  const weedPerHa = fieldWorkPerHa('weed', NO_CRAFTS.tools);
  for (let i = 0; i < n; i++) {
    const code = landscape.surface[i];
    if (code === SURFACE_CODES.water || obstacleCosts[i] === Infinity) continue;
    const forest = code === SURFACE_CODES.forest;
    const natural = landscape.fertility[i]!;
    const start = Math.min(natural * FLOOD.siltMaxShare, natural * (1 + values.silt[i]!));
    let kg = 0;
    let work = 0;
    for (let season = 0; season < ROTATION.sown; season++) {
      let fertility = start * (1 - FERTILITY.sowDepletion * season);
      if (forest) fertility += FOREST_BONUS.bySeason[season] ?? 0;
      kg += (grossYieldPerHa(Math.min(100, fertility)) - SEED_KG_PER_HA) * ha;
      work += (workPerHa - (forest && season === 0 ? weedPerHa : 0)) * ha;
    }
    const forestM = values.forestDistM[i]!;
    cells.kg[i] = Math.max(0, kg);
    cells.found[i] =
      foundingCostPerHa(forest ? 'forest' : 'meadow', NO_CRAFTS.tools) * ha + obstacleCosts[i]!;
    cells.work[i] = work;
    cells.kept[i] =
      values.floodKept[i]! *
      (1 - STEWARD.wildlifeEdgeLoss * edgeWeight(forestM)) *
      weatherKept(forestM);
  }
  fieldCellsCache.set(obstacles, { landscape, cells });
  return cells;
}

/**
 * Hodnota políčka `index` pro pole (kg čisté úrody na člověkoden za léta osevu), když je jeho
 * hospodářství `distanceM` daleko – `squareValue` rozšířená o záplavy, zvěř a počasí
 * (`FieldCells.kept`), práce × `distanceFactor`.
 */
export function fieldCellValue(cells: FieldCells, index: number, distanceM: number): number {
  const kg = cells.kg[index]!;
  if (kg <= 0) return 0;
  return (
    (kg * cells.kept[index]!) /
    (cells.found[index]! + cells.work[index]! * distanceFactor(distanceM))
  );
}

/** Výška nad potokem, pod kterou dům nestojí – hladina dvousetleté vody (`FLOOD_WATER`). */
export const HOUSE_FLOOD_M = FLOOD_WATER.levels.find((l) => l.level === 'twoHundred')?.heightM ?? 0;

/** Člověkodny za rok chůze `trips` pochůzek tam a zpět na `distanceM` m (rychlost chůze pro vodu). */
export function walkDaysPerYear(trips: number, distanceM: number): number {
  return (
    (trips * 2 * Math.max(0, distanceM)) /
    WATER_FETCHING.speedMps /
    (WATER_FETCHING.dayHours * 3600)
  );
}

/**
 * Cena místa domu na políčku `index` za rok (člověkodny) pro domácnost `people` lidí: chůze pro
 * vodu (`waterFetchingLabor` – přirážka nad `includedM`) a pro dřevo k okraji lesa
 * (`STEWARD.woodTripsPerYear`). Nevhodné místo (voda, les, pod hladinou dvousetleté vody, svah nad
 * `STEWARD.houseSlopeM`) null – ostatní (rovná zem pod půdorysem, překážky, stavby) hlídá kontrola
 * umístění.
 */
export function dwellingSiteValue(
  landscape: Landscape,
  values: LandValues,
  index: number,
  people: number,
): number | null {
  if (landscape.surface[index] !== SURFACE_CODES.meadow) return null;
  if (values.streamHeightM[index]! < HOUSE_FLOOD_M) return null;
  if (values.slopeM[index]! > STEWARD.houseSlopeM) return null;
  const water = waterFetchingLabor(people, values.waterDistM[index]!) * DAYS_PER_YEAR;
  const wood = walkDaysPerYear(STEWARD.woodTripsPerYear, values.forestDistM[index]!);
  return water + wood;
}

/**
 * Střed vsi pro plán (m) – dvorec, jinak první obydlí nebo staveniště (`villageCentre`); ves bez
 * obydlí a stavenišť null.
 */
export function planCentre(state: VillageState): { x: number; z: number } | null {
  return villageOrigin(state) ? villageCentre(state) : null;
}

/**
 * Území vsi – políčka (1 v masce) do `FIELD_LIMITS.maxDistanceM` od středu vsi (`planCentre`),
 * kam se ze středu dojde: přes vodu jen brodem (`landscapeLandAreas` – paths.md, Odhad
 * vzdáleností, Jen brodem; Martin 14. 11. 2026). Jedna ves, jedna mapa (Martin 1. 11. 2026) –
 * území nedělí jiná ves. Ves bez středu nemá území (samé 0).
 */
export function villageTerritory(state: VillageState, landscape: Landscape): Uint8Array {
  const size = landscape.size;
  const mask = new Uint8Array(size * size);
  const centre = planCentre(state);
  if (!centre) return mask;
  const reach2 = FIELD_LIMITS.maxDistanceM * FIELD_LIMITS.maxDistanceM;
  const areas = landscapeLandAreas(landscape, true);
  const home = landAreaAt(areas, centre.x, centre.z);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const c = tileCenterWorld(landscape, x, y);
      const d = (c.x - centre.x) * (c.x - centre.x) + (c.z - centre.z) * (c.z - centre.z);
      if (d > reach2) continue;
      if (home >= 0 && landAreaAt(areas, c.x, c.z) !== home) continue;
      mask[y * size + x] = 1;
    }
  }
  return mask;
}

/**
 * Políčka zabraná stavbami vsi v den `day` (1 v masce): čtverce polí, sadů, hřbitovů,
 * ohrad a lesa vsi, políčka pod obydlími a rozestavěnými obydlími, posvátnými stavbami a humny,
 * Plán na nich nic nového nechystá.
 */
export function takenTiles(state: VillageState, day: number, landscape: Landscape): Uint8Array {
  const size = landscape.size;
  const half = (size * landscape.cellSizeM) / 2;
  const mask = new Uint8Array(size * size);
  const markPoint = (x: number, z: number): void => {
    const tx = Math.floor((x + half) / landscape.cellSizeM);
    const ty = Math.floor((z + half) / landscape.cellSizeM);
    if (tx >= 0 && ty >= 0 && tx < size && ty < size) mask[ty * size + tx] = 1;
  };
  const village = placementVillageOf(state, day);
  for (const square of villageLandSquares(landscape, village)) {
    if (square.tile !== null) mask[square.tile] = 1;
    else cellsUnderPolygon(landscape, square.corners).forEach((t) => (mask[t] = 1));
  }
  for (const d of state.dwellings) markPoint(d.position.x, d.position.z);
  for (const c of state.constructions) {
    if (c.kind === 'dwelling' && c.position) markPoint(c.position.x, c.position.z);
  }
  for (const s of state.sacredBuildings ?? []) markPoint(s.position.x, s.position.z);
  for (const f of state.threshingFloors ?? []) markPoint(f.position.x, f.position.z);
  return mask;
}

/**
 * Volné louky (ne pod stavbou ani polem – `takenTiles`) nejvýš `radius` políček od středu vsi
 * (`planCentre`), od nejbližšího (při shodě nižší index) – místa modly, svatyně a kostela NPC
 * rodu. Ves bez středu žádné.
 */
export function meadowTilesNearCentre(
  state: VillageState,
  day: number,
  landscape: Landscape,
  radius: number,
): number[] {
  const centre = planCentre(state);
  if (!centre) return [];
  const size = landscape.size;
  const half = (size * landscape.cellSizeM) / 2;
  const cx = Math.floor((centre.x + half) / landscape.cellSizeM);
  const cy = Math.floor((centre.z + half) / landscape.cellSizeM);
  const taken = takenTiles(state, day, landscape);
  const tiles: { tile: number; d: number }[] = [];
  for (let y = Math.max(0, cy - radius); y <= Math.min(size - 1, cy + radius); y++) {
    for (let x = Math.max(0, cx - radius); x <= Math.min(size - 1, cx + radius); x++) {
      const tile = y * size + x;
      if (taken[tile] || landscape.surface[tile] !== SURFACE_CODES.meadow) continue;
      tiles.push({ tile, d: (x - cx) * (x - cx) + (y - cy) * (y - cy) });
    }
  }
  tiles.sort((a, b) => a.d - b.d || a.tile - b.tile);
  return tiles.map((t) => t.tile);
}

/** Políčka pod čtverci polí vsi (i natočených) v den `day` – seřazená, bez opakování. */
export function fieldTiles(state: VillageState, day: number, landscape: Landscape): number[] {
  const mask = new Uint8Array(landscape.size * landscape.size);
  for (const square of villageLandSquares(landscape, placementVillageOf(state, day), ['field'])) {
    if (square.tile !== null) mask[square.tile] = 1;
    else cellsUnderPolygon(landscape, square.corners).forEach((t) => (mask[t] = 1));
  }
  const out: number[] = [];
  mask.forEach((v, i) => {
    if (v) out.push(i);
  });
  return out;
}

/** Plocha políčka v hektarech. */
export function cellHa(landscape: Landscape): number {
  return (landscape.cellSizeM * landscape.cellSizeM) / M2_PER_HA;
}
